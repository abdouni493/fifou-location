import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, TrendingUp, TrendingDown, Users, Car as CarIcon,
  AlertTriangle, BarChart3, Activity, Loader2, Wrench,
  ShieldCheck, Droplets, Link as LinkIcon, ChevronDown,
  Phone, MapPin, Briefcase, CreditCard, AlertCircle, Clock,
  Building, FileText, Printer, Handshake, Wallet, Receipt, PieChart,
} from 'lucide-react';
import {
  Language, Car, Client, ReservationDetails, Worker,
  StoreExpense, VehicleExpense, MaintenanceAlert, WebsiteOrder, ExpenseType,
} from '../types';
import { DatabaseService } from '../services/DatabaseService';
import { ReservationsService } from '../services/ReservationsService';
import { getVehicleExpenses } from '../services/expenseService';
import { getCarsWithOwners } from '../services/carService';
import {
  calcPaid, inRange, pct, fmtPct, isOpenRental,
  computeFleetGains, sumFleetGains, commissionBreakdown,
  VehicleGainsRow,
} from '../utils/gainsMath';
import { PctChip, SplitBar, SplitLegend, CalcRow, StatCard, Tone } from './gains/GainsUI';
import { generateReportHTML } from './ReportPrintTemplate';
import {
  PageHeader, Btn, Panel, EmptyState, LoadingState, ErrorBanner,
  Donut, RankBars, BarChart as FxBarChart, Gauge as FxGauge, SERIES,
} from './ui/fx';

/** Libellés des postes de dépense pour les classements visuels. */
const EXPENSE_LABELS: Record<string, string> = {
  vidange: '🛢️ Vidange',
  assurance: '🛡️ Assurance',
  controle: '📋 Contrôle technique',
  chaine: '⛓️ Chaîne',
  autre: '🔩 Autres',
};

// ── helpers ──────────────────────────────────────────────────────────────────
const T = (fr: string, ar: string, lang: Language) => (lang === 'fr' ? fr : ar);
const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-DZ');
const fmtD = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return d || '';
  }
};

const EXPENSE_META: Record<
  ExpenseType,
  { fr: string; ar: string; icon: React.ReactNode; color: string; bg: string }
> = {
  vidange:   { fr: 'Vidange',        ar: 'تغيير الزيت', icon: <Droplets size={12} />,   color: 'text-amber-700',  bg: 'bg-amber-50' },
  assurance: { fr: 'Assurance',      ar: 'تأمين',       icon: <ShieldCheck size={12} />, color: 'text-blue-700',   bg: 'bg-blue-50' },
  controle:  { fr: 'Contrôle Tech.', ar: 'معاينة تقنية', icon: <Activity size={12} />,    color: 'text-purple-700', bg: 'bg-purple-50' },
  chaine:    { fr: 'Chaîne',         ar: 'السلسلة',     icon: <LinkIcon size={12} />,    color: 'text-teal-700',   bg: 'bg-teal-50' },
  autre:     { fr: 'Autre',          ar: 'أخرى',        icon: <Wrench size={12} />,      color: 'text-slate-700',  bg: 'bg-slate-50' },
};

const STATUS_CLS = (s: string) =>
  ({
    completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    active:    'bg-indigo-50 text-indigo-700 ring-indigo-200',
    confirmed: 'bg-blue-50 text-blue-700 ring-blue-200',
    accepted:  'bg-sky-50 text-sky-700 ring-sky-200',
    pending:   'bg-amber-50 text-amber-700 ring-amber-200',
    cancelled: 'bg-slate-100 text-slate-500 ring-slate-200',
  }[s] || 'bg-slate-100 text-slate-500 ring-slate-200');

// ── Section accordéon ────────────────────────────────────────────────────────
/**
 * Déclarée AU NIVEAU DU MODULE, et surtout pas dans le corps de `ReportsPage`.
 * Un composant recréé à chaque rendu est un type React différent à chaque fois :
 * React démontait tout le sous-arbre au moindre changement d'état, et chaque
 * fiche véhicule ouverte se refermait dès qu'on touchait une autre section.
 */
