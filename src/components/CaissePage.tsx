import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowDownCircle, ArrowUpCircle, Wallet, TrendingUp, TrendingDown,
  Trash2, Pencil, Plus, Receipt, Car as CarIcon, Store, Users, CalendarRange,
} from 'lucide-react';
import { Language, User, CaisseTransaction, ReservationDetails, VehicleExpense, StoreExpense, Worker } from '../types';
import { CaisseService, PeriodKey, resolvePeriod, inPeriod } from '../services/caisseService';
import { ReservationsService } from '../services/ReservationsService';
import { getVehicleExpenses, getStoreExpenses } from '../services/expenseService';
import { DatabaseService } from '../services/DatabaseService';
import { formatAmount } from '../utils/format';
import { useCan } from '../utils/permissions';
import {
  PageHeader, StatCard, StatGrid, Panel, Modal, Field, FormGrid, Btn, ActionBtn,
  EmptyState, LoadingState, ErrorBanner, InfoBanner, Segmented, Select, Row,
  Badge, TableWrap, Th, Td, Donut, BarChart, RankBars, SERIES,
} from './ui/fx';

interface Props {
  lang: Language;
  user: User | null;
}

const DA = (n: number) => `${formatAmount(Math.round(n))} DA`;
const today = () => new Date().toISOString().slice(0, 10);

type Tab = 'overview' | 'transactions' | 'rentals' | 'expenses';

/**
 * CAISSE
 * ──────
 * Deux natures d'information sur le même écran, volontairement distinguées :
 *
 *  • Les MOUVEMENTS D'ESPÈCES saisis à la main (dépôt / retrait) — c'est la
 *    seule chose que cette page écrit en base.
 *  • La SYNTHÈSE de tout ce qui touche à l'argent sur la période choisie :
 *    encaissements de locations, créances, dépenses véhicules, dépenses
 *    agence, salaires. Lue dans les tables d'origine, jamais recopiée.
 *
 * Le solde affiché est donc « ce qu'il y a dans le tiroir » (mouvements
 * manuels) et non le résultat comptable — les deux sont montrés côte à côte
 * pour qu'on ne les confonde pas.
 */
