import { Language } from '../types';

/**
 * CATALOGUE DES PERMISSIONS
 * ─────────────────────────
 * Une permission = un couple (interface, action).
 *
 *  - `page`   : l'id d'un élément de SIDEBAR_ITEMS. Cochée, l'interface apparaît
 *               dans la barre latérale de l'employé.
 *  - `action` : un bouton d'action DANS cette interface. Décochée, le bouton
 *               n'est pas rendu du tout (on ne se contente pas de le griser :
 *               un bouton visible mais mort est une invitation à réessayer).
 *
 * La clé stockée en base est la chaîne `"<pageId>:<actionId>"`. Un employé sans
 * aucune permission ne voit qu'un écran d'accueil vide : c'est volontaire —
 * l'admin ouvre les droits explicitement depuis Équipe → Permissions.
 *
 * L'administrateur n'est jamais filtré (cf. `can()` dans utils/permissions.ts).
 */

export interface PermissionAction {
  id: string;
  label: { fr: string; ar: string };
}

export interface PermissionPage {
  /** id d'un SIDEBAR_ITEMS */
  id: string;
  label: { fr: string; ar: string };
  icon: string;
  actions: PermissionAction[];
}

const A = (id: string, fr: string, ar: string): PermissionAction => ({ id, label: { fr, ar } });

/** Actions présentes sur presque toutes les interfaces de liste. */
const VIEW = A('view', 'Consulter le détail', 'عرض التفاصيل');
const CREATE = A('create', 'Créer', 'إنشاء');
const EDIT = A('edit', 'Modifier', 'تعديل');
const DELETE = A('delete', 'Supprimer', 'حذف');
const EXPORT = A('export', 'Exporter / Imprimer', 'تصدير / طباعة');

