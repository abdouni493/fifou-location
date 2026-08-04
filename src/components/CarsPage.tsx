import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Car, Rental, Language, Expense, ReservationDetails } from '../types';
import { CarCard } from './CarCard';
import { CarModal } from './CarModal';
import { CarDetailsModal } from './CarDetailsModal';
import { ExpenseModal } from './ExpenseModal';
import { HistoryModal } from './HistoryModal';
import { CarReportModal } from './CarReportModal';
import { ConfirmModal } from './ConfirmModal';
import { CommissionModal } from './CommissionModal';
import { Plus, RefreshCw } from 'lucide-react';
import { useCan } from '../utils/permissions';
import {
  PageHeader, StatCard, StatGrid, Toolbar, SearchInput, Segmented, Btn,
  EmptyState, LoadingState, ErrorBanner,
} from './ui/fx';
import { getCarsWithOwners, addCar, updateCar, deleteCar, AddCarData, CarOwnerInput } from '../services/carService';
import { eurOrUndefined } from '../utils/currency';
import { addVehicleExpense, getVehicleExpenses } from '../services/expenseService';
import { ReservationsService } from '../services/ReservationsService';
import { DatabaseService } from '../services/DatabaseService';

interface CarsPageProps {
  lang: Language;
  isAuthLoading?: boolean;
  user?: any;
}

