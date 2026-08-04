import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardStats, MaintenanceAlert, Language, Car, ReservationDetails, VehicleExpense, User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Bell, Calendar, CarFront, ChevronRight, Gauge, RefreshCw, TrendingUp, Users } from 'lucide-react';
import { PageHeader, StatCard, StatGrid, Panel, Btn } from './ui/fx';
import { DatabaseService } from '../services/DatabaseService';
import { getCarsWithOwners } from '../services/carService';
import { getMonthlyAgencyCommission } from '../services/consignmentService';
import { getVehicleExpenses } from '../services/expenseService';
import { getVidangeAlert, getAssuranceAlert, getControleAlert, getChaineAlert } from '../utils/vidangeAlerts';
import { ReservationsService } from '../services/ReservationsService';
import { getReservationAlerts, ReservationAlert } from '../utils/reservationAlerts';
import { scheduleNotification, checkAndTriggerScheduledNotifications, requestNotificationPermission } from '../services/notificationService';
import { eurOrUndefined } from '../utils/currency';

interface DashboardPageProps {
  lang: Language;
  isAuthLoading?: boolean;
  user?: User | null;
}

/** Palette carbone d'une ligne d'alerte selon la sévérité — dégradés + lueur. */
type SevTheme = {
  accent: string;
  barGrad: string;
  chipBg: string; chipBorder: string; chipFg: string;
  iconBg: string; iconBorder: string; iconFg: string;
  cardBorder: string; glow: string;
};
const severityTheme = (severity: string): SevTheme => {
  switch (severity) {
    case 'critical':
      return {
        accent: '#F0333C',
        barGrad: 'linear-gradient(180deg,#FF6B70,#8A0A1C)',
        chipBg: 'linear-gradient(135deg, rgba(240,51,60,0.20), rgba(116,8,26,0.06))',
        chipBorder: 'var(--fx-line-red)', chipFg: '#FFB3B6',
        iconBg: 'linear-gradient(135deg, rgba(240,51,60,0.22), rgba(116,8,26,0.05))',
        iconBorder: 'var(--fx-line-red)', iconFg: '#FFB3B6',
        cardBorder: 'var(--fx-line-red)', glow: '0 0 22px -12px rgba(240,51,60,0.7)',
      };
    case 'high':
      return {
        accent: '#F59E0B',
        barGrad: 'linear-gradient(180deg,#FCD34D,#B45309)',
        chipBg: 'linear-gradient(135deg, rgba(217,132,16,0.22), rgba(168,92,8,0.06))',
        chipBorder: 'rgba(251,191,36,0.4)', chipFg: '#FCD34D',
        iconBg: 'linear-gradient(135deg, rgba(217,132,16,0.22), rgba(168,92,8,0.05))',
        iconBorder: 'rgba(251,191,36,0.4)', iconFg: '#FCD34D',
        cardBorder: 'rgba(251,191,36,0.32)', glow: '0 0 22px -12px rgba(217,132,16,0.6)',
      };
    case 'medium':
      return {
        accent: '#FCD34D',
        barGrad: 'linear-gradient(180deg,#FDE68A,#D98410)',
        chipBg: 'linear-gradient(135deg, rgba(217,132,16,0.18), rgba(168,92,8,0.05))',
        chipBorder: 'rgba(251,191,36,0.35)', chipFg: '#FCD34D',
        iconBg: 'linear-gradient(135deg, rgba(217,132,16,0.16), rgba(168,92,8,0.04))',
        iconBorder: 'rgba(251,191,36,0.3)', iconFg: '#FDE68A',
        cardBorder: 'rgba(251,191,36,0.24)', glow: '0 0 20px -12px rgba(217,132,16,0.5)',
      };
    default:
      return {
        accent: '#34D399',
        barGrad: 'linear-gradient(180deg,#6EE7B7,#0A7350)',
        chipBg: 'linear-gradient(135deg, rgba(16,164,111,0.20), rgba(10,115,80,0.06))',
        chipBorder: 'rgba(52,211,153,0.4)', chipFg: '#6EE7B7',
        iconBg: 'linear-gradient(135deg, rgba(16,164,111,0.20), rgba(10,115,80,0.05))',
        iconBorder: 'rgba(52,211,153,0.4)', iconFg: '#6EE7B7',
        cardBorder: 'rgba(52,211,153,0.28)', glow: '0 0 20px -12px rgba(16,164,111,0.55)',
      };
  }
};

