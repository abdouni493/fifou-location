import { supabase } from '../supabase';
import { CaisseTransaction } from '../types';

/**
 * SERVICE CAISSE
 * ──────────────
 * Deux responsabilités, volontairement séparées :
 *
 *  1. Les MOUVEMENTS MANUELS (dépôt / retrait) — table `caisse_transactions`,
 *     créée par `migration_equipe_caisse.sql`. C'est la seule chose que la
 *     Caisse écrit.
 *
 *  2. La SYNTHÈSE — recettes des locations, dépenses véhicules, dépenses
 *     magasin, salaires, créances. Elle est LUE dans les tables d'origine et
 *     jamais recopiée : une caisse qui duplique la comptabilité finit toujours
 *     par diverger d'elle-même.
 */

const mapTx = (r: any): CaisseTransaction => ({
  id: r.id,
  type: r.type,
  amount: Number(r.amount ?? 0),
  date: r.date,
  description: r.description ?? undefined,
  createdBy: r.created_by ?? undefined,
  createdAt: r.created_at,
});

/** La table n'existe pas encore (migration non jouée). */
const isMissingTable = (err: any) =>
  err?.code === '42P01' || /relation .* does not exist/i.test(err?.message ?? '');

export const CaisseService = {
  tableReady: true,

  async getTransactions(from?: string, to?: string): Promise<CaisseTransaction[]> {
    let query = supabase.from('caisse_transactions').select('*').order('date', { ascending: false });
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);

    const { data, error } = await query;
    if (error) {
      if (isMissingTable(error)) {
        CaisseService.tableReady = false;
        console.warn('[CaisseService] Table absente — exécutez migration_equipe_caisse.sql.');
        return [];
      }
      throw error;
    }
    CaisseService.tableReady = true;
    return (data ?? []).map(mapTx);
  },

  async createTransaction(tx: Omit<CaisseTransaction, 'id' | 'createdAt'>): Promise<CaisseTransaction> {
    const { data, error } = await supabase
      .from('caisse_transactions')
      .insert([{
        type: tx.type,
        amount: tx.amount,
        date: tx.date,
        description: tx.description || null,
        created_by: tx.createdBy || null,
      }])
      .select()
      .single();

    if (error) {
      if (isMissingTable(error)) {
        throw new Error(
          'La table « caisse_transactions » est absente. Exécutez migration_equipe_caisse.sql dans Supabase → SQL Editor.',
        );
      }
      throw error;
    }
    return mapTx(data);
  },

  async updateTransaction(id: string, tx: Partial<CaisseTransaction>): Promise<void> {
    const row: any = {};
    if (tx.type !== undefined) row.type = tx.type;
    if (tx.amount !== undefined) row.amount = tx.amount;
    if (tx.date !== undefined) row.date = tx.date;
    if (tx.description !== undefined) row.description = tx.description || null;

    const { error } = await supabase.from('caisse_transactions').update(row).eq('id', id);
    if (error) throw error;
  },

  async deleteTransaction(id: string): Promise<void> {
    const { error } = await supabase.from('caisse_transactions').delete().eq('id', id);
    if (error) throw error;
  },
};

// ─── Périodes de filtrage ────────────────────────────────────────────────────

export type PeriodKey = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Borne une période. Renvoie des dates ISO (yyyy-mm-dd) inclusives.
 * 'all' renvoie `from` vide : les requêtes omettent alors le filtre bas.
 */
export function resolvePeriod(
  key: PeriodKey,
  custom?: { from: string; to: string },
): { from: string; to: string; label: string } {
  const now = new Date();
  const to = iso(now);

  switch (key) {
    case 'today':
      return { from: to, to, label: "Aujourd'hui" };

    case 'week': {
      const d = new Date(now);
      // Semaine ISO : lundi comme premier jour.
      const day = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - day);
      return { from: iso(d), to, label: 'Cette semaine' };
    }

    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(d), to, label: 'Ce mois' };
    }

    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3) * 3;
      const d = new Date(now.getFullYear(), q, 1);
      return { from: iso(d), to, label: 'Ce trimestre' };
    }

    case 'year': {
      const d = new Date(now.getFullYear(), 0, 1);
      return { from: iso(d), to, label: 'Cette année' };
    }

    case 'custom':
      return {
        from: custom?.from || '',
        to: custom?.to || to,
        label: 'Période personnalisée',
      };

    case 'all':
    default:
      return { from: '', to: '', label: 'Tout l\'historique' };
  }
}

/** `date` tombe-t-elle dans [from, to] ? Bornes vides = pas de limite. */
export function inPeriod(date: string | undefined | null, from: string, to: string): boolean {
  if (!date) return false;
  const d = date.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
