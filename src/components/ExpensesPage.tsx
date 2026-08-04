import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { Plus, AlertCircle, Pencil, Trash2, Car as CarIcon, Store, Receipt } from 'lucide-react';
import { StoreExpense, VehicleExpense, Language, Car, MaintenanceAlert } from '../types';
import { StoreExpenseModal } from './StoreExpenseModal';
import { VehicleExpenseModal } from './VehicleExpenseModal';
import { ConfirmModal } from './ConfirmModal';
import {
  getStoreExpenses, addStoreExpense, updateStoreExpense, deleteStoreExpense,
  getVehicleExpenses, addVehicleExpense, updateVehicleExpense, deleteVehicleExpense,
} from '../services/expenseService';
import { DatabaseService } from '../services/DatabaseService';
import { getVidangeAlert, getAssuranceAlert, getControleAlert, getChaineAlert } from '../utils/vidangeAlerts';
import { formatAmount } from '../utils/format';
import { resolvePeriod, inPeriod, PeriodKey } from '../services/caisseService';
import { useCan } from '../utils/permissions';
import {
  PageHeader, StatCard, StatGrid, Toolbar, SearchInput, Segmented, Select, Btn, ActionBtn,
  EmptyState, LoadingState, ErrorBanner, Badge, Panel, Donut, RankBars, SERIES,
} from './ui/fx';

interface ExpensesPageProps {
  lang: Language;
  cars: Car[];
}

const DA = (n: number) => `${formatAmount(Math.round(n))} DA`;
const d = (s: string) => new Date(s).toLocaleDateString('fr-FR');

type Kind = 'vehicle' | 'store';
type SortKey = 'date-desc' | 'date-asc' | 'cost-desc' | 'cost-asc';

const TYPE_META: Record<string, { fr: string; ar: string; icon: string }> = {
  vidange:   { fr: 'Vidange', ar: 'تغيير الزيت', icon: '🛢️' },
  assurance: { fr: 'Assurance', ar: 'التأمين', icon: '🛡️' },
  controle:  { fr: 'Contrôle technique', ar: 'الفحص التقني', icon: '📋' },
  chaine:    { fr: 'Chaîne de distribution', ar: 'سلسلة التوزيع', icon: '⛓️' },
  autre:     { fr: 'Autres', ar: 'أخرى', icon: '🔩' },
};

/**
 * DÉPENSES
 * ────────
 * Deux natures de dépense sur le même écran, séparées par un onglet :
 * celles rattachées à un VÉHICULE (entretien, assurance, contrôle, divers) et
 * celles de l'AGENCE (loyer, fournitures, charges).
 *
 * Le filtrage est le cœur de l'écran : période, type, véhicule, tri, plus une
 * recherche libre qui accepte la marque, le modèle, l'immatriculation ou le
 * n° de châssis. Les totaux se recalculent sur le filtre courant — c'est ce
 * qu'on vient chercher : « combien ai-je dépensé pour cette voiture ce mois-ci ».
 */
