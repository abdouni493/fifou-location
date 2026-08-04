export type Language = 'fr' | 'ar';

export type UserRole = 'admin' | 'worker' | 'driver';

export interface User {
  name: string;
  email: string;
  role: UserRole;
  avatar: string;
}

export interface SidebarItem {
  id: string;
  label: {
    fr: string;
    ar: string;
  };
  icon: string;
}

/** 'personal' = véhicule de l'agence · 'consignment' = véhicule confié par un tiers. */
export type OwnershipType = 'personal' | 'consignment';
/** 'amount' = commission fixe en DA · 'percentage' = pourcentage du total de la location. */
export type CommissionType = 'amount' | 'percentage';

/**
 * Données PRIVÉES du propriétaire d'un véhicule en conciergerie.
 * Vit dans la table `car_owners`, qui n'a AUCUNE policy pour le rôle `anon` :
 * ces champs ne doivent jamais atteindre le site public.
 */
export interface CarOwnerInfo {
  id?: string;
  carId: string;
  ownerName: string;          // 👤 privé
  ownerPhone?: string;        // 📞 privé
  internalRef?: string;       // 🚗 CS-001… (généré par la DB, lecture seule côté UI)
  consignmentDate?: string;   // 📅 date de dépôt
  commissionType: CommissionType; // 💰
  commissionValue: number;
  contractUrl?: string;       // 📄 contrat scanné
  privateNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Car {
  id: string;
  brand: string;
  model: string;
  registration: string;
  year: number;
  color: string;
  vin: string;
  energy: string;
  transmission: string;
  seats: number;
  doors: number;
  priceDay: number;
  priceWeek: number;
  priceMonth: number;
  deposit: number;
  /** Tarifs en euros, saisis librement. Absents ⇒ conversion du tarif DZD au taux courant. */
  priceDayEur?: number;
  priceWeekEur?: number;
  priceMonthEur?: number;
  depositEur?: number;
  images: string[];
  mileage: number;
  fuelLevel?: 'full' | 'half' | 'quarter' | 'eighth' | 'empty';
  // Statut dérivé des réservations réelles (calculé par getCarsWithRealStatus).
  // Seul 'maintenance' peut être saisi manuellement en base.
  status?: 'disponible' | 'reserve' | 'louer' | 'maintenance';
  // Masquée du site public (visible par défaut). Les vues admin l'affichent quand même.
  isHiddenFromSite?: boolean;
  /** Défaut 'personal' côté DB. */
  ownershipType?: OwnershipType;
  /** Texte PUBLIC affiché sur le site. */
  description?: string;
  /** Chargé UNIQUEMENT par les pages admin (getCarsWithOwners). Jamais côté site public. */
  ownerInfo?: CarOwnerInfo | null;
}

export type ExpenseType = 'vidange' | 'assurance' | 'controle' | 'chaine' | 'autre';

export interface Expense {
  id: string;
  carId: string;
  type: ExpenseType;
  cost: number;
  date: string;
  note?: string;
  // Specific fields
  nextVidangeKm?: number;
  expirationDate?: string;
  name?: string; // For 'autre'
}

export interface Rental {
  id: string;
  carId: string;
  clientId: string;
  clientName?: string;
  startDate: string;
  endDate: string;
  totalCost: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
}

export interface Agency {
  id: string;
  name: string;
  address: string;
  city: string;
  createdAt?: string;
}

export interface Client {
  id: string;
  // Personal Information
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;

  // Official Documents
  idCardNumber?: string;
  licenseNumber: string;
  licenseExpirationDate?: string;
  licenseDeliveryDate?: string;
  licenseDeliveryPlace?: string;

  // Additional Documents
  documentType?: 'id_card' | 'passport' | 'none';
  documentNumber?: string;
  documentDeliveryDate?: string;
  documentExpirationDate?: string;
  documentDeliveryAddress?: string;

  // Address & Location
  wilaya: string;
  completeAddress?: string;

  // Media
  profilePhoto?: string;
  scannedDocuments?: string[];

  createdAt: string;
  agencyId?: string;
}

export type PaymentType = 'daily' | 'monthly';

export interface WorkerAdvance {
  id: string;
  amount: number;
  date: string;
  note?: string;
}

export interface WorkerAbsence {
  id: string;
  cost: number;
  date: string;
  note?: string;
}

export interface WorkerPayment {
  id: string;
  amount: number;
  date: string;
  baseSalary: number;
  advances: number;
  absences: number;
  netSalary: number;
  note?: string;
  /** Période couverte par le règlement — sert à savoir ce qui reste dû. */
  periodStart?: string;
  periodEnd?: string;
}

/** Rôle d'employé : un libellé libre créé par l'admin. Il ne porte aucun droit. */
export interface WorkerRole {
  id: string;
  name: string;
  createdAt?: string;
}

export interface Worker {
  id: string;
  // Personal Information
  fullName: string;
  dateOfBirth?: string;
  phone: string;
  email: string;
  address?: string;
  profilePhoto?: string;
  /** Numéro de carte d'identité — facultatif. */
  idCardNumber?: string;

