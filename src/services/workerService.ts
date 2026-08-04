import { supabase } from '../supabase';
import { sessionService } from '../utils/sessionService';
import { Worker, WorkerRole, WorkerAdvance, WorkerAbsence, WorkerPayment } from '../types';

/**
 * SERVICE ÉQUIPE
 * ──────────────
 * Ce service complète DatabaseService (qu'il ne remplace pas) pour tout ce que
 * le module Équipe a gagné : rôles, permissions, date d'entrée, compte de
 * connexion Supabase Auth.
 *
 * Colonnes ajoutées par `migration_equipe_caisse.sql`. Tant qu'elle n'est pas
 * jouée, chaque lecture retombe proprement sur les colonnes historiques :
 * l'écran reste utilisable, seuls les nouveaux champs sont vides.
 */

const isMissingColumn = (err: any) =>
  err?.code === '42703' || /column .* does not exist/i.test(err?.message ?? '');

/** Colonnes ajoutées par la migration — retirées de la requête si absentes. */
const EXTENDED_COLUMNS =
  'id_card_number, role_name, start_date, payment_enabled, account_enabled, auth_user_id, permissions';

const mapWorker = (row: any): Worker => ({
  id: row.id,
  fullName: row.full_name,
  dateOfBirth: row.date_of_birth ?? undefined,
  phone: row.phone ?? '',
  email: row.email ?? '',
  address: row.address ?? undefined,
  profilePhoto: row.profile_photo ?? undefined,
  idCardNumber: row.id_card_number ?? undefined,
  type: row.type ?? 'worker',
  roleName: row.role_name ?? undefined,
  startDate: row.start_date ?? undefined,
  paymentEnabled: row.payment_enabled ?? true,
  paymentType: row.payment_type ?? 'monthly',
  baseSalary: Number(row.base_salary ?? 0),
  accountEnabled: row.account_enabled ?? false,
  username: row.username ?? '',
  password: row.password ?? '',
  authUserId: row.auth_user_id ?? undefined,
  permissions: normalisePermissions(row.permissions),
  advances: (row.advances ?? []).map(mapAdvance),
  absences: (row.absences ?? []).map(mapAbsence),
  payments: (row.payments ?? []).map(mapPayment),
  createdAt: row.created_at,
});

const mapAdvance = (r: any): WorkerAdvance => ({
  id: r.id, amount: Number(r.amount ?? 0), date: r.date, note: r.note ?? undefined,
});
const mapAbsence = (r: any): WorkerAbsence => ({
  id: r.id, cost: Number(r.cost ?? 0), date: r.date, note: r.note ?? undefined,
});
const mapPayment = (r: any): WorkerPayment => ({
  id: r.id,
  amount: Number(r.amount ?? 0),
  date: r.date,
  baseSalary: Number(r.base_salary ?? 0),
  advances: Number(r.advances ?? 0),
  absences: Number(r.absences ?? 0),
  netSalary: Number(r.net_salary ?? 0),
  note: r.note ?? undefined,
  periodStart: r.period_start ?? undefined,
  periodEnd: r.period_end ?? undefined,
});

function normalisePermissions(raw: any): string[] {
  if (Array.isArray(raw)) return raw.filter(x => typeof x === 'string');
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}

const RELATIONS = `
  advances:worker_advances(*),
  absences:worker_absences(*),
  payments:worker_payments(*)
`;

