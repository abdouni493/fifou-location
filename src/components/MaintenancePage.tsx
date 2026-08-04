import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Car, Language, VehicleExpense } from '../types';
import { MaintenanceCard } from './MaintenanceCard';
import { CarModal } from './CarModal';
import { VehicleExpenseModal } from './VehicleExpenseModal';
import { MaintenanceStatus, getMaintenanceStatus } from '../services/maintenanceService';
import { AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import { getCars, updateCar } from '../services/carService';
import { addVehicleExpense, getVehicleExpenses } from '../services/expenseService';
import { useCan } from '../utils/permissions';
import {
  PageHeader, StatCard, StatGrid, Toolbar, SearchInput, Segmented, Btn,
  EmptyState, LoadingState,
} from './ui/fx';

interface MaintenancePageProps {
  lang: Language;
  isAuthLoading?: boolean;
  user?: any;
}

export const MaintenancePage: React.FC<MaintenancePageProps> = ({
  lang,
  isAuthLoading = false,
  user = null,
}) => {
  const location = useLocation();
  const can = useCan('maintenance');
  const [cars, setCars] = useState<Car[]>([]);
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'critical' | 'warning' | 'success'>('all');
  const [isCarModalOpen, setIsCarModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [selectedCar, setSelectedCar] = useState<Car | null>(null);
  const [selectedExpenseType, setSelectedExpenseType] = useState<'vidange' | 'chaine' | 'assurance' | 'controle' | 'autre'>('vidange');
  const [prefilledExpense, setPrefilledExpense] = useState<Partial<VehicleExpense> | undefined>(undefined);

  const isRtl = lang === 'ar';

  // Load cars data
  const loadCarsData = async () => {
    try {
      setLoading(true);
      const result = await getCars();
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
          images: dbCar.image_url ? [dbCar.image_url] : ['https://picsum.photos/seed/car/400/300'],
          mileage: dbCar.mileage || 0,
          status: (dbCar.status || 'disponible') as 'disponible' | 'louer' | 'maintenance' | 'available',
        }));

        setCars(mappedCars);

        // Load all vehicle expenses
        const expensesResult = await getVehicleExpenses();
        const allExpenses = expensesResult.expenses || [];
        console.log(`[MaintenancePage] Loaded ${allExpenses.length} total expenses`);

        // Load maintenance data with expenses
        const maintenanceStatus = await getMaintenanceStatus(mappedCars, allExpenses);
        setMaintenanceData(maintenanceStatus);
      }
    } catch (err) {
      console.error('Error loading cars:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) return;

    loadCarsData();
  }, [user, isAuthLoading]);

  // Handle navigation from dashboard alert
  useEffect(() => {
    const state = location.state as any;
    // Guard: only proceed if state has all required fields and they are non-empty strings
    if (
      state &&
      typeof state.selectedCarId === 'string' && state.selectedCarId.length > 0 &&
      typeof state.expenseType === 'string' && state.expenseType.length > 0 &&
      state.showExpenseModal === true
    ) {
      // Find the car with the given ID
      const car = cars.find(c => c.id === state.selectedCarId);
      if (car) {
        setSelectedCar(car);
        setSelectedExpenseType(state.expenseType);
        setIsExpenseModalOpen(true);
        // Clear the location state immediately to prevent re-triggering
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, cars]);

  const handleEditCar = (car: Car) => {
    setSelectedCar(car);
    setIsCarModalOpen(true);
  };

  const handleSaveCar = async (carData: Partial<Car>) => {
    try {
      if (selectedCar) {
        const updateData = {
          brand: carData.brand || selectedCar.brand,
          model: carData.model || selectedCar.model,
          year: carData.year || selectedCar.year,
          plate_number: carData.registration || selectedCar.registration,
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
          mileage: carData.mileage || selectedCar.mileage,
        };
        const result = await updateCar(selectedCar.id, updateData);
        if (result.success) {
          setCars(prev =>
            prev.map(c =>
              c.id === selectedCar.id ? { ...c, ...carData } : c
            )
          );
          // Reload maintenance data
          await loadCarsData();
        }
      }
      setIsCarModalOpen(false);
      setSelectedCar(null);
    } catch (err) {
      console.error('Error updating car:', err);
    }
  };

  const handleVidangeClick = (car: Car) => {
    setSelectedCar(car);
    setSelectedExpenseType('vidange');
    const expense: Partial<VehicleExpense> = {
      carId: car.id,
      type: 'vidange',
      date: new Date().toISOString().split('T')[0],
      currentMileage: car.mileage,
      nextVidangeKm: car.mileage + 10000,
    };
    setPrefilledExpense(expense);
    setIsExpenseModalOpen(true);
  };

  const handleChaineClick = (car: Car) => {
    setSelectedCar(car);
    setSelectedExpenseType('chaine');
    const expense: Partial<VehicleExpense> = {
      carId: car.id,
      type: 'chaine',
      date: new Date().toISOString().split('T')[0],
      currentMileage: car.mileage,
      nextVidangeKm: car.mileage + 10000,
    };
    setPrefilledExpense(expense);
    setIsExpenseModalOpen(true);
  };

  const handleAssuranceClick = (car: Car) => {
    setSelectedCar(car);
    setSelectedExpenseType('assurance');
    const expense: Partial<VehicleExpense> = {
      carId: car.id,
      type: 'assurance',
      date: new Date().toISOString().split('T')[0],
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };
    setPrefilledExpense(expense);
    setIsExpenseModalOpen(true);
  };

  const handleControleClick = (car: Car) => {
    setSelectedCar(car);
    setSelectedExpenseType('controle');
    const expense: Partial<VehicleExpense> = {
      carId: car.id,
      type: 'controle',
      date: new Date().toISOString().split('T')[0],
      expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    };
    setPrefilledExpense(expense);
    setIsExpenseModalOpen(true);
  };

  /**
   * Dépense libre pour un véhicule (type « Autres ».)
   *
   * Les quatre boutons ci-dessus couvrent l'entretien planifié. Tout le reste —
   * pneus, carrosserie, lavage, pièce cassée — n'avait aucune porte d'entrée
   * depuis cet écran : il fallait repasser par Dépenses et re-chercher la
   * voiture. Ce bouton la pré-sélectionne.
   */
  const handleAutreClick = (car: Car) => {
    setSelectedCar(car);
    setSelectedExpenseType('autre');
    setPrefilledExpense({
      carId: car.id,
      type: 'autre',
      date: new Date().toISOString().split('T')[0],
      currentMileage: car.mileage,
    });
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = async (expenseData: any) => {
    try {
      if (selectedCar) {
        // Toujours un AJOUT : chaque clic sur un bouton de maintenance crée une
        // nouvelle ligne dans l'historique des dépenses du véhicule, il ne modifie
        // jamais la dépense précédente. On respecte le type choisi dans le modal.
        const expense = {
          carId: selectedCar.id,
          type: expenseData.type || selectedExpenseType,
          cost: expenseData.cost || 0,
          date: expenseData.date || new Date().toISOString().split('T')[0],
          note: expenseData.note || '',
          currentMileage: expenseData.currentMileage ?? selectedCar.mileage,
          nextVidangeKm: expenseData.nextVidangeKm || null,
          expirationDate: expenseData.expirationDate || null,
          expenseName: expenseData.expenseName || '',
          oilFilterChanged: expenseData.oilFilterChanged || false,
          airFilterChanged: expenseData.airFilterChanged || false,
          fuelFilterChanged: expenseData.fuelFilterChanged || false,
          acFilterChanged: expenseData.acFilterChanged || false,
        };

        const result = await addVehicleExpense(expense);
        if (result.success) {
          // Reload maintenance data so the card shows the newly saved entry.
          await loadCarsData();
          setIsExpenseModalOpen(false);
          setSelectedCar(null);
          setPrefilledExpense(undefined);
        } else {
          console.error('Error saving expense:', result.error);
          alert(
            lang === 'fr'
              ? `Échec de l'enregistrement de la dépense : ${result.error || 'erreur inconnue'}`
              : `فشل حفظ النفقة: ${result.error || 'خطأ غير معروف'}`
          );
        }
      }
    } catch (err) {
      console.error('Error saving expense:', err);
    }
  };

  const filteredData = maintenanceData.filter(item => {
    const matchesSearch =
      item.car.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.car.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.car.registration.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'all') return true;

    // Check if car has any item matching the status
    const items = [
      { type: 'vidange', value: item.vidange.kmRemaining, threshold: 1000 },
      { type: 'chaine', value: item.chaine.kmRemaining, threshold: 1000 },
      { type: 'assurance', value: item.assurance.daysRemaining, threshold: 30 },
      { type: 'controle', value: item.controleTechnique.daysRemaining, threshold: 30 },
    ];

    return items.some(item => {
      if (item.value === null || item.value === undefined) {
        return filterStatus === 'success';
      }

      if (item.type === 'vidange' || item.type === 'chaine') {
        if (filterStatus === 'critical') return item.value <= 0;
        if (filterStatus === 'warning') return item.value > 0 && item.value <= item.threshold;
        if (filterStatus === 'success') return item.value > item.threshold;
      } else {
        if (filterStatus === 'critical') return item.value < 0;
        if (filterStatus === 'warning') return item.value >= 0 && item.value <= item.threshold;
        if (filterStatus === 'success') return item.value > item.threshold;
      }
    });
  });

  const fr = lang === 'fr';

  // Compteurs par gravité — calculés sur l'ensemble, pas sur le filtre courant :
  // c'est une boussole, elle ne doit pas bouger quand on change de filtre.
  const counters = React.useMemo(() => {
    let critical = 0, warning = 0, ok = 0;
    maintenanceData.forEach(item => {
      const values = [
        { v: item.vidange.kmRemaining, t: 1000, km: true },
        { v: item.chaine.kmRemaining, t: 1000, km: true },
        { v: item.assurance.daysRemaining, t: 30, km: false },
        { v: item.controleTechnique.daysRemaining, t: 30, km: false },
      ];
      const worst = values.reduce<'critical' | 'warning' | 'ok'>((acc, x) => {
        if (x.v === null || x.v === undefined) return acc;
        const isCritical = x.km ? x.v <= 0 : x.v < 0;
        const isWarning = x.v >= 0 && x.v <= x.t;
        if (isCritical) return 'critical';
        if (isWarning && acc !== 'critical') return 'warning';
        return acc;
      }, 'ok');
      if (worst === 'critical') critical++;
      else if (worst === 'warning') warning++;
      else ok++;
    });
    return { critical, warning, ok };
  }, [maintenanceData]);

  return (
    <div className="max-w-[92rem] mx-auto">
      <PageHeader
        icon="🔧"
        eyebrow={fr ? 'Atelier' : 'الورشة'}
        title={fr ? 'Maintenance' : 'الصيانة'}
        subtitle={
          fr
            ? 'Vidange, chaîne, assurance et contrôle technique — échéances par véhicule.'
            : 'تغيير الزيت والسلسلة والتأمين والفحص التقني.'
        }
        actions={
          <Btn tone="steel" onClick={loadCarsData} title={fr ? 'Actualiser' : 'تحديث'}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{fr ? 'Actualiser' : 'تحديث'}</span>
          </Btn>
        }
      />

      <div className="mb-5">
        <StatGrid cols={4}>
          <StatCard label={fr ? 'Véhicules suivis' : 'المركبات المتابعة'} value={maintenanceData.length} icon="🚗" tone="steel" />
          <StatCard
            label={fr ? 'Échéances dépassées' : 'مواعيد متجاوزة'}
            value={counters.critical}
            icon="🔴" tone={counters.critical > 0 ? 'red' : 'green'}
            onClick={() => setFilterStatus(filterStatus === 'critical' ? 'all' : 'critical')}
          />
          <StatCard
            label={fr ? 'À prévoir' : 'قريبًا'}
            value={counters.warning}
            icon="🟡" tone="amber"
            onClick={() => setFilterStatus(filterStatus === 'warning' ? 'all' : 'warning')}
          />
          <StatCard
            label={fr ? 'À jour' : 'محدّثة'}
            value={counters.ok}
            icon="🟢" tone="green"
            onClick={() => setFilterStatus(filterStatus === 'success' ? 'all' : 'success')}
          />
        </StatGrid>
      </div>

      <Toolbar>
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder={fr ? 'Marque, modèle, immatriculation…' : 'العلامة، الطراز، اللوحة…'}
        />
        <Segmented<'all' | 'critical' | 'warning' | 'success'>
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: 'all', label: fr ? '🔄 Tous' : '🔄 الكل' },
            { value: 'critical', label: fr ? '🔴 Critique' : '🔴 حرج' },
            { value: 'warning', label: fr ? '🟡 Attention' : '🟡 تنبيه' },
            { value: 'success', label: fr ? '🟢 Bon' : '🟢 جيد' },
          ]}
        />
      </Toolbar>

      {loading ? (
        <LoadingState label={fr ? 'Chargement des véhicules…' : 'جاري التحميل…'} rows={8} />
      ) : filteredData.length === 0 ? (
        <EmptyState
          icon="🔧"
          title={fr ? 'Aucun véhicule' : 'لا مركبات'}
          description={
            searchTerm || filterStatus !== 'all'
              ? (fr ? 'Aucun résultat pour ces critères.' : 'لا نتائج.')
              : (fr ? 'Ajoutez des véhicules pour suivre leur entretien.' : 'أضف مركبات لمتابعة صيانتها.')
          }
        />
      ) : (
        <div className="fx-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          <AnimatePresence mode="popLayout">
            {filteredData.map((maintenance) => (
              <MaintenanceCard
                key={maintenance.car.id}
                maintenance={maintenance}
                lang={lang}
                onEditCar={handleEditCar}
                onVidangeClick={handleVidangeClick}
                onChaineClick={handleChaineClick}
                onAssuranceClick={handleAssuranceClick}
                onControleClick={handleControleClick}
                onAutreClick={can('expense') ? handleAutreClick : undefined}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Car Edit Modal */}
      <AnimatePresence>
        {isCarModalOpen && (
          <CarModal
            isOpen={isCarModalOpen}
            onClose={() => {
              setIsCarModalOpen(false);
              setSelectedCar(null);
            }}
            onSave={handleSaveCar}
            car={selectedCar || undefined}
            lang={lang}
          />
        )}
      </AnimatePresence>

      {/* Expense Modal */}
      <AnimatePresence>
        {isExpenseModalOpen && selectedCar && (
          <VehicleExpenseModal
            isOpen={isExpenseModalOpen}
            onClose={() => {
              setIsExpenseModalOpen(false);
              setSelectedCar(null);
              setPrefilledExpense(undefined);
            }}
            onSave={handleSaveExpense}
            expense={prefilledExpense as any}
            cars={[selectedCar]}
            lang={lang}
          />
        )}
      </AnimatePresence>
    </div>
  );
};