export const ExpensesPage: React.FC<ExpensesPageProps> = ({ lang, cars }) => {
  const fr = lang === 'fr';
  const can = useCan('expenses');

  const [kind, setKind] = useState<Kind>('vehicle');
  const [storeExpenses, setStoreExpenses] = useState<StoreExpense[]>([]);
  const [vehicleExpenses, setVehicleExpenses] = useState<VehicleExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<StoreExpense | VehicleExpense | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; id: string | null }>({ isOpen: false, id: null });

  // Filtres
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [custom, setCustom] = useState({ from: '', to: new Date().toISOString().slice(0, 10) });
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [carFilter, setCarFilter] = useState<string>('all');
  const [sort, setSort] = useState<SortKey>('date-desc');

  const carById = useMemo(() => new Map(cars.map(c => [c.id, c])), [cars]);
  const range = useMemo(() => resolvePeriod(period, custom), [period, custom]);

  // ─── Alerte maintenance (inchangé : logique métier existante) ─────────────
  const buildMaintenanceAlert = (
    car: Car,
    type: 'vidange' | 'assurance' | 'controle' | 'chaine',
    alertObj: any,
  ): Omit<MaintenanceAlert, 'id' | 'created_at'> => {
    const severity: 'low' | 'medium' | 'high' | 'critical' =
      alertObj.status === 'overdue' ? 'critical' : alertObj.status === 'warning' ? 'high' : 'medium';

    return {
      carId: car.id,
      carInfo: `${car.brand} ${car.model} - ${car.registration}`,
      type,
      title:
        type === 'vidange'
          ? alertObj.status === 'overdue' ? 'Vidange en retard' : 'Vidange planifiée'
          : type === 'chaine'
          ? alertObj.status === 'overdue' ? 'Chaîne en retard' : 'Chaîne planifiée'
          : type === 'assurance'
          ? alertObj.status === 'overdue' ? 'Assurance expirée' : 'Assurance à jour'
          : alertObj.status === 'overdue' ? 'Contrôle technique expirée' : 'Contrôle technique à jour',
      message: alertObj.message,
      severity,
      dueDate:
        (type === 'assurance' || type === 'controle') && alertObj.expirationDate
          ? alertObj.expirationDate.toISOString().split('T')[0]
          : undefined,
      isExpired: alertObj.status === 'overdue',
      daysUntilDue: alertObj.status === 'overdue' ? -alertObj.daysRemaining : alertObj.daysRemaining,
      currentMileage: alertObj.currentMileage,
      nextServiceMileage: alertObj.nextVidangeKm,
      createdAt: new Date().toISOString(),
    };
  };

  const syncAlert = async (type: string | undefined, carId: string, expenses: VehicleExpense[]) => {
    if (!type || !['vidange', 'assurance', 'controle', 'chaine'].includes(type)) return;
    const car = cars.find(c => c.id === carId);
    if (!car) return;
    try {
      const alertObj =
        type === 'vidange' ? getVidangeAlert(car, expenses)
        : type === 'chaine' ? getChaineAlert(car, expenses)
        : type === 'assurance' ? getAssuranceAlert(car, expenses)
        : getControleAlert(car, expenses);

      await DatabaseService.deleteMaintenanceAlert(car.id, type);
      if (alertObj) {
        await DatabaseService.createMaintenanceAlert(
          buildMaintenanceAlert(car, type as any, alertObj),
        );
      }
    } catch (alertError) {
      console.warn('Error syncing maintenance alert:', alertError);
    }
  };

  // ─── Chargement ───────────────────────────────────────────────────────────
  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [storeResult, vehicleResult] = await Promise.all([getStoreExpenses(), getVehicleExpenses()]);
      if (storeResult.success && storeResult.expenses) setStoreExpenses(storeResult.expenses);
      if (vehicleResult.success && vehicleResult.expenses) setVehicleExpenses(vehicleResult.expenses);
    } catch (err: any) {
      console.error('Error loading expenses:', err);
      setError(
        /JWT|auth|PGRST301/i.test(err?.message ?? '')
          ? (fr ? 'Session expirée. Reconnectez-vous.' : 'انتهت الجلسة.')
          : (fr ? 'Impossible de charger les dépenses.' : 'تعذر تحميل المصاريف.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ─── Filtrage ─────────────────────────────────────────────────────────────
  const filteredVehicle = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = vehicleExpenses.filter(e => {
      if (!inPeriodOrAll(e.date, range)) return false;
      if (typeFilter !== 'all' && e.type !== typeFilter) return false;
      if (carFilter !== 'all' && e.carId !== carFilter) return false;
      if (q) {
        const car = carById.get(e.carId);
        const hay = `${car?.brand ?? ''} ${car?.model ?? ''} ${car?.registration ?? ''} ${car?.vin ?? ''} ${e.expenseName ?? ''} ${e.note ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortList(out, sort, e => e.date, e => Number(e.cost || 0));
  }, [vehicleExpenses, search, range, typeFilter, carFilter, sort, carById]);

  const filteredStore = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = storeExpenses.filter(e => {
      if (!inPeriodOrAll(e.date, range)) return false;
      if (q && !`${e.name} ${e.note ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return sortList(out, sort, e => e.date, e => Number(e.cost || 0));
  }, [storeExpenses, search, range, sort]);

  const stats = useMemo(() => {
    const vTotal = filteredVehicle.reduce((s, e) => s + Number(e.cost || 0), 0);
    const sTotal = filteredStore.reduce((s, e) => s + Number(e.cost || 0), 0);

    const byType = new Map<string, number>();
    filteredVehicle.forEach(e => byType.set(e.type, (byType.get(e.type) ?? 0) + Number(e.cost || 0)));

    const byCar = new Map<string, number>();
    filteredVehicle.forEach(e => byCar.set(e.carId, (byCar.get(e.carId) ?? 0) + Number(e.cost || 0)));

    const count = kind === 'vehicle' ? filteredVehicle.length : filteredStore.length;
    const total = kind === 'vehicle' ? vTotal : sTotal;

    return {
      vTotal, sTotal, byType, byCar, count, total,
      average: count > 0 ? total / count : 0,
    };
  }, [filteredVehicle, filteredStore, kind]);

  // ─── Écriture ─────────────────────────────────────────────────────────────
  const handleSaveStoreExpense = async (data: Partial<StoreExpense>) => {
    try {
      if (editingExpense && storeExpenses.some(e => e.id === editingExpense.id)) {
        const result = await updateStoreExpense(editingExpense.id, data);
        if (result.success && result.expense) {
          setStoreExpenses(prev => prev.map(e => (e.id === editingExpense.id ? result.expense! : e)));
        }
      } else {
        const result = await addStoreExpense({
          name: data.name || '',
          cost: data.cost || 0,
          date: data.date || new Date().toISOString().split('T')[0],
          note: data.note,
          icon: data.icon || '🏪',
        });
        if (result.success && result.expense) setStoreExpenses(prev => [result.expense!, ...prev]);
      }
      setIsModalOpen(false);
      setEditingExpense(null);
    } catch (err) {
      console.error('Error saving store expense:', err);
      setError(fr ? "Échec de l'enregistrement de la dépense." : 'فشل الحفظ.');
    }
  };

  const handleSaveVehicleExpense = async (data: Partial<VehicleExpense>) => {
    try {
      if (editingExpense && vehicleExpenses.some(e => e.id === editingExpense.id)) {
        const result = await updateVehicleExpense(editingExpense.id, data);
        if (result.success && result.expense) {
          const updated = vehicleExpenses.map(e => (e.id === editingExpense.id ? result.expense! : e));
          setVehicleExpenses(updated);
          await syncAlert(data.type, result.expense.carId, updated);
        }
      } else {
        const result = await addVehicleExpense({
          carId: data.carId || '',
          type: data.type || 'autre',
          cost: data.cost || 0,
          date: data.date || new Date().toISOString().split('T')[0],
          note: data.note,
          currentMileage: data.currentMileage,
          nextVidangeKm: data.nextVidangeKm,
          expenseName: data.expenseName,
          expirationDate: data.expirationDate,
          oilFilterChanged: (data as any).oilFilterChanged || false,
          airFilterChanged: (data as any).airFilterChanged || false,
          fuelFilterChanged: (data as any).fuelFilterChanged || false,
          acFilterChanged: (data as any).acFilterChanged || false,
        });
        if (result.success && result.expense) {
          const next = [result.expense, ...vehicleExpenses];
          setVehicleExpenses(next);
          await syncAlert(data.type, result.expense.carId, next);
        }
      }
      setIsModalOpen(false);
      setEditingExpense(null);
    } catch (err) {
      console.error('Error saving vehicle expense:', err);
      setError(fr ? "Échec de l'enregistrement de la dépense." : 'فشل الحفظ.');
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.id) return;
    try {
      if (kind === 'store') {
        const r = await deleteStoreExpense(deleteConfirm.id);
        if (r.success) setStoreExpenses(prev => prev.filter(e => e.id !== deleteConfirm.id));
      } else {
        const r = await deleteVehicleExpense(deleteConfirm.id);
        if (r.success) setVehicleExpenses(prev => prev.filter(e => e.id !== deleteConfirm.id));
      }
    } catch (err) {
      console.error('Error deleting expense:', err);
      setError(fr ? 'Échec de la suppression.' : 'فشل الحذف.');
    } finally {
      setDeleteConfirm({ isOpen: false, id: null });
    }
  };

  const canCreate = kind === 'vehicle' ? can('create-vehicle') : can('create-store');

  // Alertes vidange en tête de page — la seule chose qui appelle une action.
  const alerts = useMemo(
    () =>
      cars
        .map(car => ({ car, alert: getVidangeAlert(car, vehicleExpenses) }))
        .filter(x => x.alert && x.alert.status !== 'ok'),
    [cars, vehicleExpenses],
  );

  return (
    <div className="max-w-[92rem] mx-auto">
      <PageHeader
        icon="📉"
        eyebrow={fr ? 'Sorties' : 'المصاريف'}
        title={fr ? 'Dépenses' : 'النفقات'}
        subtitle={
          fr
            ? "Entretien et frais des véhicules, charges de l'agence — filtrables par période, type et véhicule."
            : 'صيانة المركبات ومصاريف الوكالة — قابلة للتصفية.'
        }
        actions={
          canCreate ? (
            <Btn tone="primary" onClick={() => { setEditingExpense(null); setIsModalOpen(true); }}>
              <Plus size={16} />
              {kind === 'vehicle'
                ? (fr ? 'Dépense véhicule' : 'مصروف مركبة')
                : (fr ? 'Dépense agence' : 'مصروف الوكالة')}
            </Btn>
          ) : null
        }
      >
        <Segmented<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'vehicle', label: <><CarIcon size={14} /> {fr ? 'Véhicules' : 'المركبات'}</>, badge: vehicleExpenses.length },
            { value: 'store', label: <><Store size={14} /> {fr ? 'Agence' : 'الوكالة'}</>, badge: storeExpenses.length },
          ]}
          className="w-full sm:w-auto"
        />
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={load} retryLabel={fr ? 'Recharger' : 'إعادة'} />}

      {/* ── Chiffres du filtre courant ── */}
      <div className="mb-5">
        <StatGrid cols={4}>
          <StatCard
            label={fr ? 'Total filtré' : 'المجموع'}
            value={DA(stats.total)}
            hint={`${stats.count} ${fr ? 'ligne(s)' : 'سطر'} · ${range.label}`}
            icon={<Receipt size={15} />}
            tone="red"
          />
          <StatCard
            label={fr ? 'Coût moyen' : 'المتوسط'}
            value={DA(stats.average)}
            icon="⌀"
            tone="steel"
          />
          <StatCard
            label={fr ? 'Dépenses véhicules' : 'مصاريف المركبات'}
            value={DA(stats.vTotal)}
            hint={`${filteredVehicle.length} ${fr ? 'ligne(s)' : 'سطر'}`}
            icon={<CarIcon size={15} />}
            tone="steel"
            onClick={() => setKind('vehicle')}
          />
          <StatCard
            label={fr ? 'Dépenses agence' : 'مصاريف الوكالة'}
            value={DA(stats.sTotal)}
            hint={`${filteredStore.length} ${fr ? 'ligne(s)' : 'سطر'}`}
            icon={<Store size={15} />}
            tone="steel"
            onClick={() => setKind('store')}
          />
        </StatGrid>
      </div>

      {/* ── Alertes ── */}
      {kind === 'vehicle' && alerts.length > 0 && (
        <div className="mb-5 space-y-2">
          {alerts.slice(0, 4).map(({ car, alert }) => (
            <div
              key={car.id}
              className="rounded-xl p-3.5 flex items-start sm:items-center gap-3 flex-col sm:flex-row"
              style={{
                backgroundImage:
                  alert!.status === 'overdue'
                    ? 'linear-gradient(135deg, rgba(240,51,60,0.16), rgba(116,8,26,0.05))'
                    : 'linear-gradient(135deg, rgba(217,132,16,0.14), rgba(168,92,8,0.04))',
                border: `1px solid ${alert!.status === 'overdue' ? 'var(--fx-line-red-hi)' : 'rgba(251,191,36,0.4)'}`,
              }}
            >
              <AlertCircle
                size={20}
                className="shrink-0"
                style={{ color: alert!.status === 'overdue' ? 'var(--fx-red-300)' : '#FCD34D' }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold" style={{ color: alert!.status === 'overdue' ? 'var(--fx-red-200)' : '#FCD34D' }}>
                  {car.brand} {car.model} ({car.registration}) — {alert!.message}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>
                  {formatAmount(alert!.currentMileage)} km · {fr ? 'prochaine vidange à' : 'التغيير القادم عند'}{' '}
                  {formatAmount(alert!.nextVidangeKm)} km
                </p>
              </div>
              {can('create-vehicle') && (
                <Btn
                  tone="ghost" size="sm"
                  onClick={() => {
                    setEditingExpense({ carId: car.id, type: 'vidange' } as VehicleExpense);
                    setKind('vehicle');
                    setIsModalOpen(true);
                  }}
                >
                  {fr ? 'Créer la dépense' : 'إنشاء مصروف'}
                </Btn>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Filtres ── */}
      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={
            kind === 'vehicle'
              ? (fr ? 'Marque, modèle, immatriculation, châssis…' : 'العلامة، الطراز، اللوحة…')
              : (fr ? 'Libellé ou note…' : 'التسمية أو الملاحظة…')
          }
        />
        <Select
          value={period}
          onChange={v => setPeriod(v as PeriodKey)}
          className="w-full sm:w-44"
          aria-label={fr ? 'Période' : 'الفترة'}
          options={[
            { value: 'all', label: fr ? '📅 Toute période' : '📅 كل الفترات' },
            { value: 'today', label: fr ? "Aujourd'hui" : 'اليوم' },
            { value: 'week', label: fr ? 'Cette semaine' : 'هذا الأسبوع' },
            { value: 'month', label: fr ? 'Ce mois' : 'هذا الشهر' },
            { value: 'quarter', label: fr ? 'Ce trimestre' : 'هذا الفصل' },
            { value: 'year', label: fr ? 'Cette année' : 'هذه السنة' },
            { value: 'custom', label: fr ? 'Personnalisée' : 'مخصصة' },
          ]}
        />
        {kind === 'vehicle' && (
          <>
            <Select
              value={typeFilter}
              onChange={setTypeFilter}
              className="w-full sm:w-48"
              aria-label={fr ? 'Type' : 'النوع'}
              options={[
                { value: 'all', label: fr ? '🔧 Tous les types' : '🔧 كل الأنواع' },
                ...Object.entries(TYPE_META).map(([k, m]) => ({ value: k, label: `${m.icon} ${fr ? m.fr : m.ar}` })),
              ]}
            />
            <Select
              value={carFilter}
              onChange={setCarFilter}
              className="w-full sm:w-56"
              aria-label={fr ? 'Véhicule' : 'المركبة'}
              options={[
                { value: 'all', label: fr ? '🚗 Tous les véhicules' : '🚗 كل المركبات' },
                ...cars.map(c => ({ value: c.id, label: `${c.brand} ${c.model} · ${c.registration}` })),
              ]}
            />
          </>
        )}
        <Select
          value={sort}
          onChange={v => setSort(v as SortKey)}
          className="w-full sm:w-44"
          aria-label={fr ? 'Tri' : 'الترتيب'}
          options={[
            { value: 'date-desc', label: fr ? '↓ Plus récentes' : '↓ الأحدث' },
            { value: 'date-asc', label: fr ? '↑ Plus anciennes' : '↑ الأقدم' },
            { value: 'cost-desc', label: fr ? '↓ Plus chères' : '↓ الأغلى' },
            { value: 'cost-asc', label: fr ? '↑ Moins chères' : '↑ الأرخص' },
          ]}
        />
      </Toolbar>

      {period === 'custom' && (
        <div className="flex flex-col sm:flex-row gap-2 mb-5">
          <input
            type="date" className="fx-field flex-1" value={custom.from}
            onChange={e => setCustom(c => ({ ...c, from: e.target.value }))}
            aria-label={fr ? 'Du' : 'من'}
          />
          <input
            type="date" className="fx-field flex-1" value={custom.to}
            onChange={e => setCustom(c => ({ ...c, to: e.target.value }))}
            aria-label={fr ? 'Au' : 'إلى'}
          />
        </div>
      )}

      {isLoading ? (
        <LoadingState label={fr ? 'Chargement des dépenses…' : 'جاري التحميل…'} rows={6} />
      ) : (
        <>
          {/* ── Répartition ── */}
          {kind === 'vehicle' && filteredVehicle.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
              <Panel title={fr ? 'Répartition par type' : 'التوزيع حسب النوع'} icon="🥧">
                <Donut
                  size={160}
                  centerLabel={fr ? 'Total' : 'المجموع'}
                  centerValue={DA(stats.vTotal)}
                  data={[...stats.byType.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([t, v], i) => ({
                      label: `${TYPE_META[t]?.icon ?? '🔩'} ${fr ? TYPE_META[t]?.fr ?? t : TYPE_META[t]?.ar ?? t}`,
                      value: v,
                      color: SERIES[i % SERIES.length],
                    }))}
                />
              </Panel>
              <Panel title={fr ? 'Véhicules les plus coûteux' : 'المركبات الأكثر تكلفة'} icon="🏁">
                <RankBars
                  format={DA}
                  data={[...stats.byCar.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 7)
                    .map(([carId, v]) => {
                      const c = carById.get(carId);
                      return {
                        label: c ? `${c.brand} ${c.model}` : (fr ? 'Véhicule supprimé' : 'مركبة محذوفة'),
                        sub: c?.registration,
                        value: v,
                      };
                    })}
                />
              </Panel>
            </div>
          )}

          {/* ── Cartes ── */}
          {kind === 'vehicle' ? (
            filteredVehicle.length === 0 ? (
              <EmptyState
                icon="🚗"
                title={fr ? 'Aucune dépense véhicule' : 'لا مصاريف مركبات'}
                description={
                  vehicleExpenses.length > 0
                    ? (fr ? 'Aucun résultat pour ces filtres.' : 'لا نتائج لهذه الفلاتر.')
                    : (fr ? 'Enregistrez la première dépense pour suivre le coût réel de votre flotte.' : 'سجّل أول مصروف.')
                }
                action={
                  canCreate ? (
                    <Btn tone="primary" onClick={() => { setEditingExpense(null); setIsModalOpen(true); }}>
                      <Plus size={16} /> {fr ? 'Nouvelle dépense' : 'مصروف جديد'}
                    </Btn>
                  ) : undefined
                }
              />
            ) : (
              <div className="fx-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
                <AnimatePresence mode="popLayout">
                  {filteredVehicle.map(e => {
                    const car = carById.get(e.carId);
                    const meta = TYPE_META[e.type] ?? TYPE_META.autre;
                    return (
                      <article key={e.id} className="fx-card p-4 flex flex-col gap-3">
                        <header className="flex items-start gap-3 min-w-0">
                          {car?.images?.[0] ? (
                            <img src={car.images[0]} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />
                          ) : (
                            <span
                              className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center text-lg"
                              style={{ backgroundImage: 'var(--fx-grad-red-tint)', border: '1px solid var(--fx-line-red)' }}
                            >
                              {meta.icon}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <h3 className="fx-title text-sm leading-tight truncate">
                              {car ? `${car.brand} ${car.model}` : (fr ? 'Véhicule supprimé' : 'مركبة محذوفة')}
                            </h3>
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--fx-ink-mute)' }}>
                              {car?.registration ?? '—'} · {d(e.date)}
                            </p>
                          </div>
                        </header>

                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone="red">{meta.icon} {fr ? meta.fr : meta.ar}</Badge>
                          {e.currentMileage ? <Badge tone="steel">{formatAmount(e.currentMileage)} km</Badge> : null}
                          {e.expirationDate ? <Badge tone="amber">⏳ {d(e.expirationDate)}</Badge> : null}
                        </div>

                        {(e.expenseName || e.note) && (
                          <p className="text-xs leading-snug line-clamp-2" style={{ color: 'var(--fx-ink-mute)' }}>
                            {e.expenseName || e.note}
                          </p>
                        )}

                        <div className="fx-well p-3 flex items-baseline justify-between gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: 'var(--fx-ink-mute)' }}>
                            {fr ? 'Coût' : 'التكلفة'}
                          </span>
                          <span className="text-lg font-black tabular-nums" style={{ color: 'var(--fx-red-200)' }}>
                            {DA(Number(e.cost || 0))}
                          </span>
                        </div>

                        <div className="mt-auto flex gap-1.5">
                          {can('edit') && (
                            <ActionBtn
                              icon={<Pencil size={13} />} label={fr ? 'Modifier' : 'تعديل'} showLabel
                              className="flex-1"
                              onClick={() => { setEditingExpense(e); setIsModalOpen(true); }}
                            />
                          )}
                          {can('delete') && (
                            <ActionBtn
                              icon={<Trash2 size={13} />} label={fr ? 'Supprimer' : 'حذف'} showLabel tone="danger"
                              className="flex-1"
                              onClick={() => setDeleteConfirm({ isOpen: true, id: e.id })}
                            />
                          )}
                        </div>
                      </article>
                    );
                  })}
                </AnimatePresence>
              </div>
            )
          ) : filteredStore.length === 0 ? (
            <EmptyState
              icon="🏪"
              title={fr ? 'Aucune dépense agence' : 'لا مصاريف الوكالة'}
              description={
                storeExpenses.length > 0
                  ? (fr ? 'Aucun résultat pour ces filtres.' : 'لا نتائج.')
                  : (fr ? 'Loyer, fournitures, charges : enregistrez-les ici.' : 'سجّل مصاريف الوكالة هنا.')
              }
              action={
                canCreate ? (
                  <Btn tone="primary" onClick={() => { setEditingExpense(null); setIsModalOpen(true); }}>
                    <Plus size={16} /> {fr ? 'Nouvelle dépense' : 'مصروف جديد'}
                  </Btn>
                ) : undefined
              }
            />
          ) : (
            <div className="fx-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
              <AnimatePresence mode="popLayout">
                {filteredStore.map(e => (
                  <article key={e.id} className="fx-card p-4 flex flex-col gap-3">
                    <header className="flex items-start gap-3 min-w-0">
                      <span
                        className="w-11 h-11 rounded-lg shrink-0 flex items-center justify-center text-xl"
                        style={{ backgroundImage: 'var(--fx-grad-red-tint)', border: '1px solid var(--fx-line-red)' }}
                      >
                        {e.icon || '🏪'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="fx-title text-sm leading-tight truncate">{e.name}</h3>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>{d(e.date)}</p>
                      </div>
                    </header>

                    {e.note && (
                      <p className="text-xs leading-snug line-clamp-2" style={{ color: 'var(--fx-ink-mute)' }}>{e.note}</p>
                    )}

                    <div className="fx-well p-3 flex items-baseline justify-between gap-3">
                      <span className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: 'var(--fx-ink-mute)' }}>
                        {fr ? 'Coût' : 'التكلفة'}
                      </span>
                      <span className="text-lg font-black tabular-nums" style={{ color: 'var(--fx-red-200)' }}>
                        {DA(Number(e.cost || 0))}
                      </span>
                    </div>

                    <div className="mt-auto flex gap-1.5">
                      {can('edit') && (
                        <ActionBtn
                          icon={<Pencil size={13} />} label={fr ? 'Modifier' : 'تعديل'} showLabel className="flex-1"
                          onClick={() => { setEditingExpense(e); setIsModalOpen(true); }}
                        />
                      )}
                      {can('delete') && (
                        <ActionBtn
                          icon={<Trash2 size={13} />} label={fr ? 'Supprimer' : 'حذف'} showLabel tone="danger" className="flex-1"
                          onClick={() => setDeleteConfirm({ isOpen: true, id: e.id })}
                        />
                      )}
                    </div>
                  </article>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      {/* ── Modales ── */}
      {kind === 'store' && (
        <StoreExpenseModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingExpense(null); }}
          onSave={handleSaveStoreExpense}
          expense={editingExpense as StoreExpense | undefined}
          lang={lang}
        />
      )}

      {kind === 'vehicle' && (
        <VehicleExpenseModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setEditingExpense(null); }}
          onSave={handleSaveVehicleExpense}
          expense={editingExpense as VehicleExpense | undefined}
          cars={cars}
          lang={lang}
        />
      )}

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title={{ fr: 'Supprimer la dépense', ar: 'حذف النفقة' }}
        message={{
          fr: 'Êtes-vous sûr de vouloir supprimer cette dépense ? Cette action est irréversible.',
          ar: 'هل أنت متأكد من حذف هذه النفقة؟ هذا الإجراء لا يمكن التراجع عنه.',
        }}
        onConfirm={confirmDelete}
        onClose={() => setDeleteConfirm({ isOpen: false, id: null })}
        lang={lang}
      />
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function inPeriodOrAll(date: string, range: { from: string; to: string }): boolean {
  if (!range.from && !range.to) return true;
  return inPeriod(date, range.from, range.to);
}

function sortList<T>(list: T[], key: SortKey, dateOf: (t: T) => string, costOf: (t: T) => number): T[] {
  const out = [...list];
  switch (key) {
    case 'date-asc': return out.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    case 'cost-desc': return out.sort((a, b) => costOf(b) - costOf(a));
    case 'cost-asc': return out.sort((a, b) => costOf(a) - costOf(b));
    case 'date-desc':
    default: return out.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  }
}