const Section: React.FC<{
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: number | string;
  accent: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}> = ({ id, icon, title, subtitle, badge, accent, open, onToggle, children }) => (
  <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
    <button
      onClick={() => onToggle(id)}
      className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-slate-50"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accent}`}>{icon}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-800">{title}</p>
          {subtitle && <p className="truncate text-[11px] font-medium text-slate-400">{subtitle}</p>}
        </div>
        {badge !== undefined && (
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
            {badge}
          </span>
        )}
      </div>
      <ChevronDown
        size={17}
        className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
      />
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden border-t border-slate-100"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);

// ── Fiche véhicule dépliable ─────────────────────────────────────────────────
const CarBlock: React.FC<{
  row: VehicleGainsRow;
  reservations: ReservationDetails[];
  expenses: VehicleExpense[];
  lang: Language;
  idx: number;
}> = ({ row, reservations, expenses, lang, idx }) => {
  const [open, setOpen] = useState(false);
  const [openRes, setOpenRes] = useState<string | null>(null);
  const { car, gains: g } = row;
  const owner = g.owner;

  const byType = (Object.keys(EXPENSE_META) as ExpenseType[]).reduce((acc, k) => {
    const group = expenses.filter(e => e.type === k);
    if (group.length) acc[k] = group;
    return acc;
  }, {} as Record<ExpenseType, VehicleExpense[]>);

  const scaleLabel = owner
    ? owner.commissionType === 'percentage'
      ? `${owner.commissionValue.toLocaleString('fr-FR')} %`
      : `${fmt(owner.commissionValue)} DA`
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(idx, 8) * 0.04 }}
      className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
    >
      <button onClick={() => setOpen(o => !o)} className="w-full p-4 text-left transition hover:bg-slate-50">
        <div className="flex items-center gap-3">
          <div className="h-11 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
            <img
              src={car.images?.[0] || 'https://picsum.photos/seed/car/400/300'}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-sm font-extrabold text-slate-800">
              {car.brand} {car.model}
              {g.isConsignment && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                  <Handshake size={9} />
                  {T('Conciergerie', 'أمانة', lang)}
                </span>
              )}
            </p>
            <p className="text-xs font-semibold text-indigo-600">{car.registration}</p>
          </div>

          {/* Chiffres clés — desktop */}
          <div className="mr-1 hidden items-center gap-5 sm:flex">
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase text-slate-400">
                {T('Revenu agence', 'إيراد الوكالة', lang)}
              </p>
              <p className="text-sm font-extrabold tabular-nums text-emerald-700">+{fmt(g.agencyRevenue)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase text-slate-400">
                {T('Dépenses', 'المصاريف', lang)}
              </p>
              <p className="text-sm font-extrabold tabular-nums text-rose-600">−{fmt(g.expenses)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase text-slate-400">
                {T('Net', 'الصافي', lang)}
              </p>
              <p
                className={`text-sm font-extrabold tabular-nums ${
                  g.netBenefit >= 0 ? 'text-indigo-700' : 'text-rose-600'
                }`}
              >
                {g.netBenefit >= 0 ? '+' : ''}
                {fmt(g.netBenefit)}
              </p>
            </div>
            <PctChip value={g.margin} tone={g.netBenefit >= 0 ? 'indigo' : 'rose'} />
          </div>

          <span className="shrink-0 text-[11px] font-semibold text-slate-400">
            {reservations.length} {T('loc.', 'إيجار', lang)}
          </span>
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Chiffres clés — mobile */}
        <div className="mt-2.5 flex flex-wrap gap-1.5 sm:hidden">
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold tabular-nums text-emerald-700 ring-1 ring-emerald-200">
            +{fmt(g.agencyRevenue)}
          </span>
          <span className="rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold tabular-nums text-rose-700 ring-1 ring-rose-200">
            −{fmt(g.expenses)}
          </span>
          <span
            className={`rounded-md px-2 py-1 text-[10px] font-bold tabular-nums ring-1 ${
              g.netBenefit >= 0
                ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
                : 'bg-rose-50 text-rose-700 ring-rose-200'
            }`}
          >
            {g.netBenefit >= 0 ? '+' : ''}
            {fmt(g.netBenefit)}
          </span>
          <PctChip value={g.margin} tone={g.netBenefit >= 0 ? 'indigo' : 'rose'} />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-slate-100"
          >
            <div className="space-y-4 bg-slate-50 p-4">
              {/* Bandeau propriétaire */}
              {g.isConsignment && owner && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-amber-50 px-4 py-2.5 text-[11px] ring-1 ring-amber-200">
                  <span className="flex items-center gap-1.5 font-bold text-amber-900">
                    <Handshake size={11} />
                    {owner.ownerName}
                    {owner.internalRef && (
                      <span className="rounded bg-amber-200/70 px-1.5 py-0.5 font-bold" dir="ltr">
                        {owner.internalRef}
                      </span>
                    )}
                  </span>
                  {owner.ownerPhone && (
                    <span className="font-semibold text-amber-800" dir="ltr">
                      {owner.ownerPhone}
                    </span>
                  )}
                  <span className="font-semibold text-amber-800">
                    {T('Barème', 'الاتفاق', lang)} : {scaleLabel} / {T('location', 'إيجار', lang)}
                  </span>
                </div>
              )}

              {/* Détail du calcul du véhicule */}
              <div className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <PieChart size={12} />
                  {T('Détail du calcul', 'تفصيل الحساب', lang)}
                </p>

                <div className="divide-y divide-slate-100">
                  {g.consignment ? (
                    <>
                      <CalcRow
                        label={T('CA locations terminées', 'رقم أعمال الإيجارات المنتهية', lang)}
                        formula={`${g.consignment.completedCount} / ${g.rentals} ${T('location(s)', 'إيجار', lang)}`}
                        amount={g.consignment.grossCompleted}
                        share={100}
                        tone="slate"
                      />
                      <CalcRow
                        sign="−"
                        label={T('Commission agence', 'عمولة الوكالة', lang)}
                        formula={
                          owner?.commissionType === 'percentage'
                            ? `${fmt(g.consignment.grossCompleted)} × ${scaleLabel}`
                            : `${g.consignment.completedCount} × ${scaleLabel}`
                        }
                        amount={g.consignment.commissionEarned}
                        share={g.effectiveCommissionRate}
                        tone="amber"
                      />
                      <CalcRow
                        sign="−"
                        label={T('Livraison propriétaire (≥ 10 j)', 'التوصيل على المالك (≥ 10 أيام)', lang)}
                        amount={g.consignment.ownerDeliveryFees}
                        share={pct(g.consignment.ownerDeliveryFees, g.consignment.grossCompleted)}
                        tone="amber"
                      />
                      <CalcRow
                        sign="="
                        label={T('À reverser au propriétaire', 'المستحق للمالك', lang)}
                        amount={g.ownerPayout}
                        share={g.ownerShare}
                        tone="slate"
                        strong
                      />
                      <CalcRow
                        sign="−"
                        label={T('Dépenses véhicule', 'مصاريف المركبة', lang)}
                        amount={g.expenses}
                        share={g.expenseRatio}
                        tone="rose"
                      />
                      <CalcRow
                        sign="="
                        label={T('Bénéfice net agence', 'صافي ربح الوكالة', lang)}
                        formula={`${fmt(g.consignment.commissionEarned)} + ${fmt(g.consignment.ownerDeliveryFees)} − ${fmt(g.expenses)}`}
                        amount={g.netBenefit}
                        share={g.margin}
                        tone={g.netBenefit >= 0 ? 'indigo' : 'rose'}
                        strong
                      />
                    </>
                  ) : (
                    <>
                      <CalcRow
                        label={T('Total facturé', 'الإجمالي المفوتر', lang)}
                        formula={`${g.rentals} ${T('location(s)', 'إيجار', lang)}`}
                        amount={g.invoiced}
                        share={100}
                        tone="slate"
                      />
                      <CalcRow
                        sign="+"
                        label={T('Encaissé', 'المحصّل', lang)}
                        amount={g.collected}
                        share={g.collectionRate}
                        tone="emerald"
                      />
                      <CalcRow
                        sign="−"
                        label={T('Dépenses véhicule', 'مصاريف المركبة', lang)}
                        amount={g.expenses}
                        share={g.expenseRatio}
                        tone="rose"
                      />
                      <CalcRow
                        sign="="
                        label={T('Bénéfice net', 'صافي الأرباح', lang)}
                        formula={`${fmt(g.collected)} − ${fmt(g.expenses)}`}
                        amount={g.netBenefit}
                        share={g.margin}
                        tone={g.netBenefit >= 0 ? 'indigo' : 'rose'}
                        strong
                      />
                    </>
                  )}
                </div>

                {g.consignment && g.consignment.grossCompleted > 0 && (
                  <div className="mt-4">
                    <SplitBar
                      segments={[
                        { value: g.consignment.commissionEarned, label: T('Commission', 'العمولة', lang), cls: 'bg-amber-500' },
                        { value: g.consignment.ownerDeliveryFees, label: T('Livraison', 'التوصيل', lang), cls: 'bg-amber-300' },
                        { value: g.ownerPayout, label: T('Propriétaire', 'المالك', lang), cls: 'bg-slate-400' },
                      ]}
                    />
                    <SplitLegend
                      items={[
                        { label: T('Agence', 'الوكالة', lang), cls: 'bg-amber-500', pct: g.agencyShare, tone: 'amber' },
                        { label: T('Propriétaire', 'المالك', lang), cls: 'bg-slate-400', pct: g.ownerShare, tone: 'slate' },
                      ]}
                    />
                  </div>
                )}

                {g.consignment && g.consignment.pendingCount > 0 && (
                  <p className="mt-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                    <Clock size={12} className="shrink-0 text-slate-400" />
                    {g.consignment.pendingCount}{' '}
                    {T('location(s) en cours — commission estimée', 'إيجار جارٍ — عمولة مقدرة', lang)} :{' '}
                    <strong className="tabular-nums">+{fmt(g.consignment.commissionPending)} DZD</strong>
                  </p>
                )}
              </div>

              {/* Locations */}
              <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                    <Calendar size={11} />
                    {T('Locations', 'الإيجارات', lang)} ({reservations.length})
                  </span>
                  <span className="text-[11px] font-bold tabular-nums text-emerald-700">
                    +{fmt(g.collected)} DZD
                    {g.outstanding > 0 && (
                      <span className="ml-2 font-semibold text-amber-600">
                        / {fmt(g.outstanding)} {T('reste', 'متبقي', lang)}
                      </span>
                    )}
                  </span>
                </div>

                {reservations.length === 0 ? (
                  <p className="py-5 text-center text-xs font-semibold text-slate-400">
                    {T('Aucune location pour cette période', 'لا توجد إيجارات لهذه الفترة', lang)}
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {reservations.map((r, ri) => {
                      const paid = calcPaid(r);
                      const debt = Number(r.remainingPayment) || 0;
                      const total = Number(r.totalPrice) || 0;
                      const isOpen = openRes === r.id;
                      const weight = r.status === 'cancelled' ? 0 : pct(total, g.invoiced);
                      const cb = owner ? commissionBreakdown(r, owner) : null;

                      return (
                        <div key={r.id}>
                          <button
                            onClick={() => setOpenRes(isOpen ? null : r.id)}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition hover:bg-slate-50"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-500">
                              {ri + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-bold text-slate-800">
                                {r.client?.firstName} {r.client?.lastName}
                              </p>
                              <p className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock size={8} />
                                <span className="tabular-nums" dir="ltr">
                                  {fmtD(r.step1?.departureDate)} → {fmtD(r.step1?.returnDate)}
                                </span>
                                <span className="font-semibold text-slate-500">{r.totalDays}j</span>
                              </p>
                            </div>
                            {weight > 0 && <PctChip value={weight} tone="slate" />}
                            <div className="shrink-0 space-y-0.5 text-right">
                              <p className="text-[11px] font-bold tabular-nums text-emerald-700">✓ {fmt(paid)}</p>
                              {debt > 0 && (
                                <p className="text-[10px] font-semibold tabular-nums text-amber-600">
                                  ⏳ {fmt(debt)}
                                </p>
                              )}
                            </div>
                            <span
                              className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold ring-1 ${STATUS_CLS(r.status)}`}
                            >
                              {r.status}
                            </span>
                            <ChevronDown
                              size={13}
                              className={`shrink-0 text-slate-300 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                            />
                          </button>

                          <AnimatePresence initial={false}>
                            {isOpen && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden bg-slate-50/70"
                              >
                                <div className="space-y-2.5 px-4 py-3">
                                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                                    {[
                                      { l: T('Total facturé', 'الإجمالي', lang), v: total, c: 'text-slate-900', p: weight },
                                      { l: T('Avance', 'الدفعة الأولى', lang), v: Number(r.advancePayment) || 0, c: 'text-blue-700', p: pct(Number(r.advancePayment) || 0, total) },
                                      { l: T('Encaissé', 'المحصّل', lang), v: paid, c: 'text-emerald-700', p: pct(paid, total) },
                                      { l: T('Reste à payer', 'المتبقي', lang), v: debt, c: debt > 0 ? 'text-amber-700' : 'text-emerald-700', p: pct(debt, total) },
                                    ].map(item => (
                                      <div key={item.l} className="rounded-lg bg-white p-2 ring-1 ring-slate-200">
                                        <p className="text-[10px] font-semibold text-slate-400">{item.l}</p>
                                        <p className={`text-xs font-extrabold tabular-nums ${item.c}`}>
                                          {fmt(item.v)} <span className="text-[9px] text-slate-400">DZD</span>
                                        </p>
                                        <p className="text-[9px] font-semibold tabular-nums text-slate-400">
                                          {fmtPct(item.p)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Commission — le calcul, location par location */}
                                  {cb && owner && r.status !== 'cancelled' && (
                                    <div className="rounded-lg bg-white p-3 ring-1 ring-amber-200">
                                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                        <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                                          <Handshake size={10} />
                                          {T('Calcul de la commission', 'حساب العمولة', lang)}
                                        </p>
                                        <span
                                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold ring-1 ${
                                            cb.locked
                                              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                              : 'bg-slate-100 text-slate-500 ring-slate-200'
                                          }`}
                                        >
                                          {cb.locked
                                            ? T('Figée', 'مثبتة', lang)
                                            : T('Estimée', 'مقدرة', lang)}
                                        </span>
                                      </div>
                                      <p
                                        className="mb-2 rounded bg-amber-50 px-2.5 py-1.5 font-mono text-[11px] font-semibold tabular-nums text-amber-900"
                                        dir="ltr"
                                      >
                                        {fmt(cb.base)} × {scaleLabel} → {fmt(cb.commission)} DZD
                                        {cb.ownerDelivery > 0 && ` (+ ${fmt(cb.ownerDelivery)} ${T('livraison', 'توصيل', lang)})`}
                                      </p>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        <div className="rounded-lg bg-amber-50 p-2 ring-1 ring-amber-200">
                                          <p className="text-[10px] font-semibold text-amber-700">
                                            {T('Part agence', 'حصة الوكالة', lang)}
                                          </p>
                                          <p className="flex items-center gap-1.5 text-xs font-extrabold tabular-nums text-amber-800">
                                            {fmt(cb.agencyPart)}
                                            <PctChip value={pct(cb.agencyPart, cb.base)} tone="amber" />
                                          </p>
                                        </div>
                                        <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                                          <p className="text-[10px] font-semibold text-slate-500">
                                            {T('Part propriétaire', 'حصة المالك', lang)}
                                          </p>
                                          <p className="flex items-center gap-1.5 text-xs font-extrabold tabular-nums text-slate-700">
                                            {fmt(cb.ownerPart)}
                                            <PctChip value={pct(cb.ownerPart, cb.base)} tone="slate" />
                                          </p>
                                        </div>
                                      </div>
                                      <div className="mt-2">
                                        <SplitBar
                                          height="h-2"
                                          segments={[
                                            { value: cb.agencyPart, label: T('Agence', 'الوكالة', lang), cls: 'bg-amber-500' },
                                            { value: cb.ownerPart, label: T('Propriétaire', 'المالك', lang), cls: 'bg-slate-400' },
                                          ]}
                                        />
                                      </div>
                                    </div>
                                  )}

                                  {/* Paiements */}
                                  {r.payments && r.payments.length > 0 && (
                                    <div className="space-y-1">
                                      <p className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                        <CreditCard size={9} />
                                        {T('Paiements enregistrés', 'المدفوعات المسجلة', lang)}
                                      </p>
                                      {(r.payments as any[]).map((p, pi) => (
                                        <div
                                          key={p.id || pi}
                                          className="flex justify-between rounded-lg bg-white px-2.5 py-1.5 text-[10px] ring-1 ring-slate-100"
                                        >
                                          <span className="text-slate-500">
                                            {fmtD(p.date)} · {p.paymentMethod || p.payment_method || 'cash'}
                                          </span>
                                          <span className="font-bold tabular-nums text-emerald-700">
                                            +{fmt(Number(p.amount) || 0)} DZD
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {(Number(r.additionalFees) || 0) > 0 && (
                                    <div className="flex justify-between rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] ring-1 ring-rose-100">
                                      <span className="text-slate-500">
                                        {T('Frais supplémentaires', 'رسوم إضافية', lang)}
                                      </span>
                                      <span className="font-bold tabular-nums text-rose-700">
                                        +{fmt(Number(r.additionalFees))} DZD
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}

                {reservations.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[10px]">
                    <div>
                      <p className="text-slate-400">{T('Facturé', 'المفوتر', lang)}</p>
                      <p className="font-extrabold tabular-nums text-slate-700">{fmt(g.invoiced)} DZD</p>
                    </div>
                    <div>
                      <p className="text-slate-400">{T('Encaissé', 'المحصّل', lang)}</p>
                      <p className="flex items-center gap-1 font-extrabold tabular-nums text-emerald-700">
                        {fmt(g.collected)}
                        <PctChip value={g.collectionRate} tone="emerald" />
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-400">{T('Dettes', 'الديون', lang)}</p>
                      <p
                        className={`font-extrabold tabular-nums ${
                          g.outstanding > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {fmt(g.outstanding)} DZD
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Dépenses par type */}
              <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-700">
                    <Wrench size={11} />
                    {T('Dépenses', 'المصاريف', lang)} ({expenses.length})
                  </span>
                  <span className="text-[11px] font-extrabold tabular-nums text-rose-700">
                    −{fmt(g.expenses)} DZD
                  </span>
                </div>

                {expenses.length === 0 ? (
                  <p className="py-5 text-center text-xs font-semibold text-slate-400">
                    {T('Aucune dépense', 'لا توجد مصاريف', lang)}
                  </p>
                ) : (
                  <>
                    {(Object.entries(byType) as [ExpenseType, VehicleExpense[]][]).map(([type, group]) => {
                      const meta = EXPENSE_META[type];
                      const sub = group.reduce((s, e) => s + (Number(e.cost) || 0), 0);
                      return (
                        <div key={type}>
                          <div
                            className={`flex items-center justify-between border-b border-slate-50 px-4 py-2 ${meta.bg}`}
                          >
                            <span className={`flex items-center gap-1.5 text-xs font-bold ${meta.color}`}>
                              {meta.icon}
                              {lang === 'fr' ? meta.fr : meta.ar} ({group.length})
                            </span>
                            <span className="flex items-center gap-1.5">
                              <PctChip value={pct(sub, g.expenses)} tone="rose" />
                              <span className={`text-xs font-extrabold tabular-nums ${meta.color}`}>
                                −{fmt(sub)} DZD
                              </span>
                            </span>
                          </div>
                          {group.map(e => (
                            <div
                              key={e.id}
                              className="flex items-start justify-between border-b border-slate-50 px-6 py-2 text-[10px] transition last:border-0 hover:bg-slate-50"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-700">
                                  {e.expenseName || (lang === 'fr' ? meta.fr : meta.ar)}
                                </p>
                                <p className="mt-0.5 flex items-center gap-1 text-slate-400">
                                  <Calendar size={8} />
                                  {fmtD(e.date)}
                                  {e.currentMileage ? ` · ${fmt(e.currentMileage)} km` : ''}
                                  {e.note ? ` · ${e.note}` : ''}
                                </p>
                              </div>
                              <span className={`ml-3 shrink-0 font-extrabold tabular-nums ${meta.color}`}>
                                −{fmt(Number(e.cost))} DZD
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    <div className="flex justify-between border-t border-rose-100 bg-rose-50 px-4 py-2.5 text-xs">
                      <span className="font-bold text-rose-700">
                        {T('Total dépenses', 'إجمالي المصاريف', lang)}
                      </span>
                      <span className="font-extrabold tabular-nums text-rose-700">−{fmt(g.expenses)} DZD</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Données du rapport ───────────────────────────────────────────────────────
interface ReportData {
  clients: Client[];
  reservations: ReservationDetails[];
  cars: Car[];
  workers: Worker[];
  storeExpenses: StoreExpense[];
  vehicleExpenses: VehicleExpense[];
  alerts: MaintenanceAlert[];
  websiteOrders: WebsiteOrder[];
}

// ── Page ─────────────────────────────────────────────────────────────────────
const ReportsPage: React.FC<{ lang: Language }> = ({ lang }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<string | null>('cars');

  const toggleSection = useCallback(
    (id: string) => setOpenSection(cur => (cur === id ? null : id)),
    [],
  );

  const generate = async () => {
    if (!startDate || !endDate) {
      alert(T('Sélectionnez les deux dates.', 'اختر تاريخ البداية والنهاية.', lang));
      return;
    }
    setIsGenerating(true);
    setError(null);
    setData(null);

    try {
      let clients: Client[] = [];
      let reservations: ReservationDetails[] = [];
      let cars: Car[] = [];
      let workers: Worker[] = [];
      let storeExpenses: StoreExpense[] = [];
      let vehicleExpenses: VehicleExpense[] = [];
      let alerts: MaintenanceAlert[] = [];
      let websiteOrders: WebsiteOrder[] = [];

      await Promise.all([
        ReservationsService.getReservations()
          .then(d => { reservations = d; })
          .catch(e => console.warn('reservations fetch failed:', e)),

        DatabaseService.getClients()
          .then(d => { clients = d; })
          .catch(() => {}),

        // Join car_owners : sans le barème, aucune commission de conciergerie
        // n'est calculable.
        getCarsWithOwners()
          .then(result => {
            if (result.success && result.cars) {
              cars = result.cars.map((dbCar: any) => ({
                id: dbCar.id || '',
                brand: dbCar.brand,
                model: dbCar.model,
                registration: dbCar.plate_number,
                year: dbCar.year,
                color: dbCar.color || 'Premium',
                vin: dbCar.vin || '',
                energy: dbCar.energy || 'Essence',
                transmission: dbCar.transmission || 'Automatique',
                seats: dbCar.seats || 5,
                doors: dbCar.doors || 4,
                priceDay: Math.round(Number(dbCar.price_per_day)),
                priceWeek: Math.round(Number(dbCar.price_week || dbCar.price_per_day * 2)),
                priceMonth: Math.round(Number(dbCar.price_month || dbCar.price_per_day * 4)),
                deposit: Math.round(Number(dbCar.deposit || dbCar.price_per_day * 2)),
                images: dbCar.image_url ? [dbCar.image_url] : ['https://picsum.photos/seed/car/400/300'],
                mileage: dbCar.mileage || 0,
                status: dbCar.status === 'maintenance' ? 'maintenance' : 'disponible',
                ownershipType: dbCar.ownership_type === 'consignment' ? 'consignment' : 'personal',
                ownerInfo: dbCar.owner
                  ? {
                      carId: dbCar.id || '',
                      ownerName: dbCar.owner.owner_name,
                      ownerPhone: dbCar.owner.owner_phone || undefined,
                      internalRef: dbCar.owner.internal_ref || undefined,
                      commissionType: dbCar.owner.commission_type === 'amount' ? 'amount' : 'percentage',
                      commissionValue: Number(dbCar.owner.commission_value || 0),
                    }
                  : null,
              } as Car));
            }
          })
          .catch(() => {}),

        DatabaseService.getWorkers().then(d => { workers = d; }).catch(() => {}),
        DatabaseService.getStoreExpenses().then(d => { storeExpenses = d; }).catch(() => {}),
        getVehicleExpenses().then(r => { vehicleExpenses = r.expenses || []; }).catch(() => {}),
        DatabaseService.getMaintenanceAlerts().then(d => { alerts = d; }).catch(() => {}),
        DatabaseService.getWebsiteOrders().then(d => { websiteOrders = d; }).catch(() => {}),
      ]);

      const ir = (d: string) => inRange(d, startDate, endDate);

      setData({
        clients,
        cars,
        workers,
        reservations: reservations.filter(r => ir(r.step1?.departureDate || r.createdAt || '')),
        storeExpenses: storeExpenses.filter(e => ir(e.date)),
        vehicleExpenses: vehicleExpenses.filter(e => ir(e.date)),
        alerts: alerts.filter(a => ir(a.createdAt)),
        websiteOrders: websiteOrders.filter(o => ir(o.createdAt)),
      });
    } catch (e: any) {
      console.error(e);
      setError(T('Erreur lors de la génération.', 'خطأ في التوليد.', lang));
    } finally {
      setIsGenerating(false);
    }
  };

  const printReport = async () => {
    if (!data) return;
    try {
      const agencySettings = await DatabaseService.getAgencyBranding();
      const html = generateReportHTML(
        null, data.reservations, data.vehicleExpenses, startDate, endDate, agencySettings, lang,
      );
      const printWindow = window.open('', '', 'width=794,height=1123');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 250);
      }
    } catch (err) {
      console.error('Error printing report:', err);
      alert(T("Erreur lors de l'impression.", 'خطأ في الطباعة.', lang));
    }
  };

  // ── Agrégats ───────────────────────────────────────────────────────────────
  // Une seule source de vérité : `computeFleetGains` applique par véhicule
  // exactement les formules de la page « Gains par véhicule » et de la vue DB
  // `consignment_earnings`.
  const rows = useMemo<VehicleGainsRow[]>(
    () => (data ? computeFleetGains(data.cars, data.reservations, data.vehicleExpenses) : []),
    [data],
  );
  const fleet = useMemo(() => sumFleetGains(rows), [rows]);
  const consignmentRows = useMemo(() => rows.filter(r => r.gains.isConsignment), [rows]);

  const nonCancelledRes = data?.reservations.filter(r => r.status !== 'cancelled') ?? [];
  const totalStoreExp = data?.storeExpenses.reduce((s, e) => s + (Number(e.cost) || 0), 0) ?? 0;
  const totalExpGlobal = fleet.vehicleExpenses + totalStoreExp;
  const totalDebtGlobal = (data?.reservations ?? [])
    .filter(isOpenRental)
    .reduce((s, r) => s + (Number(r.remainingPayment) || 0), 0);

  /**
   * Bénéfice net de l'agence.
   *
   * `fleet.agencyRevenue` ne compte, pour un véhicule en conciergerie, que la
   * commission + la livraison à charge du propriétaire (locations clôturées) —
   * jamais la totalité de l'encaissé, dont l'essentiel appartient au
   * propriétaire. L'ancienne formule partait de l'encaissé global et ne
   * retranchait la part des propriétaires que sur les locations terminées : une
   * location en cours faisait donc apparaître l'argent du propriétaire comme un
   * bénéfice de l'agence.
   */
  const agencyRevenueGlobal = fleet.agencyRevenue;
  const netBenefitGlobal = agencyRevenueGlobal - totalExpGlobal;
  const marginGlobal = pct(netBenefitGlobal, agencyRevenueGlobal);
  const commissionAgencyTotal = fleet.commissionEarned + fleet.ownerDeliveryFees;
  const consignmentExpenses = consignmentRows.reduce((s, r) => s + r.gains.expenses, 0);

  const fieldCls =
    'w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white outline-none backdrop-blur-sm transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20';

  return (
    <div className="max-w-[92rem] mx-auto pb-8">
      {/* ── En-tête ── */}
      <PageHeader
        icon="📄"
        eyebrow={T('Analyse', 'التحليل', lang)}
        title={T('Rapports complets', 'التقارير الشاملة', lang)}
        subtitle={T(
          'Locations, clients, flotte, commissions, dépenses et bénéfice — avec le détail de chaque calcul.',
          'الإيجارات والعملاء والأسطول والعمولات والمصاريف والأرباح.',
          lang,
        )}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div>
            <label className="fx-label">{T('Date de début', 'تاريخ البداية', lang)}</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setData(null); }}
              className="fx-field"
            />
          </div>
          <div>
            <label className="fx-label">{T('Date de fin', 'تاريخ النهاية', lang)}</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setData(null); }}
              className="fx-field"
            />
          </div>
          <div className="flex items-end">
            <Btn tone="primary" className="w-full" onClick={generate} disabled={isGenerating}>
              {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <BarChart3 size={16} />}
              {isGenerating
                ? T('Chargement…', 'جاري التحميل…', lang)
                : T('Générer le rapport', 'توليد التقرير', lang)}
            </Btn>
          </div>
        </div>
      </PageHeader>

      {isGenerating && <LoadingState label={T('Chargement des données…', 'جاري تحميل البيانات…', lang)} rows={6} />}

      {!isGenerating && !data && !error && (
        <EmptyState
          icon="📄"
          title={T('Choisissez une période', 'اختر فترة', lang)}
          description={T(
            'Sélectionnez une date de début et une date de fin, puis générez le rapport : chiffre d’affaires, flotte, clients, dépenses et bénéfice y sont détaillés poste par poste.',
            'اختر تاريخ البداية والنهاية ثم ولّد التقرير.',
            lang,
          )}
        />
      )}

      {error && <ErrorBanner message={error} onRetry={generate} retryLabel={T('Réessayer', 'إعادة', lang)} />}

      <AnimatePresence>
        {data && !isGenerating && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {/* Période */}
            <div className="flex flex-wrap items-center gap-2.5 rounded-2xl bg-white px-5 py-3 text-sm shadow-sm ring-1 ring-slate-200">
              <FileText size={15} className="shrink-0 text-slate-400" />
              <span className="font-semibold text-slate-600">
                {T('Rapport du', 'تقرير من', lang)} <strong className="text-slate-900">{fmtD(startDate)}</strong>{' '}
                {T('au', 'إلى', lang)} <strong className="text-slate-900">{fmtD(endDate)}</strong>
              </span>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                {data.reservations.length} {T('réservation(s)', 'حجز', lang)}
              </span>
              {consignmentRows.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                  <Handshake size={10} />
                  {consignmentRows.length} {T('en conciergerie', 'أمانة', lang)}
                </span>
              )}
            </div>

            {/* KPI globaux */}
            <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${consignmentRows.length > 0 ? 'xl:grid-cols-6' : ''}`}>
              <StatCard
                index={0}
                label={T('Encaissé (brut)', 'المحصّل الإجمالي', lang)}
                value={fleet.collected}
                hint={`${nonCancelledRes.length} ${T('location(s)', 'إيجار', lang)}`}
                tone="emerald"
                icon={<Wallet size={16} />}
              />
              <StatCard
                index={1}
                label={T('Revenu agence', 'إيراد الوكالة', lang)}
                value={agencyRevenueGlobal}
                share={pct(agencyRevenueGlobal, fleet.collected)}
                shareLabel={T("de l'encaissé", 'من المحصّل', lang)}
                tone="indigo"
                icon={<TrendingUp size={16} />}
              />
              <StatCard
                index={2}
                label={T('Reste à payer', 'المتبقي للعملاء', lang)}
                value={totalDebtGlobal}
                share={pct(totalDebtGlobal, fleet.invoiced)}
                shareLabel={T('du facturé', 'من المفوتر', lang)}
                tone="amber"
                icon={<AlertCircle size={16} />}
              />
              <StatCard
                index={3}
                label={T('Total dépenses', 'إجمالي المصاريف', lang)}
                value={totalExpGlobal}
                share={pct(totalExpGlobal, agencyRevenueGlobal)}
                shareLabel={T('du revenu agence', 'من إيراد الوكالة', lang)}
                tone="rose"
                icon={<TrendingDown size={16} />}
              />
              {consignmentRows.length > 0 && (
                <>
                  <StatCard
                    index={4}
                    label={T('Commission conciergerie', 'عمولة الأمانة', lang)}
                    value={commissionAgencyTotal}
                    share={pct(commissionAgencyTotal, fleet.consignmentGross)}
                    shareLabel={T('du CA confié', 'من رقم أعمال الأمانة', lang)}
                    tone="amber"
                    icon={<Handshake size={16} />}
                  />
                  <StatCard
                    index={5}
                    label={T('Reversement propriétaires', 'مستحقات الملاك', lang)}
                    value={fleet.ownerPayout}
                    share={pct(fleet.ownerPayout, fleet.consignmentGross)}
                    shareLabel={T('du CA confié', 'من رقم أعمال الأمانة', lang)}
                    tone="slate"
                    icon={<Users size={16} />}
                  />
                </>
              )}
            </div>

            {/* ══ TABLEAU DE BORD VISUEL ══
                Les chiffres bruts ci-dessus disent « combien ». Ces quatre vues
                disent « d'où » et « comment ça évolue » — c'est ce qu'on ne peut
                pas lire dans une colonne de nombres. */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Panel title={T('Où va le chiffre d’affaires', 'أين يذهب رقم الأعمال', lang)} icon="🥧">
                {fleet.collected > 0 ? (
                  <Donut
                    size={170}
                    centerLabel={T('Encaissé', 'المحصّل', lang)}
                    centerValue={`${fmt(fleet.collected)} DA`}
                    data={[
                      { label: T('Bénéfice net agence', 'صافي الربح', lang), value: Math.max(0, netBenefitGlobal), color: SERIES[0] },
                      { label: T('Dépenses', 'المصاريف', lang), value: Math.max(0, totalExpGlobal), color: SERIES[2] },
                      { label: T('Reversé aux propriétaires', 'مستحقات الملاك', lang), value: Math.max(0, fleet.ownerPayout), color: SERIES[3] },
                    ].filter(d => d.value > 0)}
                  />
                ) : (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
                    {T('Aucun encaissement sur la période.', 'لا مقبوضات في هذه الفترة.', lang)}
                  </p>
                )}
              </Panel>

              <Panel title={T('Santé de l’activité', 'صحة النشاط', lang)} icon="📊">
                <div className="flex flex-wrap items-start justify-around gap-4 py-2">
                  <FxGauge
                    value={pct(fleet.collected, fleet.invoiced)}
                    label={T('Recouvrement', 'التحصيل', lang)}
                    tone={pct(fleet.collected, fleet.invoiced) >= 90 ? '#10A46F' : '#D98410'}
                  />
                  <FxGauge
                    value={Math.max(0, marginGlobal)}
                    label={T('Marge nette', 'هامش الربح', lang)}
                    tone={marginGlobal >= 30 ? '#10A46F' : marginGlobal >= 0 ? '#D98410' : '#E01331'}
                  />
                  <FxGauge
                    value={Math.min(100, pct(totalExpGlobal, agencyRevenueGlobal))}
                    label={T('Poids des dépenses', 'وزن المصاريف', lang)}
                    tone={pct(totalExpGlobal, agencyRevenueGlobal) <= 30 ? '#10A46F' : '#D98410'}
                  />
                  <FxGauge
                    value={pct(
                      data.cars.filter(c => c.status === 'louer' || c.status === 'reserve').length,
                      Math.max(1, data.cars.length),
                    )}
                    label={T('Flotte en service', 'الأسطول العامل', lang)}
                    tone="#E01331"
                  />
                </div>
              </Panel>

              <Panel title={T('Chiffre d’affaires par mois', 'رقم الأعمال شهريًا', lang)} icon="📈" className="xl:col-span-2">
                <FxBarChart
                  height={180}
                  format={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))}
                  data={(() => {
                    // Six derniers mois de la période demandée, encaissements réels.
                    const byMonth = new Map<string, number>();
                    nonCancelledRes.forEach(r => {
                      const key = (r.completedAt || r.createdAt || '').slice(0, 7);
                      if (!key) return;
                      byMonth.set(key, (byMonth.get(key) ?? 0) + calcPaid(r));
                    });
                    return [...byMonth.entries()]
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .slice(-12)
                      .map(([key, value]) => {
                        const [y, m] = key.split('-');
                        return {
                          label: new Date(Number(y), Number(m) - 1, 1)
                            .toLocaleDateString('fr-FR', { month: 'short' }),
                          value,
                        };
                      });
                  })()}
                />
              </Panel>

              <Panel title={T('Véhicules les plus rentables', 'المركبات الأكثر ربحية', lang)} icon="🏆">
                <RankBars
                  format={n => `${fmt(n)} DA`}
                  data={rows
                    .slice()
                    .sort((a, b) => b.gains.netBenefit - a.gains.netBenefit)
                    .slice(0, 8)
                    .map(r => ({
                      label: `${r.car.brand} ${r.car.model}`,
                      sub: r.car.registration,
                      value: Math.max(0, r.gains.netBenefit),
                    }))}
                />
              </Panel>

              <Panel title={T('Postes de dépense', 'بنود المصاريف', lang)} icon="📉">
                <RankBars
                  format={n => `${fmt(n)} DA`}
                  data={(() => {
                    const byType = new Map<string, number>();
                    data.vehicleExpenses.forEach(e =>
                      byType.set(e.type, (byType.get(e.type) ?? 0) + Number(e.cost || 0)),
                    );
                    const storeTotal = data.storeExpenses.reduce((s, e) => s + Number(e.cost || 0), 0);
                    const list = [...byType.entries()].map(([t, v], i) => ({
                      label: EXPENSE_LABELS[t] ?? t,
                      value: v,
                      color: SERIES[i % SERIES.length],
                    }));
                    if (storeTotal > 0) {
                      list.push({ label: '🏪 Agence', value: storeTotal, color: SERIES[7] });
                    }
                    return list.sort((a, b) => b.value - a.value);
                  })()}
                />
              </Panel>
            </div>

            {/* Bénéfice net + détail du calcul global */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid gap-4 lg:grid-cols-5"
            >
              <div
                className={`rounded-2xl p-5 text-white shadow-lg lg:col-span-2 ${
                  netBenefitGlobal >= 0
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-800'
                    : 'bg-gradient-to-br from-rose-600 to-rose-800'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                  {T('Bénéfice net agence', 'صافي ربح الوكالة', lang)}
                </p>
                <p className="mt-1 text-4xl font-extrabold tabular-nums leading-none">
                  {netBenefitGlobal >= 0 ? '+' : ''}
                  {fmt(netBenefitGlobal)}
                  <span className="ml-1.5 text-base font-semibold text-white/50">DZD</span>
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span className="rounded-lg bg-white/10 px-2.5 py-1 text-xs font-bold tabular-nums ring-1 ring-white/20">
                    {T('Marge', 'الهامش', lang)} {fmtPct(marginGlobal)}
                  </span>
                  {consignmentRows.length > 0 && (
                    <span className="text-[11px] font-medium text-white/60">
                      {T('hors part des propriétaires', 'بدون حصة الملاك', lang)}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 lg:col-span-3">
                <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <PieChart size={12} />
                  {T('Comment ce bénéfice est calculé', 'كيف يُحتسب هذا الربح', lang)}
                </p>
                <div className="divide-y divide-slate-100">
                  <CalcRow
                    label={T('Revenu des véhicules de l’agence', 'إيراد مركبات الوكالة', lang)}
                    formula={T('encaissé des locations', 'المحصّل من الإيجارات', lang)}
                    amount={agencyRevenueGlobal - commissionAgencyTotal}
                    share={pct(agencyRevenueGlobal - commissionAgencyTotal, agencyRevenueGlobal)}
                    tone="emerald"
                  />
                  <CalcRow
                    sign="+"
                    label={T('Commission conciergerie', 'عمولة الأمانة', lang)}
                    formula={T('commission + livraison propriétaire', 'العمولة + توصيل المالك', lang)}
                    amount={commissionAgencyTotal}
                    share={pct(commissionAgencyTotal, agencyRevenueGlobal)}
                    tone="amber"
                  />
                  <CalcRow
                    sign="−"
                    label={T('Dépenses véhicules', 'مصاريف المركبات', lang)}
                    amount={fleet.vehicleExpenses}
                    share={pct(fleet.vehicleExpenses, agencyRevenueGlobal)}
                    tone="rose"
                  />
                  <CalcRow
                    sign="−"
                    label={T('Dépenses showroom', 'مصاريف المعرض', lang)}
                    amount={totalStoreExp}
                    share={pct(totalStoreExp, agencyRevenueGlobal)}
                    tone="rose"
                  />
                  <CalcRow
                    sign="="
                    label={T('Bénéfice net agence', 'صافي ربح الوكالة', lang)}
                    amount={netBenefitGlobal}
                    share={marginGlobal}
                    tone={netBenefitGlobal >= 0 ? 'indigo' : 'rose'}
                    strong
                  />
                </div>
              </div>
            </motion.div>

            <button
              onClick={printReport}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800"
            >
              <Printer size={17} />
              {T('Imprimer le rapport complet', 'طباعة التقرير الكامل', lang)}
            </button>

            {/* ── Véhicules ── */}
            <Section
              id="cars"
              open={openSection === 'cars'}
              onToggle={toggleSection}
              accent="bg-blue-50 text-blue-600"
              icon={<CarIcon size={17} />}
              title={T('Rapport par véhicule', 'التقرير لكل سيارة', lang)}
              subtitle={T('Détail du calcul, location par location', 'تفصيل الحساب، إيجارًا بإيجار', lang)}
              badge={rows.length}
            >
              <div className="space-y-3 bg-slate-50 p-4">
                {rows.map((row, i) => (
                  <CarBlock
                    key={row.car.id}
                    row={row}
                    idx={i}
                    lang={lang}
                    reservations={data.reservations.filter(r => (r.carId || r.car?.id) === row.car.id)}
                    expenses={data.vehicleExpenses.filter(e => e.carId === row.car.id)}
                  />
                ))}
                {rows.length === 0 && (
                  <p className="py-6 text-center text-sm font-semibold text-slate-400">
                    {T('Aucun véhicule', 'لا توجد سيارات', lang)}
                  </p>
                )}
              </div>
            </Section>

            {/* ── 🤝 Conciergerie ── */}
            {consignmentRows.length > 0 && (
              <Section
                id="consignment"
                open={openSection === 'consignment'}
                onToggle={toggleSection}
                accent="bg-amber-50 text-amber-700"
                icon={<Handshake size={17} />}
                title={T('Véhicules en conciergerie', 'المركبات المودعة (أمانة)', lang)}
                subtitle={T(
                  'Commission de l’agence et part revenant aux propriétaires',
                  'عمولة الوكالة وحصة الملاك',
                  lang,
                )}
                badge={consignmentRows.length}
              >
                <div className="space-y-4 bg-slate-50 p-4">
                  {/* Le calcul global, posé */}
                  <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-amber-200">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                      <Handshake size={12} />
                      {T('Répartition du chiffre d’affaires confié', 'توزيع رقم أعمال الأمانة', lang)}
                    </p>

                    <div className="divide-y divide-slate-100">
                      <CalcRow
                        label={T('CA des locations terminées', 'رقم أعمال الإيجارات المنتهية', lang)}
                        formula={`${consignmentRows.reduce((s, r) => s + (r.gains.consignment?.completedCount ?? 0), 0)} ${T('location(s) clôturée(s)', 'إيجار مغلق', lang)}`}
                        amount={fleet.consignmentGross}
                        share={100}
                        tone="slate"
                      />
                      <CalcRow
                        sign="−"
                        label={T('Commission agence', 'عمولة الوكالة', lang)}
                        amount={fleet.commissionEarned}
                        share={pct(fleet.commissionEarned, fleet.consignmentGross)}
                        tone="amber"
                      />
                      <CalcRow
                        sign="−"
                        label={T('Livraison à charge des propriétaires (≥ 10 j)', 'التوصيل على حساب الملاك (≥ 10 أيام)', lang)}
                        amount={fleet.ownerDeliveryFees}
                        share={pct(fleet.ownerDeliveryFees, fleet.consignmentGross)}
                        tone="amber"
                      />
                      <CalcRow
                        sign="="
                        label={T('À reverser aux propriétaires', 'المستحق للملاك', lang)}
                        amount={fleet.ownerPayout}
                        share={pct(fleet.ownerPayout, fleet.consignmentGross)}
                        tone="slate"
                        strong
                      />
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                      <div className="mb-2.5 flex items-center justify-between">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          {T('Qui touche quoi', 'من يأخذ ماذا', lang)}
                        </p>
                        <p className="text-[11px] font-bold tabular-nums text-slate-500">
                          {fmt(fleet.consignmentGross)} DZD
                        </p>
                      </div>
                      <SplitBar
                        segments={[
                          { value: fleet.commissionEarned, label: T('Commission', 'العمولة', lang), cls: 'bg-amber-500' },
                          { value: fleet.ownerDeliveryFees, label: T('Livraison', 'التوصيل', lang), cls: 'bg-amber-300' },
                          { value: fleet.ownerPayout, label: T('Propriétaires', 'الملاك', lang), cls: 'bg-slate-400' },
                        ]}
                      />
                      <SplitLegend
                        items={[
                          {
                            label: T('Agence', 'الوكالة', lang),
                            cls: 'bg-amber-500',
                            pct: pct(commissionAgencyTotal, fleet.consignmentGross),
                            tone: 'amber',
                          },
                          {
                            label: T('Propriétaires', 'الملاك', lang),
                            cls: 'bg-slate-400',
                            pct: pct(fleet.ownerPayout, fleet.consignmentGross),
                            tone: 'slate',
                          },
                        ]}
                      />
                    </div>

                    <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-[11px] font-medium leading-relaxed text-slate-500 ring-1 ring-slate-200">
                      {T(
                        'La commission est figée à la clôture de chaque location, au barème du propriétaire en vigueur ce jour-là. La livraison est à la charge du propriétaire à partir de 10 jours de location. Reversement = CA terminé − commission − livraison.',
                        'تُثبَّت العمولة عند إنهاء كل إيجار وفق اتفاق المالك الساري حينها. التوصيل على حساب المالك ابتداءً من 10 أيام. مستحقات المالك = رقم الأعمال المنتهي − العمولة − التوصيل.',
                        lang,
                      )}
                    </p>

                    {fleet.pendingRentals > 0 && (
                      <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        <Clock size={12} className="shrink-0" />
                        {T(
                          'Commissions estimées sur les locations non terminées',
                          'عمولات مقدرة على الإيجارات غير المنتهية',
                          lang,
                        )}{' '}
                        : <strong className="tabular-nums">+{fmt(fleet.commissionPending)} DZD</strong>
                        <span className="text-amber-600">
                          ({fleet.pendingRentals} {T('location(s)', 'إيجار', lang)})
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Détail par véhicule confié */}
                  <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-amber-100 bg-amber-50 text-amber-800">
                            {[
                              { l: T('Véhicule', 'المركبة', lang), a: 'text-left' },
                              { l: T('Propriétaire', 'المالك', lang), a: 'text-left' },
                              { l: T('Terminées', 'منتهية', lang), a: 'text-center' },
                              { l: T('CA terminé', 'رقم الأعمال', lang), a: 'text-right' },
                              { l: T('Commission', 'العمولة', lang), a: 'text-right' },
                              { l: T('%', '%', lang), a: 'text-right' },
                              { l: T('Livraison', 'التوصيل', lang), a: 'text-right' },
                              { l: T('Reversement', 'المستحق', lang), a: 'text-right' },
                              { l: T('Dépenses', 'المصاريف', lang), a: 'text-right' },
                              { l: T('Net agence', 'صافي الوكالة', lang), a: 'text-right' },
                              { l: T('Marge', 'الهامش', lang), a: 'text-right' },
                            ].map(h => (
                              <th
                                key={h.l}
                                className={`whitespace-nowrap px-3 py-2.5 text-[10px] font-extrabold uppercase tracking-wide ${h.a}`}
                              >
                                {h.l}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {consignmentRows.map(({ car, gains }) => {
                            const c = gains.consignment!;
                            const owner = gains.owner!;
                            return (
                              <tr key={car.id} className="transition hover:bg-amber-50/40">
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <p className="font-extrabold text-slate-800">
                                    {car.brand} {car.model}
                                  </p>
                                  <p className="text-[10px] font-semibold text-indigo-600">{car.registration}</p>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  <p className="font-bold text-slate-700">{owner.ownerName}</p>
                                  <p className="text-[10px] font-semibold text-slate-400">
                                    {owner.commissionValue.toLocaleString('fr-FR')}
                                    {owner.commissionType === 'percentage' ? ' %' : ' DA'} /{' '}
                                    {T('loc.', 'إيجار', lang)}
                                    {owner.internalRef ? ` · ${owner.internalRef}` : ''}
                                  </p>
                                </td>
                                <td className="px-3 py-2.5 text-center font-extrabold tabular-nums text-slate-700">
                                  {c.completedCount}
                                  <span className="font-semibold text-slate-400">/{gains.rentals}</span>
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-slate-800">
                                  {fmt(c.grossCompleted)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-amber-700">
                                  +{fmt(c.commissionEarned)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                                  <PctChip value={gains.effectiveCommissionRate} tone="amber" />
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-amber-700">
                                  +{fmt(c.ownerDeliveryFees)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-slate-700">
                                  {fmt(gains.ownerPayout)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums text-rose-600">
                                  −{fmt(gains.expenses)}
                                </td>
                                <td
                                  className={`whitespace-nowrap px-3 py-2.5 text-right font-extrabold tabular-nums ${
                                    gains.netBenefit >= 0 ? 'text-indigo-700' : 'text-rose-600'
                                  }`}
                                >
                                  {gains.netBenefit >= 0 ? '+' : ''}
                                  {fmt(gains.netBenefit)}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-right">
                                  <PctChip
                                    value={gains.margin}
                                    tone={gains.netBenefit >= 0 ? 'indigo' : 'rose'}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-amber-200 bg-amber-50 font-extrabold text-amber-900">
                            <td className="px-3 py-2.5" colSpan={3}>
                              {T('TOTAL', 'المجموع', lang)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              {fmt(fleet.consignmentGross)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              +{fmt(fleet.commissionEarned)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              {fmtPct(pct(fleet.commissionEarned, fleet.consignmentGross))}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              +{fmt(fleet.ownerDeliveryFees)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              {fmt(fleet.ownerPayout)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              −{fmt(consignmentExpenses)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              {fmt(commissionAgencyTotal - consignmentExpenses)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                              {fmtPct(pct(commissionAgencyTotal - consignmentExpenses, commissionAgencyTotal))}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* ── Clients & dettes ── */}
            <Section
              id="clients"
              open={openSection === 'clients'}
              onToggle={toggleSection}
              accent="bg-indigo-50 text-indigo-600"
              icon={<Users size={17} />}
              title={T('Clients & dettes', 'العملاء والديون', lang)}
              badge={data.clients.length}
            >
              <div className="space-y-4 bg-slate-50 p-4">
                {(() => {
                  const debtors = data.reservations.filter(
                    r => (Number(r.remainingPayment) || 0) > 0 && isOpenRental(r),
                  );
                  if (!debtors.length) {
                    return (
                      <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                        <AlertCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                        <p className="text-sm font-bold text-emerald-800">
                          {T('Aucune dette pour cette période', 'لا توجد ديون لهذه الفترة', lang)}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-amber-200">
                      <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-4 py-2.5">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-700">
                          {T('Montants impayés', 'المبالغ غير المدفوعة', lang)} ({debtors.length})
                        </span>
                        <span className="flex items-center gap-1.5">
                          <PctChip value={pct(totalDebtGlobal, fleet.invoiced)} tone="amber" />
                          <span className="text-[11px] font-extrabold tabular-nums text-amber-700">
                            −{fmt(totalDebtGlobal)} DZD
                          </span>
                        </span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {debtors.map(r => {
                          const total = Number(r.totalPrice) || 0;
                          const debt = Number(r.remainingPayment) || 0;
                          return (
                            <div key={r.id} className="flex items-start gap-3 px-4 py-3 text-xs">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-50 text-sm font-extrabold text-amber-700 ring-1 ring-amber-200">
                                {(r.client?.firstName?.[0] || '?').toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-bold text-slate-800">
                                  {r.client?.firstName} {r.client?.lastName}
                                </p>
                                <p className="flex flex-wrap items-center gap-1 text-slate-400">
                                  <Phone size={9} />
                                  {r.client?.phone}
                                  {r.client?.wilaya && (
                                    <>
                                      <MapPin size={9} />
                                      {r.client.wilaya}
                                    </>
                                  )}
                                </p>
                                <p className="mt-0.5 truncate text-slate-500">
                                  {r.car?.brand} {r.car?.model} · {fmtD(r.step1?.departureDate)} →{' '}
                                  {fmtD(r.step1?.returnDate)}
                                </p>
                              </div>
                              <div className="shrink-0 space-y-0.5 text-right">
                                <p className="text-[10px] tabular-nums text-slate-400">
                                  {T('Total', 'الإجمالي', lang)} : {fmt(total)}
                                </p>
                                <p className="text-[10px] font-bold tabular-nums text-emerald-700">
                                  ✓ {fmt(calcPaid(r))}
                                </p>
                                <p className="flex items-center justify-end gap-1.5 font-extrabold tabular-nums text-amber-700">
                                  {fmt(debt)}
                                  <PctChip value={pct(debt, total)} tone="amber" />
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Stats par client */}
                <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                  <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
                      {T('Statistiques par client', 'إحصاءات العملاء', lang)}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {data.clients.map(client => {
                      const cRes = data.reservations.filter(r => r.clientId === client.id);
                      if (cRes.length === 0) return null;
                      const active = cRes.filter(r => r.status !== 'cancelled');
                      const cPaid = active.reduce((s, r) => s + calcPaid(r), 0);
                      const cTotal = active.reduce((s, r) => s + (Number(r.totalPrice) || 0), 0);
                      const cDebt = cRes
                        .filter(isOpenRental)
                        .reduce((s, r) => s + (Number(r.remainingPayment) || 0), 0);
                      return (
                        <div
                          key={client.id}
                          className="flex items-center gap-3 px-4 py-3 text-xs transition hover:bg-slate-50"
                        >
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-indigo-50 ring-1 ring-indigo-100">
                            {client.profilePhoto ? (
                              <img src={client.profilePhoto} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-extrabold text-indigo-600">
                                {(client.firstName?.[0] || '?').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-slate-800">
                              {client.firstName} {client.lastName}
                            </p>
                            <p className="flex items-center gap-1 text-slate-400">
                              <Phone size={9} />
                              {client.phone}
                              {client.wilaya && (
                                <>
                                  <MapPin size={9} />
                                  {client.wilaya}
                                </>
                              )}
                            </p>
                          </div>
                          <PctChip value={pct(cTotal, fleet.invoiced)} tone="slate" />
                          <div className="shrink-0 space-y-0.5 text-right">
                            <p className="text-[10px] tabular-nums text-slate-400">
                              {T('Facturé', 'المفوتر', lang)} : {fmt(cTotal)}
                            </p>
                            <p className="font-extrabold tabular-nums text-emerald-700">+{fmt(cPaid)} DZD</p>
                            {cDebt > 0 && (
                              <p className="font-bold tabular-nums text-amber-600">−{fmt(cDebt)} DZD</p>
                            )}
                            <p className="text-[10px] tabular-nums text-slate-400">
                              {cRes.length} {T('loc.', 'إيجار', lang)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>

            {/* ── Équipe ── */}
            <Section
              id="workers"
              open={openSection === 'workers'}
              onToggle={toggleSection}
              accent="bg-purple-50 text-purple-600"
              icon={<Briefcase size={17} />}
              title={T('Équipe & paiements', 'الفريق والمدفوعات', lang)}
              badge={data.workers.length}
            >
              <div className="space-y-3 bg-slate-50 p-4">
                {data.workers.length === 0 ? (
                  <p className="py-5 text-center text-sm font-semibold text-slate-400">
                    {T('Aucun employé', 'لا يوجد موظفون', lang)}
                  </p>
                ) : (
                  data.workers.map(worker => {
                    const isInPeriod = (d: string) => inRange(d, startDate, endDate);
                    const periodPay = (worker.payments || []).filter(p => isInPeriod(p.date));
                    const periodAdv = (worker.advances || []).filter(a => isInPeriod(a.date));
                    const periodAbs = (worker.absences || []).filter(a => isInPeriod(a.date));
                    const paid = periodPay.reduce((s, p) => s + p.amount, 0);
                    const adv = periodAdv.reduce((s, a) => s + a.amount, 0);
                    const abs = periodAbs.reduce((s, a) => s + (a.cost || 0), 0);

                    return (
                      <div
                        key={worker.id}
                        className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200"
                      >
                        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-purple-50 ring-1 ring-purple-100">
                            {worker.profilePhoto ? (
                              <img src={worker.profilePhoto} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-extrabold text-purple-600">
                                {(worker.fullName?.[0] || '?').toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-extrabold text-slate-800">{worker.fullName}</p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold capitalize text-purple-700">
                                {worker.type}
                              </span>
                              <span>{worker.phone}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-xs">
                            <p className="text-slate-400">{T('Salaire base', 'الراتب', lang)}</p>
                            <p className="font-extrabold tabular-nums text-purple-700">
                              {fmt(worker.baseSalary || 0)} DZD
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 divide-x divide-slate-100 text-xs">
                          {[
                            {
                              icon: <CreditCard size={10} />,
                              title: T('Paiements', 'المدفوعات', lang),
                              rows: periodPay.map(p => ({ id: p.id, date: p.date, amount: p.amount })),
                              total: paid,
                              cls: 'text-purple-700',
                              sign: '+',
                            },
                            {
                              icon: <Wallet size={10} />,
                              title: T('Avances', 'السلفيات', lang),
                              rows: periodAdv.map(a => ({ id: a.id, date: a.date, amount: a.amount })),
                              total: adv,
                              cls: 'text-amber-700',
                              sign: '+',
                            },
                            {
                              icon: <AlertTriangle size={10} />,
                              title: T('Absences', 'الغيابات', lang),
                              rows: periodAbs.map(a => ({ id: a.id, date: a.date, amount: a.cost || 0 })),
                              total: abs,
                              cls: 'text-rose-700',
                              sign: '−',
                            },
                          ].map(col => (
                            <div key={col.title} className="p-3">
                              <p className="mb-2 flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                {col.icon}
                                {col.title} ({col.rows.length})
                              </p>
                              {col.rows.length === 0 ? (
                                <p className="text-[10px] italic text-slate-300">
                                  {T('Aucun', 'لا يوجد', lang)}
                                </p>
                              ) : (
                                <>
                                  {col.rows.slice(0, 4).map(r => (
                                    <div
                                      key={r.id}
                                      className="flex justify-between border-b border-slate-50 py-0.5 text-[10px] last:border-0"
                                    >
                                      <span className="text-slate-500">{fmtD(r.date)}</span>
                                      <span className={`font-extrabold tabular-nums ${col.cls}`}>
                                        {fmt(r.amount)}
                                      </span>
                                    </div>
                                  ))}
                                  {col.rows.length > 4 && (
                                    <p className="mt-1 text-[10px] text-slate-400">
                                      +{col.rows.length - 4} {T('autres', 'أخرى', lang)}
                                    </p>
                                  )}
                                  <div
                                    className={`mt-1 border-t border-slate-100 pt-1 text-right text-[10px] font-extrabold tabular-nums ${col.cls}`}
                                  >
                                    {col.sign}
                                    {fmt(col.total)} DZD
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Section>

            {/* ── Dépenses showroom ── */}
            <Section
              id="store"
              open={openSection === 'store'}
              onToggle={toggleSection}
              accent="bg-pink-50 text-pink-600"
              icon={<Building size={17} />}
              title={T('Dépenses showroom', 'مصاريف المعرض', lang)}
              badge={data.storeExpenses.length}
            >
              <div className="bg-slate-50 p-4">
                {data.storeExpenses.length === 0 ? (
                  <p className="py-5 text-center text-sm font-semibold text-slate-400">
                    {T('Aucune dépense showroom pour cette période', 'لا توجد مصاريف للمعرض في هذه الفترة', lang)}
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200">
                    <div className="flex items-center justify-between border-b border-pink-100 bg-pink-50 px-4 py-2.5">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-pink-700">
                        {T('Liste', 'القائمة', lang)} ({data.storeExpenses.length})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <PctChip value={pct(totalStoreExp, totalExpGlobal)} tone="rose" />
                        <span className="text-[11px] font-extrabold tabular-nums text-pink-700">
                          −{fmt(totalStoreExp)} DZD
                        </span>
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {data.storeExpenses.map(e => (
                        <div
                          key={e.id}
                          className="flex items-center gap-3 px-4 py-3 text-xs transition hover:bg-slate-50"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pink-50 text-base ring-1 ring-pink-100">
                            {e.icon || '🏬'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-slate-800">{e.name}</p>
                            <p className="flex items-center gap-1 text-slate-400">
                              <Calendar size={9} />
                              {fmtD(e.date)}
                              {e.note && <> · {e.note}</>}
                            </p>
                          </div>
                          <PctChip value={pct(Number(e.cost) || 0, totalStoreExp)} tone="rose" />
                          <span className="shrink-0 font-extrabold tabular-nums text-pink-700">
                            −{fmt(e.cost)} DZD
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between border-t border-pink-100 bg-pink-50 px-4 py-2.5 text-xs">
                      <span className="font-bold text-pink-700">{T('Total showroom', 'إجمالي المعرض', lang)}</span>
                      <span className="font-extrabold tabular-nums text-pink-700">−{fmt(totalStoreExp)} DZD</span>
                    </div>
                  </div>
                )}
              </div>
            </Section>

            {/* ── Bilan ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-3.5">
                <Receipt size={15} className="text-slate-400" />
                <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">
                  {T('Bilan de la période', 'ملخص الفترة', lang)}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-3 lg:grid-cols-6">
                {([
                  { l: T('Facturé', 'المفوتر', lang), v: fleet.invoiced, p: 100, c: 'text-slate-900', t: 'slate' },
                  { l: T('Encaissé', 'المحصّل', lang), v: fleet.collected, p: pct(fleet.collected, fleet.invoiced), c: 'text-emerald-700', t: 'emerald' },
                  { l: T('Revenu agence', 'إيراد الوكالة', lang), v: agencyRevenueGlobal, p: pct(agencyRevenueGlobal, fleet.collected), c: 'text-indigo-700', t: 'indigo' },
                  { l: T('Reversé aux propriétaires', 'مستحقات الملاك', lang), v: fleet.ownerPayout, p: pct(fleet.ownerPayout, fleet.collected), c: 'text-slate-700', t: 'slate' },
                  { l: T('Dépenses', 'المصاريف', lang), v: totalExpGlobal, p: pct(totalExpGlobal, agencyRevenueGlobal), c: 'text-rose-700', t: 'rose' },
                  { l: T('Bénéfice net', 'الصافي', lang), v: netBenefitGlobal, p: marginGlobal, c: netBenefitGlobal >= 0 ? 'text-indigo-700' : 'text-rose-700', t: netBenefitGlobal >= 0 ? 'indigo' : 'rose' },
                ] as { l: string; v: number; p: number; c: string; t: Tone }[]).map(item => (
                  <div key={item.l} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                    <p className="text-[10px] font-semibold uppercase leading-tight text-slate-500">{item.l}</p>
                    <p className={`mt-1.5 text-lg font-extrabold tabular-nums ${item.c}`}>{fmt(item.v)}</p>
                    <div className="mt-1.5">
                      <PctChip value={item.p} tone={item.t} />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ReportsPage;