export const PERMISSION_PAGES: PermissionPage[] = [
  {
    id: 'dashboard',
    label: { fr: 'Tableau de bord', ar: 'لوحة القيادة' },
    icon: '📊',
    actions: [
      A('stats', 'Voir les statistiques financières', 'عرض الإحصائيات المالية'),
      A('alerts', 'Voir les alertes maintenance', 'عرض تنبيهات الصيانة'),
    ],
  },
  {
    id: 'planner',
    label: { fr: 'Planificateur', ar: 'المخطط' },
    icon: '📅',
    actions: [
      CREATE,
      VIEW,
      EDIT,
      A('activate', 'Activer une réservation', 'تفعيل الحجز'),
      A('complete', 'Clôturer une réservation', 'إنهاء الحجز'),
      A('cancel', 'Annuler une réservation', 'إلغاء الحجز'),
      A('payment', 'Enregistrer un paiement', 'تسجيل دفعة'),
      A('print', 'Imprimer les documents', 'طباعة المستندات'),
      DELETE,
    ],
  },
  {
    id: 'reservations',
    label: { fr: 'Contrats', ar: 'العقود' },
    icon: '🧾',
    actions: [VIEW, A('print', 'Imprimer le contrat', 'طباعة العقد'), A('send', 'Envoyer par e-mail', 'إرسال بالبريد'), DELETE],
  },
  {
    id: 'vehicles',
    label: { fr: 'Véhicules', ar: 'المركبات' },
    icon: '🚗',
    actions: [
      CREATE,
      VIEW,
      EDIT,
      DELETE,
      A('prices', 'Voir et modifier les tarifs', 'عرض وتعديل الأسعار'),
      A('owner', 'Voir les infos propriétaire (conciergerie)', 'عرض معلومات المالك'),
      A('visibility', 'Afficher / masquer sur le site', 'إظهار / إخفاء في الموقع'),
    ],
  },
  {
    id: 'maintenance',
    label: { fr: 'Maintenance', ar: 'الصيانة' },
    icon: '🔧',
    actions: [
      CREATE,
      VIEW,
      EDIT,
      DELETE,
      A('expense', 'Créer une dépense véhicule', 'إنشاء مصروف للمركبة'),
    ],
  },
  {
    id: 'clients',
    label: { fr: 'Clients', ar: 'العملاء' },
    icon: '👥',
    actions: [CREATE, VIEW, EDIT, DELETE, A('history', 'Voir l\'historique de location', 'عرض سجل الإيجار')],
  },
  {
    id: 'team',
    label: { fr: 'Équipe', ar: 'الفريق' },
    icon: '🤝',
    actions: [
      CREATE,
      VIEW,
      EDIT,
      DELETE,
      A('permissions', 'Gérer les permissions', 'إدارة الصلاحيات'),
      A('advance', 'Gérer les acomptes', 'إدارة السلف'),
      A('absence', 'Gérer les absences', 'إدارة الغيابات'),
      A('payment', 'Gérer les paiements', 'إدارة الرواتب'),
    ],
  },
  {
    id: 'expenses',
    label: { fr: 'Dépenses', ar: 'المصاريف' },
    icon: '📉',
    actions: [
      A('create-vehicle', 'Créer une dépense véhicule', 'إنشاء مصروف مركبة'),
      A('create-store', 'Créer une dépense magasin', 'إنشاء مصروف المحل'),
      VIEW,
      EDIT,
      DELETE,
      EXPORT,
    ],
  },
  {
    id: 'web-mgmt',
    label: { fr: 'Website management', ar: 'إدارة الموقع' },
    icon: '🌐',
    actions: [
      EDIT,
      A('offers', 'Gérer les offres spéciales', 'إدارة العروض الخاصة'),
      A('promo', 'Gérer les codes promo', 'إدارة رموز الخصم'),
      A('branding', 'Modifier le logo et les visuels', 'تعديل الشعار والصور'),
    ],
  },
  {
    id: 'web-orders',
    label: { fr: 'Website réservations', ar: 'حجوزات الموقع' },
    icon: '🛒',
    actions: [
      VIEW,
      A('accept', 'Accepter une réservation', 'قبول الحجز'),
      A('reject', 'Refuser une réservation', 'رفض الحجز'),
      DELETE,
    ],
  },
  {
    id: 'car-gains',
    label: { fr: 'Gains par Véhicule', ar: 'الأرباح حسب المركبة' },
    icon: '💰',
    actions: [VIEW, A('detail', 'Voir le détail ligne à ligne', 'عرض التفاصيل'), EXPORT],
  },
  {
    id: 'caisse',
    label: { fr: 'Caisse', ar: 'الصندوق' },
    icon: '🏦',
    actions: [
      A('deposit', 'Enregistrer une entrée', 'تسجيل إيداع'),
      A('withdraw', 'Enregistrer une sortie', 'تسجيل سحب'),
      A('history', 'Consulter l\'historique', 'عرض السجل'),
      EDIT,
      DELETE,
      EXPORT,
    ],
  },
  {
    id: 'reports',
    label: { fr: 'Rapports', ar: 'التقارير' },
    icon: '📄',
    actions: [VIEW, EXPORT],
  },
  {
    id: 'config',
    label: { fr: 'Configuration', ar: 'الإعدادات' },
    icon: '🛠️',
    actions: [
      A('agency', 'Modifier les infos de l\'agence', 'تعديل معلومات الوكالة'),
      A('documents', 'Modifier les modèles de documents', 'تعديل نماذج المستندات'),
      A('conditions', 'Modifier les conditions', 'تعديل الشروط'),
      A('services', 'Gérer services et assurances', 'إدارة الخدمات والتأمينات'),
    ],
  },
];

export const permissionKey = (pageId: string, actionId: string) => `${pageId}:${actionId}`;

/** Toutes les clés du catalogue — sert au bouton « tout cocher ». */
export const ALL_PERMISSION_KEYS = PERMISSION_PAGES.flatMap(p =>
  p.actions.map(a => permissionKey(p.id, a.id)),
);

export const findPermissionPage = (pageId: string) =>
  PERMISSION_PAGES.find(p => p.id === pageId);

export const tr = (l: { fr: string; ar: string }, lang: Language) => l[lang] ?? l.fr;
