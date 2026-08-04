import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Sidebar } from './components/Sidebar';
import { Navbar } from './components/Navbar';
import { Login } from './components/Login';
import { CarsPage } from './components/CarsPage';
import { MaintenancePage } from './components/MaintenancePage';
import { ClientsPage } from './components/ClientsPage';
import { EquipePage } from './components/EquipePage';
import { ExpensesPage } from './components/ExpensesPage';
import { ConfigPage } from './components/ConfigPage';
import { WebsiteManagementPage } from './components/WebsiteManagementPage';
import { WebsiteOrders } from './components/WebsiteOrders';
import { ProtectionServicesPage } from './components/ProtectionServicesPage';
import { PlannerPage } from './components/PlannerPage';
import { Website } from './components/Website';
import { DashboardPage } from './components/DashboardPage';
import ReportsPage from './components/ReportsPage';
import { CarGainsPage } from './components/CarGainsPage';
import { CaissePage } from './components/CaissePage';
import { ReservationsPage } from './components/ReservationsPage';
import { Language, User, UserRole, Car, Agency } from './types';
import { supabase, supabaseConfigured } from './supabase';
import { SIDEBAR_ITEMS } from './constants';
import { DatabaseService } from './services/DatabaseService';
import { setupErrorInterceptor } from './utils/errorInterceptor';
import { DebugAuth } from './utils/debugAuth';
import { sessionService } from './utils/sessionService';
import { PermissionsProvider, usePermissions } from './utils/permissions';

// Initialize global error interceptor on load
setupErrorInterceptor();

// Make Supabase available globally for console debugging
if (typeof window !== 'undefined') {
  (window as any).__supabase__ = supabase;
}

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center px-6">
    <div className="text-center">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        className="w-12 h-12 rounded-full mx-auto mb-4"
        style={{
          border: '3px solid rgba(255,255,255,0.08)',
          borderTopColor: 'var(--fx-red-400)',
          boxShadow: '0 0 24px -6px rgba(200,16,46,0.7)',
        }}
      />
      <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--fx-ink-mute)' }}>
        Chargement…
      </p>
    </div>
  </div>
);

interface DashboardLayoutProps {
  lang: Language;
  setLang: (lang: Language) => void;
  user: User | null;
  isAuthLoading: boolean;
  activeTab: string;
  onTabChange: (tabId: string) => void;
  isSidebarVisible: boolean;
  setIsSidebarVisible: (visible: boolean) => void;
  onLogout: () => void;
  maintenanceAlertsCount: number;
  webOrdersCount: number;
  cars: Car[];
}

/**
 * Layout du back-office (sidebar + navbar + page active).
 *
 * IMPORTANT : ce composant est défini au niveau MODULE (et non à l'intérieur
 * de <App/>). Défini dans App, son identité changeait à chaque re-render du
 * parent, forçant React à démonter/remonter tout l'écran actif — chaque page
 * rechargeait alors ses données ("auto-refresh" subi par l'utilisateur).
 */