export const WorkerService = {
  /** Vrai si la migration Équipe a été jouée — pilote les bandeaux d'aide. */
  migrationApplied: true,

  async getWorkers(): Promise<Worker[]> {
    // Première tentative : toutes les colonnes, y compris celles de la migration.
    let { data, error } = await supabase
      .from('workers')
      .select(`*, ${EXTENDED_COLUMNS}, ${RELATIONS}`)
      .order('created_at', { ascending: false });

    if (error && isMissingColumn(error)) {
      WorkerService.migrationApplied = false;
      console.warn('[WorkerService] Migration Équipe non jouée — colonnes étendues ignorées.');
      ({ data, error } = await supabase
        .from('workers')
        .select(`*, ${RELATIONS}`)
        .order('created_at', { ascending: false }));
    }

    if (error) throw error;
    return (data ?? []).map(mapWorker);
  },

  // ── Rôles ────────────────────────────────────────────────────────────────
  async getRoles(): Promise<WorkerRole[]> {
    const { data, error } = await supabase
      .from('worker_roles')
      .select('*')
      .order('name');

    // Table absente : on retombe sur les rôles distincts déjà utilisés.
    if (error) {
      console.warn('[WorkerService] worker_roles indisponible :', error.message);
      return [];
    }
    return (data ?? []).map((r: any) => ({ id: r.id, name: r.name, createdAt: r.created_at }));
  },

  async createRole(name: string): Promise<WorkerRole> {
    const { data, error } = await supabase
      .from('worker_roles')
      .insert([{ name: name.trim() }])
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, name: data.name, createdAt: data.created_at };
  },

  async deleteRole(id: string): Promise<void> {
    const { error } = await supabase.from('worker_roles').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Création / mise à jour ───────────────────────────────────────────────

  /**
   * Crée l'employé, et son compte de connexion si demandé.
   *
   * Le compte passe par `supabase.auth.signUp` : l'employé apparaît alors dans
   * la table Authentication de Supabase et se connecte avec son e-mail et son
   * mot de passe, exactement comme l'administrateur.
   *
   * Subtilité : `signUp` remplace la session du SDK par celle du nouveau
   * compte. La session de l'admin, elle, vit dans localStorage (sessionService)
   * et n'est pas touchée — on la réinjecte dans le SDK juste après, sinon les
   * écritures suivantes partiraient avec l'identité du nouvel employé.
   */
  async createWorker(input: Partial<Worker>): Promise<Worker> {
    let authUserId: string | undefined;

    if (input.accountEnabled && input.email && input.password) {
      authUserId = await createAuthAccount(input);
    }

    const row = toDbRow(input);
    if (authUserId) row.auth_user_id = authUserId;

    let { data, error } = await supabase.from('workers').insert([row]).select().single();

    if (error && isMissingColumn(error)) {
      // Migration non jouée : on n'insère que les colonnes historiques plutôt
      // que d'échouer — l'admin garde la main sur son équipe.
      WorkerService.migrationApplied = false;
      ({ data, error } = await supabase
        .from('workers')
        .insert([toLegacyRow(input)])
        .select()
        .single());
    }

    if (error) throw error;
    return mapWorker({ ...data, advances: [], absences: [], payments: [] });
  },

  async updateWorker(id: string, input: Partial<Worker>): Promise<Worker> {
    // Un compte de connexion demandé après coup : on le crée maintenant.
    let authUserId = input.authUserId;
    if (input.accountEnabled && !authUserId && input.email && input.password) {
      try {
        authUserId = await createAuthAccount(input);
      } catch (err: any) {
        // Compte déjà existant côté Auth : ce n'est pas une erreur bloquante,
        // l'employé pourra se connecter avec son mot de passe existant.
        if (!/already registered|already exists/i.test(err?.message ?? '')) throw err;
        console.warn('[WorkerService] Compte Auth déjà existant pour', input.email);
      }
    }

    const row = toDbRow(input, true);
    if (authUserId) row.auth_user_id = authUserId;

    let { data, error } = await supabase
      .from('workers').update(row).eq('id', id).select().single();

    if (error && isMissingColumn(error)) {
      WorkerService.migrationApplied = false;
      ({ data, error } = await supabase
        .from('workers')
        .update(toLegacyRow(input, true))
        .eq('id', id)
        .select()
        .single());
    }

    if (error) throw error;
    return mapWorker({ ...data, advances: [], absences: [], payments: [] });
  },

  async deleteWorker(id: string): Promise<void> {
    const { error } = await supabase.from('workers').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Permissions ──────────────────────────────────────────────────────────
  async setPermissions(workerId: string, keys: string[]): Promise<void> {
    const { error } = await supabase
      .from('workers')
      .update({ permissions: keys })
      .eq('id', workerId);

    if (error) {
      if (isMissingColumn(error)) {
        throw new Error(
          'La colonne « permissions » est absente. Exécutez migration_equipe_caisse.sql dans Supabase → SQL Editor.',
        );
      }
      throw error;
    }
  },

  // ── Acomptes / absences / paiements ──────────────────────────────────────
  async addAdvance(workerId: string, a: Omit<WorkerAdvance, 'id'>): Promise<WorkerAdvance> {
    const { data, error } = await supabase
      .from('worker_advances')
      .insert([{ worker_id: workerId, amount: a.amount, date: a.date, note: a.note || null }])
      .select().single();
    if (error) throw error;
    return mapAdvance(data);
  },

  async deleteAdvance(id: string): Promise<void> {
    const { error } = await supabase.from('worker_advances').delete().eq('id', id);
    if (error) throw error;
  },

  async addAbsence(workerId: string, a: Omit<WorkerAbsence, 'id'>): Promise<WorkerAbsence> {
    const { data, error } = await supabase
      .from('worker_absences')
      .insert([{ worker_id: workerId, cost: a.cost, date: a.date, note: a.note || null }])
      .select().single();
    if (error) throw error;
    return mapAbsence(data);
  },

  async deleteAbsence(id: string): Promise<void> {
    const { error } = await supabase.from('worker_absences').delete().eq('id', id);
    if (error) throw error;
  },

  async addPayment(workerId: string, p: Omit<WorkerPayment, 'id'>): Promise<WorkerPayment> {
    const base: any = {
      worker_id: workerId,
      amount: p.amount,
      date: p.date,
      base_salary: p.baseSalary,
      advances: p.advances,
      absences: p.absences,
      net_salary: p.netSalary,
      note: p.note || null,
    };
    const withPeriod = { ...base, period_start: p.periodStart || null, period_end: p.periodEnd || null };

    let { data, error } = await supabase
      .from('worker_payments').insert([withPeriod]).select().single();

    if (error && isMissingColumn(error)) {
      ({ data, error } = await supabase
        .from('worker_payments').insert([base]).select().single());
    }

    if (error) throw error;
    return mapPayment(data);
  },

  async deletePayment(id: string): Promise<void> {
    const { error } = await supabase.from('worker_payments').delete().eq('id', id);
    if (error) throw error;
  },

  async updatePayment(id: string, p: Partial<WorkerPayment>): Promise<void> {
    const row: any = {};
    if (p.amount !== undefined) row.amount = p.amount;
    if (p.date !== undefined) row.date = p.date;
    if (p.note !== undefined) row.note = p.note || null;
    if (p.netSalary !== undefined) row.net_salary = p.netSalary;

    const { error } = await supabase.from('worker_payments').update(row).eq('id', id);
    if (error) throw error;
  },
};

/**
 * Crée le compte de connexion dans Supabase Auth, puis restaure la session de
 * l'administrateur dans le SDK.
 */
async function createAuthAccount(input: Partial<Worker>): Promise<string | undefined> {
  const { data, error } = await supabase.auth.signUp({
    email: input.email!,
    password: input.password!,
    options: {
      data: {
        full_name: input.fullName,
        username: input.username,
        role: input.type ?? 'worker',
        role_name: input.roleName,
      },
    },
  });

  // Quoi qu'il arrive, on rend sa session à l'administrateur avant de rendre
  // la main : sans cela l'insertion suivante partirait sous l'identité du
  // compte fraîchement créé (et serait refusée par RLS).
  await sessionService.ensureSupabaseSession().catch(() => {});

  if (error) throw error;
  return data?.user?.id;
}

/** Ligne complète (migration jouée). */
function toDbRow(w: Partial<Worker>, partial = false): any {
  const row: any = {};
  const set = (k: string, v: any) => {
    if (!partial || v !== undefined) row[k] = v ?? null;
  };

  set('full_name', w.fullName);
  set('date_of_birth', w.dateOfBirth || null);
  set('phone', w.phone);
  set('email', w.email);
  set('address', w.address);
  set('profile_photo', w.profilePhoto);
  set('id_card_number', w.idCardNumber);
  set('type', w.type ?? 'worker');
  set('role_name', w.roleName);
  set('start_date', w.startDate || null);
  set('payment_enabled', w.paymentEnabled ?? true);
  set('payment_type', w.paymentType ?? 'monthly');
  set('base_salary', w.baseSalary ?? 0);
  set('account_enabled', w.accountEnabled ?? false);
  set('username', w.username);
  set('password', w.password);
  if (w.permissions !== undefined) row.permissions = w.permissions;
  return row;
}

/** Ligne restreinte aux colonnes historiques (migration non jouée). */
function toLegacyRow(w: Partial<Worker>, partial = false): any {
  const full = toDbRow(w, partial);
  [
    'id_card_number', 'role_name', 'start_date', 'payment_enabled',
    'account_enabled', 'auth_user_id', 'permissions',
  ].forEach(k => delete full[k]);
  return full;
}