export const CaissePage: React.FC<Props> = ({ lang, user }) => {
  const fr = lang === 'fr';
  const can = useCan('caisse');

  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [custom, setCustom] = useState({ from: '', to: today() });

  const [transactions, setTransactions] = useState<CaisseTransaction[]>([]);
  const [reservations, setReservations] = useState<ReservationDetails[]>([]);
  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpense[]>([]);
  const [storeExpenses, setStoreExpenses] = useState<StoreExpense[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);

  const [modal, setModal] = useState<{ open: boolean; type: 'deposit' | 'withdraw'; editing: CaisseTransaction | null }>({
    open: false, type: 'deposit', editing: null,
  });

  const range = useMemo(() => resolvePeriod(period, custom), [period, custom]);

  // ─── Chargement ───────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [tx, res, ve, se, wk] = await Promise.all([
        CaisseService.getTransactions().catch(() => []),
        ReservationsService.getReservations().catch(() => []),
        getVehicleExpenses().then(r => r.expenses ?? []).catch(() => []),
        getStoreExpenses().then(r => r.expenses ?? []).catch(() => []),
        DatabaseService.getWorkers().catch(() => []),
      ]);
      setTransactions(tx);
      setReservations(res);
      setVehicleExpenses(ve);
      setStoreExpenses(se);
      setWorkers(wk);
      setTableMissing(!CaisseService.tableReady);
    } catch (err: any) {
      console.error('[Caisse] chargement', err);
      setError(fr ? 'Impossible de charger les données de la caisse.' : 'تعذر تحميل بيانات الصندوق.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ─── Agrégats sur la période ──────────────────────────────────────────────
  const data = useMemo(() => {
    const { from, to } = range;
    const keep = (d?: string | null) => (!from && !to ? true : inPeriod(d, from, to));

    const tx = transactions.filter(t => keep(t.date));
    const deposits = tx.filter(t => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
    const withdrawals = tx.filter(t => t.type === 'withdraw').reduce((s, t) => s + t.amount, 0);

    // Solde de caisse : tous les mouvements depuis l'origine, pas seulement la
    // période — un tiroir ne se remet pas à zéro parce qu'on change de filtre.
    const balance = transactions.reduce((s, t) => s + (t.type === 'deposit' ? t.amount : -t.amount), 0);

    // Locations : on retient celles créées dans la période.
    const rentals = reservations.filter(r => keep((r.createdAt || '').slice(0, 10)));
    const rentalsBilled = rentals.reduce((s, r) => s + Number(r.totalPrice || 0), 0);

    // Encaissé : la somme des paiements réels, plus fiable que `advancePayment`
    // qui n'est qu'un instantané de la saisie initiale.
    const paymentsInPeriod = reservations.flatMap(r =>
      (r.payments ?? [])
        .filter(p => keep((p.date || '').slice(0, 10)))
        .map(p => ({ ...p, reservation: r })),
    );
    const cashedIn = paymentsInPeriod.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Créances : ce qui reste dû sur les locations non annulées, toutes périodes
    // confondues — une dette d'il y a trois mois est toujours une dette.
    const debts = reservations
      .filter(r => r.status !== 'cancelled')
      .map(r => {
        const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
        const due = Number(r.totalPrice || 0) - paid;
        return { reservation: r, paid, due };
      })
      .filter(d => d.due > 0.5);
    const totalDebt = debts.reduce((s, d) => s + d.due, 0);

    const carExp = vehicleExpenses.filter(e => keep(e.date));
    const carExpTotal = carExp.reduce((s, e) => s + Number(e.cost || 0), 0);

    const storeExp = storeExpenses.filter(e => keep(e.date));
    const storeExpTotal = storeExp.reduce((s, e) => s + Number(e.cost || 0), 0);

    // Salaires réglés + acomptes versés sur la période.
    const salaries = workers.flatMap(w => (w.payments ?? []).filter(p => keep(p.date)).map(p => ({ ...p, worker: w })));
    const salaryTotal = salaries.reduce((s, p) => s + Number(p.netSalary || p.amount || 0), 0);
    const advances = workers.flatMap(w => (w.advances ?? []).filter(a => keep(a.date)).map(a => ({ ...a, worker: w })));
    const advanceTotal = advances.reduce((s, a) => s + Number(a.amount || 0), 0);

    const outflow = carExpTotal + storeExpTotal + salaryTotal + advanceTotal;
    const net = cashedIn - outflow;

    // Répartition des dépenses par poste
    const byType = new Map<string, number>();
    carExp.forEach(e => byType.set(e.type, (byType.get(e.type) ?? 0) + Number(e.cost || 0)));

    // Évolution mensuelle des encaissements sur 6 mois (indépendante du filtre :
    // c'est une tendance, pas une photo de la période).
    const months: { label: string; value: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const total = reservations
        .flatMap(r => r.payments ?? [])
        .filter(p => (p.date || '').startsWith(key))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      months.push({ label: d.toLocaleDateString('fr-FR', { month: 'short' }), value: total });
    }

    return {
      tx, deposits, withdrawals, balance,
      rentals, rentalsBilled, cashedIn, paymentsInPeriod,
      debts, totalDebt,
      carExp, carExpTotal, storeExp, storeExpTotal,
      salaries, salaryTotal, advances, advanceTotal,
      outflow, net, byType, months,
    };
  }, [transactions, reservations, vehicleExpenses, storeExpenses, workers, range]);

  // ─── Écriture ─────────────────────────────────────────────────────────────
  const saveTransaction = async (form: { type: 'deposit' | 'withdraw'; amount: number; date: string; description: string }) => {
    try {
      if (modal.editing) {
        await CaisseService.updateTransaction(modal.editing.id, form);
        setTransactions(prev => prev.map(t => (t.id === modal.editing!.id ? { ...t, ...form } : t)));
      } else {
        const created = await CaisseService.createTransaction({ ...form, createdBy: user?.name });
        setTransactions(prev => [created, ...prev]);
      }
      setModal({ open: false, type: 'deposit', editing: null });
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  const removeTransaction = async (id: string) => {
    if (!window.confirm(fr ? 'Supprimer ce mouvement ?' : 'حذف هذه الحركة؟')) return;
    try {
      await CaisseService.deleteTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────
  const periodOptions = [
    { value: 'today', label: fr ? "Aujourd'hui" : 'اليوم' },
    { value: 'week', label: fr ? 'Cette semaine' : 'هذا الأسبوع' },
    { value: 'month', label: fr ? 'Ce mois' : 'هذا الشهر' },
    { value: 'quarter', label: fr ? 'Ce trimestre' : 'هذا الفصل' },
    { value: 'year', label: fr ? 'Cette année' : 'هذه السنة' },
    { value: 'all', label: fr ? 'Tout' : 'الكل' },
    { value: 'custom', label: fr ? 'Personnalisée' : 'مخصصة' },
  ];

  return (
    <div className="max-w-[92rem] mx-auto">
      <PageHeader
        icon="🏦"
        eyebrow={fr ? 'Trésorerie' : 'الخزينة'}
        title={fr ? 'Caisse' : 'الصندوق'}
        subtitle={
          fr
            ? "Mouvements d'espèces, encaissements, créances et dépenses sur la période choisie."
            : 'حركات النقد والمقبوضات والديون والمصاريف خلال الفترة المحددة.'
        }
        actions={
          <>
            {can('deposit') && (
              <Btn tone="success" onClick={() => setModal({ open: true, type: 'deposit', editing: null })}>
                <ArrowDownCircle size={16} />
                {fr ? 'Entrée' : 'إيداع'}
              </Btn>
            )}
            {can('withdraw') && (
              <Btn tone="danger" onClick={() => setModal({ open: true, type: 'withdraw', editing: null })}>
                <ArrowUpCircle size={16} />
                {fr ? 'Sortie' : 'سحب'}
              </Btn>
            )}
          </>
        }
      >
        {/* Filtre de période — la commande principale de tout l'écran */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="flex items-center gap-2 shrink-0">
            <CalendarRange size={15} style={{ color: 'var(--fx-red-300)' }} />
            <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--fx-ink-mute)' }}>
              {fr ? 'Période' : 'الفترة'}
            </span>
          </div>
          <Select
            value={period}
            onChange={v => setPeriod(v as PeriodKey)}
            options={periodOptions}
            className="w-full sm:w-52"
            aria-label={fr ? 'Période' : 'الفترة'}
          />
          {period === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-2 flex-1">
              <input
                type="date"
                value={custom.from}
                onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
                className="fx-field flex-1"
                aria-label={fr ? 'Date de début' : 'تاريخ البدء'}
              />
              <input
                type="date"
                value={custom.to}
                onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
                className="fx-field flex-1"
                aria-label={fr ? 'Date de fin' : 'تاريخ الانتهاء'}
              />
            </div>
          )}
        </div>
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={loadAll} retryLabel={fr ? 'Recharger' : 'إعادة'} />}
      {tableMissing && (
        <InfoBanner>
          {fr
            ? 'La table « caisse_transactions » n’existe pas encore. Exécutez migration_equipe_caisse.sql dans Supabase → SQL Editor pour activer la saisie des mouvements. La synthèse ci-dessous fonctionne déjà.'
            : 'جدول caisse_transactions غير موجود بعد. نفّذ migration_equipe_caisse.sql في Supabase.'}
        </InfoBanner>
      )}

      {loading ? (
        <LoadingState label={fr ? 'Chargement de la caisse…' : 'جاري التحميل…'} rows={6} />
      ) : (
        <>
          {/* ── Chiffres clés ── */}
          <div className="mb-5">
            <StatGrid cols={4}>
              <StatCard
                label={fr ? 'Solde de caisse' : 'رصيد الصندوق'}
                value={DA(data.balance)}
                hint={fr ? 'Tous mouvements manuels confondus' : 'كل الحركات اليدوية'}
                icon={<Wallet size={15} />}
                tone={data.balance >= 0 ? 'green' : 'red'}
              />
              <StatCard
                label={fr ? 'Encaissé (période)' : 'المقبوضات'}
                value={DA(data.cashedIn)}
                hint={`${data.paymentsInPeriod.length} ${fr ? 'paiement(s)' : 'دفعة'}`}
                icon={<TrendingUp size={15} />}
                tone="green"
              />
              <StatCard
                label={fr ? 'Décaissé (période)' : 'المدفوعات'}
                value={DA(data.outflow)}
                hint={fr ? 'Véhicules + agence + salaires' : 'مركبات + وكالة + رواتب'}
                icon={<TrendingDown size={15} />}
                tone="red"
              />
              <StatCard
                label={fr ? 'Résultat net' : 'الصافي'}
                value={DA(data.net)}
                hint={fr ? 'Encaissé − décaissé' : 'المقبوضات − المدفوعات'}
                icon="⚖️"
                tone={data.net >= 0 ? 'green' : 'red'}
              />
              <StatCard
                label={fr ? 'Créances clients' : 'ديون العملاء'}
                value={DA(data.totalDebt)}
                hint={`${data.debts.length} ${fr ? 'location(s) impayée(s)' : 'حجز غير مدفوع'}`}
                icon={<Users size={15} />}
                tone="amber"
              />
              <StatCard
                label={fr ? 'Facturé (période)' : 'المفوتر'}
                value={DA(data.rentalsBilled)}
                hint={`${data.rentals.length} ${fr ? 'location(s)' : 'حجز'}`}
                icon={<Receipt size={15} />}
                tone="steel"
              />
              <StatCard
                label={fr ? 'Dépenses véhicules' : 'مصاريف المركبات'}
                value={DA(data.carExpTotal)}
                hint={`${data.carExp.length} ${fr ? 'ligne(s)' : 'سطر'}`}
                icon={<CarIcon size={15} />}
                tone="steel"
              />
              <StatCard
                label={fr ? 'Dépenses agence' : 'مصاريف الوكالة'}
                value={DA(data.storeExpTotal)}
                hint={`${data.storeExp.length} ${fr ? 'ligne(s)' : 'سطر'}`}
                icon={<Store size={15} />}
                tone="steel"
              />
            </StatGrid>
          </div>

          <div className="mb-4">
            <Segmented<Tab>
              value={tab}
              onChange={setTab}
              options={[
                { value: 'overview', label: fr ? '📊 Synthèse' : '📊 ملخص' },
                { value: 'transactions', label: fr ? '💵 Mouvements' : '💵 الحركات', badge: data.tx.length },
                { value: 'rentals', label: fr ? '🧾 Locations' : '🧾 الحجوزات', badge: data.rentals.length },
                { value: 'expenses', label: fr ? '📉 Dépenses' : '📉 المصاريف', badge: data.carExp.length + data.storeExp.length },
              ]}
            />
          </div>

          {/* ══ SYNTHÈSE ══ */}
          {tab === 'overview' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 xl:grid-cols-3 gap-4"
            >
              <Panel title={fr ? 'Répartition des sorties' : 'توزيع المصاريف'} icon="🥧" className="xl:col-span-1">
                {data.outflow > 0 ? (
                  <Donut
                    size={170}
                    centerLabel={fr ? 'Total' : 'المجموع'}
                    centerValue={DA(data.outflow)}
                    data={[
                      { label: fr ? 'Véhicules' : 'مركبات', value: data.carExpTotal },
                      { label: fr ? 'Agence' : 'وكالة', value: data.storeExpTotal },
                      { label: fr ? 'Salaires' : 'رواتب', value: data.salaryTotal },
                      { label: fr ? 'Acomptes' : 'سلف', value: data.advanceTotal },
                    ].filter(d => d.value > 0)}
                  />
                ) : (
                  <p className="py-8 text-center text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
                    {fr ? 'Aucune sortie sur la période.' : 'لا مصاريف في هذه الفترة.'}
                  </p>
                )}
              </Panel>

              <Panel title={fr ? 'Encaissements — 6 derniers mois' : 'المقبوضات — 6 أشهر'} icon="📈" className="xl:col-span-2">
                <BarChart data={data.months} height={170} format={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} />
              </Panel>

              <Panel title={fr ? 'Dépenses véhicules par type' : 'مصاريف المركبات حسب النوع'} icon="🔧" className="xl:col-span-1">
                {data.byType.size > 0 ? (
                  <RankBars
                    format={DA}
                    data={[...data.byType.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, value], i) => ({ label: EXPENSE_LABEL(type, fr), value, color: SERIES[i % SERIES.length] }))}
                  />
                ) : (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
                    {fr ? 'Aucune dépense véhicule.' : 'لا مصاريف مركبات.'}
                  </p>
                )}
              </Panel>

              <Panel title={fr ? 'Créances en cours' : 'الديون الجارية'} icon="⏳" className="xl:col-span-2">
                {data.debts.length > 0 ? (
                  <TableWrap>
                    <thead className="fx-table-head">
                      <tr>
                        <Th>{fr ? 'Client' : 'العميل'}</Th>
                        <Th>{fr ? 'Véhicule' : 'المركبة'}</Th>
                        <Th align="right">{fr ? 'Total' : 'المجموع'}</Th>
                        <Th align="right">{fr ? 'Payé' : 'مدفوع'}</Th>
                        <Th align="right">{fr ? 'Reste dû' : 'المتبقي'}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.debts.slice(0, 12).map(d => (
                        <tr key={d.reservation.id} className="fx-table-row">
                          <Td>
                            {d.reservation.client
                              ? `${d.reservation.client.firstName} ${d.reservation.client.lastName}`
                              : '—'}
                          </Td>
                          <Td>
                            {d.reservation.car ? `${d.reservation.car.brand} ${d.reservation.car.model}` : '—'}
                          </Td>
                          <Td align="right">{DA(Number(d.reservation.totalPrice || 0))}</Td>
                          <Td align="right">{DA(d.paid)}</Td>
                          <Td align="right" className="font-black">
                            <span style={{ color: 'var(--fx-red-200)' }}>{DA(d.due)}</span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                ) : (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
                    {fr ? 'Aucune créance : tout est encaissé. 🎉' : 'لا ديون. 🎉'}
                  </p>
                )}
              </Panel>
            </motion.div>
          )}

          {/* ══ MOUVEMENTS ══ */}
          {tab === 'transactions' && (
            <Panel
              title={fr ? "Historique des mouvements d'espèces" : 'سجل حركات النقد'}
              icon="💵"
              actions={
                can('deposit') ? (
                  <Btn tone="primary" size="sm" onClick={() => setModal({ open: true, type: 'deposit', editing: null })}>
                    <Plus size={14} />
                    {fr ? 'Nouveau' : 'جديد'}
                  </Btn>
                ) : null
              }
              bodyClassName="p-0"
            >
              {data.tx.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon="💵"
                    title={fr ? 'Aucun mouvement sur la période' : 'لا حركات في هذه الفترة'}
                    description={
                      fr
                        ? 'Enregistrez une entrée ou une sortie pour commencer à suivre le tiroir-caisse.'
                        : 'سجّل إيداعًا أو سحبًا لبدء المتابعة.'
                    }
                  />
                </div>
              ) : (
                <TableWrap>
                  <thead className="fx-table-head">
                    <tr>
                      <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                      <Th>{fr ? 'Type' : 'النوع'}</Th>
                      <Th>{fr ? 'Description' : 'الوصف'}</Th>
                      <Th align="right">{fr ? 'Montant' : 'المبلغ'}</Th>
                      <Th align="right">{fr ? 'Actions' : 'إجراءات'}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tx.map(t => (
                      <tr key={t.id} className="fx-table-row">
                        <Td>{new Date(t.date).toLocaleDateString('fr-FR')}</Td>
                        <Td>
                          <Badge tone={t.type === 'deposit' ? 'green' : 'red'}>
                            {t.type === 'deposit'
                              ? (fr ? 'Entrée' : 'إيداع')
                              : (fr ? 'Sortie' : 'سحب')}
                          </Badge>
                        </Td>
                        <Td>{t.description || <span style={{ color: 'var(--fx-ink-dim)' }}>—</span>}</Td>
                        <Td align="right" className="font-black tabular-nums">
                          <span style={{ color: t.type === 'deposit' ? '#6EE7B7' : 'var(--fx-red-200)' }}>
                            {t.type === 'deposit' ? '+' : '−'}{DA(t.amount)}
                          </span>
                        </Td>
                        <Td align="right">
                          <div className="flex items-center justify-end gap-1.5">
                            {can('edit') && (
                              <ActionBtn
                                icon={<Pencil size={13} />}
                                label={fr ? 'Modifier' : 'تعديل'}
                                onClick={() => setModal({ open: true, type: t.type, editing: t })}
                              />
                            )}
                            {can('delete') && (
                              <ActionBtn
                                icon={<Trash2 size={13} />}
                                label={fr ? 'Supprimer' : 'حذف'}
                                tone="danger"
                                onClick={() => removeTransaction(t.id)}
                              />
                            )}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}

              <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t" style={{ borderColor: 'var(--fx-line)' }}>
                <div className="fx-well p-3">
                  <Row label={fr ? 'Entrées' : 'إيداعات'} value={<span style={{ color: '#6EE7B7' }}>+{DA(data.deposits)}</span>} />
                </div>
                <div className="fx-well p-3">
                  <Row label={fr ? 'Sorties' : 'سحوبات'} value={<span style={{ color: 'var(--fx-red-200)' }}>−{DA(data.withdrawals)}</span>} />
                </div>
                <div className="fx-well p-3">
                  <Row label={fr ? 'Net période' : 'صافي الفترة'} value={DA(data.deposits - data.withdrawals)} strong />
                </div>
              </div>
            </Panel>
          )}

          {/* ══ LOCATIONS ══ */}
          {tab === 'rentals' && (
            <Panel title={fr ? 'Locations de la période' : 'حجوزات الفترة'} icon="🧾" bodyClassName="p-0">
              {data.rentals.length === 0 ? (
                <div className="p-4">
                  <EmptyState icon="🧾" title={fr ? 'Aucune location sur la période' : 'لا حجوزات في هذه الفترة'} />
                </div>
              ) : (
                <TableWrap>
                  <thead className="fx-table-head">
                    <tr>
                      <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                      <Th>{fr ? 'Client' : 'العميل'}</Th>
                      <Th>{fr ? 'Véhicule' : 'المركبة'}</Th>
                      <Th>{fr ? 'Statut' : 'الحالة'}</Th>
                      <Th align="right">{fr ? 'Total' : 'المجموع'}</Th>
                      <Th align="right">{fr ? 'Payé' : 'مدفوع'}</Th>
                      <Th align="right">{fr ? 'Reste' : 'المتبقي'}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rentals.map(r => {
                      const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0);
                      const due = Number(r.totalPrice || 0) - paid;
                      return (
                        <tr key={r.id} className="fx-table-row">
                          <Td>{new Date(r.createdAt).toLocaleDateString('fr-FR')}</Td>
                          <Td>{r.client ? `${r.client.firstName} ${r.client.lastName}` : '—'}</Td>
                          <Td>{r.car ? `${r.car.brand} ${r.car.model}` : '—'}</Td>
                          <Td><Badge tone={STATUS_TONE(r.status)}>{STATUS_LABEL(r.status, fr)}</Badge></Td>
                          <Td align="right" className="tabular-nums">{DA(Number(r.totalPrice || 0))}</Td>
                          <Td align="right" className="tabular-nums">{DA(paid)}</Td>
                          <Td align="right" className="tabular-nums font-bold">
                            <span style={{ color: due > 0.5 ? 'var(--fx-red-200)' : '#6EE7B7' }}>{DA(Math.max(0, due))}</span>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )}
            </Panel>
          )}

          {/* ══ DÉPENSES ══ */}
          {tab === 'expenses' && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Panel title={fr ? 'Dépenses véhicules' : 'مصاريف المركبات'} icon="🚗" bodyClassName="p-0">
                {data.carExp.length === 0 ? (
                  <div className="p-4"><EmptyState icon="🚗" title={fr ? 'Aucune dépense véhicule' : 'لا مصاريف'} /></div>
                ) : (
                  <TableWrap>
                    <thead className="fx-table-head">
                      <tr>
                        <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                        <Th>{fr ? 'Type' : 'النوع'}</Th>
                        <Th>{fr ? 'Note' : 'ملاحظة'}</Th>
                        <Th align="right">{fr ? 'Coût' : 'التكلفة'}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.carExp.map(e => (
                        <tr key={e.id} className="fx-table-row">
                          <Td>{new Date(e.date).toLocaleDateString('fr-FR')}</Td>
                          <Td><Badge tone="red">{EXPENSE_LABEL(e.type, fr)}</Badge></Td>
                          <Td>{e.expenseName || e.note || '—'}</Td>
                          <Td align="right" className="tabular-nums font-bold">{DA(Number(e.cost || 0))}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </Panel>

              <Panel title={fr ? 'Dépenses agence' : 'مصاريف الوكالة'} icon="🏪" bodyClassName="p-0">
                {data.storeExp.length === 0 ? (
                  <div className="p-4"><EmptyState icon="🏪" title={fr ? 'Aucune dépense agence' : 'لا مصاريف'} /></div>
                ) : (
                  <TableWrap>
                    <thead className="fx-table-head">
                      <tr>
                        <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                        <Th>{fr ? 'Libellé' : 'التسمية'}</Th>
                        <Th align="right">{fr ? 'Coût' : 'التكلفة'}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.storeExp.map(e => (
                        <tr key={e.id} className="fx-table-row">
                          <Td>{new Date(e.date).toLocaleDateString('fr-FR')}</Td>
                          <Td>{e.icon} {e.name}</Td>
                          <Td align="right" className="tabular-nums font-bold">{DA(Number(e.cost || 0))}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                )}
              </Panel>

              <Panel title={fr ? 'Salaires & acomptes' : 'الرواتب والسلف'} icon="🤝" className="xl:col-span-2" bodyClassName="p-0">
                {data.salaries.length === 0 && data.advances.length === 0 ? (
                  <div className="p-4"><EmptyState icon="🤝" title={fr ? 'Aucun règlement sur la période' : 'لا مدفوعات'} /></div>
                ) : (
                  <TableWrap>
                    <thead className="fx-table-head">
                      <tr>
                        <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                        <Th>{fr ? 'Employé' : 'الموظف'}</Th>
                        <Th>{fr ? 'Nature' : 'الطبيعة'}</Th>
                        <Th>{fr ? 'Note' : 'ملاحظة'}</Th>
                        <Th align="right">{fr ? 'Montant' : 'المبلغ'}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ...data.salaries.map(s => ({
                          id: `p-${s.id}`, date: s.date, who: s.worker.fullName,
                          kind: fr ? 'Salaire' : 'راتب', note: s.note, amount: Number(s.netSalary || s.amount || 0),
                        })),
                        ...data.advances.map(a => ({
                          id: `a-${a.id}`, date: a.date, who: a.worker.fullName,
                          kind: fr ? 'Acompte' : 'سلفة', note: a.note, amount: Number(a.amount || 0),
                        })),
                      ]
                        .sort((x, y) => y.date.localeCompare(x.date))
                        .map(r => (
                          <tr key={r.id} className="fx-table-row">
                            <Td>{new Date(r.date).toLocaleDateString('fr-FR')}</Td>
                            <Td>{r.who}</Td>
                            <Td><Badge tone={r.kind === 'Salaire' || r.kind === 'راتب' ? 'steel' : 'amber'}>{r.kind}</Badge></Td>
                            <Td>{r.note || '—'}</Td>
                            <Td align="right" className="tabular-nums font-bold">{DA(r.amount)}</Td>
                          </tr>
                        ))}
                    </tbody>
                  </TableWrap>
                )}
              </Panel>
            </div>
          )}
        </>
      )}

      <TransactionModal
        state={modal}
        lang={lang}
        onClose={() => setModal({ open: false, type: 'deposit', editing: null })}
        onSave={saveTransaction}
      />
    </div>
  );
};

// ─── Modale de saisie ────────────────────────────────────────────────────────

const TransactionModal: React.FC<{
  state: { open: boolean; type: 'deposit' | 'withdraw'; editing: CaisseTransaction | null };
  lang: Language;
  onClose: () => void;
  onSave: (f: { type: 'deposit' | 'withdraw'; amount: number; date: string; description: string }) => void;
}> = ({ state, lang, onClose, onSave }) => {
  const fr = lang === 'fr';
  const [form, setForm] = useState({ type: state.type, amount: '', date: today(), description: '' });
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!state.open) return;
    setErr('');
    setForm(
      state.editing
        ? {
            type: state.editing.type,
            amount: String(state.editing.amount),
            date: state.editing.date,
            description: state.editing.description ?? '',
          }
        : { type: state.type, amount: '', date: today(), description: '' },
    );
  }, [state]);

  const submit = () => {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr(fr ? 'Saisissez un montant supérieur à zéro.' : 'أدخل مبلغًا أكبر من صفر.');
      return;
    }
    if (!form.date) {
      setErr(fr ? 'La date est obligatoire.' : 'التاريخ مطلوب.');
      return;
    }
    onSave({ type: form.type, amount, date: form.date, description: form.description.trim() });
  };

  const isDeposit = form.type === 'deposit';

  return (
    <Modal
      open={state.open}
      onClose={onClose}
      size="sm"
      icon={isDeposit ? '⬇️' : '⬆️'}
      title={
        state.editing
          ? (fr ? 'Modifier le mouvement' : 'تعديل الحركة')
          : isDeposit
            ? (fr ? 'Nouvelle entrée' : 'إيداع جديد')
            : (fr ? 'Nouvelle sortie' : 'سحب جديد')
      }
      subtitle={fr ? 'Mouvement du tiroir-caisse' : 'حركة الصندوق'}
      footer={
        <>
          <Btn tone="ghost" onClick={onClose}>{fr ? 'Annuler' : 'إلغاء'}</Btn>
          <Btn tone={isDeposit ? 'success' : 'danger'} onClick={submit}>
            {state.editing ? (fr ? 'Enregistrer' : 'حفظ') : (fr ? 'Valider' : 'تأكيد')}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={form.type}
          onChange={v => setForm(f => ({ ...f, type: v }))}
          options={[
            { value: 'deposit' as const, label: fr ? '⬇️ Entrée' : '⬇️ إيداع' },
            { value: 'withdraw' as const, label: fr ? '⬆️ Sortie' : '⬆️ سحب' },
          ]}
          className="w-full"
        />

        <FormGrid>
          <Field label={fr ? 'Montant (DA)' : 'المبلغ (دج)'} required>
            <input
              type="number" min="0" step="any" inputMode="decimal" autoFocus
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="fx-field text-lg font-black tabular-nums"
              placeholder="0"
            />
          </Field>
          <Field label={fr ? 'Date' : 'التاريخ'} required>
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="fx-field"
            />
          </Field>
        </FormGrid>

        <Field
          label={fr ? 'Description' : 'الوصف'}
          hint={fr ? 'Facultative — mais elle rend l’historique relisible dans six mois.' : 'اختياري'}
        >
          <textarea
            rows={3}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="fx-field resize-y"
            placeholder={fr ? 'Ex. : versement bancaire, achat fournitures…' : 'مثال: إيداع بنكي…'}
          />
        </Field>

        {err && (
          <p className="text-sm font-semibold" style={{ color: 'var(--fx-red-300)' }}>{err}</p>
        )}
      </div>
    </Modal>
  );
};

// ─── Libellés ────────────────────────────────────────────────────────────────

function EXPENSE_LABEL(type: string, fr: boolean): string {
  const map: Record<string, [string, string]> = {
    vidange: ['Vidange', 'تغيير الزيت'],
    assurance: ['Assurance', 'التأمين'],
    controle: ['Contrôle technique', 'الفحص التقني'],
    chaine: ['Chaîne', 'السلسلة'],
    autre: ['Autres', 'أخرى'],
  };
  const e = map[type] ?? [type, type];
  return fr ? e[0] : e[1];
}

function STATUS_LABEL(s: string, fr: boolean): string {
  const map: Record<string, [string, string]> = {
    pending: ['En attente', 'قيد الانتظار'],
    accepted: ['Acceptée', 'مقبول'],
    confirmed: ['Confirmée', 'مؤكد'],
    active: ['En cours', 'جاري'],
    completed: ['Terminée', 'منتهي'],
    cancelled: ['Annulée', 'ملغى'],
  };
  const e = map[s] ?? [s, s];
  return fr ? e[0] : e[1];
}

function STATUS_TONE(s: string): 'red' | 'green' | 'amber' | 'steel' {
  if (s === 'active' || s === 'confirmed') return 'green';
  if (s === 'pending' || s === 'accepted') return 'amber';
  if (s === 'cancelled') return 'red';
  return 'steel';
}
