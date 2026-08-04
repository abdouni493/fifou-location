import React, { useState, useEffect } from 'react';
import { Language, WebsiteOrder, Car, Agency } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Users, Car as CarIcon, Plus, Search, Filter, Eye, Edit, Trash2, CheckCircle, XCircle, Clock, MapPin, Fuel, Camera, FileText, CreditCard, DollarSign, AlertTriangle, Phone, Mail, User, Loader } from 'lucide-react';
import { DatabaseService } from '../services/DatabaseService';
import { ReservationsService } from '../services/ReservationsService';
import { DEFAULT_EUR_RATE, dzdToEur, formatMoney } from '../utils/currency';
import { useCan } from '../utils/permissions';
import {
  PageHeader, StatCard, StatGrid, SearchInput, Segmented, Badge, ActionBtn,
  EmptyState, LoadingState,
} from './ui/fx';

interface WebsiteOrdersProps {
  lang: Language;
  /** Appelé après acceptation / annulation / suppression d'une commande,
   *  pour permettre au planificateur de se rafraîchir. */
  onOrdersChanged?: () => void;
}

/** Statuts qu'une commande du site prend une fois acceptée par l'agence. */
const ACCEPTED_STATUSES = ['pending', 'accepted', 'confirmed', 'active'];

type OrderTab = 'website_reservation' | 'accepted' | 'completed' | 'cancelled' | 'all';

/** Une commande appartient-elle à l'onglet demandé ? */
const matchesTab = (status: string, tab: OrderTab): boolean => {
  switch (tab) {
    case 'all':      return true;
    case 'accepted': return ACCEPTED_STATUSES.includes(status);
    default:         return status === tab;
  }
};

/**
 * Seules une commande jamais acceptée et une commande annulée peuvent être
 * supprimées. Une fois acceptée, elle vit dans le planificateur : la supprimer
 * ici effacerait la réservation, ses paiements et son contrat.
 */
const isDeletable = (status: string) => status === 'website_reservation' || status === 'cancelled';

/** Pastille de statut (couleur + libellé bilingue) d'une commande du site. */
const statusBadge = (status: string, lang: Language): { className: string; label: string } => {
  if (status === 'cancelled') {
    return { className: 'bg-red-100 text-red-800', label: lang === 'fr' ? '❌ Annulée' : '❌ ملغاة' };
  }
  if (status === 'completed') {
    return { className: 'bg-slate-200 text-slate-700', label: lang === 'fr' ? '✅ Terminée' : '✅ منتهية' };
  }
  if (ACCEPTED_STATUSES.includes(status)) {
    return { className: 'bg-green-100 text-green-800', label: lang === 'fr' ? '✔️ Acceptée' : '✔️ مقبولة' };
  }
  return { className: 'bg-yellow-100 text-yellow-800', label: lang === 'fr' ? '🆕 Nouvelle réservation' : '🆕 حجز جديد' };
};

/** Teinte du badge, dans le vocabulaire du kit fx. */
const statusTone = (status: string): 'red' | 'green' | 'amber' | 'steel' => {
  if (status === 'cancelled') return 'red';
  if (status === 'completed') return 'steel';
  if (ACCEPTED_STATUSES.includes(status)) return 'green';
  return 'amber';
};

