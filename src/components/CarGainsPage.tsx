import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, TrendingUp, ChevronDown, Printer, Loader2, AlertCircle,
  Clock, Handshake, Phone, User as UserIcon, Wallet, Receipt,
  PieChart, ArrowRight, Gauge,
} from 'lucide-react';
import { Language, Car, ReservationDetails, VehicleExpense } from '../types';
import { DatabaseService } from '../services/DatabaseService';
import { ReservationsService } from '../services/ReservationsService';
import { getVehicleExpenses } from '../services/expenseService';
import { getCarsWithOwners } from '../services/carService';
import {
  calcPaid, inRange, pct, fmtPct, computeVehicleGains, commissionBreakdown,
} from '../utils/gainsMath';
import { PctChip, SplitBar, SplitLegend, CalcRow, StatCard } from './gains/GainsUI';
import { generateReportHTML } from './ReportPrintTemplate';
import { eurOrUndefined } from '../utils/currency';
import { CarPicker } from './ui/CarPicker';
import {
  PageHeader, Btn, EmptyState, Panel, Badge, TableWrap, Th, Td,
  Donut, RankBars, Gauge as FxGauge, SERIES,
} from './ui/fx';

interface CarGainsPageProps {
  lang: Language;
}

const T = (fr: string, ar: string, lang: Language) => (lang === 'fr' ? fr : ar);
const fmt = (n: number) => Math.round(n || 0).toLocaleString('fr-DZ');

/** Libellés des postes de dépense, pour le classement visuel. */
const EXPENSE_FR: Record<string, string> = {
  vidange: '🛢️ Vidange',
  assurance: '🛡️ Assurance',
  controle: '📋 Contrôle technique',
  chaine: '⛓️ Chaîne',
  autre: '🔩 Autres',
};
const fmtD = (d: string) => {
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return d || '';
  }
};