export const CarsPage: React.FC<CarsPageProps> = ({ lang, isAuthLoading = false, user = null }) => {
  const can = useCan('vehicles');
  const [cars, setCars] = useState<Car[]>([]);
  const [reservations, setReservations] = useState<ReservationDetails[]>([]);

  // ── Statuts réels calculés à partir des réservations ──────────────────────
  /** Calcule le statut réel de chaque voiture d'après les réservations chargées */
  const computeRealStatuses = (rawCars: Car[], allReservations: ReservationDetails[]): Car[] => {
    const today = new Date().toISOString().substring(0, 10);
    return rawCars.map(car => {
      // La maintenance reste la priorité (saisie manuellement)
      if (car.status === 'maintenance') return car;

      const carRes = allReservations.filter(r => r.carId === car.id || (r.car && r.car.id === car.id));
      const coversToday = (r: ReservationDetails) => {
        const dep = (r.step1?.departureDate || '').substring(0, 10);
        const ret = (r.step1?.returnDate    || '').substring(0, 10);
        return dep <= today && today <= ret;
      };

      const active   = carRes.find(r => r.status === 'active'    && coversToday(r));
      const reserved = carRes.find(r => (r.status === 'confirmed' || r.status === 'pending') && coversToday(r));

      let realStatus: Car['status'] = 'disponible';
      if (active)   realStatus = 'louer';
      else if (reserved) realStatus = 'reserve';

      return { ...car, status: realStatus };
    });
  };

  /** Retourne la réservation en cours pour une voiture donnée (pour afficher client + dates) */
  const getActiveReservationInfo = (carId: string) => {
    const today = new Date().toISOString().substring(0, 10);
    const res = reservations.find(r => {
      const id = r.carId || r.car?.id;
      if (id !== carId) return false;
      if (!['active', 'confirmed', 'pending'].includes(r.status)) return false;
      const dep = (r.step1?.departureDate || '').substring(0, 10);
      const ret = (r.step1?.returnDate    || '').substring(0, 10);
      return dep <= today && today <= ret;
    });
    if (!res) return null;
    return {
      clientName: res.client ? `${res.client.firstName} ${res.client.lastName}` : '',
      departureDate: res.step1?.departureDate || '',
      returnDate:    res.step1?.returnDate    || '',
    };
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 250); // wait quarter-second after user stops typing

    return () => clearTimeout(timer);
  }, [searchTerm]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCarModalOpen, setIsCarModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [carToDelete, setCarToDelete] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportExpenses, setReportExpenses] = useState<Expense[]>([]);
  const [reportReservations, setReportReservations] = useState<ReservationDetails[]>([]);
  const [isCommissionModalOpen, setIsCommissionModalOpen] = useState(false);
  const [commissionCar, setCommissionCar] = useState<Car | null>(null);
  /**
   * Section active : véhicules de l'agence ou véhicules confiés par des tiers.
   * Le tableau de bord peut pré-sélectionner l'onglet via `location.state.carsTab`.
   */
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'personal' | 'consignment'>(
    (location.state as { carsTab?: 'personal' | 'consignment' } | null)?.carsTab || 'personal'
  );

  const loadCarsData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Page admin : on charge aussi les données propriétaire des véhicules en conciergerie.
      const result = await getCarsWithOwners();
      if (result.success && result.cars) {
        const mappedCars: Car[] = result.cars.map(dbCar => ({
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
          // Conserve 'maintenance' si en DB ; le vrai statut sera recalculé avec les réservations
          status: dbCar.status === 'maintenance' ? 'maintenance' : 'disponible',
          fuelLevel: dbCar.fuel_level || 'full',
          isHiddenFromSite: dbCar.is_hidden_from_site === true,
          ownershipType: dbCar.ownership_type === 'consignment' ? 'consignment' : 'personal',
          description: dbCar.description || undefined,
          ownerInfo: dbCar.owner
            ? {
                id: dbCar.owner.id,
                carId: dbCar.owner.car_id || dbCar.id || '',
                ownerName: dbCar.owner.owner_name,
                ownerPhone: dbCar.owner.owner_phone || undefined,
                internalRef: dbCar.owner.internal_ref || undefined,
                consignmentDate: dbCar.owner.consignment_date || undefined,
                commissionType: dbCar.owner.commission_type === 'amount' ? 'amount' : 'percentage',
                commissionValue: Number(dbCar.owner.commission_value || 0),
                contractUrl: dbCar.owner.contract_url || undefined,
                privateNotes: dbCar.owner.private_notes || undefined,
              }
            : null,
        }));
        setCars(mappedCars);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      console.error('Error loading cars:', err);
      setError('Failed to load cars');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Skip loading if authentication is still in progress or user not available
    if (isAuthLoading) return;
    if (!user) return;

    loadCarsData();
  }, [user, isAuthLoading]);

  useEffect(() => {
    // Skip loading if authentication is still in progress or user not available
    if (isAuthLoading) return;
    if (!user) return;

    const loadReservations = async () => {
      try {
        console.log('Loading reservations...');
        const reservationsData = await ReservationsService.getReservations();
        console.log('Raw reservations from database:', reservationsData);
        setReservations(reservationsData);
      } catch (err) {
        console.error('Error loading reservations:', err);
      }
    };

    loadReservations();
  }, [user, isAuthLoading]);

  // Voitures avec leur statut RÉEL calculé (dépend des réservations chargées)
  const carsWithRealStatus = useMemo(
    () => computeRealStatuses(cars, reservations),
    [cars, reservations]
  );

  const isConsignmentCar = (car: Car) => car.ownershipType === 'consignment';

  // Les deux sections : véhicules de l'agence / véhicules confiés.
  const personalCars    = useMemo(() => carsWithRealStatus.filter(c => !isConsignmentCar(c)), [carsWithRealStatus]);
  const consignmentCars = useMemo(() => carsWithRealStatus.filter(isConsignmentCar),          [carsWithRealStatus]);

  const sectionCars = activeTab === 'consignment' ? consignmentCars : personalCars;

  // Recherche et compteurs de statut portent sur la section active uniquement.
  const filteredCars = sectionCars.filter(car =>
    car.brand.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    car.model.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (car.registration || '').toLowerCase().includes(debouncedSearch.toLowerCase()) ||
    (car.ownerInfo?.internalRef || '').toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  // Compteurs par statut réel
  const counters = useMemo(() => ({
    disponible:  sectionCars.filter(c => c.status === 'disponible').length,
    reserve:     sectionCars.filter(c => c.status === 'reserve').length,
    louer:       sectionCars.filter(c => c.status === 'louer').length,
    maintenance: sectionCars.filter(c => c.status === 'maintenance').length,
  }), [sectionCars]);

  const handleEditCommission = (car: Car) => {
    setCommissionCar(car);
    setIsCommissionModalOpen(true);
  };

  const handleAddCar = () => {
    setSelectedCar(null);
    setIsCarModalOpen(true);
  };

  const handleEditCar = (car: Car) => {
    setSelectedCar(car);
    setIsCarModalOpen(true);
  };

  /** CarOwnerInfo (camelCase, UI) → colonnes `car_owners`. `internal_ref` reste géré par la DB. */
  const toOwnerRow = (owner: Car['ownerInfo']): CarOwnerInput | undefined => {
    if (!owner) return undefined;
    return {
      owner_name: owner.ownerName.trim(),
      owner_phone: owner.ownerPhone || undefined,
      consignment_date: owner.consignmentDate || undefined,
      commission_type: owner.commissionType,
      commission_value: owner.commissionValue,
      contract_url: owner.contractUrl || undefined,
      private_notes: owner.privateNotes || undefined,
    };
  };

  const handleSaveCar = async (carData: Partial<Car>) => {
    try {
      const ownershipType = carData.ownershipType || 'personal';
      const ownerRow = ownershipType === 'consignment' ? toOwnerRow(carData.ownerInfo) : undefined;

      if (selectedCar) {
        const updateData = {
          brand: carData.brand || selectedCar.brand,
          model: carData.model || selectedCar.model,
          year: carData.year || selectedCar.year,
          plate_number: carData.registration ?? selectedCar.registration,
          price_per_day: carData.priceDay || selectedCar.priceDay,
          status: carData.status || selectedCar.status || 'disponible',
          image_url: carData.images?.[0] || selectedCar.images[0],
          color: carData.color || selectedCar.color,
          vin: carData.vin || selectedCar.vin,
          energy: carData.energy || selectedCar.energy,
          transmission: carData.transmission || selectedCar.transmission,
          seats: carData.seats || selectedCar.seats,
          doors: carData.doors || selectedCar.doors,
          price_week: carData.priceWeek || selectedCar.priceWeek,
          price_month: carData.priceMonth || selectedCar.priceMonth,
          deposit: carData.deposit || selectedCar.deposit,
          // `?? null` et non `||` : un tarif euro remis à 0/vide doit être effacé en base.
          price_day_eur: carData.priceDayEur ?? null,
          price_week_eur: carData.priceWeekEur ?? null,
          price_month_eur: carData.priceMonthEur ?? null,
          deposit_eur: carData.depositEur ?? null,
          mileage: carData.mileage || selectedCar.mileage,
          fuel_level: carData.fuelLevel || selectedCar.fuelLevel || 'full',
          ownership_type: ownershipType,
          description: carData.description ?? selectedCar.description,
          owner: ownerRow,
        };
        const result = await updateCar(selectedCar.id, updateData);
        if (result.success) {
          // La référence interne peut venir d'être générée : on recharge depuis la DB.
          await loadCarsData();
        } else {
          setError(result.error || 'Failed to save car');
          return;
        }
      } else {
        const newCarData: AddCarData = {
          brand: carData.brand || '',
          model: carData.model || '',
          year: carData.year || new Date().getFullYear(),
          plate_number: carData.registration || '',
          price_per_day: carData.priceDay || 0,
          status: 'disponible',
          image_url: carData.images?.[0],
          color: carData.color || '',
          vin: carData.vin || '',
          energy: carData.energy || 'Essence',
          transmission: carData.transmission || 'Manuelle',
          seats: carData.seats || 5,
          doors: carData.doors || 5,
          price_week: carData.priceWeek || 0,
          price_month: carData.priceMonth || 0,
          deposit: carData.deposit || 0,
          price_day_eur: carData.priceDayEur ?? null,
          price_week_eur: carData.priceWeekEur ?? null,
          price_month_eur: carData.priceMonthEur ?? null,
          deposit_eur: carData.depositEur ?? null,
          mileage: carData.mileage || 0,
          ownership_type: ownershipType,
          description: carData.description || undefined,
          owner: ownerRow,
        };
        const result = await addCar(newCarData);
        if (result.success && result.car) {
          await loadCarsData();
        } else {
          setError(result.error || 'Failed to save car');
          return;
        }
      }
      setIsCarModalOpen(false);
    } catch (err) {
      console.error('Error saving car:', err);
      setError('Failed to save car');
    }
  };

  const handleDeleteCar = async (id: string) => {
    setCarToDelete(id);
    setIsConfirmModalOpen(true);
  };

  const confirmDelete = async () => {
    if (carToDelete) {
      try {
        const result = await deleteCar(carToDelete);
        if (result.success) {
          setCars(prev => prev.filter(c => c.id !== carToDelete));
          setCarToDelete(null);
          if (selectedCar?.id === carToDelete) {
            setIsCarModalOpen(false);
          }
        }
      } catch (err) {
        console.error('Error deleting car:', err);
        setError('Failed to delete car');
      }
    }
  };

  const handleViewDetails = (car: Car) => {
    setSelectedCar(car);
    setIsDetailsModalOpen(true);
  };

  const handleHistory = (car: Car) => {
    setSelectedCar(car);
    setIsHistoryModalOpen(true);
  };

  const handleExpenses = (car: Car) => {
    setSelectedCar(car);
    setIsExpenseModalOpen(true);
  };

  const handleReports = async (car: Car) => {
    setSelectedCar(car);
    // Fetch all expenses for this car
    const expensesResult = await getVehicleExpenses();
    let carExpenses = [];
    if (expensesResult.success && expensesResult.expenses) {
      carExpenses = expensesResult.expenses.filter(e => e.carId === car.id);
    }
    setReportExpenses(carExpenses);
    // Filter reservations for this car
    const carReservations = reservations.filter(r => r.carId === car.id);
    setReportReservations(carReservations);
    setIsReportModalOpen(true);
  };

  /**
   * Seul le basculement vers/depuis 'maintenance' est autorisé manuellement.
   * Les statuts 'disponible' / 'reserve' / 'louer' sont calculés automatiquement.
   */
  const handleStatusChange = async (carId: string, newStatus: string) => {
    const allowed = ['maintenance', 'disponible'];
    if (!allowed.includes(newStatus)) return; // Sécurité — ignore les appels non autorisés
    try {
      const result = await updateCar(carId, { status: newStatus } as any);
      if (result.success) {
        setCars(prev => prev.map(c =>
          c.id === carId ? { ...c, status: newStatus as Car['status'] } : c
        ));
      } else {
        setError('Failed to update car status');
      }
    } catch (err) {
      console.error('Error updating car status:', err);
      setError('Failed to update car status');
    }
  };

  const handleSaveExpense = async (
    expenseData: Partial<Expense> & {
      currentMileage?: number;
      nextVidangeKm?: number;
      expenseName?: string;
    }
  ) => {
    if (!selectedCar) return;
    try {
      const newExpense: Omit<import('../types').VehicleExpense, 'id' | 'createdAt'> = {
        carId: selectedCar.id,
        type: expenseData.type || 'autre',
        cost: expenseData.cost || 0,
        date: expenseData.date || new Date().toISOString().split('T')[0],
        note: expenseData.note,
        currentMileage: expenseData.currentMileage,
        nextVidangeKm: expenseData.nextVidangeKm,
        expirationDate: expenseData.expirationDate,
        expenseName: expenseData.expenseName || expenseData.name,
      };
      const result = await addVehicleExpense(newExpense);
      if (!result.success) {
        console.error('Error saving expense to DB', result.error);
        setError('Failed to save expense');
      }
    } catch (err) {
      console.error('Unexpected error saving expense', err);
      setError('Failed to save expense');
    }
  };

  const fr = lang === 'fr';

  return (
    <div className="max-w-[92rem] mx-auto">
      <PageHeader
        icon="🚗"
        eyebrow={fr ? 'Flotte' : 'الأسطول'}
        title={fr ? 'Parc automobile' : 'أسطول السيارات'}
        subtitle={
          fr
            ? 'Véhicules, disponibilité en temps réel, tarifs et conciergerie.'
            : 'المركبات والتوفر والأسعار والوكالة.'
        }
        actions={
          <>
            <Btn tone="steel" onClick={loadCarsData} title={fr ? 'Actualiser' : 'تحديث'}>
              <RefreshCw size={16} />
              <span className="hidden sm:inline">{fr ? 'Actualiser' : 'تحديث'}</span>
            </Btn>
            {can('create') && (
              <Btn tone="primary" onClick={handleAddCar}>
                <Plus size={16} />
                {fr ? 'Nouveau véhicule' : 'مركبة جديدة'}
              </Btn>
            )}
          </>
        }
      >
        {!loading && (
          <Segmented<'personal' | 'consignment'>
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'personal', label: fr ? '🚗 Mes véhicules' : '🚗 مركباتي', badge: personalCars.length },
              { value: 'consignment', label: fr ? '🤝 Conciergerie' : '🤝 بالوكالة', badge: consignmentCars.length },
            ]}
            className="w-full sm:w-auto"
          />
        )}
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={loadCarsData} retryLabel={fr ? 'Recharger' : 'إعادة'} />}

      {/* ── Compteurs de statut réel (section active) ── */}
      {!loading && (
        <div className="mb-5">
          <StatGrid cols={4}>
            <StatCard
              label={fr ? 'Disponibles' : 'متاحة'}
              value={counters.disponible}
              icon="✅" tone="green"
            />
            <StatCard
              label={fr ? 'Réservés' : 'محجوزة'}
              value={counters.reserve}
              icon="📅" tone="amber"
            />
            <StatCard
              label={fr ? 'En location' : 'في الإيجار'}
              value={counters.louer}
              icon="🔑" tone="red"
            />
            <StatCard
              label={fr ? 'En maintenance' : 'صيانة'}
              value={counters.maintenance}
              icon="🔧" tone="steel"
            />
          </StatGrid>
        </div>
      )}

      <Toolbar>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={fr ? 'Marque, modèle, immatriculation, réf. conciergerie…' : 'العلامة، الطراز، اللوحة…'}
        />
      </Toolbar>

      {loading ? (
        <LoadingState label={fr ? 'Chargement des véhicules…' : 'جاري تحميل السيارات…'} rows={8} />
      ) : filteredCars.length === 0 ? (
        <EmptyState
          icon="🚗"
          title={
            activeTab === 'consignment'
              ? (fr ? 'Aucun véhicule en conciergerie' : 'لا مركبات بالوكالة')
              : (fr ? 'Aucun véhicule' : 'لا مركبات')
          }
          description={
            searchTerm
              ? (fr ? 'Aucun résultat pour cette recherche.' : 'لا نتائج لهذا البحث.')
              : (fr ? 'Ajoutez un véhicule pour commencer à louer.' : 'أضف مركبة للبدء.')
          }
          action={
            !searchTerm && can('create') ? (
              <Btn tone="primary" onClick={handleAddCar}>
                <Plus size={16} /> {fr ? 'Nouveau véhicule' : 'مركبة جديدة'}
              </Btn>
            ) : undefined
          }
        />
      ) : (
        <div className="fx-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          {filteredCars.map(car => (
            <CarCard
              key={car.id}
              car={car}
              lang={lang}
              onDelete={handleDeleteCar}
              onEdit={handleEditCar}
              onViewDetails={handleViewDetails}
              onHistory={handleHistory}
              onExpenses={handleExpenses}
              onReports={handleReports}
              onStatusChange={handleStatusChange}
              onEditCommission={isConsignmentCar(car) ? handleEditCommission : undefined}
              activeReservationInfo={getActiveReservationInfo(car.id)}
            />
          ))}
        </div>
      )}

      <CarModal
        isOpen={isCarModalOpen}
        onClose={() => setIsCarModalOpen(false)}
        onSave={handleSaveCar}
        onDelete={handleDeleteCar}
        car={selectedCar || undefined}
        lang={lang}
      />

      <CommissionModal
        isOpen={isCommissionModalOpen}
        onClose={() => setIsCommissionModalOpen(false)}
        onSaved={loadCarsData}
        car={commissionCar}
        lang={lang}
      />

      <ConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirm={confirmDelete}
        title={{
          fr: 'Confirmation de suppression',
          ar: 'تأكيد الحذف'
        }}
        message={{
          fr: 'Êtes-vous sûr de vouloir supprimer ce véhicule ? Cette action est irréversible.',
          ar: 'هل أنت متأكد من رغبتك في حذف هذه المركبة؟ هذا الإجراء لا يمكن التراجع عنه.'
        }}
        lang={lang}
      />

      {selectedCar && (
        <>
          <CarDetailsModal
            isOpen={isDetailsModalOpen}
            onClose={() => setIsDetailsModalOpen(false)}
            car={selectedCar}
            lang={lang}
          />
          <ExpenseModal
            isOpen={isExpenseModalOpen}
            onClose={() => setIsExpenseModalOpen(false)}
            onSave={handleSaveExpense}
            car={selectedCar}
            lang={lang}
          />
          <HistoryModal
            isOpen={isHistoryModalOpen}
            onClose={() => setIsHistoryModalOpen(false)}
            car={selectedCar}
            reservations={reservations}
            lang={lang}
          />
          <CarReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            car={selectedCar}
            reservations={reportReservations}
            expenses={reportExpenses}
            lang={lang}
          />
        </>
      )}
    </div>
  );
};