const maintenanceIcon = (type: string) => {
  switch (type) {
    case 'vidange': return '🛢️';
    case 'assurance': return '🛡️';
    case 'controle': return '🔍';
    case 'chaine': return '⛓️';
    default: return '⚠️';
  }
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ lang, isAuthLoading = false, user = null }) => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    monthlyRevenue: 0,
    totalReservations: 0,
    activeReservations: 0,
    totalClients: 0,
    totalCars: 0,
    availableCars: 0,
    personalCars: 0,
    consignmentCars: 0,
    maintenanceAlerts: 0,
    overduePayments: 0,
    recentReservations: [],
    revenueByMonth: [],
    carUtilization: []
  });
  const [cars, setCars] = useState<Car[]>([]);
  /** Commissions encaissées sur les locations de conciergerie clôturées ce mois-ci. */
  const [monthlyCommission, setMonthlyCommission] = useState(0);
  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpense[]>([]);
  const [reservations, setReservations] = useState<ReservationDetails[]>([]);
  const [alertFilter, setAlertFilter] = useState<'all' | 'maintenance' | 'reservations'>('all');
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch real data from database in parallel
      // Page admin : getCarsWithOwners joint car_owners (réf interne, propriétaire, commission).
      const [dbStats, , carsResult, expensesResult, reservationsResult, commissionThisMonth] = await Promise.all([
        DatabaseService.getDashboardStats(),
        DatabaseService.getMaintenanceAlerts(),
        getCarsWithOwners(),
        getVehicleExpenses(),
        ReservationsService.getReservations(),
        getMonthlyAgencyCommission()
      ]);

      setMonthlyCommission(commissionThisMonth);

      // Set cars and expenses for vidange alerts
      if (carsResult.success && carsResult.cars) {
        setCars(carsResult.cars.map(dbCar => ({
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
        })));
      }

      if (expensesResult.success && expensesResult.expenses) {
        setVehicleExpenses(expensesResult.expenses);
      }

      // Set reservations for alerts
      if (Array.isArray(reservationsResult)) {
        setReservations(reservationsResult);
      }

      // Map database stats to component state
      setStats({
        totalRevenue: dbStats.totalRevenue,
        totalClients: dbStats.totalClients,
        totalCars: dbStats.totalCars,
        activeReservations: dbStats.activeReservations,
        maintenanceAlerts: dbStats.maintenanceAlerts,
        monthlyRevenue: dbStats.monthlyRevenue || 0,
        totalReservations: dbStats.totalReservations || 0,
        availableCars: dbStats.availableCars || 0,
        personalCars: dbStats.personalCars || 0,
        consignmentCars: dbStats.consignmentCars || 0,
        overduePayments: dbStats.overduePayments || 0,
        recentReservations: dbStats.recentReservations || [],
        revenueByMonth: dbStats.revenueByMonth || [],
        carUtilization: dbStats.carUtilization || []
      });

      setLoading(false);
      setRefreshing(false);
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Chargement UNIQUE à l'arrivée sur la page — aucun rafraîchissement
  // automatique. Le bouton « Actualiser » relance le chargement à la demande.
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) return;
    loadDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAuthLoading]);

  // Schedule notifications for reservations expiring tomorrow
  useEffect(() => {
    if (reservations.length === 0) return;

    // Request notification permission on first load
    requestNotificationPermission();

    // Get all alerts to find expiring_tomorrow alerts
    const allAlerts = getReservationAlerts(reservations);
    const expiringTomorrowAlerts = allAlerts.filter(a => a.type === 'expiring_tomorrow');

    // Schedule notifications for each expiring reservation
    expiringTomorrowAlerts.forEach(alert => {
      const returnDate = new Date(alert.reservation.step1.returnDate);
      const clientName = `${alert.reservation.client.firstName} ${alert.reservation.client.lastName}`;
      const vehicleName = `${alert.reservation.car.brand} ${alert.reservation.car.model}`;
      const message = `La réservation de ${clientName} pour ${vehicleName} expire demain!`;

      scheduleNotification(alert.reservationId, returnDate, message);
    });
  }, [reservations]);

  // Déclenche les notifications navigateur planifiées. Cette boucle ne touche
  // AUCUN état React : elle ne provoque donc aucun re-render / refresh de l'UI.
  useEffect(() => {
    checkAndTriggerScheduledNotifications();
    const notificationCheckInterval = setInterval(() => {
      checkAndTriggerScheduledNotifications();
    }, 60000);
    return () => clearInterval(notificationCheckInterval);
  }, []);

  // ── Alertes maintenance (vidange / assurance / contrôle / chaîne) ──────────
  const maintenanceAlerts = useMemo(() => cars
    .flatMap(car => [
      { type: 'vidange', alert: getVidangeAlert(car, vehicleExpenses), car },
      { type: 'assurance', alert: getAssuranceAlert(car, vehicleExpenses), car },
      { type: 'controle', alert: getControleAlert(car, vehicleExpenses), car },
      { type: 'chaine', alert: getChaineAlert(car, vehicleExpenses), car }
    ])
    .filter(item => item.alert !== null && item.alert.status !== 'ok')
    .map(item => ({
      ...item.alert,
      type: item.type,
      carId: item.car.id,
      carInfo: `${item.car.brand} ${item.car.model} - ${item.car.registration}`,
      id: `${item.car.id}-${item.type}`,
      severity: (item.alert as any).status === 'overdue' ? 'critical' : (item.alert as any).status === 'warning' ? 'high' : 'low',
      title: item.type === 'vidange' ? 'Vidange' : item.type === 'assurance' ? 'Assurance' : item.type === 'controle' ? 'Contrôle' : 'Chaîne',
      daysUntilDue: (item.alert as any).daysRemaining || 0,
      dueDate: (item.alert as any).expirationDate || null,
      currentMileage: (item.alert as any).currentMileage || 0,
      nextServiceMileage: (item.alert as any).nextVidangeKm || 0,
      isExpired: (item.alert as any).status === 'overdue',
      createdAt: new Date().toISOString()
    } as MaintenanceAlert)), [cars, vehicleExpenses]);

  const reservationAlerts = useMemo(() => getReservationAlerts(reservations), [reservations]);

  // Commandes du site public en attente d'acceptation par l'agence
  // (statut dédié 'website_reservation').
  const pendingWebOrdersCount = reservations.filter(
    r => r.source === 'website' && (r.status as string) === 'website_reservation'
  ).length;

  // ── File unifiée des notifications, triée par sévérité ─────────────────────
  const severityRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  type UnifiedAlert =
    | { kind: 'maintenance'; severity: string; data: MaintenanceAlert }
    | { kind: 'reservation'; severity: string; data: ReservationAlert };

  const unifiedAlerts: UnifiedAlert[] = useMemo(() => {
    const list: UnifiedAlert[] = [
      ...maintenanceAlerts.map(a => ({ kind: 'maintenance' as const, severity: a.severity, data: a })),
      ...reservationAlerts.map(a => ({ kind: 'reservation' as const, severity: a.severity, data: a })),
    ];
    return list.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenanceAlerts, reservationAlerts]);

  const filteredAlerts = unifiedAlerts.filter(a =>
    alertFilter === 'all' ? true : alertFilter === 'maintenance' ? a.kind === 'maintenance' : a.kind === 'reservation'
  );
  const displayedAlerts = showAllAlerts ? filteredAlerts : filteredAlerts.slice(0, 6);

  const criticalCount = unifiedAlerts.filter(a => a.severity === 'critical').length;
  const highCount = unifiedAlerts.filter(a => a.severity === 'high').length;

  // ── Parc scindé : véhicules de l'agence / véhicules confiés (conciergerie) ──
  const personalCarsList    = cars.filter(c => c.ownershipType !== 'consignment');
  const consignmentCarsList = cars.filter(c => c.ownershipType === 'consignment');

  /** Disponible = ni en maintenance, ni couvert aujourd'hui par une réservation en cours. */
  const countAvailable = (list: Car[]) => {
    const today = new Date().toISOString().substring(0, 10);
    const busyCarIds = new Set(
      reservations
        .filter(r => ['pending', 'confirmed', 'active'].includes(r.status))
        .filter(r => {
          const dep = (r.step1?.departureDate || '').substring(0, 10);
          const ret = (r.step1?.returnDate || '').substring(0, 10);
          return dep <= today && today <= ret;
        })
        .map(r => r.carId || r.car?.id)
    );
    return list.filter(c => c.status !== 'maintenance' && !busyCarIds.has(c.id)).length;
  };

  const personalAvailableCount    = countAvailable(personalCarsList);
  const consignmentAvailableCount = countAvailable(consignmentCarsList);

  const handleMaintenanceAlertClick = (alert: MaintenanceAlert) => {
    // Navigate to maintenance page with pre-selected car and expense type
    navigate('/maintenance', {
      state: {
        selectedCarId: alert.carId,
        expenseType: alert.type,
        showExpenseModal: true
      }
    });
  };

  const handleReservationAlertClick = (alert: ReservationAlert) => {
    navigate('/planificateur', {
      state: {
        selectedReservationId: alert.reservationId,
        viewMode: 'details'
      }
    });
  };

  const fmtDA = (n: number) => `${Math.round(n).toLocaleString()} DA`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-saas-primary-via border-t-transparent rounded-full"
        />
        <span className="ml-4 text-saas-text-main font-medium">
          {lang === 'fr' ? 'Chargement du tableau de bord...' : 'جاري تحميل لوحة القيادة...'}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-saas-text-main mb-2">
            {lang === 'fr' ? 'Erreur de chargement' : 'خطأ في التحميل'}
          </h3>
          <p className="text-saas-text-muted mb-6">{error}</p>
          <button
            onClick={() => loadDashboardData(true)}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            {lang === 'fr' ? 'Réessayer' : 'إعادة المحاولة'}
          </button>
        </div>
      </div>
    );
  }

  const kpiCards = [
    {
      key: 'revenue',
      label: lang === 'fr' ? 'Revenus du mois' : 'إيرادات الشهر',
      value: fmtDA(stats.monthlyRevenue),
      sub: lang === 'fr' ? `Total encaissé : ${fmtDA(stats.totalRevenue)}` : `الإجمالي : ${fmtDA(stats.totalRevenue)}`,
      icon: <TrendingUp size={18} />,
      tone: 'red' as const,
      to: '/rapports',
    },
    {
      key: 'reservations',
      label: lang === 'fr' ? 'Réservations actives' : 'الحجوزات النشطة',
      value: `${stats.activeReservations}`,
      sub: lang === 'fr' ? `${stats.totalReservations} au total` : `${stats.totalReservations} إجمالاً`,
      icon: <Calendar size={18} />,
      tone: 'ink' as const,
      to: '/reservations',
    },
    {
      key: 'cars',
      label: lang === 'fr' ? 'Véhicules disponibles' : 'المركبات المتاحة',
      value: `${stats.availableCars}/${stats.totalCars}`,
      sub: lang === 'fr'
        ? `${stats.personalCars} agence · ${stats.consignmentCars} conciergerie`
        : `${stats.personalCars} وكالة · ${stats.consignmentCars} أمانة`,
      icon: <CarFront size={18} />,
      tone: 'green' as const,
      to: '/vehicules',
    },
    {
      key: 'clients',
      label: lang === 'fr' ? 'Clients' : 'العملاء',
      value: `${stats.totalClients}`,
      sub: lang === 'fr' ? `${unifiedAlerts.length} alerte(s) en cours` : `${unifiedAlerts.length} تنبيه جارٍ`,
      icon: <Users size={18} />,
      tone: 'amber' as const,
      to: '/clients',
    },
  ];

  const alertFilters = [
    { id: 'all', label: lang === 'fr' ? 'Toutes' : 'الكل', icon: '📋' },
    { id: 'maintenance', label: lang === 'fr' ? 'Maintenance' : 'الصيانة', icon: '🔧' },
    { id: 'reservations', label: lang === 'fr' ? 'Réservations' : 'الحجوزات', icon: '📅' },
  ] as const;

  return (
    <div className="max-w-[92rem] mx-auto">
      {/* ════ EN-TÊTE ════ */}
      <PageHeader
        icon="📊"
        eyebrow={lang === 'fr' ? "Vue d'ensemble" : 'نظرة عامة'}
        title={lang === 'fr' ? 'Tableau de Bord' : 'لوحة القيادة'}
        subtitle={new Date().toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        })}
        actions={
          <Btn tone="ghost" onClick={() => loadDashboardData(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {lang === 'fr' ? 'Actualiser' : 'تحديث'}
          </Btn>
        }
      />

      <div className="space-y-5 sm:space-y-6">
        {/* ════ INDICATEURS CLÉS ════ */}
        <StatGrid cols={4}>
          {kpiCards.map((kpi) => (
            <StatCard
              key={kpi.key}
              label={kpi.label}
              value={kpi.value}
              hint={kpi.sub}
              icon={kpi.icon}
              tone={kpi.tone}
              onClick={() => navigate(kpi.to)}
            />
          ))}
        </StatGrid>

        {/* ════ NOTIFICATIONS & ALERTES ════ */}
        <div className="fx-card overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-4 sm:px-5 py-4"
               style={{ backgroundImage: 'var(--fx-grad-red-veil)', borderBottom: '1px solid var(--fx-line)' }}>
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="relative shrink-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ backgroundImage: 'var(--fx-grad-red)', boxShadow: 'var(--fx-edge-red), 0 8px 22px -10px rgba(200,16,46,0.8)' }}
                >
                  <Bell size={20} className="text-white" />
                </div>
                {(criticalCount > 0 || pendingWebOrdersCount > 0) && (
                  <span className="fx-pulse absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full"
                        style={{ background: 'linear-gradient(135deg,#FF6B70,#8A0A1C)', border: '2px solid var(--fx-black-300)' }} />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="fx-title text-base sm:text-lg leading-tight">
                  {lang === 'fr' ? 'Alertes & Notifications' : 'التنبيهات والإشعارات'}
                </h2>
                <p className="text-[11px] font-semibold mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>
                  {unifiedAlerts.length === 0
                    ? (lang === 'fr' ? 'Tout est en ordre ✓' : 'كل شيء على ما يرام ✓')
                    : lang === 'fr'
                      ? `${unifiedAlerts.length} alerte(s) — ${criticalCount} critique(s), ${highCount} élevée(s)`
                      : `${unifiedAlerts.length} تنبيه — ${criticalCount} حرج، ${highCount} مرتفع`}
                </p>
              </div>
            </div>

            {/* Filtres segmentés */}
            <div className="fx-tabs max-w-full overflow-x-auto fx-scroll-x shrink-0">
              {alertFilters.map(f => (
                <button
                  key={f.id}
                  onClick={() => setAlertFilter(f.id)}
                  className={`fx-tab ${alertFilter === f.id ? 'fx-tab-active' : ''}`}
                >
                  {f.icon} {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 sm:p-5 space-y-2.5">
            {/* Nouvelles commandes du site web */}
            <AnimatePresence>
              {pendingWebOrdersCount > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  onClick={() => navigate('/website-commandes')}
                  className="w-full flex items-center gap-3.5 rounded-2xl px-4 sm:px-5 py-4 text-left text-white transition-all"
                  style={{ backgroundImage: 'var(--fx-grad-red)', boxShadow: 'var(--fx-edge-red), 0 12px 30px -12px rgba(200,16,46,0.75)' }}
                >
                  <motion.span
                    animate={{ rotate: [0, -12, 12, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                    className="text-2xl flex-shrink-0"
                  >
                    🔔
                  </motion.span>
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm uppercase tracking-tight">
                      {lang === 'fr'
                        ? `${pendingWebOrdersCount} nouvelle${pendingWebOrdersCount > 1 ? 's' : ''} commande${pendingWebOrdersCount > 1 ? 's' : ''} du site web`
                        : `${pendingWebOrdersCount} طلب جديد من الموقع`}
                    </p>
                    <p className="text-white/80 text-xs font-medium truncate">
                      {lang === 'fr'
                        ? 'En attente de votre acceptation — cliquez pour les traiter'
                        : 'في انتظار موافقتك — انقر لمعالجتها'}
                    </p>
                  </div>
                  <span className="px-4 py-2 bg-white/20 border border-white/30 font-bold rounded-xl text-xs whitespace-nowrap shrink-0">
                    {lang === 'fr' ? 'Traiter →' : 'معالجة ←'}
                  </span>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Liste unifiée des alertes */}
            {displayedAlerts.length === 0 && pendingWebOrdersCount === 0 && (
              <div
                className="flex items-center gap-4 px-5 py-6 rounded-2xl"
                style={{
                  backgroundImage: 'linear-gradient(135deg, rgba(16,164,111,0.14), rgba(10,115,80,0.04))',
                  border: '1px solid rgba(52,211,153,0.35)',
                }}
              >
                <span className="text-3xl">✅</span>
                <div>
                  <p className="font-black text-sm" style={{ color: '#6EE7B7' }}>
                    {lang === 'fr' ? 'Aucune alerte active' : 'لا توجد تنبيهات نشطة'}
                  </p>
                  <p className="text-xs font-semibold" style={{ color: 'var(--fx-ink-mute)' }}>
                    {lang === 'fr' ? 'Véhicules et réservations sous contrôle.' : 'المركبات والحجوزات تحت السيطرة.'}
                  </p>
                </div>
              </div>
            )}

            {displayedAlerts.map((item, index) => {
              const theme = severityTheme(item.severity);
              const isMaint = item.kind === 'maintenance';
              const alert: any = item.data;
              return (
                <motion.button
                  key={`${isMaint ? 'm' : 'r'}-${alert.id}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  onClick={() => isMaint ? handleMaintenanceAlertClick(alert) : handleReservationAlertClick(alert)}
                  className="w-full flex items-center gap-3 sm:gap-3.5 pl-2.5 pr-3 py-3 rounded-2xl text-left group transition-all"
                  style={{ backgroundImage: 'var(--fx-grad-surface)', border: `1px solid ${theme.cardBorder}`, boxShadow: theme.glow }}
                >
                  <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ backgroundImage: theme.barGrad }} />
                  <span
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                    style={{ backgroundImage: theme.iconBg, border: `1px solid ${theme.iconBorder}`, color: theme.iconFg }}
                  >
                    {isMaint ? maintenanceIcon(alert.type) : (alert.icon || '📅')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-sm truncate" style={{ color: 'var(--fx-ink)' }}>{alert.title}</p>
                      <span className="text-[9px] font-black uppercase tracking-wider shrink-0" style={{ color: 'var(--fx-ink-dim)' }}>
                        {isMaint ? (lang === 'fr' ? 'Maintenance' : 'صيانة') : (lang === 'fr' ? 'Réservation' : 'حجز')}
                      </span>
                    </div>
                    <p className="text-[11px] font-semibold truncate" style={{ color: 'var(--fx-ink-mute)' }}>
                      {isMaint
                        ? alert.carInfo
                        : `${alert.car?.brand ?? ''} ${alert.car?.model ?? ''} · ${alert.reservation?.client?.firstName ?? ''} ${alert.reservation?.client?.lastName ?? ''}`}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: 'var(--fx-ink-dim)' }}>{alert.message}</p>
                  </div>
                  <span
                    className="px-3 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap shrink-0"
                    style={{ backgroundImage: theme.chipBg, border: `1px solid ${theme.chipBorder}`, color: theme.chipFg }}
                  >
                    {isMaint
                      ? (alert.isExpired
                          ? (lang === 'fr' ? 'EXPIRÉ' : 'منتهي')
                          : (alert.type === 'vidange' || alert.type === 'chaine')
                            ? `${Math.max(0, (alert.nextServiceMileage || 0) - (alert.currentMileage || 0)).toLocaleString()} km`
                            : `${alert.daysUntilDue} ${lang === 'fr' ? 'jours' : 'أيام'}`)
                      : (alert.daysOverdue !== undefined && alert.daysOverdue > 0
                          ? (lang === 'fr' ? `+${alert.daysOverdue} j retard` : `+${alert.daysOverdue} يوم تأخير`)
                          : alert.daysUntil !== undefined
                            ? (alert.daysUntil === 0
                                ? (lang === 'fr' ? "Aujourd'hui" : 'اليوم')
                                : `${alert.daysUntil} ${lang === 'fr' ? 'jours' : 'أيام'}`)
                            : (lang === 'fr' ? 'Action requise' : 'إجراء مطلوب'))}
                  </span>
                  <ChevronRight size={16} className="shrink-0 transition-transform group-hover:translate-x-0.5" style={{ color: 'var(--fx-ink-dim)' }} />
                </motion.button>
              );
            })}

            {filteredAlerts.length > 6 && (
              <button
                onClick={() => setShowAllAlerts(!showAllAlerts)}
                className="w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
                style={{ border: '1px dashed var(--fx-line-strong)', color: 'var(--fx-ink-mute)' }}
              >
                {showAllAlerts
                  ? (lang === 'fr' ? 'Réduire' : 'تقليص')
                  : (lang === 'fr' ? `Voir les ${filteredAlerts.length - 6} autres alertes` : `عرض ${filteredAlerts.length - 6} تنبيهات أخرى`)}
              </button>
            )}
          </div>
        </div>

        {/* ════ PARC : VÉHICULES PERSONNELS vs CONCIERGERIE ════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* 🚗 Véhicules de l'agence */}
          <Panel
            icon="🚗"
            title={lang === 'fr' ? 'Mes véhicules personnels' : 'مركباتي الشخصية'}
            actions={
              <Btn tone="ghost" size="sm" onClick={() => navigate('/vehicules', { state: { carsTab: 'personal' } })}>
                {lang === 'fr' ? 'Voir tout' : 'عرض الكل'}
              </Btn>
            }
          >
            <div className="flex items-baseline gap-3 mb-4">
              <p className="text-3xl font-black tabular-nums" style={{ color: 'var(--fx-ink)' }}>{stats.personalCars}</p>
              <p className="text-xs font-bold" style={{ color: 'var(--fx-ink-mute)' }}>
                {personalAvailableCount}/{personalCarsList.length} {lang === 'fr' ? 'disponibles' : 'متاحة'}
              </p>
            </div>
            <div className="space-y-2">
              {personalCarsList.slice(0, 5).map(car => (
                <div key={car.id} className="fx-well flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-xs font-bold truncate" style={{ color: 'var(--fx-ink-soft)' }}>{car.brand} {car.model}</span>
                  <span className={`fx-badge ${car.status === 'maintenance' ? 'fx-badge-steel' : 'fx-badge-green'}`}>
                    {car.status === 'maintenance'
                      ? (lang === 'fr' ? 'Maintenance' : 'صيانة')
                      : (lang === 'fr' ? 'Disponible' : 'متاح')}
                  </span>
                </div>
              ))}
              {personalCarsList.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--fx-ink-dim)' }}>
                  {lang === 'fr' ? 'Aucun véhicule personnel.' : 'لا توجد مركبات شخصية.'}
                </p>
              )}
            </div>
          </Panel>

          {/* 🤝 Véhicules confiés */}
          <Panel
            icon="🤝"
            title={lang === 'fr' ? 'Véhicules en conciergerie' : 'مركبات بالوكالة'}
            actions={
              <Btn tone="ghost" size="sm" onClick={() => navigate('/vehicules', { state: { carsTab: 'consignment' } })}>
                {lang === 'fr' ? 'Voir tout' : 'عرض الكل'}
              </Btn>
            }
          >
            <div className="flex items-baseline gap-3 mb-4">
              <p className="text-3xl font-black tabular-nums" style={{ color: 'var(--fx-ink)' }}>{stats.consignmentCars}</p>
              <p className="text-xs font-bold" style={{ color: 'var(--fx-ink-mute)' }}>
                {consignmentAvailableCount}/{consignmentCarsList.length} {lang === 'fr' ? 'disponibles' : 'متاحة'}
              </p>
            </div>

            <div
              className="rounded-xl px-4 py-3 mb-4"
              style={{ backgroundImage: 'linear-gradient(135deg, rgba(217,132,16,0.16), rgba(168,92,8,0.05))', border: '1px solid rgba(251,191,36,0.35)' }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#FCD34D' }}>
                {lang === 'fr' ? 'Commission agence — ce mois' : 'عمولة الوكالة — هذا الشهر'}
              </p>
              <p className="text-2xl font-black mt-1 tabular-nums" style={{ color: '#FDE68A' }}>
                {fmtDA(monthlyCommission)}
              </p>
            </div>

            <div className="space-y-2">
              {consignmentCarsList.slice(0, 5).map(car => (
                <div key={car.id} className="fx-well flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: 'var(--fx-ink-soft)' }}>
                      {car.ownerInfo?.internalRef && (
                        <span dir="ltr" style={{ color: '#FCD34D' }}>{car.ownerInfo.internalRef} · </span>
                      )}
                      {car.brand} {car.model}
                    </p>
                    {car.ownerInfo && (
                      <p className="text-[10px] font-bold truncate" style={{ color: 'var(--fx-ink-dim)' }}>👤 {car.ownerInfo.ownerName}</p>
                    )}
                  </div>
                  {car.ownerInfo && (
                    <span className="fx-badge fx-badge-amber">
                      {car.ownerInfo.commissionValue.toLocaleString()} {car.ownerInfo.commissionType === 'percentage' ? '%' : 'DA'}
                    </span>
                  )}
                </div>
              ))}
              {consignmentCarsList.length === 0 && (
                <p className="text-xs py-4 text-center" style={{ color: 'var(--fx-ink-dim)' }}>
                  {lang === 'fr' ? 'Aucun véhicule en conciergerie.' : 'لا توجد مركبات بالوكالة.'}
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* ════ GRAPHIQUES ════ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          {/* Évolution des revenus */}
          <Panel icon={<TrendingUp size={18} style={{ color: 'var(--fx-red-300)' }} />} title={lang === 'fr' ? 'Évolution des Revenus' : 'تطور الإيرادات'}>
            <div className="space-y-3">
              {stats.revenueByMonth.map((item, index) => {
                const maxRevenue = Math.max(...stats.revenueByMonth.map(m => m.revenue), 1);
                return (
                  <div key={item.month} className="flex items-center gap-3">
                    <div className="w-10 text-[11px] font-black tabular-nums" style={{ color: 'var(--fx-ink-mute)' }}>{item.month}</div>
                    <div className="fx-meter flex-1">
                      <motion.div
                        className="fx-meter-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.revenue / maxRevenue) * 100}%` }}
                        transition={{ delay: 0.2 + index * 0.06, duration: 0.7, ease: 'easeOut' }}
                      />
                    </div>
                    <div className="w-24 sm:w-28 text-right text-xs font-black tabular-nums" style={{ color: 'var(--fx-ink)' }}>
                      {item.revenue.toLocaleString()} <span className="text-[10px] font-bold" style={{ color: 'var(--fx-ink-dim)' }}>DA</span>
                    </div>
                  </div>
                );
              })}
              {stats.revenueByMonth.length === 0 && (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--fx-ink-dim)' }}>
                  {lang === 'fr' ? 'Aucune donnée de revenus.' : 'لا توجد بيانات إيرادات.'}
                </p>
              )}
            </div>
          </Panel>

          {/* Taux d'utilisation */}
          <Panel icon={<Gauge size={18} style={{ color: '#6EE7B7' }} />} title={lang === 'fr' ? "Taux d'Utilisation" : 'معدلات الاستخدام'}>
            <div className="space-y-4">
              {stats.carUtilization.map((car, index) => {
                const fill = car.utilization > 80
                  ? 'linear-gradient(90deg,#F0333C,#74081A)'
                  : car.utilization > 60
                    ? 'linear-gradient(90deg,#F59E0B,#B45309)'
                    : 'linear-gradient(90deg,#10A46F,#0A7350)';
                const txt = car.utilization > 80 ? '#FFB3B6' : car.utilization > 60 ? '#FCD34D' : '#6EE7B7';
                return (
                  <div key={car.carId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold truncate" style={{ color: 'var(--fx-ink-soft)' }}>{car.carInfo}</span>
                      <span className="text-sm font-black tabular-nums shrink-0" style={{ color: txt }}>{car.utilization}%</span>
                    </div>
                    <div className="fx-meter">
                      <motion.div
                        className="fx-meter-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${car.utilization}%` }}
                        transition={{ delay: 0.25 + index * 0.06, duration: 0.7, ease: 'easeOut' }}
                        style={{ backgroundImage: fill, boxShadow: 'none' }}
                      />
                    </div>
                  </div>
                );
              })}
              {stats.carUtilization.length === 0 && (
                <p className="text-xs py-6 text-center" style={{ color: 'var(--fx-ink-dim)' }}>
                  {lang === 'fr' ? "Aucune donnée d'utilisation." : 'لا توجد بيانات استخدام.'}
                </p>
              )}
            </div>
          </Panel>
        </div>

        {/* ════ ACTIONS RAPIDES ════ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {[
            {
              icon: '📅',
              title: lang === 'fr' ? 'Nouvelle Réservation' : 'حجز جديد',
              desc: lang === 'fr' ? 'Créer une réservation pour vos clients' : 'إنشاء حجز جديد لعملائك',
              cta: lang === 'fr' ? 'Créer' : 'إنشاء',
              to: '/planificateur',
            },
            {
              icon: '🚗',
              title: lang === 'fr' ? 'Ajouter un Véhicule' : 'إضافة مركبة',
              desc: lang === 'fr' ? 'Étendre votre flotte automobile' : 'توسيع أسطول سياراتك',
              cta: lang === 'fr' ? 'Ajouter' : 'إضافة',
              to: '/vehicules',
            },
            {
              icon: '📊',
              title: lang === 'fr' ? 'Rapports Détaillés' : 'تقارير مفصلة',
              desc: lang === 'fr' ? 'Analyser vos performances' : 'تحليل أدائك وإحصائياتك',
              cta: lang === 'fr' ? 'Voir' : 'عرض',
              to: '/rapports',
            },
          ].map((action, i) => (
            <motion.button
              key={action.to}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.07 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(action.to)}
              className="fx-card p-5 text-left flex items-center gap-4"
            >
              <span
                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundImage: 'var(--fx-grad-red-tint)', border: '1px solid var(--fx-line-red)', boxShadow: 'var(--fx-edge-red)' }}
              >
                {action.icon}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="fx-title text-sm sm:text-base leading-tight">{action.title}</h4>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>{action.desc}</p>
              </div>
              <span className="fx-badge fx-badge-red shrink-0">{action.cta} →</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
};