const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  lang, setLang, user, isAuthLoading, activeTab, onTabChange,
  isSidebarVisible, setIsSidebarVisible, onLogout,
  maintenanceAlertsCount, webOrdersCount, cars,
}) => {
  const activeItem = SIDEBAR_ITEMS.find(item => item.id === activeTab) || SIDEBAR_ITEMS[0];
  const { canPage, isAdmin, loading: permsLoading } = usePermissions();

  /**
   * Un employé qui atteint une interface fermée (URL tapée à la main, lien
   * gardé en favori) ne doit pas voir un écran vide : on le renvoie sur la
   * première interface qui lui est ouverte.
   */
  useEffect(() => {
    if (isAdmin || permsLoading) return;
    if (canPage(activeTab)) return;

    const firstAllowed = SIDEBAR_ITEMS.find(i => canPage(i.id));
    if (firstAllowed && firstAllowed.id !== activeTab) onTabChange(firstAllowed.id);
  }, [activeTab, canPage, isAdmin, permsLoading, onTabChange]);

  const renderContent = () => {
    // Interface non autorisée : message net, pas de page fantôme.
    if (!isAdmin && !permsLoading && !canPage(activeTab)) {
      return (
        <div className="fx-card p-8 sm:p-12 text-center max-w-lg mx-auto">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="fx-title text-xl mb-2">
            {lang === 'fr' ? 'Accès non autorisé' : 'وصول غير مصرح به'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--fx-ink-mute)' }}>
            {lang === 'fr'
              ? "Cette interface ne fait pas partie de vos permissions. Contactez votre administrateur."
              : 'هذه الواجهة ليست ضمن صلاحياتك. اتصل بالمسؤول.'}
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage lang={lang} isAuthLoading={isAuthLoading} user={user} />;
      case 'planner':
        return <PlannerPage lang={lang} isAuthLoading={isAuthLoading} user={user} />;
      case 'car-gains':
        return <CarGainsPage lang={lang} />;
      case 'caisse':
        return <CaissePage lang={lang} user={user} />;
      case 'vehicles':
        return <CarsPage lang={lang} isAuthLoading={isAuthLoading} user={user} />;
      case 'maintenance':
        return <MaintenancePage lang={lang} isAuthLoading={isAuthLoading} user={user} />;
      case 'clients':
        return <ClientsPage lang={lang} isAuthLoading={isAuthLoading} user={user} />;
      case 'team':
        return <EquipePage lang={lang} />;
      case 'expenses':
        return <ExpensesPage lang={lang} cars={cars} />;
      case 'web-mgmt':
        return <WebsiteManagementPage lang={lang} />;
      case 'web-orders':
        return <WebsiteOrders lang={lang} />;
      case 'protection-services':
        return <ProtectionServicesPage lang={lang} />;
      case 'reservations':
        return <ReservationsPage lang={lang} isAuthLoading={isAuthLoading} user={user} />;
      case 'reports':
        return <ReportsPage lang={lang} />;
      case 'config':
        return user ? <ConfigPage lang={lang} user={user} /> : null;
      default:
        return (
          <div className="fx-card p-8 sm:p-12 text-center max-w-lg mx-auto">
            <div className="text-6xl mb-4 opacity-40">{activeItem.icon}</div>
            <h2 className="fx-title text-xl mb-2">{activeItem.label[lang]}</h2>
            <p className="text-sm" style={{ color: 'var(--fx-ink-mute)' }}>
              {lang === 'fr' ? 'Section indisponible.' : 'القسم غير متاح.'}
            </p>
          </div>
        );
    }
  };

  return (
    <div className={`flex min-h-screen ${lang === 'ar' ? 'font-arabic' : ''}`}>
      {!supabaseConfigured && (
        <div className="fixed inset-x-0 top-0 z-[60] px-4 py-2 text-center text-xs font-bold"
             style={{ background: 'var(--fx-grad-red)', color: '#fff' }}>
          Supabase non configuré — définissez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.
        </div>
      )}
      <Sidebar
        lang={lang}
        isVisible={isSidebarVisible}
        setIsVisible={setIsSidebarVisible}
        onLogout={onLogout}
        activeTab={activeTab}
        setActiveTab={onTabChange}
        alertsCount={maintenanceAlertsCount}
        webOrdersCount={webOrdersCount}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Navbar
          user={user}
          lang={lang}
          setLang={setLang}
          toggleSidebar={() => setIsSidebarVisible(!isSidebarVisible)}
        />

        {/* Le rembourrage suit la taille de l'écran : 16 px au pouce, 32 px au
            bureau. À 8 px partout, les cartes touchaient le bord du téléphone. */}
        <main className="fx-page-shell flex-1 min-w-0 p-3 sm:p-5 lg:p-8 fx-safe-b">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Voile mobile : ferme la barre latérale au toucher */}
      <AnimatePresence>
        {isSidebarVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarVisible(false)}
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: 'rgba(4,4,6,0.72)', backdropFilter: 'blur(6px)' }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

/** Route protégée : spinner pendant l'auth, redirection sinon, layout complet une fois connecté. */
const ProtectedRoute: React.FC<DashboardLayoutProps> = (props) => {
  if (props.isAuthLoading) {
    return <LoadingScreen />;
  }

  if (!props.user) {
    return <Navigate to="/login" replace />;
  }

  return <DashboardLayout {...props} />;
};

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Language>('fr');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true); // Add loading state
  const [isSidebarVisible, setIsSidebarVisible] = useState(window.innerWidth >= 1024);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cars, setCars] = useState<Car[]>([]);
  const [specialOffers, setSpecialOffers] = useState<any[]>([]);
  const [contactInfo, setContactInfo] = useState<any>(null);
  const [websiteSettings, setWebsiteSettings] = useState<any>(null);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoadingAgenciesForWebsite, setIsLoadingAgenciesForWebsite] = useState(true);
  const [maintenanceAlertsCount, setMaintenanceAlertsCount] = useState(0);
  const [webOrdersCount, setWebOrdersCount] = useState(0);

  // Refs to prevent multiple listener initialization (especially important in StrictMode dev environment)
  const authListenerInitialized = useRef(false);
  const isWebsiteMode = location.pathname === '/website';

  // Le site public est noir, l'admin reste clair : les deux partagent le même
  // <body>, donc on marque la racine pour que index.css bascule la surface
  // (fond, couleur de texte héritée, scrollbar) sans contaminer le back-office.
  useEffect(() => {
    document.documentElement.dataset.surface = isWebsiteMode ? 'site' : 'admin';
  }, [isWebsiteMode]);

  // Le rail est-il épinglé à l'écran ? Sur ce drapeau, index.css décale les
  // fenêtres modales (« Nouveau client », « Nouveau véhicule »…) pour qu'elles
  // s'ouvrent À DROITE de la barre latérale au lieu de la recouvrir.
  useEffect(() => {
    document.documentElement.dataset.rail = isSidebarVisible ? 'on' : 'off';
  }, [isSidebarVisible]);

  // Sync URL with active tab - extract tab from URL on mount and when URL changes
  useEffect(() => {
    const pathname = location.pathname;

    // Map URL paths to tab IDs
    const pathMap: Record<string, string> = {
      '/dashboard': 'dashboard',
      '/planificateur': 'planner',
      '/gains-vehicule': 'car-gains',
      '/caisse': 'caisse',
      '/vehicules': 'vehicles',
      '/maintenance': 'maintenance',
      '/clients': 'clients',
      '/equipe': 'team',
      '/depenses': 'expenses',
      '/website-management': 'web-mgmt',
      '/website-reservations': 'web-orders',
      // Ancienne URL des commandes du site : conservée pour ne pas casser les
      // favoris. Elle pointe sur la même interface, renommée « réservations ».
      '/website-commandes': 'web-orders',
      '/protection-services': 'protection-services',
      '/reservations': 'reservations',
      '/rapports': 'reports',
      '/configuration': 'config',
      '/': 'dashboard', // Default to dashboard
    };

    const tabId = pathMap[pathname] || 'dashboard';
    setActiveTab(tabId);
  }, [location.pathname]);

  // Responsive sidebar visibility
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarVisible(true);
      } else {
        setIsSidebarVisible(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update URL when active tab changes
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);

    const urlMap: Record<string, string> = {
      'dashboard': '/dashboard',
      'planner': '/planificateur',
      'car-gains': '/gains-vehicule',
      'caisse': '/caisse',
      'vehicles': '/vehicules',
      'maintenance': '/maintenance',
      'clients': '/clients',
      'team': '/equipe',
      'expenses': '/depenses',
      'web-mgmt': '/website-management',
      'web-orders': '/website-reservations',
      'protection-services': '/protection-services',
      'reservations': '/reservations',
      'reports': '/rapports',
      'config': '/configuration',
    };

    // Navigate with empty state to clear any previous location.state
    // This prevents pages like MaintenancePage from re-opening modals
    // triggered by previous dashboard alert clicks
    navigate(urlMap[tabId] || '/dashboard', { state: {} });
  };

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  // Badges de la sidebar (alertes maintenance / commandes web).
  // Chargés UNE fois à la connexion — plus d'intervalle de rafraîchissement :
  // l'utilisateur recharge lui-même quand il veut des données fraîches.
  useEffect(() => {
    if (!user || isAuthLoading) return;

    const loadAlerts = async () => {
      try {
        const alerts = await DatabaseService.getMaintenanceAlerts();
        setMaintenanceAlertsCount(alerts.length);
      } catch (err) {
        console.error('Error loading alerts:', err);
        setMaintenanceAlertsCount(0);
      }
      // Commandes du site en attente d'acceptation (badge planificateur)
      try {
        const orders = await DatabaseService.getWebsiteOrders();
        setWebOrdersCount(orders.filter(o => o.status === 'website_reservation').length);
      } catch (err) {
        console.error('Error loading website orders count:', err);
        setWebOrdersCount(0);
      }
    };

    loadAlerts();
  }, [user, isAuthLoading]);

  // Load cars from database. La table cars est lisible en anonyme (RLS),
  // ce qui permet au site public d'afficher les vraies voitures sans connexion.
  useEffect(() => {
    const loadCars = async () => {
      try {
        const dbCars = await DatabaseService.getCars();
        setCars(dbCars.length > 0 ? dbCars : mockCars);
      } catch (error) {
        console.error('Failed to load cars from database:', error);
        // Fallback to mock data if database load fails
        setCars(mockCars);
      }
    };

    loadCars();
  }, [user]); // Recharge après connexion/déconnexion

  // Load website data from database
  useEffect(() => {
    const loadWebsiteData = async () => {
      try {
        const [dbSpecialOffers, dbContactInfo, dbWebsiteSettings] = await Promise.all([
          DatabaseService.getSpecialOffers(),
          DatabaseService.getWebsiteContacts(),
          DatabaseService.getWebsiteSettings(),
        ]);

        setSpecialOffers(dbSpecialOffers);
        setContactInfo(dbContactInfo || mockContactInfo);
        setWebsiteSettings(dbWebsiteSettings || mockWebsiteSettings);

        // Branding dynamique : le titre et le favicon suivent le logo/nom
        // de l'agence en base (les PNG de public/ restent le défaut statique).
        if (dbWebsiteSettings?.name) {
          document.title = `${dbWebsiteSettings.name.split(/\s+/).slice(0, 3).join(' ')} | Location de Voitures`;
        }
        if (dbWebsiteSettings?.logo) {
          document.querySelectorAll("link[rel='icon']").forEach(link => {
            (link as HTMLLinkElement).href = dbWebsiteSettings.logo;
          });
        }
      } catch (error) {
        console.error('Failed to load website data from database:', error);
        // Fallback to mock data if database load fails
        setSpecialOffers([]);
        setContactInfo(mockContactInfo);
        setWebsiteSettings(mockWebsiteSettings);
      }
    };

    loadWebsiteData();
  }, []); // Load once on mount

  // fetch agencies for public website mode (used by ReservationWizard)
  useEffect(() => {
    if (!isWebsiteMode) return;

    const loadAgencies = async () => {
      try {
        const dbAgencies = await DatabaseService.getAgencies();
        setAgencies(dbAgencies.length > 0 ? dbAgencies : mockAgencies);
      } catch (err) {
        console.error('Failed to load agencies for website:', err);
        setAgencies(mockAgencies);
      } finally {
        setIsLoadingAgenciesForWebsite(false);
      }
    };

    loadAgencies();
  }, [isWebsiteMode]);

  // Define mock data immediately (used as fallback)
  const mockCars: Car[] = [
    {
      id: '1',
      brand: 'Toyota',
      model: 'Prius',
      registration: 'AB-123-CD',
      year: 2021,
      color: 'Blanc',
      vin: 'VIN123456',
      energy: 'Hybride',
      transmission: 'Automatique',
      seats: 5,
      doors: 4,
      priceDay: 5000,
      priceWeek: 28000,
      priceMonth: 90000,
      deposit: 50000,
      images: ['https://images.unsplash.com/photo-1560958089-b8a63dd8aa8b?w=500&h=400&fit=crop'],
      mileage: 45000,
    },
    {
      id: '2',
      brand: 'Mercedes',
      model: 'E-Class',
      registration: 'AB-456-EF',
      year: 2022,
      color: 'Noir',
      vin: 'VIN789012',
      energy: 'Essence',
      transmission: 'Automatique',
      seats: 5,
      doors: 4,
      priceDay: 12000,
      priceWeek: 70000,
      priceMonth: 200000,
      deposit: 100000,
      images: ['https://images.unsplash.com/photo-1552820728-8ac41f1ce891?w=500&h=400&fit=crop'],
      mileage: 23000,
    },
    {
      id: '3',
      brand: 'BMW',
      model: 'X5',
      registration: 'AB-789-GH',
      year: 2023,
      color: 'Gris',
      vin: 'VIN345678',
      energy: 'Essence',
      transmission: 'Automatique',
      seats: 7,
      doors: 4,
      priceDay: 15000,
      priceWeek: 85000,
      priceMonth: 250000,
      deposit: 125000,
      images: ['https://images.unsplash.com/photo-1605559424843-9e4c3ff86981?w=500&h=400&fit=crop'],
      mileage: 5000,
    },
  ];

  const mockAgencies: Agency[] = [
    {
      id: '1',
      name: 'Luxdrive Alger Centre',
      address: 'Boulevard Didouche Mourad',
      city: 'Alger',
      createdAt: new Date().toISOString(),
    },
    {
      id: '2',
      name: 'Luxdrive Oran',
      address: 'Boulevard Khémisti',
      city: 'Oran',
      createdAt: new Date().toISOString(),
    },
    {
      id: '3',
      name: 'Luxdrive Annaba',
      address: 'Rue Larbi Ben Mhidi',
      city: 'Annaba',
      createdAt: new Date().toISOString(),
    },
  ];

  const mockContactInfo = {
    facebook: 'https://facebook.com/luxdrive',
    instagram: '@luxdrive_dz',
    tiktok: '@luxdrive',
    whatsapp: '+213 5 1234 5678',
    phone: '+213 5 1234 5678',
    address: 'Alger, Algeria',
    email: 'contact@luxdrive.com',
  };

  const mockWebsiteSettings = {
    name: 'Luxdrive Premium',
    description: 'Votre partenaire de confiance en location de véhicules',
    logo: 'https://images.unsplash.com/photo-1560958089-b8a63dd8aa8b?w=200&h=200&fit=crop',
  };

  const handleLogin = (userObj: User) => {
    console.log('[Auth] ======= LOGIN HANDLER STARTED =======');
    console.log('[Auth] User logged in:', { name: userObj.name, role: userObj.role, email: userObj.email });
    console.log('[Auth] Current localStorage state:', {
      has_token: !!localStorage.getItem('supabase.auth.token'),
      token_preview: localStorage.getItem('supabase.auth.token')?.substring(0, 50) + '...'
    });
    setUser(userObj);
    // Add a delay before rendering dashboard to let Supabase settle
    setTimeout(() => {
      console.log('[Auth] 500ms delay complete, setting isAuthLoading to false');
      setIsAuthLoading(false);
    }, 500);
  };

  // Session restoration on app mount - use new session service
  useEffect(() => {
    if (authListenerInitialized.current) {
      console.log('[Auth] Session restoration already initialized, skipping');
      return;
    }

    authListenerInitialized.current = true;

    const restoreSession = async () => {
      console.log('\n[Auth] ======= SESSION RESTORATION STARTED =======');
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[Auth] Timestamp: ${timestamp}`);

      try {
        // Initialize session using new session service
        const session = await sessionService.initializeSession();

        if (!session) {
          console.log('[Auth] === No valid session found ===');
          setIsAuthLoading(false);
          return;
        }

        // CRITICAL: Sync the restored session with Supabase Auth SDK
        // This ensures Supabase queries work after page refresh
        console.log('[Auth] === Syncing session with Supabase ===');
        try {
          await supabase.auth.setSession({
            access_token: session.accessToken,
            refresh_token: session.refreshToken || ''
          });
          console.log('[Auth] Supabase session synchronized');
        } catch (syncError) {
          console.warn('[Auth] Failed to sync with Supabase:', syncError);
          // Continue anyway - local session is still valid
        }

        // Session restored from database/localStorage
        console.log('[Auth] === Session restored successfully ===');
        console.log('[Auth] User:', session.name, 'Role:', session.role);

        const userObj: User = {
          name: session.name,
          email: session.email,
          role: session.role as UserRole,
          avatar: '' // Add avatar property
        };

        setUser(userObj);
        console.log('[Auth] User state updated, ready to render dashboard');

        // Give React time to process state update before marking loading complete
        setTimeout(() => {
          console.log('[Auth] Setting isAuthLoading to false');
          setIsAuthLoading(false);
        }, 100);

      } catch (error) {
        console.error('[Auth] Session restoration error:', error);
        setUser(null);
        setIsAuthLoading(false);
      }
    };

    restoreSession();

    return () => {
      // No cleanup needed
    };
  }, []);

  const handleLogout = async () => {
    console.log('[Auth] Logout handler called');
    await sessionService.invalidateSession();
    await supabase.auth.signOut();
    setUser(null);
    navigate('/login');
  };

  /**
   * Voitures transmises au site public.
   *
   * La protection principale est structurelle : `car_owners` n'a aucune policy
   * pour le rôle `anon`. Ceci est la ceinture côté front — on retire tout champ
   * propriétaire avant qu'il ne puisse atteindre un composant du site.
   */
  const publicCars = (cars.length > 0 ? cars : mockCars)
    .filter(car => car.isHiddenFromSite !== true)
    .map(({ ownerInfo, ...rest }) => ({ ...rest, ownerInfo: undefined }));

  const protectedProps: DashboardLayoutProps = {
    lang,
    setLang,
    user,
    isAuthLoading,
    activeTab,
    onTabChange: handleTabChange,
    isSidebarVisible,
    setIsSidebarVisible,
    onLogout: handleLogout,
    maintenanceAlertsCount,
    webOrdersCount,
    cars,
  };

  return (
    <PermissionsProvider user={user}>
    <Routes>
      {/* Website route */}
      <Route path="/website" element={
        <Website
          lang={lang}
          onLangChange={setLang}
          // Le site public exclut les voitures masquées (isHiddenFromSite)
          cars={publicCars}
          agencies={agencies.length > 0 ? agencies : mockAgencies}
          isLoadingAgencies={isLoadingAgenciesForWebsite}
          specialOffers={specialOffers}
          contactInfo={contactInfo}
          websiteSettings={websiteSettings}
        />
      } />

      {/* Login route */}
      <Route path="/login" element={
        isAuthLoading ? (
          <LoadingScreen />
        ) : user ? (
          <Navigate to="/dashboard" replace />
        ) : (
          <Login lang={lang} onLogin={handleLogin} />
        )
      } />

      {/* Dashboard and all interface routes - all protected */}
      <Route path="/dashboard" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/planificateur" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/gains-vehicule" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/caisse" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/vehicules" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/maintenance" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/clients" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/equipe" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/depenses" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/website-management" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/website-reservations" element={<ProtectedRoute {...protectedProps} />} />
      {/* Ancienne URL — conservée pour les favoris déjà enregistrés. */}
      <Route path="/website-commandes" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/protection-services" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/reservations" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/rapports" element={<ProtectedRoute {...protectedProps} />} />
      <Route path="/configuration" element={<ProtectedRoute {...protectedProps} />} />

      {/* Les deux interfaces retirées : on redirige plutôt que de laisser un 404
          sur un favori existant. */}
      <Route path="/agences" element={<Navigate to="/planificateur" replace />} />
      <Route path="/personalisation" element={<Navigate to="/configuration" replace />} />

      {/* Default redirect */}
      <Route path="/" element={
        isAuthLoading ? <LoadingScreen /> : <Navigate to={user ? "/dashboard" : "/login"} replace />
      } />

      {/* Fallback for unknown routes */}
      <Route path="*" element={
        isAuthLoading ? <LoadingScreen /> : <Navigate to={user ? "/dashboard" : "/login"} replace />
      } />
    </Routes>
    </PermissionsProvider>
  );
}