  // Work Information
  type: 'admin' | 'worker' | 'driver';
  /** Libellé du rôle choisi/créé par l'admin (indépendant de `type`). */
  roleName?: string;
  /** Date d'entrée en fonction — origine du calcul des périodes dues. */
  startDate?: string;
  /** L'employé est-il rémunéré ? Faux ⇒ ni salaire, ni acompte, ni paie. */
  paymentEnabled?: boolean;
  paymentType?: PaymentType;
  baseSalary: number;

  // Login Credentials
  /** Un compte de connexion existe-t-il pour cet employé ? */
  accountEnabled?: boolean;
  username: string;
  password: string;
  /** id dans auth.users quand un compte Supabase a été créé. */
  authUserId?: string;

  /** Droits accordés : clés « page:action » (cf. constants/permissions.ts). */
  permissions?: string[];

  // Records
  advances: WorkerAdvance[];
  absences: WorkerAbsence[];
  payments: WorkerPayment[];

  createdAt: string;
}

/** Un mouvement d'espèces saisi manuellement dans la Caisse. */
export interface CaisseTransaction {
  id: string;
  type: 'deposit' | 'withdraw';
  amount: number;
  date: string;
  description?: string;
  createdBy?: string;
  createdAt: string;
}
export interface StoreExpense {
  id: string;
  name: string;
  cost: number;
  date: string;
  note?: string;
  icon?: string;
  createdAt: string;
}

export interface VehicleExpense {
  id: string;
  carId: string;
  type: ExpenseType;
  cost: number;
  date: string;
  note?: string;
  currentMileage?: number;
  nextVidangeKm?: number;
  expirationDate?: string;
  expenseName?: string;
  createdAt: string;
  // Filtres changés lors d'une vidange (optionnels : anciennes lignes sans donnée).
  oilFilterChanged?: boolean;
  airFilterChanged?: boolean;
  fuelFilterChanged?: boolean;
  acFilterChanged?: boolean;
}

export interface ReservationStep1 {
  carId: string;
  departureDate: string;
  departureTime: string;
  departureAgency: string;
  returnDate: string;
  returnTime: string;
  returnAgency: string;
  differentReturnAgency: boolean;
}

export interface ReservationStep2 {
  photo?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  licenseNumber: string;
  licenseExpiration?: string;
  licenseDelivery?: string;
  licenseDeliveryPlace?: string;
  additionalDocType?: 'id_card' | 'passport' | 'none';
  additionalDocNumber?: string;
  additionalDocDelivery?: string;
  additionalDocExpiration?: string;
  additionalDocDeliveryAddress?: string;
  wilaya: string;
  completeAddress?: string;
  scannedDocuments?: string[];
}

export interface Reservation {
  id: string;
  step1: ReservationStep1;
  step2: ReservationStep2;
  carInfo: Car;
  totalDays: number;
  totalPrice: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: string;
}

// Une offre spéciale est une PROMOTION attachée à une voiture existante.
// isActive = affichée sur le site (le toggle masquer/afficher) ;
// startDate/endDate (optionnelles) limitent la période de validité de la promo.
export interface SpecialOffer {
  id: string;
  carId: string;
  car: Car;
  oldPrice: number;
  newPrice: number;
  note?: string;
  isActive: boolean;
  createdAt: string;
  label?: string;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  startDate?: string;
  endDate?: string;
}

export interface ContactInfo {
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  whatsapp?: string;
  phone?: string;
  address?: string;
  email?: string;
}

export interface WebsiteSettings {
  name: string;
  description: string;
  /** Logo principal : barre latérale de l'admin + en-tête des documents imprimés. */
  logo?: string;
  /**
   * Logo dédié à la barre de navigation du site public (fond noir, format large).
   * Vide → le site retombe sur `logo`.
   */
  navbar_logo?: string;
  phone_number_2?: string;
  bank_number?: string;
  address?: string;
  phone?: string;
  /** Image de fond du landing du site public (URL storage, affichée floutée). */
  landing_background?: string;
}

/**
 * Identité de l'agence, normalisée depuis `website_settings` (source unique).
 *
 * Les gabarits d'impression ont été écrits à des époques différentes et lisent
 * la même donnée sous trois orthographes (`name`, `agency_name`, `agencyName`).
 * Plutôt que de réécrire tous les modèles — y compris ceux enregistrés en base
 * par l'éditeur de documents — on expose chaque alias.
 */
export interface AgencyBranding {
  name: string;
  agency_name: string;
  agencyName: string;
  /** Wordmark sur fond noir : en-tête des documents imprimés. */
  logo: string;
  agency_logo: string;
  /**
   * Écusson détouré (`website_settings.navbar_logo`) : navbar du site, mais
   * aussi barre latérale et page de connexion, où le wordmark noir ne tient pas
   * dans une pastille. Vide → on retombe sur `logo`.
   */
  navbar_logo: string;
  address: string;
  agency_address: string;
  phone: string;
  agency_phone: string;
  phone_number_2: string;
  bank_number: string;
  description: string;
  slogan: string;
}

// Code promo utilisable sur la réservation du site public
export interface PromoCode {
  id: string;
  code: string;
  discountPercentage: number;
  isActive: boolean;
  isUsed: boolean;
  usedAt?: string | null;
  reservationId?: string | null;
  createdAt: string;
}

// Planner Types
export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  idCardNumber?: string;
  licenseNumber: string;
  licenseExpiration?: string;
  licenseDelivery?: string;
  licenseDeliveryPlace?: string;
  additionalDocType?: 'id_card' | 'passport' | 'none';
  additionalDocNumber?: string;
  additionalDocDelivery?: string;
  additionalDocExpiration?: string;
  additionalDocDeliveryAddress?: string;
  wilaya: string;
  completeAddress?: string;
  scannedDocuments?: string[];
  profilePhoto?: string;
  createdAt: string;
}