export const WebsiteOrders: React.FC<WebsiteOrdersProps> = ({ lang, onOrdersChanged }) => {
  const can = useCan('web-orders');
  const [orders, setOrders] = useState<WebsiteOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  // Par défaut : les commandes qui attendent une décision de l'agence.
  const [filterStatus, setFilterStatus] = useState<OrderTab>('website_reservation');
  const [selectedOrder, setSelectedOrder] = useState<WebsiteOrder | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);

  // Load website orders from database
  useEffect(() => {
    loadWebsiteOrders();
  }, []);

  const loadWebsiteOrders = async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getWebsiteOrders();
      setOrders(data || []);
    } catch (err) {
      console.error('Error loading website orders:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.step2.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.step2.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.car.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.car.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.car.registration || '').toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch && matchesTab(order.status, filterStatus);
  });

  /** Compteur par onglet, calculé sur toutes les commandes du site. */
  const tabCount = (tab: OrderTab) => orders.filter(o => matchesTab(o.status, tab)).length;

  const handleViewDetails = (order: WebsiteOrder) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  const handleConfirmOrder = async (orderId: string) => {
    try {
      setIsProcessing(orderId);

      // Accepter une commande du site : elle passe au statut 'pending' et rejoint
      // le planificateur (avec le badge « 🌐 Site web ») pour l'inspection. Elle
      // reste consultable ici, dans l'onglet « Acceptées ».
      await DatabaseService.updateWebsiteOrderStatus(orderId, 'pending');

      setOrders(prev => prev.map(order =>
        order.id === orderId ? { ...order, status: 'pending' as const } : order
      ));

      if (selectedOrder?.id === orderId) {
        setShowOrderDetails(false);
        setSelectedOrder(null);
      }

      onOrdersChanged?.();
      console.log(`Order ${orderId} accepted → moved to Planner as pending`);
    } catch (err) {
      console.error('Error accepting order:', err);
      alert(lang === 'fr' ? 'Erreur lors de l\'acceptation de la commande' : 'خطأ في قبول الطلب');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      setIsProcessing(orderId);
      
      // Update the website order status in database
      await DatabaseService.updateWebsiteOrderStatus(orderId, 'cancelled');

      // Update local state
      setOrders(prev => prev.map(order =>
        order.id === orderId ? { ...order, status: 'cancelled' as const } : order
      ));

      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: 'cancelled' } : null);
      }

      onOrdersChanged?.();
      console.log(`Order ${orderId} cancelled`);
    } catch (err) {
      console.error('Error cancelling order:', err);
      alert(lang === 'fr' ? 'Erreur lors de l\'annulation de la commande' : 'خطأ في إلغاء الطلب');
    } finally {
      setIsProcessing(null);
    }
  };

  const handleDeleteOrder = (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (order && !isDeletable(order.status)) return;
    setShowDeleteConfirm(orderId);
  };

  const confirmDeleteOrder = async () => {
    if (showDeleteConfirm) {
      try {
        setIsProcessing(showDeleteConfirm);
        
        // Delete from database
        await DatabaseService.deleteWebsiteOrder(showDeleteConfirm);

        // Update local state
        setOrders(prev => prev.filter(order => order.id !== showDeleteConfirm));
        setShowDeleteConfirm(null);
        
        if (selectedOrder?.id === showDeleteConfirm) {
          setSelectedOrder(null);
          setShowOrderDetails(false);
        }
        onOrdersChanged?.();
      } catch (err) {
        console.error('Error deleting order:', err);
        alert(lang === 'fr' ? 'Erreur lors de la suppression de la commande' : 'خطأ في حذف الطلب');
        setShowDeleteConfirm(null);
      } finally {
        setIsProcessing(null);
      }
    }
  };

  return (
    <div className="max-w-[92rem] mx-auto">
      <PageHeader
        icon="🛒"
        eyebrow={lang === 'fr' ? 'Site public' : 'الموقع العام'}
        title={lang === 'fr' ? 'Website réservations' : 'حجوزات الموقع'}
        subtitle={
          lang === 'fr'
            ? 'Réservations reçues depuis le site — à accepter ou à refuser.'
            : 'الحجوزات الواردة من الموقع — للقبول أو الرفض.'
        }
      >
        <div className="flex flex-col sm:flex-row gap-2.5">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={lang === 'fr' ? 'Client, véhicule, n° de réservation…' : 'عميل، مركبة، رقم الحجز…'}
          />
          <Segmented<'website_reservation' | 'accepted' | 'completed' | 'cancelled' | 'all'>
            value={filterStatus}
            onChange={setFilterStatus}
            options={[
              { value: 'website_reservation', label: lang === 'fr' ? 'Nouvelles' : 'جديدة', badge: tabCount('website_reservation') },
              { value: 'accepted', label: lang === 'fr' ? 'Acceptées' : 'مقبولة', badge: tabCount('accepted') },
              { value: 'completed', label: lang === 'fr' ? 'Terminées' : 'منتهية', badge: tabCount('completed') },
              { value: 'cancelled', label: lang === 'fr' ? 'Annulées' : 'ملغاة', badge: tabCount('cancelled') },
              { value: 'all', label: lang === 'fr' ? 'Toutes' : 'الكل', badge: orders.length },
            ]}
          />
        </div>
      </PageHeader>

      {/* ── Chiffres clés ── */}
      <div className="mb-5">
        <StatGrid cols={4}>
          <StatCard
            label={lang === 'fr' ? 'À traiter' : 'للمعالجة'}
            value={tabCount('website_reservation')}
            hint={lang === 'fr' ? 'En attente de décision' : 'بانتظار القرار'}
            icon={<Clock size={15} />}
            tone={tabCount('website_reservation') > 0 ? 'red' : 'green'}
            onClick={() => setFilterStatus('website_reservation')}
          />
          <StatCard
            label={lang === 'fr' ? 'Acceptées' : 'مقبولة'}
            value={tabCount('accepted')}
            icon={<CheckCircle size={15} />}
            tone="green"
            onClick={() => setFilterStatus('accepted')}
          />
          <StatCard
            label={lang === 'fr' ? 'Annulées' : 'ملغاة'}
            value={tabCount('cancelled')}
            icon={<XCircle size={15} />}
            tone="amber"
            onClick={() => setFilterStatus('cancelled')}
          />
          <StatCard
            label={lang === 'fr' ? 'Total reçu' : 'المجموع'}
            value={orders.length}
            icon="🌐"
            tone="steel"
            onClick={() => setFilterStatus('all')}
          />
        </StatGrid>
      </div>

      {/* ── Cartes de réservation ── */}
      {isLoading ? (
        <LoadingState label={lang === 'fr' ? 'Chargement des réservations…' : 'جاري التحميل…'} rows={6} />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon="📭"
          title={lang === 'fr' ? 'Aucune réservation' : 'لا حجوزات'}
          description={
            lang === 'fr'
              ? 'Les réservations passées depuis le site web apparaîtront ici.'
              : 'ستظهر حجوزات الموقع هنا.'
          }
        />
      ) : (
      <div className="fx-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {filteredOrders.map((order) => (
          <motion.div
            key={order.id}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="fx-card flex flex-col relative overflow-hidden"
          >
            {/* Car Image */}
            <div className="relative h-44 overflow-hidden shrink-0">
              <img
                src={order.car?.image_url || order.car?.images?.[0] || 'https://picsum.photos/seed/car/400/300'}
                alt={`${order.car?.brand} ${order.car?.model}`}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(180deg, rgba(8,8,11,0.2) 0%, transparent 42%, rgba(8,8,11,0.9) 100%)' }}
              />
              {/* Client Avatar - Circular with Border */}
              <div
                className="absolute top-3 end-3 w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
                style={{ border: '2px solid var(--fx-red-500)', background: 'var(--fx-black-300)' }}
              >
                {order.step2?.photo ? (
                  <img
                    src={order.step2.photo}
                    alt={`${order.step2.firstName} ${order.step2.lastName}`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : order.step2?.scannedDocuments && order.step2.scannedDocuments.length > 0 ? (
                  <img
                    src={order.step2.scannedDocuments[0]}
                    alt={`${order.step2.firstName} ${order.step2.lastName}`}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="text-2xl">👤</span>
                )}
              </div>
              {/* Status Badge and Website Badge Stack */}
              <div className="absolute top-4 left-4 flex flex-col gap-1">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusBadge(order.status, lang).className}`}>
                  {statusBadge(order.status, lang).label}
                </span>
                <span className="px-2 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 w-fit">
                  🌐 Website
                </span>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Client & Car Info */}
              <div className="space-y-3 mb-4">
                <div>
                  <h3 className="font-bold text-lg text-slate-900">
                    {order.step2.firstName} {order.step2.lastName}
                  </h3>
                  <p className="text-sm text-slate-600">
                    📱 {order.step2.phone}
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900">
                    🚗 {order.car?.brand || 'N/A'} {order.car?.model || 'N/A'}
                  </h4>
                  <p className="text-sm text-slate-600">
                    🏷️ {order.car?.plate_number || 'N/A'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Calendar className="w-4 h-4" />
                  <span>{order.step1.departureDate} → {order.step1.returnDate}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Clock className="w-4 h-4" />
                  <span>{order.totalDays} {lang === 'fr' ? 'jours' : 'أيام'}</span>
                </div>
                
                {/* Pricing Section */}
                <div className="mt-3 fx-well p-3.5">
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: 'var(--fx-ink-mute)' }}>
                        {lang === 'fr' ? 'Total réservation' : 'الإجمالي'}
                      </div>
                      {order.paymentCurrency === 'EUR' ? (
                        <>
                          <div className="text-xl font-black tabular-nums" style={{ color: 'var(--fx-red-200)' }}>
                            {formatMoney(order.totalPriceEur ?? dzdToEur(order.totalPrice, order.euroRate || DEFAULT_EUR_RATE), 'EUR')}
                          </div>
                          <div className="text-[11px]" style={{ color: 'var(--fx-ink-dim)' }}>
                            ≈ {formatMoney(order.totalPrice, 'DZD')}
                          </div>
                        </>
                      ) : (
                        <div className="text-xl font-black tabular-nums" style={{ color: 'var(--fx-red-200)' }}>
                          {formatMoney(order.totalPrice, 'DZD')}
                        </div>
                      )}
                    </div>
                    <div className="text-end space-y-1.5 shrink-0">
                      <Badge tone={statusTone(order.status)}>{statusBadge(order.status, lang).label}</Badge>
                      <div>
                        <Badge tone={order.paymentCurrency === 'EUR' ? 'steel' : 'green'}>
                          {order.paymentCurrency === 'EUR' ? '💶 EUR' : '💵 DZD'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Actions ── */}
              <div className="mt-auto grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {can('view') && (
                  <ActionBtn
                    icon={<Eye size={13} />}
                    label={lang === 'fr' ? 'Détails' : 'تفاصيل'}
                    showLabel
                    className="flex-col !gap-0.5 py-2"
                    disabled={isProcessing === order.id}
                    onClick={() => handleViewDetails(order)}
                  />
                )}

                {can('accept') && (
                  <ActionBtn
                    icon={isProcessing === order.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle size={13} />}
                    label={lang === 'fr' ? 'Accepter' : 'قبول'}
                    showLabel
                    tone="success"
                    className="flex-col !gap-0.5 py-2"
                    disabled={order.status !== 'website_reservation' || isProcessing === order.id}
                    onClick={() => handleConfirmOrder(order.id)}
                  />
                )}

                {can('reject') && (
                  <ActionBtn
                    icon={isProcessing === order.id ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <XCircle size={13} />}
                    label={lang === 'fr' ? 'Refuser' : 'رفض'}
                    showLabel
                    tone="warning"
                    className="flex-col !gap-0.5 py-2"
                    disabled={order.status !== 'website_reservation' || isProcessing === order.id}
                    onClick={() => handleCancelOrder(order.id)}
                  />
                )}

                {/* Une réservation acceptée ou terminée est une location à part
                    entière : la supprimer d'ici effacerait son historique. */}
                {can('delete') && (
                  <ActionBtn
                    icon={<Trash2 size={13} />}
                    label={
                      isDeletable(order.status)
                        ? (lang === 'fr' ? 'Supprimer' : 'حذف')
                        : (lang === 'fr' ? 'Impossible : réservation acceptée' : 'غير ممكن: تم القبول')
                    }
                    showLabel
                    tone="danger"
                    className="flex-col !gap-0.5 py-2"
                    disabled={!isDeletable(order.status) || isProcessing === order.id}
                    onClick={() => handleDeleteOrder(order.id)}
                  />
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      )}

      {/* Order Details Modal */}
      <AnimatePresence>
        {showOrderDetails && selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fx-overlay"
            onClick={() => setShowOrderDetails(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fx-modal sm:max-w-4xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-black text-slate-900">
                    📋 {lang === 'fr' ? 'Détails de la Commande' : 'تفاصيل الطلب'}
                  </h2>
                  <button
                    onClick={() => setShowOrderDetails(false)}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Order Info */}
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-slate-50 to-gray-50 rounded-2xl p-6 border border-slate-200">
                      <h3 className="text-lg font-black text-slate-900 mb-4">
                        📋 {lang === 'fr' ? 'Informations Commande' : 'معلومات الطلب'}
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'N° Commande:' : 'رقم الطلب:'}</span>
                          <span className="font-mono">{selectedOrder.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Date création:' : 'تاريخ الإنشاء:'}</span>
                          <span>{new Date(selectedOrder.createdAt).toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'ar-DZ')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Statut:' : 'الحالة:'}</span>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusBadge(selectedOrder.status, lang).className}`}>
                            {statusBadge(selectedOrder.status, lang).label}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Source:' : 'المصدر:'}</span>
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">
                            🌐 {lang === 'fr' ? 'Site Web' : 'الموقع الإلكتروني'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                      <h3 className="text-lg font-black text-blue-900 mb-4">
                        👤 {lang === 'fr' ? 'Informations Client' : 'معلومات العميل'}
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Nom:' : 'الاسم:'}</span>
                          <span>{selectedOrder.step2.firstName} {selectedOrder.step2.lastName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Téléphone:' : 'الهاتف:'}</span>
                          <span>{selectedOrder.step2.phone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Email:' : 'البريد:'}</span>
                          <span className="text-sm">{selectedOrder.step2.email}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Wilaya:' : 'الولاية:'}</span>
                          <span>{selectedOrder.step2.wilaya}</span>
                        </div>
                        {selectedOrder.step2.completeAddress && (
                          <div className="flex justify-between">
                            <span className="font-bold">{lang === 'fr' ? 'Adresse:' : 'العنوان:'}</span>
                            <span className="text-sm text-right">{selectedOrder.step2.completeAddress}</span>
                          </div>
                        )}
                        {selectedOrder.step2.licenseNumber && (
                          <div className="flex justify-between">
                            <span className="font-bold">{lang === 'fr' ? 'N° Permis:' : 'رقم الرخصة:'}</span>
                            <span>{selectedOrder.step2.licenseNumber}</span>
                          </div>
                        )}
                        {selectedOrder.step2.dateOfBirth && (
                          <div className="flex justify-between">
                            <span className="font-bold">{lang === 'fr' ? 'Date Naissance:' : 'تاريخ الميلاد:'}</span>
                            <span>{selectedOrder.step2.dateOfBirth}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Documents Section */}
                    {selectedOrder.step2.scannedDocuments && selectedOrder.step2.scannedDocuments.length > 0 && (
                      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-200">
                        <h3 className="text-lg font-black text-amber-900 mb-4">
                          📄 {lang === 'fr' ? 'Documents Scannés' : 'الوثائق الممسوحة'}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {selectedOrder.step2.scannedDocuments.map((docUrl, index) => (
                            <div key={index} className="relative group">
                              <img
                                src={docUrl}
                                alt={`${lang === 'fr' ? 'Document' : 'وثيقة'} ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg border border-amber-300 cursor-pointer hover:shadow-lg transition-shadow"
                                onClick={() => window.open(docUrl, '_blank')}
                              />
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <Eye className="w-6 h-6 text-white" />
                                </div>
                              </div>
                              <div className="absolute bottom-2 left-2 bg-amber-600 text-white text-xs px-2 py-1 rounded">
                                {lang === 'fr' ? `Doc ${index + 1}` : `وثيقة ${index + 1}`}
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-sm text-amber-700 mt-3">
                          {lang === 'fr' 
                            ? `📎 ${selectedOrder.step2.scannedDocuments.length} document(s) téléchargé(s) par le client` 
                            : `📎 ${selectedOrder.step2.scannedDocuments.length} وثيقة تم رفعها من قبل العميل`}
                        </p>
                      </div>
                    )}

                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200">
                      <h3 className="text-lg font-black text-green-900 mb-4">
                        🚗 {lang === 'fr' ? 'Informations Véhicule' : 'معلومات المركبة'}
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Modèle:' : 'الموديل:'}</span>
                          <span>{selectedOrder.car?.brand || 'N/A'} {selectedOrder.car?.model || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Immatriculation:' : 'رقم اللوحة:'}</span>
                          <span>{selectedOrder.car?.plate_number || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Couleur:' : 'اللون:'}</span>
                          <span>{selectedOrder.car?.color || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Année:' : 'السنة:'}</span>
                          <span>{selectedOrder.car?.year || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Énergie:' : 'الطاقة:'}</span>
                          <span>{selectedOrder.car?.energy || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Transmission:' : 'النقل:'}</span>
                          <span>{selectedOrder.car?.transmission || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Prix/jour:' : 'السعر/يوم:'}</span>
                          <span>{selectedOrder.car?.price_per_day ? parseInt(selectedOrder.car.price_per_day).toLocaleString() : 'N/A'} DA</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Caution:' : 'الكفالة:'}</span>
                          <span>{selectedOrder.car?.deposit ? parseInt(selectedOrder.car.deposit).toLocaleString() : 'N/A'} DA</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dates & Pricing */}
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-6 border border-purple-200">
                      <h3 className="text-lg font-black text-purple-900 mb-4">
                        📅 {lang === 'fr' ? 'Dates de Location' : 'تواريخ التأجير'}
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Départ:' : 'المغادرة:'}</span>
                          <span>{selectedOrder.step1.departureDate} à {selectedOrder.step1.departureTime}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Retour:' : 'العودة:'}</span>
                          <span>{selectedOrder.step1.returnDate} à {selectedOrder.step1.returnTime}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="font-bold">{lang === 'fr' ? 'Durée:' : 'المدة:'}</span>
                          <span>{selectedOrder.totalDays} {lang === 'fr' ? 'jours' : 'أيام'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-orange-50 to-yellow-50 rounded-2xl p-6 border border-orange-200">
                      <h3 className="text-lg font-black text-orange-900 mb-4">
                        💰 {lang === 'fr' ? 'Tarification & Paiement' : 'التسعير والدفع'}
                      </h3>
                      {(() => {
                        const servicesTotal = selectedOrder.servicesTotal || 0;
                        const carPortion = Math.max(0, selectedOrder.totalPrice - servicesTotal);
                        const payInEur = selectedOrder.paymentCurrency === 'EUR';
                        const rate = selectedOrder.euroRate || DEFAULT_EUR_RATE;
                        // Le total euro convenu fait foi ; à défaut on reconvertit le total DZD.
                        const totalEur = selectedOrder.totalPriceEur ?? dzdToEur(selectedOrder.totalPrice, rate);
                        return (
                          <div className="space-y-3">
                            {/* Devise réglée par le client */}
                            <div className="flex justify-between items-center pb-3 border-b border-orange-300">
                              <span className="font-bold">{lang === 'fr' ? 'Devise de paiement:' : 'عملة الدفع:'}</span>
                              <span className={`px-3 py-1 rounded-full text-sm font-black ${
                                payInEur ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                         : 'bg-emerald-100 text-emerald-800 border border-emerald-300'}`}>
                                {payInEur ? '💶 EUR (€)' : '💵 DZD (DA)'}
                              </span>
                            </div>

                            <div className="flex justify-between">
                              <span className="font-bold">{lang === 'fr' ? 'Prix véhicule:' : 'سعر المركبة:'}</span>
                              <span>
                                {formatMoney(carPortion, 'DZD')}
                                {payInEur && <span className="text-slate-500 ml-2">≈ {formatMoney(dzdToEur(carPortion, rate), 'EUR')}</span>}
                              </span>
                            </div>
                            {servicesTotal > 0 && (
                              <div className="flex justify-between">
                                <span className="font-bold">{lang === 'fr' ? 'Services:' : 'الخدمات:'}</span>
                                <span>
                                  {formatMoney(servicesTotal, 'DZD')}
                                  {payInEur && <span className="text-slate-500 ml-2">≈ {formatMoney(dzdToEur(servicesTotal, rate), 'EUR')}</span>}
                                </span>
                              </div>
                            )}

                            <div className="border-t border-orange-300 pt-3 flex justify-between font-black text-lg">
                              <span>{lang === 'fr' ? 'Total à payer:' : 'المبلغ المستحق:'}</span>
                              <span className="text-orange-600">
                                {payInEur ? formatMoney(totalEur, 'EUR') : formatMoney(selectedOrder.totalPrice, 'DZD')}
                              </span>
                            </div>

                            {/* Contre-valeur + taux : l'agence encaisse en euros mais
                                comptabilise en dinars. */}
                            {payInEur && (
                              <div className="bg-white/70 rounded-xl p-3 border border-orange-200 space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-600">{lang === 'fr' ? 'Contre-valeur en dinars:' : 'ما يعادل بالدينار:'}</span>
                                  <span className="font-bold text-slate-800">{formatMoney(selectedOrder.totalPrice, 'DZD')}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-600">{lang === 'fr' ? 'Taux appliqué:' : 'السعر المطبق:'}</span>
                                  <span className="font-bold text-slate-800">{rate.toLocaleString('fr-FR')} DA / €</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Services */}
                    {selectedOrder.step3.additionalServices.length > 0 && (
                      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 rounded-2xl p-6 border border-indigo-200">
                        <h3 className="text-lg font-black text-indigo-900 mb-4">
                          🛎️ {lang === 'fr' ? 'Services Supplémentaires' : 'الخدمات الإضافية'}
                        </h3>
                        <div className="space-y-2">
                          {selectedOrder.step3.additionalServices.map((service) => (
                            <div key={service.id} className="flex justify-between items-center">
                              <span className="font-bold">{service.name}</span>
                              <span className="text-indigo-700">{service.price.toLocaleString()} DA</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
                  <button
                    onClick={() => setShowOrderDetails(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-lg border border-slate-200 hover:border-slate-300 transition-all"
                  >
                    {lang === 'fr' ? 'Fermer' : 'إغلاق'}
                  </button>
                  {selectedOrder.status === 'website_reservation' && (
                    <>
                      <button
                        onClick={() => {
                          handleCancelOrder(selectedOrder.id);
                        }}
                        className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
                      >
                        ❌ {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                      </button>
                      <button
                        onClick={() => {
                          handleConfirmOrder(selectedOrder.id);
                        }}
                        className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-all text-sm"
                      >
                        ✅ {lang === 'fr' ? 'Accepter' : 'قبول'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fx-overlay"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="fx-modal sm:max-w-md p-6"
            >
              <div className="text-center">
                <div className="text-6xl mb-4">⚠️</div>
                <h3 className="text-xl font-black text-slate-900 mb-2">
                  {lang === 'fr' ? 'Confirmer la Suppression' : 'تأكيد الحذف'}
                </h3>
                <p className="text-slate-600 mb-6">
                  {lang === 'fr' 
                    ? 'Êtes-vous sûr de vouloir supprimer cette commande ? Cette action est irréversible.' 
                    : 'هل أنت متأكد من أنك تريد حذف هذا الطلب؟ هذا الإجراء لا رجعة فيه.'}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(null)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition-colors"
                  >
                    {lang === 'fr' ? 'Annuler' : 'إلغاء'}
                  </button>
                  <button
                    onClick={confirmDeleteOrder}
                    className="flex-1 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-4 rounded-xl transition-all"
                  >
                    🗑️ {lang === 'fr' ? 'Supprimer' : 'حذف'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};