const STATUS_META: Record<string, { fr: string; ar: string; cls: string }> = {
  pending:   { fr: 'En attente', ar: 'قيد الانتظار', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  accepted:  { fr: 'Acceptée',   ar: 'مقبول',        cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
  confirmed: { fr: 'Confirmée',  ar: 'مؤكد',         cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  active:    { fr: 'En cours',   ar: 'جارية',        cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  completed: { fr: 'Terminée',   ar: 'منتهية',       cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  cancelled: { fr: 'Annulée',    ar: 'ملغاة',        cls: 'bg-slate-100 text-slate-500 ring-slate-200' },
};

export const CarGainsPage: React.FC<CarGainsPageProps> = ({ lang }) => {
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedCarId, setSelectedCarId] = useState<string>('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [reservations, setReservations] = useState<ReservationDetails[]>([]);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [expandedRes, setExpandedRes] = useState<string | null>(null);

  // Chargement AVEC les propriétaires : sans le barème, aucune commission de
  // conciergerie ne peut être calculée (page réservée à l'admin).
  useEffect(() => {
    const loadCars = async () => {
      try {
        const result = await getCarsWithOwners();
        if (result.success && result.cars) {
          const mapped: Car[] = result.cars.map((dbCar: any) => ({
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
            priceDayEur: eurOrUndefined(dbCar.price_day_eur),
            priceWeekEur: eurOrUndefined(dbCar.price_week_eur),
            priceMonthEur: eurOrUndefined(dbCar.price_month_eur),
            depositEur: eurOrUndefined(dbCar.deposit_eur),
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
          }));
          setCars(mapped);
          if (mapped.length > 0) setSelectedCarId(mapped[0].id);
        }
      } catch (err) {
        console.error('Error loading cars:', err);
      }
    };
    loadCars();
  }, []);

  const handleGenerate = async () => {
    if (!selectedCarId || !startDate || !endDate) {
      alert(T('Veuillez sélectionner un véhicule et les dates.', 'يرجى تحديد المركبة والتواريخ.', lang));
      return;
    }

    setLoading(true);
    try {
      const [resList, expList] = await Promise.all([
        ReservationsService.getReservations(),
        (async () => {
          const res = await getVehicleExpenses();
          return res.expenses || [];
        })(),
      ]);

      const carRes = resList.filter(
        r => (r.carId || r.car?.id) === selectedCarId
          && inRange(r.step1?.departureDate || r.createdAt || '', startDate, endDate),
      );

      const carExp = expList
        .filter(e => e.carId === selectedCarId && inRange(e.date, startDate, endDate))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setReservations(carRes);
      setExpenses(carExp);
      setGenerated(true);
    } catch (err) {
      console.error('Error loading data:', err);
      alert(T('Erreur lors du chargement des données.', 'خطأ في تحميل البيانات.', lang));
    } finally {
      setLoading(false);
    }
  };

  const selectedCar = cars.find(c => c.id === selectedCarId);

  // Tous les agrégats viennent du socle partagé : la page « Rapports » applique
  // exactement les mêmes formules sur les mêmes données.
  const g = useMemo(
    () => computeVehicleGains(selectedCar, reservations, expenses),
    [selectedCar, reservations, expenses],
  );
  const { consignment, owner } = g;

  const periodDays = Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1,
  );
  const occupancy = Math.min(100, pct(g.daysRented, periodDays));

  const handlePrint = async () => {
    if (!selectedCar) return;
    try {
      const agencySettings = await DatabaseService.getAgencyBranding();
      const html = generateReportHTML(
        selectedCar, reservations, expenses, startDate, endDate, agencySettings, lang,
      );

      const iframe = document.createElement('iframe');
      iframe.id = '__print_iframe__';
      iframe.style.display = 'none';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(html);
        iframeDoc.close();
        setTimeout(() => {
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 100);
        }, 250);
      }
    } catch (err) {
      console.error('Error printing report:', err);
      alert(T("Erreur lors de l'impression.", 'خطأ في الطباعة.', lang));
    }
  };

  /** Le barème du propriétaire, écrit tel qu'il s'applique. */
  const scaleLabel = owner
    ? owner.commissionType === 'percentage'
      ? `${owner.commissionValue.toLocaleString('fr-FR')} %`
      : `${fmt(owner.commissionValue)} DA`
    : '';

  // ── KPI : véhicule confié vs véhicule de l'agence ───────────────────────────
  const kpis = consignment
    ? [
        {
          label: T('CA encaissé (brut)', 'المحصّل الإجمالي', lang),
          value: g.collected,
          share: g.collectionRate,
          shareLabel: T('du facturé', 'من المفوتر', lang),
          tone: 'slate' as const,
          icon: <Wallet size={15} />,
        },
        {
          label: T('Revenu agence', 'إيراد الوكالة', lang),
          value: g.agencyRevenue,
          share: g.agencyShare,
          shareLabel: T('du CA terminé', 'من رقم الأعمال المنتهي', lang),
          tone: 'amber' as const,
          icon: <Handshake size={15} />,
        },
        {
          label: T('Reversement propriétaire', 'مستحقات المالك', lang),
          value: g.ownerPayout,
          share: g.ownerShare,
          shareLabel: T('du CA terminé', 'من رقم الأعمال المنتهي', lang),
          tone: 'slate' as const,
          icon: <UserIcon size={15} />,
        },
        {
          label: T('Dépenses', 'المصاريف', lang),
          value: g.expenses,
          share: g.expenseRatio,
          shareLabel: T('du revenu agence', 'من إيراد الوكالة', lang),
          tone: 'rose' as const,
          icon: <Receipt size={15} />,
        },
        {
          label: T('Bénéfice net agence', 'صافي ربح الوكالة', lang),
          value: g.netBenefit,
          share: g.margin,
          shareLabel: T('de marge', 'هامش', lang),
          tone: g.netBenefit >= 0 ? ('indigo' as const) : ('rose' as const),
          icon: <TrendingUp size={15} />,
        },
      ]
    : [
        {
          label: T('Total facturé', 'الإجمالي المفوتر', lang),
          value: g.invoiced,
          hint: `${g.rentals} ${T('location(s)', 'إيجار', lang)}`,
          tone: 'slate' as const,
          icon: <Receipt size={15} />,
        },
        {
          label: T('Encaissé', 'المحصّل', lang),
          value: g.collected,
          share: g.collectionRate,
          shareLabel: T('du facturé', 'من المفوتر', lang),
          tone: 'emerald' as const,
          icon: <Wallet size={15} />,
        },
        {
          label: T('Dépenses', 'المصاريف', lang),
          value: g.expenses,
          share: g.expenseRatio,
          shareLabel: T("de l'encaissé", 'من المحصّل', lang),
          tone: 'rose' as const,
          icon: <Receipt size={15} />,
        },
        {
          label: T('Bénéfice net', 'صافي الأرباح', lang),
          value: g.netBenefit,
          share: g.margin,
          shareLabel: T('de marge', 'هامش', lang),
          tone: g.netBenefit >= 0 ? ('indigo' as const) : ('rose' as const),
          icon: <TrendingUp size={15} />,
        },
      ];

  const fieldCls =
    'w-full rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white outline-none backdrop-blur-sm transition focus:border-white/40 focus:bg-white/15 focus:ring-2 focus:ring-white/20';

  return (
    <div className="max-w-[92rem] mx-auto pb-8">
      {/* ── En-tête + filtres ── */}
      <PageHeader
        icon="💰"
        eyebrow={T('Rentabilité', 'الربحية', lang)}
        title={T('Gains par véhicule', 'الأرباح حسب المركبة', lang)}
        subtitle={T(
          'Revenus, commissions, créances et dépenses — avec le détail de chaque calcul.',
          'الإيرادات والعمولات والديون والمصاريف — مع تفصيل كل عملية حسابية.',
          lang,
        )}
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <label className="fx-label">{T('Véhicule', 'المركبة', lang)}</label>
            {/* Recherche plutôt qu'une liste déroulante : au-delà de quinze
                voitures, retrouver la bonne à l'œil devient un exercice. */}
            <CarPicker
              cars={cars}
              value={selectedCarId}
              lang={lang}
              placeholder={T('Choisir un véhicule…', 'اختر مركبة…', lang)}
              onChange={carId => { setSelectedCarId(carId); setGenerated(false); }}
            />
          </div>

          <div>
            <label className="fx-label">{T('Date de début', 'تاريخ البداية', lang)}</label>
            <input
              type="date"
              value={startDate}
              onChange={e => { setStartDate(e.target.value); setGenerated(false); }}
              className="fx-field"
            />
          </div>

          <div>
            <label className="fx-label">{T('Date de fin', 'تاريخ النهاية', lang)}</label>
            <input
              type="date"
              value={endDate}
              onChange={e => { setEndDate(e.target.value); setGenerated(false); }}
              className="fx-field"
            />
          </div>

          <div className="flex items-end">
            <Btn
              tone="primary"
              className="w-full"
              onClick={handleGenerate}
              disabled={loading || !selectedCarId}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
              {loading ? T('Génération…', 'جاري…', lang) : T('Analyser', 'تحليل', lang)}
            </Btn>
          </div>
        </div>
      </PageHeader>

      <AnimatePresence mode="wait">
        {!generated && !loading && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <EmptyState
              icon="📊"
              title={T('Prêt à analyser vos gains ?', 'هل أنت مستعد لتحليل أرباحك؟', lang)}
              description={T(
                'Choisissez un véhicule et une période, puis lancez l’analyse pour voir le détail des calculs : chaque location, chaque paiement, chaque dépense.',
                'اختر مركبة وفترة، ثم ابدأ التحليل لعرض تفاصيل الحسابات.',
                lang,
              )}
            />
          </motion.div>
        )}

        {generated && !loading && selectedCar && (
          <motion.div
            key="report"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* ── Identité du véhicule ── */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex flex-col items-center gap-5 p-5 sm:flex-row">
                <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
                  <img
                    src={selectedCar.images?.[0] || 'https://picsum.photos/seed/car/400/300'}
                    alt={`${selectedCar.brand} ${selectedCar.model}`}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
                    <h2 className="text-xl font-extrabold tracking-tight text-slate-900">
                      {selectedCar.brand} {selectedCar.model}
                    </h2>
                    {g.isConsignment && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                        <Handshake size={11} />
                        {T('Conciergerie', 'أمانة', lang)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-indigo-600">{selectedCar.registration}</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                    {[
                      `${selectedCar.year}`,
                      selectedCar.energy,
                      `${selectedCar.mileage.toLocaleString('fr-FR')} km`,
                    ].map(chip => (
                      <span
                        key={chip}
                        className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Taux d'occupation — le seul % qui parle d'exploitation, pas d'argent. */}
                <div className="w-full shrink-0 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:w-48">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <Gauge size={12} />
                    {T('Taux d’occupation', 'معدل الإشغال', lang)}
                  </div>
                  <p className="text-2xl font-extrabold tabular-nums text-slate-900">{fmtPct(occupancy)}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-400 tabular-nums">
                    {g.daysRented} / {periodDays} {T('jours', 'يوم', lang)}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${occupancy}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full bg-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {g.isConsignment && owner && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-amber-100 bg-amber-50/60 px-5 py-3">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-amber-900">
                    <UserIcon size={14} />
                    {owner.ownerName}
                    {owner.internalRef && (
                      <span className="rounded bg-amber-200/70 px-1.5 py-0.5 text-[11px] font-bold" dir="ltr">
                        {owner.internalRef}
                      </span>
                    )}
                  </span>
                  {owner.ownerPhone && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-800" dir="ltr">
                      <Phone size={12} />
                      {owner.ownerPhone}
                    </span>
                  )}
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200">
                    {T('Barème', 'الاتفاق', lang)} : {scaleLabel} / {T('location', 'إيجار', lang)}
                  </span>
                </div>
              )}
            </div>

            {/* ── KPI ── */}
            <div className={`grid grid-cols-2 gap-3 lg:grid-cols-4 ${consignment ? 'xl:grid-cols-5' : ''}`}>
              {kpis.map((k, i) => (
                <StatCard key={k.label} index={i} {...k} />
              ))}
            </div>

            {/* ── Lecture visuelle : où part l'argent, et quelle est la marge ── */}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Panel title={T('Répartition du chiffre', 'توزيع رقم الأعمال', lang)} icon="🥧">
                {g.invoiced > 0 ? (
                  <Donut
                    size={160}
                    centerLabel={T('Facturé', 'المفوتر', lang)}
                    centerValue={`${fmt(g.invoiced)} DA`}
                    data={[
                      { label: T('Revenu agence', 'إيراد الوكالة', lang), value: Math.max(0, g.agencyRevenue), color: SERIES[0] },
                      { label: T('Part propriétaire', 'حصة المالك', lang), value: Math.max(0, g.ownerPayout), color: SERIES[3] },
                      { label: T('Dépenses véhicule', 'مصاريف المركبة', lang), value: Math.max(0, g.expenses), color: SERIES[2] },
                      { label: T('Reste à encaisser', 'المتبقي', lang), value: Math.max(0, g.outstanding), color: SERIES[6] },
                    ].filter(d => d.value > 0)}
                  />
                ) : (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
                    {T('Aucune location sur la période.', 'لا إيجارات في هذه الفترة.', lang)}
                  </p>
                )}
              </Panel>

              <Panel title={T('Indicateurs de santé', 'مؤشرات الأداء', lang)} icon="📈">
                <div className="flex flex-wrap items-start justify-around gap-4 py-2">
                  <FxGauge
                    value={g.collectionRate}
                    label={T('Taux de recouvrement', 'نسبة التحصيل', lang)}
                    tone={g.collectionRate >= 90 ? '#10A46F' : g.collectionRate >= 60 ? '#D98410' : '#E01331'}
                  />
                  <FxGauge
                    value={g.margin}
                    label={T('Marge nette', 'هامش الربح', lang)}
                    tone={g.margin >= 30 ? '#10A46F' : g.margin >= 0 ? '#D98410' : '#E01331'}
                  />
                  <FxGauge
                    value={Math.min(100, g.expenseRatio)}
                    label={T('Poids des dépenses', 'وزن المصاريف', lang)}
                    tone={g.expenseRatio <= 30 ? '#10A46F' : g.expenseRatio <= 60 ? '#D98410' : '#E01331'}
                  />
                </div>
              </Panel>

              <Panel title={T('Dépenses par poste', 'المصاريف حسب البند', lang)} icon="🔧">
                {expenses.length > 0 ? (
                  <RankBars
                    format={n => `${fmt(n)} DA`}
                    data={Object.entries(
                      expenses.reduce<Record<string, number>>((acc, e) => {
                        acc[e.type] = (acc[e.type] ?? 0) + Number(e.cost || 0);
                        return acc;
                      }, {}),
                    )
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, value], i) => ({
                        label: EXPENSE_FR[type] ?? type,
                        value,
                        color: SERIES[i % SERIES.length],
                      }))}
                  />
                ) : (
                  <p className="py-6 text-center text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
                    {T('Aucune dépense sur la période.', 'لا مصاريف في هذه الفترة.', lang)}
                  </p>
                )}
              </Panel>
            </div>

            {/* ── Créances : ce qui reste dû, location par location ── */}
            {(() => {
              const debts = reservations
                .filter(r => r.status !== 'cancelled')
                .map(r => ({ r, paid: calcPaid(r), due: Number(r.totalPrice || 0) - calcPaid(r) }))
                .filter(d => d.due > 0.5)
                .sort((a, b) => b.due - a.due);

              if (debts.length === 0) return null;

              return (
                <Panel
                  title={T('Créances sur ce véhicule', 'ديون هذه المركبة', lang)}
                  icon="⏳"
                  actions={<Badge tone="red">{fmt(debts.reduce((s, d) => s + d.due, 0))} DA</Badge>}
                  bodyClassName="p-0"
                >
                  <TableWrap>
                    <thead className="fx-table-head">
                      <tr>
                        <Th>{T('Client', 'العميل', lang)}</Th>
                        <Th>{T('Période', 'الفترة', lang)}</Th>
                        <Th>{T('Statut', 'الحالة', lang)}</Th>
                        <Th align="right">{T('Total', 'المجموع', lang)}</Th>
                        <Th align="right">{T('Payé', 'مدفوع', lang)}</Th>
                        <Th align="right">{T('Reste dû', 'المتبقي', lang)}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {debts.map(({ r, paid, due }) => (
                        <tr key={r.id} className="fx-table-row">
                          <Td>{r.client ? `${r.client.firstName} ${r.client.lastName}` : '—'}</Td>
                          <Td>
                            {(r.step1?.departureDate || '').slice(0, 10)} → {(r.step1?.returnDate || '').slice(0, 10)}
                          </Td>
                          <Td><Badge tone={r.status === 'completed' ? 'steel' : 'amber'}>{r.status}</Badge></Td>
                          <Td align="right" className="tabular-nums">{fmt(Number(r.totalPrice || 0))} DA</Td>
                          <Td align="right" className="tabular-nums">{fmt(paid)} DA</Td>
                          <Td align="right" className="tabular-nums font-black">
                            <span style={{ color: 'var(--fx-red-200)' }}>{fmt(due)} DA</span>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableWrap>
                </Panel>
              );
            })()}

            {/* ── 🤝 Détail du calcul — conciergerie ── */}
            {consignment && owner && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-amber-200"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-100 bg-amber-50 px-5 py-3.5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-amber-800">
                    <Handshake size={16} />
                    {T('Détail du calcul — conciergerie', 'تفصيل الحساب — الأمانة', lang)}
                  </h3>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                    {consignment.completedCount} {T('location(s) terminée(s)', 'إيجار منتهي', lang)}
                  </span>
                </div>

                <div className="p-5">
                  <div className="divide-y divide-slate-100">
                    <CalcRow
                      label={T('CA des locations terminées', 'رقم أعمال الإيجارات المنتهية', lang)}
                      formula={`${consignment.completedCount} × ${T('locations clôturées', 'إيجارات مغلقة', lang)}`}
                      amount={consignment.grossCompleted}
                      share={100}
                      tone="slate"
                    />
                    <CalcRow
                      sign="−"
                      label={T('Commission agence', 'عمولة الوكالة', lang)}
                      formula={
                        owner.commissionType === 'percentage'
                          ? `${fmt(consignment.grossCompleted)} × ${scaleLabel} = ${fmt(consignment.commissionEarned)}`
                          : `${consignment.completedCount} × ${scaleLabel} = ${fmt(consignment.commissionEarned)}`
                      }
                      amount={consignment.commissionEarned}
                      share={g.effectiveCommissionRate}
                      tone="amber"
                    />
                    <CalcRow
                      sign="−"
                      label={T('Livraison à charge du propriétaire (≥ 10 jours)', 'التوصيل على حساب المالك (≥ 10 أيام)', lang)}
                      amount={consignment.ownerDeliveryFees}
                      share={pct(consignment.ownerDeliveryFees, consignment.grossCompleted)}
                      tone="amber"
                    />
                    <CalcRow
                      sign="="
                      label={T('À reverser au propriétaire', 'المستحق للمالك', lang)}
                      amount={consignment.ownerPayout}
                      share={g.ownerShare}
                      tone="slate"
                      strong
                    />
                  </div>

                  {/* Répartition visuelle du CA clôturé */}
                  <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="mb-2.5 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                        {T('Répartition du CA terminé', 'توزيع رقم الأعمال المنتهي', lang)}
                      </p>
                      <p className="text-[11px] font-bold tabular-nums text-slate-500">
                        {fmt(consignment.grossCompleted)} DZD
                      </p>
                    </div>
                    <SplitBar
                      segments={[
                        { value: consignment.commissionEarned, label: T('Commission', 'العمولة', lang), cls: 'bg-amber-500' },
                        { value: consignment.ownerDeliveryFees, label: T('Livraison', 'التوصيل', lang), cls: 'bg-amber-300' },
                        { value: consignment.ownerPayout, label: T('Propriétaire', 'المالك', lang), cls: 'bg-slate-400' },
                      ]}
                    />
                    <SplitLegend
                      items={[
                        { label: T('Agence', 'الوكالة', lang), cls: 'bg-amber-500', pct: g.agencyShare, tone: 'amber' },
                        { label: T('Propriétaire', 'المالك', lang), cls: 'bg-slate-400', pct: g.ownerShare, tone: 'slate' },
                      ]}
                    />
                  </div>

                  {/* Le taux constaté peut s'écarter du barème : les commissions
                      sont figées à la clôture, un barème modifié après coup ne
                      recalcule pas le passé. */}
                  {owner.commissionType === 'percentage'
                    && consignment.completedCount > 0
                    && Math.abs(g.effectiveCommissionRate - owner.commissionValue) > 0.5 && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                        ℹ️ {T(
                          `Taux constaté ${fmtPct(g.effectiveCommissionRate)} contre ${scaleLabel} au barème — les commissions sont figées à la clôture de chaque location.`,
                          `النسبة الفعلية ${fmtPct(g.effectiveCommissionRate)} مقابل ${scaleLabel} في الاتفاق — تُثبَّت العمولات عند إنهاء كل إيجار.`,
                          lang,
                        )}
                      </p>
                    )}

                  {consignment.pendingCount > 0 && (
                    <p className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                      <Clock size={13} className="shrink-0 text-slate-400" />
                      {consignment.pendingCount}{' '}
                      {T(
                        'location(s) en cours — commission estimée non encore acquise',
                        'إيجار جارٍ — عمولة مقدرة غير مكتسبة بعد',
                        lang,
                      )}{' '}
                      : <strong className="tabular-nums">+{fmt(consignment.commissionPending)} DZD</strong>
                    </p>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Détail du calcul — véhicule de l'agence ── */}
            {!consignment && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">
                    <PieChart size={16} />
                    {T('Détail du calcul', 'تفصيل الحساب', lang)}
                  </h3>
                </div>
                <div className="p-5">
                  <div className="divide-y divide-slate-100">
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
                      label={T('Reste à encaisser', 'المتبقي للتحصيل', lang)}
                      amount={g.outstanding}
                      share={pct(g.outstanding, g.invoiced)}
                      tone="amber"
                    />
                    <CalcRow
                      sign="−"
                      label={T('Dépenses véhicule', 'مصاريف المركبة', lang)}
                      formula={`${expenses.length} ${T('poste(s)', 'بند', lang)}`}
                      amount={g.expenses}
                      share={g.expenseRatio}
                      tone="rose"
                    />
                    <CalcRow
                      sign="="
                      label={T('Bénéfice net', 'صافي الأرباح', lang)}
                      amount={g.netBenefit}
                      share={g.margin}
                      tone={g.netBenefit >= 0 ? 'indigo' : 'rose'}
                      strong
                    />
                  </div>

                  <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {T('Répartition de l’encaissé', 'توزيع المحصّل', lang)}
                    </p>
                    <SplitBar
                      segments={[
                        { value: Math.max(0, g.netBenefit), label: T('Bénéfice net', 'صافي الأرباح', lang), cls: 'bg-indigo-500' },
                        { value: g.expenses, label: T('Dépenses', 'المصاريف', lang), cls: 'bg-rose-400' },
                      ]}
                    />
                    <SplitLegend
                      items={[
                        { label: T('Bénéfice net', 'صافي الأرباح', lang), cls: 'bg-indigo-500', pct: g.margin, tone: 'indigo' },
                        { label: T('Dépenses', 'المصاريف', lang), cls: 'bg-rose-400', pct: g.expenseRatio, tone: 'rose' },
                      ]}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Locations ── */}
            {reservations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-slate-700">
                    <Calendar size={16} />
                    {T('Locations', 'الإيجارات', lang)}
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                      {reservations.length}
                    </span>
                  </h3>
                  <span className="text-sm font-bold tabular-nums text-emerald-700">
                    +{fmt(g.collected)} <span className="text-[10px] text-slate-400">DZD</span>
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {reservations.map(res => {
                    const paid = calcPaid(res);
                    const debt = Number(res.remainingPayment) || 0;
                    const total = Number(res.totalPrice) || 0;
                    const isOpen = expandedRes === res.id;
                    const st = STATUS_META[res.status] || STATUS_META.pending;
                    const cb = owner ? commissionBreakdown(res, owner) : null;
                    // Poids de cette location dans le CA de la période.
                    const weight = res.status === 'cancelled' ? 0 : pct(total, g.invoiced);

                    return (
                      <div key={res.id}>
                        <button
                          onClick={() => setExpandedRes(isOpen ? null : res.id)}
                          className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-bold text-slate-800">
                                {res.client?.firstName} {res.client?.lastName}
                              </p>
                              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ring-1 ${st.cls}`}>
                                {T(st.fr, st.ar, lang)}
                              </span>
                              {weight > 0 && <PctChip value={weight} tone="slate" />}
                            </div>
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                              <Clock size={12} />
                              <span className="tabular-nums" dir="ltr">
                                {fmtD(res.step1?.departureDate)} → {fmtD(res.step1?.returnDate)}
                              </span>
                              <span className="font-semibold text-slate-600">({res.totalDays}j)</span>
                            </p>
                          </div>

                          <div className="shrink-0 space-y-0.5 text-right">
                            <p className="text-sm font-bold tabular-nums text-emerald-700">{fmt(paid)}</p>
                            {debt > 0 && res.status !== 'cancelled' && (
                              <p className="text-xs font-semibold tabular-nums text-amber-600">
                                {T('reste', 'متبقي', lang)} {fmt(debt)}
                              </p>
                            )}
                            {cb && res.status !== 'cancelled' && (
                              <p className="flex items-center justify-end gap-1 text-xs font-semibold tabular-nums text-amber-700">
                                <Handshake size={10} />
                                {fmt(cb.agencyPart)}
                              </p>
                            )}
                          </div>

                          <ChevronDown
                            size={16}
                            className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          />
                        </button>

                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.22 }}
                              className="overflow-hidden border-t border-slate-100 bg-slate-50/70"
                            >
                              <div className="space-y-3 p-5">
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  {[
                                    { l: T('Total', 'الإجمالي', lang), v: total, c: 'text-slate-900', p: weight },
                                    { l: T('Avance', 'الدفعة الأولى', lang), v: Number(res.advancePayment) || 0, c: 'text-blue-700', p: pct(Number(res.advancePayment) || 0, total) },
                                    { l: T('Payé', 'المدفوع', lang), v: paid, c: 'text-emerald-700', p: pct(paid, total) },
                                    { l: T('Reste', 'المتبقي', lang), v: debt, c: debt > 0 ? 'text-amber-700' : 'text-emerald-700', p: pct(debt, total) },
                                  ].map(item => (
                                    <div key={item.l} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                                      <p className="text-[11px] font-semibold text-slate-500">{item.l}</p>
                                      <p className={`mt-1 text-sm font-extrabold tabular-nums ${item.c}`}>
                                        {fmt(item.v)}
                                        <span className="ml-1 text-[10px] font-semibold text-slate-400">DZD</span>
                                      </p>
                                      <p className="mt-1 text-[10px] font-semibold tabular-nums text-slate-400">
                                        {fmtPct(item.p)}
                                      </p>
                                    </div>
                                  ))}
                                </div>

                                {/* Le calcul de commission, location par location. */}
                                {cb && owner && res.status !== 'cancelled' && (
                                  <div className="rounded-xl bg-white p-4 ring-1 ring-amber-200">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">
                                        <Handshake size={12} />
                                        {T('Calcul de la commission', 'حساب العمولة', lang)}
                                      </p>
                                      <span
                                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ring-1 ${
                                          cb.locked
                                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                                            : 'bg-slate-100 text-slate-500 ring-slate-200'
                                        }`}
                                      >
                                        {cb.locked
                                          ? T('Figée à la clôture', 'مثبتة عند الإغلاق', lang)
                                          : T('Estimée (en cours)', 'مقدرة (جارية)', lang)}
                                      </span>
                                    </div>

                                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 font-mono text-xs font-semibold tabular-nums text-amber-900" dir="ltr">
                                      <span>{fmt(cb.base)}</span>
                                      <span className="text-amber-400">×</span>
                                      <span>{scaleLabel}</span>
                                      <ArrowRight size={12} className="text-amber-400" />
                                      <span className="font-extrabold">{fmt(cb.commission)} DZD</span>
                                    </div>

                                    <div className="divide-y divide-slate-100">
                                      <CalcRow
                                        label={T('Base (total location)', 'الأساس (إجمالي الإيجار)', lang)}
                                        amount={cb.base}
                                        share={100}
                                        tone="slate"
                                      />
                                      <CalcRow
                                        sign="−"
                                        label={T('Commission agence', 'عمولة الوكالة', lang)}
                                        amount={cb.commission}
                                        share={cb.rate}
                                        tone="amber"
                                      />
                                      {cb.ownerDelivery > 0 && (
                                        <CalcRow
                                          sign="−"
                                          label={T('Livraison (propriétaire)', 'التوصيل (المالك)', lang)}
                                          formula={`${res.totalDays} ${T('jours ≥ 10', 'أيام ≥ 10', lang)}`}
                                          amount={cb.ownerDelivery}
                                          share={pct(cb.ownerDelivery, cb.base)}
                                          tone="amber"
                                        />
                                      )}
                                      <CalcRow
                                        sign="="
                                        label={T('Part propriétaire', 'حصة المالك', lang)}
                                        amount={cb.ownerPart}
                                        share={pct(cb.ownerPart, cb.base)}
                                        tone="slate"
                                        strong
                                      />
                                    </div>

                                    <div className="mt-3">
                                      <SplitBar
                                        segments={[
                                          { value: cb.agencyPart, label: T('Agence', 'الوكالة', lang), cls: 'bg-amber-500' },
                                          { value: cb.ownerPart, label: T('Propriétaire', 'المالك', lang), cls: 'bg-slate-400' },
                                        ]}
                                      />
                                    </div>

                                    {cb.differsFromScale && (
                                      <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
                                        {T(
                                          'Commission figée à la clôture — le barème actuel du propriétaire a été modifié depuis.',
                                          'العمولة مثبتة عند الإغلاق — تم تعديل اتفاق المالك منذ ذلك الحين.',
                                          lang,
                                        )}
                                      </p>
                                    )}
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

                <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm">
                  <span className="font-semibold text-slate-600">
                    {T('Total facturé', 'الإجمالي المفوتر', lang)}
                  </span>
                  <span className="font-extrabold tabular-nums text-slate-900">
                    {fmt(g.invoiced)} <span className="text-[10px] font-semibold text-slate-400">DZD</span>
                  </span>
                </div>
              </motion.div>
            )}

            {/* ── Dépenses ── */}
            {expenses.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-5 py-3.5">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-rose-700">
                    <Receipt size={16} />
                    {T('Dépenses', 'المصاريف', lang)}
                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200">
                      {expenses.length}
                    </span>
                  </h3>
                  <span className="text-sm font-bold tabular-nums text-rose-700">
                    −{fmt(g.expenses)} <span className="text-[10px] text-rose-400">DZD</span>
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {expenses.map(exp => {
                    const cost = Number(exp.cost) || 0;
                    return (
                      <div
                        key={exp.id}
                        className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {exp.expenseName || exp.type}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <Calendar size={11} />
                              {fmtD(exp.date)}
                            </span>
                            {exp.currentMileage ? <span>{fmt(exp.currentMileage)} km</span> : null}
                            {exp.note ? <span className="truncate">{exp.note}</span> : null}
                          </p>
                        </div>
                        <PctChip value={pct(cost, g.expenses)} tone="rose" />
                        <span className="shrink-0 text-sm font-bold tabular-nums text-rose-700">
                          −{fmt(cost)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm">
                  <span className="font-semibold text-rose-700">
                    {T('Total dépenses', 'إجمالي المصاريف', lang)}
                  </span>
                  <span className="font-extrabold tabular-nums text-rose-700">
                    −{fmt(g.expenses)} <span className="text-[10px] font-semibold text-rose-400">DZD</span>
                  </span>
                </div>
              </motion.div>
            )}

            {/* ── Résultat ── */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className={`overflow-hidden rounded-2xl p-5 text-white shadow-lg ${
                g.netBenefit >= 0
                  ? 'bg-gradient-to-br from-indigo-600 to-indigo-800'
                  : 'bg-gradient-to-br from-rose-600 to-rose-800'
              }`}
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                    {consignment
                      ? T('Bénéfice net agence', 'صافي ربح الوكالة', lang)
                      : T('Bénéfice net', 'صافي الأرباح', lang)}
                  </p>
                  <p className="mt-1 text-4xl font-extrabold tabular-nums leading-none">
                    {g.netBenefit >= 0 ? '+' : ''}
                    {fmt(g.netBenefit)}
                    <span className="ml-1.5 text-base font-semibold text-white/50">DZD</span>
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-white/60 tabular-nums" dir="ltr">
                    {consignment
                      ? `${fmt(consignment.commissionEarned)} + ${fmt(consignment.ownerDeliveryFees)} − ${fmt(g.expenses)}`
                      : `${fmt(g.collected)} − ${fmt(g.expenses)}`}
                  </p>
                </div>
                <div className="rounded-xl bg-white/10 px-4 py-3 text-right ring-1 ring-white/20">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
                    {T('Marge', 'الهامش', lang)}
                  </p>
                  <p className="mt-0.5 text-2xl font-extrabold tabular-nums">{fmtPct(g.margin)}</p>
                  <p className="mt-0.5 text-[10px] font-medium text-white/50">
                    {T('du revenu agence', 'من إيراد الوكالة', lang)}
                  </p>
                </div>
              </div>
            </motion.div>

            {reservations.length === 0 && expenses.length === 0 && (
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-200">
                <AlertCircle className="h-5 w-5 shrink-0 text-slate-400" />
                <p className="text-sm font-semibold text-slate-600">
                  {T('Aucune donnée pour cette période', 'لا توجد بيانات لهذه الفترة', lang)}
                </p>
              </div>
            )}

            <div className="flex justify-center pt-1">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handlePrint}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:opacity-50"
              >
                <Printer size={16} />
                {T('Imprimer le rapport', 'طباعة التقرير', lang)}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CarGainsPage;