export interface InspectionItem {
  id: string;
  category: 'security' | 'equipment' | 'comfort' | 'cleanliness';
  name: string;
  checked: boolean;
}

export interface VehicleInspection {
  id: string;
  reservationId: string;
  type: 'departure' | 'return';
  mileage: number;
  fuelLevel: 'full' | 'half' | 'quarter' | 'eighth' | 'empty';
  location: string;
  date: string;
  time: string;
  interiorPhotos: string[];
  exteriorPhotos: string[];
  inspectionItems: InspectionItem[];
  notes: string;
  signature?: string;
  createdAt: string;
}

export interface Payment {
  id: string;
  reservationId: string;
  amount: number;
  date: string;
  method: 'cash' | 'card' | 'transfer' | 'check';
  note?: string;
  createdAt: string;
}

export interface AdditionalService {
  id: string;
  category: 'decoration' | 'equipment' | 'insurance' | 'service';
  name: string;
  description?: string;
  price: number;
  selected: boolean;
  // Alias des colonnes `reservation_services` : un service peut provenir du
  // catalogue (name/id) ou d'un snapshot déjà enregistré (service_name/service_id).
  service_name?: string;
  service_id?: string;
  /** ID du service maître dont ce snapshot est issu. */
  originalServiceId?: string;
}

// Un item d'un forfait d'assurance de protection (avec son statut vrai/faux).
export interface ProtectionAssuranceItem {
  linkId?: string;
  itemId: string;
  name: string;
  status: boolean;
  displayOrder?: number;
}

// Un forfait d'assurance de protection (nom + prix/jour + liste d'items).
export interface ProtectionAssurance {
  id: string;
  name: string;
  pricePerDay: number;
  isActive: boolean;
  createdAt: string;
  items: ProtectionAssuranceItem[];
}

