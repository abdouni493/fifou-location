import { Worker, WorkerAdvance, WorkerAbsence } from '../types';

/**
 * CALCUL DE LA PAIE
 * ─────────────────
 * Le principe : on ne stocke jamais « ce qui reste dû ». On le RECALCULE à
 * partir de trois faits déjà en base — la date d'entrée, les périodes déjà
 * réglées, et les mouvements (acomptes, absences) postérieurs au dernier
 * règlement. Un solde stocké finit toujours par diverger de son historique.
 *
 * La borne de départ (`cutoff`) est la fin de la dernière période payée. Tout
 * ce qui est antérieur est considéré comme soldé : acomptes déjà retenus,
 * absences déjà décomptées. C'est ce qui rend le calcul idempotent — rouvrir
 * l'écran de paie ne redéduit jamais deux fois le même acompte.
 */

export interface DuePeriod {
  /** Clé stable : '2026-03' pour un mois, '2026-03-14' pour un jour. */
  key: string;
  label: string;
  start: string;
  end: string;
}

export interface PayrollSummary {
  /** L'employé est-il rémunéré ? Faux ⇒ tout est à zéro. */
  paid: boolean;
  mode: 'monthly' | 'daily';
  baseSalary: number;

  /** Fin de la dernière période réglée (exclusive pour la suite). */
  cutoff: string;
  /** Périodes non encore réglées, de la plus ancienne à la plus récente. */
  duePeriods: DuePeriod[];
  /** Nombre d'unités dues (mois ou jours). */
  dueUnits: number;

  /** Brut dû = unités × base. */
  gross: number;

  /** Acomptes versés depuis le dernier règlement (à retenir). */
  pendingAdvances: WorkerAdvance[];
  advancesTotal: number;

  /** Absences depuis le dernier règlement (à retenir). */
  pendingAbsences: WorkerAbsence[];
  absencesTotal: number;

  /** Net proposé = brut − acomptes − absences, jamais négatif. */
  net: number;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => s.slice(0, 10);

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

/** Fin de la dernière période réglée, ou date d'entrée si aucun règlement. */
function findCutoff(worker: Worker): string {
  const payments = worker.payments ?? [];
  if (payments.length === 0) {
    return day(worker.startDate || worker.createdAt || new Date().toISOString());
  }

  // periodEnd est la borne exacte ; à défaut, la date de règlement fait foi.
  const ends = payments
    .map(p => day(p.periodEnd || p.date))
    .filter(Boolean)
    .sort();

  return ends[ends.length - 1];
}

/** Nombre de jours (inclusif) entre deux dates ISO. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${day(from)}T00:00:00Z`).getTime();
  const b = new Date(`${day(to)}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / 86_400_000) + 1;
}

export function computePayroll(worker: Worker, referenceDate = iso(new Date())): PayrollSummary {
  const mode: 'monthly' | 'daily' = worker.paymentType === 'daily' ? 'daily' : 'monthly';
  const baseSalary = Number(worker.baseSalary || 0);
  const paid = worker.paymentEnabled !== false && baseSalary > 0;

  const cutoff = findCutoff(worker);
  const today = day(referenceDate);

  // ── Périodes dues ────────────────────────────────────────────────────────
  const duePeriods: DuePeriod[] = [];

  if (paid && mode === 'monthly') {
    // On règle un mois APRÈS l'avoir travaillé : le mois courant n'est dû
    // qu'une fois terminé. Sinon le premier jour du mois afficherait déjà un
    // salaire complet à verser.
    const start = new Date(`${cutoff}T00:00:00Z`);
    const now = new Date(`${today}T00:00:00Z`);

    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();

    // Le mois du cutoff est déjà réglé (ou est le mois d'entrée) : on démarre
    // au suivant, sauf si l'employé est entré ce mois-ci et n'a rien touché.
    const hasPayments = (worker.payments ?? []).length > 0;
    if (hasPayments) m += 1;

    while (true) {
      const first = new Date(Date.UTC(y + Math.floor(m / 12), m % 12, 1));
      const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
      if (last >= now) break; // mois non terminé : pas encore dû

      duePeriods.push({
        key: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, '0')}`,
        label: `${MONTHS_FR[first.getUTCMonth()]} ${first.getUTCFullYear()}`,
        start: iso(first),
        end: iso(last),
      });

      m += 1;
      if (duePeriods.length > 60) break; // garde-fou : 5 ans d'arriérés suffisent
    }
  }

  if (paid && mode === 'daily') {
    // Au jour : on compte les jours ouvrés depuis le lendemain du dernier
    // règlement, absences déduites (elles sont facturées à part).
    const hasPayments = (worker.payments ?? []).length > 0;
    const startDate = new Date(`${cutoff}T00:00:00Z`);
    if (hasPayments) startDate.setUTCDate(startDate.getUTCDate() + 1);

    const from = iso(startDate);
    const count = daysBetween(from, today);

    for (let i = 0; i < count && i < 400; i++) {
      const d = new Date(`${from}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      const k = iso(d);
      duePeriods.push({
        key: k,
        label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }),
        start: k,
        end: k,
      });
    }
  }

  // ── Mouvements postérieurs au dernier règlement ──────────────────────────
  const after = (d?: string) => Boolean(d) && day(d!) > cutoff;
  // Sans aucun règlement, tout ce qui est postérieur à l'entrée compte —
  // y compris le jour même de l'entrée.
  const hasPayments = (worker.payments ?? []).length > 0;
  const keep = (d?: string) => (hasPayments ? after(d) : Boolean(d) && day(d!) >= cutoff);

  const pendingAdvances = (worker.advances ?? []).filter(a => keep(a.date));
  const pendingAbsences = (worker.absences ?? []).filter(a => keep(a.date));

  const advancesTotal = pendingAdvances.reduce((s, a) => s + Number(a.amount || 0), 0);
  const absencesTotal = pendingAbsences.reduce((s, a) => s + Number(a.cost || 0), 0);

  const dueUnits = duePeriods.length;
  const gross = paid ? dueUnits * baseSalary : 0;
  const net = Math.max(0, gross - advancesTotal - absencesTotal);

  return {
    paid, mode, baseSalary,
    cutoff, duePeriods, dueUnits,
    gross,
    pendingAdvances, advancesTotal,
    pendingAbsences, absencesTotal,
    net,
  };
}