export interface ReservationDetails {
  id: string;
  clientId: string;
  client: Client;
  carId: string;
  car: Car;
  step1: ReservationStep1;
  step2: ReservationStep2;
  additionalServices: AdditionalService[];
  deposit: number;
  totalDays: number;
  /** Montants de référence, toujours en dinars, quelle que soit `paymentCurrency`. */
  totalPrice: number;
  discountAmount: number;
  discountType: 'percentage' | 'fixed';
  advancePayment: number;
  remainingPayment: number;
  /** Devise réglée par le client. Les colonnes DZD restent la référence comptable. */
  paymentCurrency?: 'DZD' | 'EUR';
  /** Contreparties en euros — renseignées seulement quand `paymentCurrency === 'EUR'`. */
  totalPriceEur?: number | null;
  advancePaymentEur?: number | null;
  remainingPaymentEur?: number | null;
  /** Taux DA/€ appliqué à la réservation (caution ET total). */
  euroRate?: number;
  /** Caution : montant de référence en dinars + devise dans laquelle elle est prise. */
  cautionEnabled?: boolean;
  cautionAmountDzd?: number;
  cautionCurrency?: 'DZD' | 'EUR';
  status: 'pending' | 'accepted' | 'confirmed' | 'active' | 'completed' | 'cancelled';
  // Forfait d'assurance de protection sélectionné (snapshot + référence).
  protectionAssuranceId?: string;
  protectionAssuranceName?: string;
  protectionAssurancePrice?: number; // prix/jour au moment de la réservation
  protectionAssurance?: ProtectionAssurance; // détail (items) chargé pour l'affichage
  departureInspection?: VehicleInspection;
  returnInspection?: VehicleInspection;
  payments: Payment[];
  excessMileage?: number;
  missingFuel?: number;
  additionalFees: number;
  /** Frais de livraison du véhicule (DA). 0 = pas de livraison. */
  deliveryFee?: number;
  /**
   * Qui paie la livraison. Fixé par un trigger DB à partir de `totalDays` :
   * >= 10 jours → 'owner' (propriétaire), sinon 'client'. Null si `deliveryFee` = 0.
   */
  deliveryFeePayer?: 'client' | 'owner';
  /**
   * CONCIERGERIE — commission de l'agence (DA), figée par trigger DB à la
   * clôture de la location (`commission_amount`). Absente sur les locations
   * non terminées ou les véhicules personnels.
   */
  commissionAmount?: number;
  tvaApplied: boolean;
  notes?: string;
  conditions?: string;
  createdAt: string;
  activatedAt?: string;
  completedAt?: string;
  createdBy?: string;
  createdByName?: string;
  /** Origine de la réservation : 'website' (site public) ou 'agency' (admin). */
  source?: 'website' | 'agency';
}

// ─── Assistant de création / édition de réservation ──────────────────────────
// `ReservationDetails` décrit une réservation *persistée*. Les formulaires, eux,
// manipulent une structure par étapes qui n'a jamais correspondu à ce type — d'où
// les centaines d'erreurs `tsc` sur `step2.selectedCar`, `step6.*`, etc.
// `ReservationWizardData` décrit la forme réelle du state des deux wizards.

export interface ReservationWizardStep1 {
  departureDate: string;
  departureTime: string;
  returnDate: string;
  returnTime: string;
  /** Source de vérité pour résoudre l'agence (le libellé peut être édité/traduit). */
  departureAgencyId?: string;
  returnAgencyId?: string;
  /** Libellés d'affichage uniquement — jamais utilisés pour retrouver l'agence. */
  departureLocation?: string;
  returnLocation?: string;
  /** Champs hérités : id d'agence porté par une réservation déjà enregistrée. */
  departureAgency?: string;
  returnAgency?: string;
  /** L'agence de retour diffère de celle du départ. */
  differentReturnAgency?: boolean;
}

/** Étape « Tarification finale » (step6) du wizard. */
export interface ReservationWizardPricing {
  basePrice?: number;
  totalPrice?: number;
  isManualTotal?: boolean;
  manualTotal?: number | string;
  tvaApplied?: boolean;
  tvaAmount?: number;
  additionalFees?: number;
  /** Frais de livraison (DA). Le payeur découle de la durée — cf. utils/deliveryFee. */
  deliveryFee?: number;
  advancePayment?: number;
  remainingPayment?: number;
  deposit?: number;
  notes?: string;
  paymentNotes?: string;
  cautionEnabled?: boolean;
  cautionCurrency?: 'DZD' | 'EUR';
  euroAmount?: number | string;
  euroRate?: number;
  caution_amount_dzd?: number;
  assuranceEnabled?: boolean;
  assurancePercentage?: number | string;
  assuranceAmount?: number;
  finalTotal?: number;
}

/**
 * Inspection telle que manipulée par le wizard : elle provient soit du
 * formulaire (camelCase), soit d'une ligne DB déjà chargée (snake_case).
 */
export interface WizardInspection extends Partial<VehicleInspection> {
  otherPhotos?: string[];
  other_photos?: string[];
  client_signature?: string;
}

export interface ReservationWizardData {
  id?: string;
  step1: ReservationWizardStep1;
  /** L'édition conserve aussi le snapshot client saisi à l'étape 2. */
  step2: { selectedCar: Car | null } & Partial<ReservationStep2>;
  step3: { departureInspection: WizardInspection | null; selectedDriver?: Worker | null };
  step4: { selectedClient: Client | null };
  step5: { additionalServices: AdditionalService[] };
  step6: ReservationWizardPricing;

  // Champs à plat conservés depuis une réservation existante (mode édition/inspection).
  clientId?: string;
  carId?: string;
  car?: Car;
  client?: Client;
  status?: ReservationDetails['status'];
  deposit?: number;
  totalDays?: number;
  totalPrice?: number;
  discountAmount?: number;
  discountType?: 'percentage' | 'fixed';
  additionalFees?: number;
  advancePayment?: number;
  remainingPayment?: number;
  excessMileage?: number;
  missingFuel?: number;
  tvaApplied?: boolean;
  notes?: string;
  conditions?: string;
  payments?: Payment[];
  additionalServices?: AdditionalService[];
  protectionAssurance?: ProtectionAssurance | null;
  departureInspection?: VehicleInspection;
  returnInspection?: VehicleInspection;
  createdAt?: string;
  activatedAt?: string;
  completedAt?: string;
}

export interface Invoice {
  id: string;
  reservationId: string;
  clientId: string;
  clientName: string;
  carId: string;
  carInfo: string;
  invoiceNumber: string;
  date: string;
  subtotal: number;
  tvaAmount: number;
  additionalFees: number;
  totalAmount: number;
  totalPaid: number;
  remainingAmount: number;
  status: 'paid' | 'partial' | 'unpaid';
  type: 'invoice' | 'quote' | 'contract';
  payments: Payment[];
  createdAt: string;
}

export interface MaintenanceAlert {
  id: string;
  carId: string;
  carInfo: string;
  type: 'vidange' | 'assurance' | 'controle' | 'chaine';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  dueDate?: string;
  isExpired: boolean;
  daysUntilDue?: number;
  currentMileage?: number;
  nextServiceMileage?: number;
  createdAt: string;
}

export interface DashboardStats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalReservations: number;
  activeReservations: number;
  totalClients: number;
  totalCars: number;
  availableCars: number;
  /** Véhicules appartenant à l'agence (ownershipType !== 'consignment'). */
  personalCars: number;
  /** Véhicules confiés par des propriétaires tiers (ownershipType === 'consignment'). */
  consignmentCars: number;
  maintenanceAlerts: number;
  overduePayments: number;
  recentReservations: ReservationDetails[];
  revenueByMonth: { month: string; revenue: number }[];
  carUtilization: { carId: string; carInfo: string; utilization: number }[];
}

export interface WebsiteOrder {
  id: string;
  carId: string;
  car: Car;
  step1: ReservationStep1;
  step2: ReservationStep2;
  step3: {
    additionalServices: AdditionalService[];
  };
  totalDays: number;
  /** Toujours en dinars : devise de référence, quelle que soit `paymentCurrency`. */
  totalPrice: number;
  servicesTotal: number;
  /** Devise choisie par le client au moment de la commande. */
  paymentCurrency: 'DZD' | 'EUR';
  /** Total en euros — renseigné seulement quand `paymentCurrency === 'EUR'`. */
  totalPriceEur?: number;
  /** Taux DA/€ appliqué à cette commande. */
  euroRate: number;
  // Assurance de protection sélectionnée
  protectionAssurance?: ProtectionAssurance;
  protectionAssuranceName?: string;
  assuranceTotal?: number;
  // 'website_reservation' = nouvelle commande du site en attente d'acceptation.
  // Une fois acceptée elle devient 'pending' (réservation du planificateur) ;
  // annulée elle passe à 'cancelled'.
  status: 'website_reservation' | 'pending' | 'accepted' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
  createdAt: string;
  source: 'website';
}

// Document Template Types
export type DocumentType = 'contrat' | 'devis' | 'facture' | 'recu' | 'engagement';

export interface DocumentField {
  x: number;
  y: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
  textAlign?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  maxWidth?: number;
  customText?: string; // For custom text blocks
  width?: number; // For images like logo
  height?: number; // For images like logo
  text?: string; // For dynamic text content
}

export interface DocumentTemplate {
  [key: string]: DocumentField;
}

export interface DocumentTemplates {
  contrat?: DocumentTemplate;
  devis?: DocumentTemplate;
  facture?: DocumentTemplate;
  recu?: DocumentTemplate;
  engagement?: DocumentTemplate;
}

export interface AgencySettings {
  id: string;
  agencyName: string;
  slogan?: string;
  address?: string;
  phone?: string;
  logo?: string;
  documentTemplates?: DocumentTemplates;
  createdAt: string;
  updatedAt: string;
}