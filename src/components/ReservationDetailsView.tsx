import React, { useState, useEffect } from 'react';
import { Language, ReservationDetails, Payment, VehicleInspection, InspectionItem, Agency } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Calendar, Clock, MapPin, Fuel, Camera, FileText, CreditCard, DollarSign, Printer, AlertTriangle, Check, CheckCircle, XCircle, Plus, Trash2, Edit, Eye, Car as CarIcon, User, Phone, Mail, CreditCard as CardIcon, Shield, Wrench, Sofa, Sparkles, Droplets } from 'lucide-react';
import { ReservationsService } from '../services/ReservationsService';
import { DatabaseService } from '../services/DatabaseService';
import { supabase } from '../supabase';
import { formatAmount } from '../utils/format';
import { DEFAULT_EUR_RATE, dzdToEur, formatMoney } from '../utils/currency';

interface ReservationDetailsViewProps {
  lang: Language;
  reservation: ReservationDetails;
  onBack: () => void;
  onUpdate?: (reservation: ReservationDetails) => void;
}

export const ReservationDetailsView: React.FC<ReservationDetailsViewProps> = ({ lang, reservation, onBack, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'inspections' | 'payments' | 'financial'>('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const handleAddPayment = () => {
    setShowPaymentModal(true);
  };

  const handleSavePayment = (payment: Payment) => {
    const updatedReservation = {
      ...reservation,
      payments: [...reservation.payments, payment],
      advancePayment: reservation.advancePayment + payment.amount,
      remainingPayment: Math.max(0, reservation.remainingPayment - payment.amount)
    };
    onUpdate?.(updatedReservation);
  };

  const handleDeletePayment = (paymentId: string) => {
    const paymentToDelete = reservation.payments.find(p => p.id === paymentId);
    if (!paymentToDelete) return;

    const updatedReservation = {
      ...reservation,
      payments: reservation.payments.filter(p => p.id !== paymentId),
      advancePayment: reservation.advancePayment - paymentToDelete.amount,
      remainingPayment: reservation.remainingPayment + paymentToDelete.amount
    };
    onUpdate?.(updatedReservation);
  };

  const handlePrintPayment = (payment: Payment) => {
    // Print logic here
    console.log('Print payment:', payment);
    // You could open a print dialog or generate a PDF
  };

  const handleActivate = () => {
    setShowActivationModal(true);
  };

  const handleComplete = () => {
    setShowCompletionModal(true);
  };

  const handlePrint = (type: 'quote' | 'contract' | 'receipt' | 'versement') => {
    // Print logic here
    console.log('Print:', type);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-saas-primary-start hover:text-saas-primary-end font-bold"
          >
            <ArrowLeft className="w-5 h-5" />
            {lang === 'fr' ? 'Retour' : 'العودة'}
          </button>
          <div>
            <h2 className="text-3xl font-black text-saas-text-main uppercase tracking-tighter">
              👁️ {lang === 'fr' ? 'Détails de Réservation' : 'تفاصيل الحجز'}
            </h2>
            <p className="text-saas-text-muted font-bold uppercase text-[10px] tracking-widest">
              #{reservation.id}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => handlePrint('quote')}
            className="btn-saas-primary text-sm"
          >
            📋 {lang === 'fr' ? 'Devis' : 'عرض أسعار'}
          </button>
          <button
            onClick={() => handlePrint('contract')}
            className="btn-saas-success text-sm"
          >
            📄 {lang === 'fr' ? 'Contrat' : 'عقد'}
          </button>
          <button
            onClick={() => handlePrint('versement')}
            className="btn-saas-secondary text-sm"
          >
            🧾 {lang === 'fr' ? 'Versement' : 'إيصال'}
          </button>
        </div>
      </div>

      {/* Status and Quick Actions */}
      <div className="glass-card p-6 border border-saas-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className={`px-4 py-2 rounded-full text-sm font-bold ${
              reservation.status === 'confirmed' ? 'bg-green-100 text-green-800' :
              reservation.status === 'accepted' ? 'bg-teal-100 text-teal-800' :
              reservation.status === 'active' ? 'bg-blue-100 text-blue-800' :
              reservation.status === 'completed' ? 'bg-purple-100 text-purple-800' :
              'bg-yellow-100 text-yellow-800'
            }`}>
              {reservation.status === 'confirmed' ? '✅ Confirmé' :
               reservation.status === 'accepted' ? '✅ Accepté' :
               reservation.status === 'active' ? '🔄 Actif' :
               reservation.status === 'completed' ? '🏁 Terminé' :
               '⏳ En attente'}
            </span>
            {/* Montants dans la devise réglée par le client (détail complet
                dans l'onglet Paiements). */}
            {(() => {
              const inEur = reservation.paymentCurrency === 'EUR';
              const r = reservation.euroRate || DEFAULT_EUR_RATE;
              const show = (dzd: number, eur?: number | null) =>
                inEur ? formatMoney(eur ?? dzdToEur(dzd, r), 'EUR') : formatMoney(dzd, 'DZD');
              return (
                <div className="text-sm text-saas-text-muted">
                  <p>💰 {lang === 'fr' ? 'Total:' : 'المجموع:'} {show(reservation.totalPrice, reservation.totalPriceEur)}</p>
                  <p>💳 {lang === 'fr' ? 'Payé:' : 'مدفوع:'} {show(reservation.advancePayment, reservation.advancePaymentEur)}</p>
                  <p>⚠️ {lang === 'fr' ? 'Reste:' : 'متبقي:'} {show(reservation.remainingPayment, reservation.remainingPaymentEur)}</p>
                </div>
              );
            })()}
          </div>

          <div className="flex gap-2">
            {(reservation.status === 'confirmed' || reservation.status === 'accepted') && (
              <button
                onClick={handleActivate}
                className="btn-saas-success"
              >
                ✅ {lang === 'fr' ? 'Activer' : 'تفعيل'}
              </button>
            )}
            {reservation.status === 'active' && (
              <button
                onClick={handleComplete}
                className="btn-saas-secondary"
              >
                🏁 {lang === 'fr' ? 'Terminer' : 'إنهاء'}
              </button>
            )}
            <button
              onClick={handleAddPayment}
              className="btn-saas-primary"
            >
              💳 {lang === 'fr' ? 'Régler Dette' : 'تسوية الدين'}
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="glass-card border border-saas-border">
        <div className="flex border-b border-saas-border">
          {[
            { id: 'overview', label: lang === 'fr' ? 'Aperçu' : 'نظرة عامة', icon: '👁️' },
            { id: 'inspections', label: lang === 'fr' ? 'Inspections' : 'الفحوصات', icon: '🔍' },
            { id: 'payments', label: lang === 'fr' ? 'Paiements' : 'المدفوعات', icon: '💰' },
            { id: 'financial', label: lang === 'fr' ? 'Financier' : 'المالي', icon: '📊' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-4 px-6 text-center font-bold transition-colors ${
                activeTab === tab.id
                  ? 'bg-saas-primary-start/10 text-saas-primary-start border-b-2 border-saas-primary-start'
                  : 'text-saas-text-muted hover:bg-saas-bg'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && <OverviewTab lang={lang} reservation={reservation} />}
          {activeTab === 'inspections' && <InspectionsTab lang={lang} reservation={reservation} />}
          {activeTab === 'payments' && <PaymentsTab lang={lang} reservation={reservation} onAddPayment={handleAddPayment} onDeletePayment={handleDeletePayment} onPrintPayment={handlePrintPayment} />}
          {activeTab === 'financial' && <FinancialTab lang={lang} reservation={reservation} />}
        </div>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showPaymentModal && (
          <PaymentModal lang={lang} reservation={reservation} onClose={() => setShowPaymentModal(false)} onAddPayment={handleSavePayment} />
        )}
        {showActivationModal && (
          <ActivationModal lang={lang} reservation={reservation} onClose={() => setShowActivationModal(false)} onActivate={onUpdate} />
        )}
        {showCompletionModal && (
          <CompletionModal lang={lang} reservation={reservation} onClose={() => setShowCompletionModal(false)} onComplete={onUpdate} />
        )}
      </AnimatePresence>
    </div>
  );
};

// Overview Tab Component
const OverviewTab: React.FC<{ lang: Language; reservation: ReservationDetails }> = ({ lang, reservation }) => (
  <div className="space-y-8">
    {/* Chronologie de la Location */}
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 border border-blue-200">
      <h3 className="text-xl font-black text-slate-900 mb-6">
        📅 {lang === 'fr' ? 'Chronologie de la Location' : 'جدولة التأجير'}
      </h3>
      <div className="flex items-center justify-center gap-8">
        <div className="text-center">
          <div className="bg-blue-100 rounded-full p-4 mb-2">
            <MapPin className="w-8 h-8 text-blue-600" />
          </div>
          <p className="font-bold text-slate-900">{lang === 'fr' ? 'Départ' : 'المغادرة'}</p>
          <p className="text-sm text-slate-600">{reservation.step1.departureDate}</p>
          <p className="text-sm text-slate-600">{reservation.step1.departureTime}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 h-0.5 bg-blue-300"></div>
          <Clock className="w-6 h-6 text-blue-500" />
          <div className="w-16 h-0.5 bg-blue-300"></div>
        </div>
        <div className="text-center">
          <div className="bg-green-100 rounded-full p-4 mb-2">
            <Calendar className="w-8 h-8 text-green-600" />
          </div>
          <p className="font-bold text-slate-900">{lang === 'fr' ? 'Durée' : 'المدة'}</p>
          <p className="text-sm text-slate-600">{reservation.totalDays} {lang === 'fr' ? 'jours' : 'أيام'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 h-0.5 bg-green-300"></div>
          <Clock className="w-6 h-6 text-green-500" />
          <div className="w-16 h-0.5 bg-green-300"></div>
        </div>
        <div className="text-center">
          <div className="bg-purple-100 rounded-full p-4 mb-2">
            <MapPin className="w-8 h-8 text-purple-600" />
          </div>
          <p className="font-bold text-slate-900">{lang === 'fr' ? 'Retour' : 'العودة'}</p>
          <p className="text-sm text-slate-600">{reservation.step1.returnDate}</p>
          <p className="text-sm text-slate-600">{reservation.step1.returnTime}</p>
        </div>
      </div>
    </div>

    {/* Client & Vehicle Info */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Client Info */}
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
        <h3 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">
          👤 {lang === 'fr' ? 'Locataire' : 'المستأجر'}
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            {reservation.client.profilePhoto && (
              <img
                src={reservation.client.profilePhoto}
                alt={`${reservation.client.firstName} ${reservation.client.lastName}`}
                className="w-12 h-12 rounded-full object-cover"
              />
            )}
            <div>
              <p className="font-bold text-lg">{reservation.client.firstName} {reservation.client.lastName}</p>
              <p className="text-slate-600">📱 {reservation.client.phone}</p>
              <p className="text-slate-600">📧 {reservation.client.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-bold text-slate-900">🆔 {lang === 'fr' ? 'Permis' : 'رخصة'}</p>
              <p className="text-slate-600">{reservation.client.licenseNumber}</p>
            </div>
            <div>
              <p className="font-bold text-slate-900">🎂 {lang === 'fr' ? 'Naissance' : 'الميلاد'}</p>
              <p className="text-slate-600">{reservation.client.dateOfBirth || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
        <h3 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">
          🚗 {lang === 'fr' ? 'Véhicule' : 'المركبة'}
        </h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <img
              src={reservation.car.images[0]}
              alt={`${reservation.car.brand} ${reservation.car.model}`}
              className="w-16 h-12 rounded-lg object-cover"
            />
            <div>
              <p className="font-bold text-lg">{reservation.car.brand} {reservation.car.model}</p>
              <p className="text-slate-600">🏷️ {reservation.car.registration}</p>
              <p className="text-slate-600">🎨 {reservation.car.color}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-bold text-slate-900">📅 {lang === 'fr' ? 'Année' : 'السنة'}</p>
              <p className="text-slate-600">{reservation.car.year}</p>
            </div>
            <div>
              <p className="font-bold text-slate-900">⛽ {lang === 'fr' ? 'Carburant' : 'الوقود'}</p>
              <p className="text-slate-600">{reservation.car.energy}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Inspections Tab Component
const InspectionsTab: React.FC<{ lang: Language; reservation: ReservationDetails }> = ({ lang, reservation }) => {
  const securityItems = reservation.departureInspection?.inspectionItems.filter(i => i.category === 'security') || [];
  const equipmentItems = reservation.departureInspection?.inspectionItems.filter(i => i.category === 'equipment') || [];
  const comfortItems = reservation.departureInspection?.inspectionItems.filter(i => i.category === 'comfort' || i.category === 'cleanliness') || [];

  const returnSecurityItems = (reservation.returnInspection?.inspectionItems || reservation.departureInspection?.inspectionItems || []).filter(i => i.category === 'security');
  const returnEquipmentItems = (reservation.returnInspection?.inspectionItems || reservation.departureInspection?.inspectionItems || []).filter(i => i.category === 'equipment');
  const returnComfortItems = (reservation.returnInspection?.inspectionItems || reservation.departureInspection?.inspectionItems || []).filter(i => i.category === 'comfort' || i.category === 'cleanliness');

  return (
  <div className="space-y-6">
    {/* Check-in */}
    <div className="glass-card p-6 border border-saas-border">
      <h3 className="text-xl font-black text-saas-text-main mb-4 flex items-center gap-2">
        ✅ {lang === 'fr' ? 'Check-in (Mise en Circulation)' : 'الدخول (التداول)'}
      </h3>
      {reservation.departureInspection ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="font-bold text-blue-900">⛽ {lang === 'fr' ? 'Kilométrage' : 'العداد'}</p>
              <p className="text-2xl font-black text-blue-700">{formatAmount(reservation.departureInspection.mileage)} km</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="font-bold text-green-900">🛢️ {lang === 'fr' ? 'Carburant' : 'الوقود'}</p>
              <p className="text-2xl font-black text-green-700">
                {reservation.departureInspection.fuelLevel === 'full' ? 'PLEIN' :
                 reservation.departureInspection.fuelLevel === 'half' ? '1/2' :
                 reservation.departureInspection.fuelLevel === 'quarter' ? '1/4' :
                 reservation.departureInspection.fuelLevel === 'eighth' ? '1/8' : 'VIDE'}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="font-bold text-purple-900">📍 {lang === 'fr' ? 'Localisation' : 'الموقع'}</p>
              <p className="text-lg font-bold text-purple-700">{reservation.departureInspection.location}</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="font-bold text-orange-900">📅 {lang === 'fr' ? 'Date & Heure' : 'التاريخ والوقت'}</p>
              <p className="text-lg font-bold text-orange-700">{reservation.departureInspection.date}</p>
              <p className="text-sm text-orange-600">{reservation.departureInspection.time}</p>
            </div>
          {reservation.departureInspection.signature && (
            <div className="bg-indigo-50 rounded-lg p-4">
              <p className="font-bold text-indigo-900">✍️ {lang === 'fr' ? 'Signature' : 'التوقيع'}</p>
              <div className="mt-2">
                <img src={reservation.departureInspection.signature} alt="Client Signature" className="w-full h-16 object-contain border border-indigo-300 rounded" />
              </div>
            </div>
          )}
          </div>

          {/* Photos Gallery */}
          <div className="space-y-4">
            {(reservation.departureInspection.exteriorPhotos && reservation.departureInspection.exteriorPhotos.length > 0) && (
              <div>
                <h4 className="font-bold text-saas-text-main mb-3">📸 {lang === 'fr' ? 'Photos Extérieures' : 'الصور الخارجية'}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reservation.departureInspection.exteriorPhotos.map((photo, idx) => (
                    <div key={`exterior-${idx}`} className="rounded-lg overflow-hidden border border-saas-border shadow-md">
                      <img src={photo} alt={`Exterior ${idx + 1}`} className="w-full h-48 object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {(reservation.departureInspection.interiorPhotos && reservation.departureInspection.interiorPhotos.length > 0) && (
              <div>
                <h4 className="font-bold text-saas-text-main mb-3">🏎️ {lang === 'fr' ? 'Photos Intérieures' : 'الصور الداخلية'}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reservation.departureInspection.interiorPhotos.map((photo, idx) => (
                    <div key={`interior-${idx}`} className="rounded-lg overflow-hidden border border-saas-border shadow-md">
                      <img src={photo} alt={`Interior ${idx + 1}`} className="w-full h-48 object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Inspection Items */}
          <div className="space-y-6">
            {/* Security Items */}
            <div>
              <h4 className="font-bold text-saas-text-main mb-3">🛡️ {lang === 'fr' ? 'Sécurité' : 'الأمان'}</h4>
              <div className="space-y-2">
                {securityItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-saas-border">
                    <span className="font-bold capitalize text-saas-text-main">
                      {item.name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded font-bold text-sm ${item.checked ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {item.checked ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Equipment Items */}
            <div>
              <h4 className="font-bold text-saas-text-main mb-3">🔧 {lang === 'fr' ? 'Équipements' : 'المعدات'}</h4>
              <div className="space-y-2">
                {equipmentItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-saas-border">
                    <span className="font-bold capitalize text-saas-text-main">
                      {item.name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded font-bold text-sm ${item.checked ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {item.checked ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comfort & Cleanliness Items */}
            <div>
              <h4 className="font-bold text-saas-text-main mb-3">✨ {lang === 'fr' ? 'Confort & Propreté' : 'الراحة والنظافة'}</h4>
              <div className="space-y-2">
                {comfortItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-saas-border">
                    <span className="font-bold capitalize text-saas-text-main">
                      {item.name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded font-bold text-sm ${item.checked ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {item.checked ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-saas-text-muted italic">{lang === 'fr' ? 'Aucune inspection de départ enregistrée' : 'لم يتم تسجيل فحص المغادرة'}</p>
      )}
    </div>

    {/* Check-out */}
    <div className="glass-card p-6 border border-saas-border">
      <h3 className="text-xl font-black text-saas-text-main mb-4 flex items-center gap-2">
        🔒 {lang === 'fr' ? 'Check-out (Clôture)' : 'الخروج (الإغلاق)'}
      </h3>
      {reservation.returnInspection ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="font-bold text-blue-900">⛽ {lang === 'fr' ? 'Kilométrage' : 'العداد'}</p>
              <p className="text-2xl font-black text-blue-700">{formatAmount(reservation.returnInspection.mileage)} km</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="font-bold text-green-900">📏 {lang === 'fr' ? 'Distance' : 'المسافة'}</p>
              <p className="text-2xl font-black text-green-700">
                {reservation.returnInspection.mileage - (reservation.departureInspection?.mileage || 0)} km
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="font-bold text-purple-900">🛢️ {lang === 'fr' ? 'Carburant' : 'الوقود'}</p>
              <p className="text-2xl font-black text-purple-700">
                {reservation.returnInspection.fuelLevel === 'full' ? 'PLEIN' :
                 reservation.returnInspection.fuelLevel === 'half' ? '1/2' :
                 reservation.returnInspection.fuelLevel === 'quarter' ? '1/4' :
                 reservation.returnInspection.fuelLevel === 'eighth' ? '1/8' : 'VIDE'}
              </p>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <p className="font-bold text-orange-900">📍 {lang === 'fr' ? 'Localisation' : 'الموقع'}</p>
              <p className="text-lg font-bold text-orange-700">{reservation.returnInspection.location}</p>
            </div>
            {reservation.returnInspection.signature && (
              <div className="bg-indigo-50 rounded-lg p-4">
                <p className="font-bold text-indigo-900">✍️ {lang === 'fr' ? 'Signature' : 'التوقيع'}</p>
                <div className="mt-2">
                  <img src={reservation.returnInspection.signature} alt="Client Signature" className="w-full h-16 object-contain border border-indigo-300 rounded" />
                </div>
              </div>
            )}
          </div>

          {/* Photos Gallery */}
          <div className="space-y-4">
            {(reservation.returnInspection.exteriorPhotos && reservation.returnInspection.exteriorPhotos.length > 0) && (
              <div>
                <h4 className="font-bold text-saas-text-main mb-3">📸 {lang === 'fr' ? 'Photos Extérieures' : 'الصور الخارجية'}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reservation.returnInspection.exteriorPhotos.map((photo, idx) => (
                    <div key={`return-exterior-${idx}`} className="rounded-lg overflow-hidden border border-saas-border shadow-md">
                      <img src={photo} alt={`Exterior ${idx + 1}`} className="w-full h-48 object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {(reservation.returnInspection.interiorPhotos && reservation.returnInspection.interiorPhotos.length > 0) && (
              <div>
                <h4 className="font-bold text-saas-text-main mb-3">🏎️ {lang === 'fr' ? 'Photos Intérieures' : 'الصور الداخلية'}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reservation.returnInspection.interiorPhotos.map((photo, idx) => (
                    <div key={`return-interior-${idx}`} className="rounded-lg overflow-hidden border border-saas-border shadow-md">
                      <img src={photo} alt={`Interior ${idx + 1}`} className="w-full h-48 object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-indigo-50 rounded-lg p-4">
              <p className="font-bold text-indigo-900">📅 {lang === 'fr' ? 'Date & Heure' : 'التاريخ والوقت'}</p>
              <p className="text-lg font-bold text-indigo-700">{reservation.returnInspection.date}</p>
              <p className="text-sm text-indigo-600">{reservation.returnInspection.time}</p>
            </div>
          </div>

          {/* Inspection Items */}
          <div className="space-y-6">
            {/* Security Items */}
            <div>
              <h4 className="font-bold text-saas-text-main mb-3">🛡️ {lang === 'fr' ? 'Sécurité' : 'الأمان'}</h4>
              <div className="space-y-2">
                {returnSecurityItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-saas-border">
                    <span className="font-bold capitalize text-saas-text-main">
                      {item.name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded font-bold text-sm ${item.checked ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {item.checked ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Equipment Items */}
            <div>
              <h4 className="font-bold text-saas-text-main mb-3">🔧 {lang === 'fr' ? 'Équipements' : 'المعدات'}</h4>
              <div className="space-y-2">
                {returnEquipmentItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-saas-border">
                    <span className="font-bold capitalize text-saas-text-main">
                      {item.name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded font-bold text-sm ${item.checked ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {item.checked ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comfort & Cleanliness Items */}
            <div>
              <h4 className="font-bold text-saas-text-main mb-3">✨ {lang === 'fr' ? 'Confort & Propreté' : 'الراحة والنظافة'}</h4>
              <div className="space-y-2">
                {returnComfortItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-saas-border">
                    <span className="font-bold capitalize text-saas-text-main">
                      {item.name}
                    </span>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded font-bold text-sm ${item.checked ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                        {item.checked ? '✅' : '❌'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-saas-text-muted italic">{lang === 'fr' ? 'Aucune inspection de retour enregistrée' : 'لم يتم تسجيل فحص العودة'}</p>
      )}
    </div>
  </div>
);
};
// Payments Tab Component
const PaymentsTab: React.FC<{ lang: Language; reservation: ReservationDetails; onAddPayment: () => void; onDeletePayment: (id: string) => void; onPrintPayment: (payment: Payment) => void }> = ({ lang, reservation, onAddPayment, onDeletePayment, onPrintPayment }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Include initial advance payment if not already in payments
  const allPayments = [
    ...(reservation.advancePayment > 0 && !reservation.payments.some(p => p.amount === reservation.advancePayment) ? [{
      id: 'initial',
      amount: reservation.advancePayment,
      method: 'cash' as const,
      date: reservation.createdAt?.split('T')[0] || new Date().toISOString().split('T')[0],
      note: lang === 'fr' ? 'Paiement initial' : 'الدفعة الأولية'
    }] : []),
    ...reservation.payments
  ];

  const handleDeleteClick = (paymentId: string) => {
    setShowDeleteConfirm(paymentId);
  };

  const confirmDelete = () => {
    if (showDeleteConfirm) {
      onDeletePayment(showDeleteConfirm);
      setShowDeleteConfirm(null);
    }
  };

  // Devise réglée par le client. Le dinar reste la référence : chaque montant est
  // affiché dans la devise de règlement, avec sa contre-valeur dans l'autre.
  const payInEur = reservation.paymentCurrency === 'EUR';
  const rate = reservation.euroRate || DEFAULT_EUR_RATE;
  // Les montants euros négociés font foi ; à défaut on reconvertit le dinar au taux.
  const totalEur = reservation.totalPriceEur ?? dzdToEur(reservation.totalPrice, rate);
  const paidEur = reservation.advancePaymentEur ?? dzdToEur(reservation.advancePayment, rate);
  const remainingEur = reservation.remainingPaymentEur ?? dzdToEur(reservation.remainingPayment, rate);
  const cautionDzd = reservation.cautionAmountDzd || reservation.deposit;

  /** Montant principal dans la devise de règlement + contre-valeur en second. */
  const MoneyPair: React.FC<{ dzd: number; eur: number; className?: string }> = ({ dzd, eur, className = '' }) => (
    <>
      <p className={`text-2xl font-black ${className}`}>
        {payInEur ? formatMoney(eur, 'EUR') : formatMoney(dzd, 'DZD')}
      </p>
      <p className="text-xs text-saas-text-muted mt-1">
        ≈ {payInEur ? formatMoney(dzd, 'DZD') : formatMoney(eur, 'EUR')}
      </p>
    </>
  );

  return (
  <div className="space-y-6">
    {/* Payment Summary */}
    <div className="glass-card p-6 border border-saas-border">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-xl font-black text-saas-text-main">
          💰 {lang === 'fr' ? 'Détails Financiers' : 'التفاصيل المالية'}
        </h3>
        {/* Devise de règlement + taux appliqué */}
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-black border ${
            payInEur ? 'bg-blue-100 text-blue-800 border-blue-300'
                     : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
            {payInEur
              ? `💶 ${lang === 'fr' ? 'Paiement en euros' : 'الدفع بالأورو'}`
              : `💵 ${lang === 'fr' ? 'Paiement en dinars' : 'الدفع بالدينار'}`}
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {rate.toLocaleString('fr-FR')} DA / €
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg p-4 text-center border border-saas-border">
          <p className="text-sm text-saas-text-muted">{lang === 'fr' ? 'Montant Total' : 'المبلغ الإجمالي'}</p>
          <MoneyPair dzd={reservation.totalPrice} eur={totalEur} className="text-saas-text-main" />
        </div>
        <div className="bg-green-50 rounded-lg p-4 text-center border border-green-200">
          <p className="text-sm text-green-700">{lang === 'fr' ? 'Montant Payé' : 'المبلغ المدفوع'}</p>
          <MoneyPair dzd={reservation.advancePayment} eur={paidEur} className="text-green-700" />
        </div>
        <div className="bg-orange-50 rounded-lg p-4 text-center border border-orange-200">
          <p className="text-sm text-orange-700">{lang === 'fr' ? 'Reste à Payer' : 'المبلغ المتبقي'}</p>
          <MoneyPair dzd={reservation.remainingPayment} eur={remainingEur} className="text-orange-700" />
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center border border-blue-200">
          {typeof reservation.cautionEnabled === 'undefined' || reservation.cautionEnabled ? (
            <>
              <p className="text-sm text-blue-700">{lang === 'fr' ? 'Caution' : 'الضمان'}</p>
              {/* La caution a sa propre devise, indépendante de celle du règlement. */}
              <p className="text-2xl font-black text-blue-700">
                {reservation.cautionCurrency === 'EUR'
                  ? formatMoney(dzdToEur(cautionDzd, rate), 'EUR')
                  : formatMoney(cautionDzd, 'DZD')}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                ≈ {reservation.cautionCurrency === 'EUR'
                  ? formatMoney(cautionDzd, 'DZD')
                  : formatMoney(dzdToEur(cautionDzd, rate), 'EUR')}
              </p>
            </>
          ) : null}
        </div>
        {(reservation as any).assuranceEnabled && (
          <div className="bg-purple-50 rounded-lg p-4 text-center border border-purple-200">
            <p className="text-sm text-purple-700">{lang === 'fr' ? 'Assurance' : 'التأمين'}</p>
            <p className="text-2xl font-black text-purple-700">
              {formatAmount(Math.round((reservation.totalPrice) * ((reservation as any).assurancePercentage || 0) / 100))} DA
            </p>
            <p className="text-xs text-purple-600 mt-1">({(reservation as any).assurancePercentage}%)</p>
          </div>
        )}
      </div>
    </div>

    {/* Payment History */}
    <div className="glass-card border border-saas-border">
      <div className="p-6 border-b border-saas-border">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-black text-saas-text-main">
            🧾 {lang === 'fr' ? 'Historique des Paiements' : 'سجل المدفوعات'}
          </h3>
          <button
            onClick={onAddPayment}
            className="btn-saas-primary"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            {lang === 'fr' ? 'Ajouter Paiement' : 'إضافة دفعة'}
          </button>
        </div>
      </div>
      <div className="p-6">
        {allPayments.length > 0 ? (
          <div className="space-y-4">
            {allPayments.map((payment) => (
              <div key={payment.id} className="flex items-center justify-between p-4 bg-saas-bg rounded-lg border border-saas-border">
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 rounded-full p-2">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-bold text-saas-text-main">
                      {payInEur
                        ? formatMoney(dzdToEur(payment.amount, rate), 'EUR')
                        : formatMoney(payment.amount, 'DZD')}
                      <span className="font-normal text-xs text-saas-text-muted ml-2">
                        ≈ {payInEur ? formatMoney(payment.amount, 'DZD') : formatMoney(dzdToEur(payment.amount, rate), 'EUR')}
                      </span>
                    </p>
                    <p className="text-sm text-saas-text-muted">{payment.date} • {payment.method === 'cash' ? (lang === 'fr' ? 'Espèces' : 'نقدي') : payment.method === 'card' ? (lang === 'fr' ? 'Carte' : 'بطاقة') : (lang === 'fr' ? 'Virement' : 'تحويل')}</p>
                    {payment.note && <p className="text-xs text-saas-text-muted">{payment.note}</p>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onPrintPayment(payment)}
                    className="p-2 text-saas-primary-start hover:text-saas-primary-end transition-colors"
                    title={lang === 'fr' ? 'Imprimer' : 'طباعة'}
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  {payment.id !== 'initial' && (
                    <button
                      onClick={() => handleDeleteClick(payment.id)}
                      className="p-2 text-red-600 hover:text-red-800 transition-colors"
                      title={lang === 'fr' ? 'Supprimer' : 'حذف'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-saas-text-muted italic text-center py-8">
            {lang === 'fr' ? 'Aucun paiement enregistré' : 'لم يتم تسجيل أي دفعات'}
          </p>
        )}
      </div>
    </div>

    {/* Delete Confirmation Modal */}
    {showDeleteConfirm && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fx-overlay p-4"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="glass-card max-w-sm w-full p-6 border border-saas-border"
        >
          <h3 className="text-lg font-black text-saas-text-main mb-4">
            ⚠️ {lang === 'fr' ? 'Confirmer la Suppression' : 'تأكيد الحذف'}
          </h3>
          <p className="text-saas-text-muted mb-6">
            {lang === 'fr' ? 'Êtes-vous sûr de vouloir supprimer ce paiement ?' : 'هل أنت متأكد من حذف هذه الدفعة؟'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDeleteConfirm(null)}
              className="flex-1 bg-saas-bg hover:bg-saas-secondary-start/10 text-saas-text-muted font-bold py-2 px-4 rounded-lg border border-saas-border hover:border-saas-secondary-start/20 transition-all"
            >
              {lang === 'fr' ? 'Annuler' : 'إلغاء'}
            </button>
            <button
              onClick={confirmDelete}
              className="flex-1 btn-saas-danger"
            >
              🗑️ {lang === 'fr' ? 'Supprimer' : 'حذف'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </div>
);
};

// Financial Tab Component
const FinancialTab: React.FC<{ lang: Language; reservation: ReservationDetails }> = ({ lang, reservation }) => (
  <div className="space-y-6">
    {/* Pricing Breakdown */}
    <div className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
      <h3 className="text-xl font-black text-slate-900 mb-6">
        💰 {lang === 'fr' ? 'Décomposition du Tarif' : 'تفصيل الأسعار'}
      </h3>
      <div className="space-y-4">
        <div className="flex justify-between items-center py-2 border-b border-slate-200">
          <span className="font-bold">{lang === 'fr' ? 'Location de base' : 'التأجير الأساسي'}</span>
          <span className="font-bold">{formatAmount(reservation.totalPrice - reservation.additionalFees)} DA</span>
        </div>
        {reservation.additionalServices.map((service: any) => (
          <div key={service.id} className="flex justify-between items-center py-2 border-b border-slate-200">
            <span>🛎️ {service.name || service.service_name}</span>
            <span>{formatAmount(Number(service.price))} DA</span>
          </div>
        ))}
        {(reservation.protectionAssurance || reservation.protectionAssuranceName) && (
          <div className="flex justify-between items-center py-2 border-b border-slate-200">
            <span>🛡️ {reservation.protectionAssurance?.name || reservation.protectionAssuranceName}
              {reservation.protectionAssurancePrice != null && reservation.totalDays > 0 && (
                <span className="text-slate-400 text-sm ml-1">
                  ({formatAmount(reservation.protectionAssurancePrice)} DA/{lang === 'fr' ? 'j' : 'ي'} × {reservation.totalDays})
                </span>
              )}
            </span>
            <span>{formatAmount(Math.round((reservation.protectionAssurancePrice || 0) * (reservation.totalDays || 0)))} DA</span>
          </div>
        )}
        {(reservation.deliveryFee || 0) > 0 && (
          <div className={`flex justify-between items-center py-2 border-b border-slate-200 ${
            reservation.deliveryFeePayer === 'owner' ? 'text-green-700' : ''
          }`}>
            <span>
              🚚 {lang === 'fr' ? 'Frais de livraison' : 'رسوم التوصيل'}
              <span className="text-slate-400 text-sm ml-1">
                {reservation.deliveryFeePayer === 'owner'
                  ? (lang === 'fr' ? '(à la charge du propriétaire — non facturés)' : '(على عاتق المالك — غير مفوترة)')
                  : (lang === 'fr' ? '(à la charge du client)' : '(على عاتق العميل)')}
              </span>
            </span>
            <span className={reservation.deliveryFeePayer === 'owner' ? 'line-through' : ''}>
              {formatAmount(reservation.deliveryFee || 0)} DA
            </span>
          </div>
        )}
        {reservation.excessMileage > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-slate-200 text-red-600">
            <span>{lang === 'fr' ? 'Kilométrage excédentaire' : 'عداد الكيلومترات الزائد'}</span>
            <span>{formatAmount(reservation.excessMileage)} DA</span>
          </div>
        )}
        {reservation.missingFuel > 0 && (
          <div className="flex justify-between items-center py-2 border-b border-slate-200 text-red-600">
            <span>{lang === 'fr' ? 'Carburant manquant' : 'الوقود المفقود'}</span>
            <span>{formatAmount(reservation.missingFuel)} DA</span>
          </div>
        )}
        <div className="flex justify-between items-center py-4 border-t-2 border-slate-300 text-lg font-black">
          <span>{lang === 'fr' ? 'TOTAL GÉNÉRAL' : 'المجموع الكلي'}</span>
          <span>{formatAmount(reservation.totalPrice + reservation.additionalFees)} DA</span>
        </div>
      </div>
    </div>

    {/* Caution & Assurance Information */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Caution */}
      {typeof reservation.cautionEnabled === 'undefined' || reservation.cautionEnabled ? (
        <div className="bg-blue-50 rounded-2xl shadow-lg p-6 border border-blue-200">
          <h3 className="text-lg font-black text-blue-900 mb-4">🔐 {lang === 'fr' ? 'Caution' : 'الضمان'}</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-blue-200">
              <span className="text-blue-700 font-bold">{lang === 'fr' ? 'Montant (DA):' : 'المبلغ (DA):'}</span>
              <span className="font-black text-blue-900">{formatAmount((reservation as any).cautionAmountDzd || reservation.deposit)} DA</span>
            </div>
            {(reservation as any).cautionCurrency === 'EUR' && (reservation as any).euroRate && (
              <>
                <div className="flex justify-between items-center py-2 border-b border-blue-200">
                  <span className="text-blue-700 font-bold">{lang === 'fr' ? 'Montant (EUR):' : 'المبلغ (EUR):'}</span>
                  <span className="font-black text-blue-900">
                    {(Math.round(((reservation as any).cautionAmountDzd || reservation.deposit) / (reservation as any).euroRate * 100) / 100).toFixed(2)} €
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-blue-700 text-sm">{lang === 'fr' ? 'Taux de change:' : 'سعر الصرف:'}</span>
                  <span className="text-blue-900 text-sm font-bold">{(reservation as any).euroRate} DA/€</span>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Assurance Serenity */}
      {(reservation as any).assuranceEnabled && (
        <div className="bg-purple-50 rounded-2xl shadow-lg p-6 border border-purple-200">
          <h3 className="text-lg font-black text-purple-900 mb-4">🛡️ {lang === 'fr' ? 'Assurance Serenity' : 'تأمين Serenity'}</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-purple-200">
              <span className="text-purple-700 font-bold">{lang === 'fr' ? 'Pourcentage:' : 'النسبة:'}</span>
              <span className="font-black text-purple-900">{(reservation as any).assurancePercentage || 0}%</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-purple-700 font-bold">{lang === 'fr' ? 'Montant:' : 'المبلغ:'}</span>
              <span className="font-black text-purple-900">{formatAmount(Math.round((reservation.totalPrice) * ((reservation as any).assurancePercentage || 0) / 100))} DA</span>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Assurance de protection sélectionnée (forfait + éléments) */}
    {(reservation.protectionAssurance || reservation.protectionAssuranceName) && (
      <div className="bg-red-50 rounded-2xl shadow-lg p-6 border border-red-200">
        <h3 className="text-lg font-black text-red-900 mb-4">🛡️ {lang === 'fr' ? 'Assurance de Protection' : 'تأمين الحماية'}</h3>
        <div className="flex justify-between items-center py-2 border-b border-red-200 mb-3">
          <span className="font-black text-slate-900">{reservation.protectionAssurance?.name || reservation.protectionAssuranceName}</span>
          <span className="font-black text-red-700">
            {formatAmount(reservation.protectionAssurancePrice || reservation.protectionAssurance?.pricePerDay || 0)} DA/{lang === 'fr' ? 'jour' : 'يوم'}
          </span>
        </div>
        {reservation.protectionAssurance && reservation.protectionAssurance.items.length > 0 ? (
          <ul className="space-y-1.5">
            {reservation.protectionAssurance.items.map((item) => (
              <li key={item.linkId || item.itemId} className="flex items-center gap-2 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.status ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                }`}>
                  {item.status ? '✓' : '✕'}
                </span>
                <span className={item.status ? 'text-slate-700' : 'text-slate-400 line-through'}>{item.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-500 text-sm italic">{lang === 'fr' ? 'Détail des éléments indisponible' : 'تفاصيل العناصر غير متوفرة'}</p>
        )}
      </div>
    )}
  </div>
);

// Modal Components
const PaymentModal: React.FC<{ lang: Language; reservation: ReservationDetails; onClose: () => void; onAddPayment: (payment: Payment) => void }> = ({ lang, reservation, onClose, onAddPayment }) => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [note, setNote] = useState('');

  const paymentAmount = parseFloat(amount) || 0;
  const newRemaining = Math.max(0, reservation.remainingPayment - paymentAmount);

  const handleSave = () => {
    if (paymentAmount <= 0) return;
    
    const newPayment: Payment = {
      id: `payment-${Date.now()}`,
      reservationId: reservation.id,
      amount: paymentAmount,
      method,
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString(),
      note: note || undefined
    };

    onAddPayment(newPayment);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fx-overlay p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-card max-w-md w-full p-6 border border-saas-border"
      >
        <h3 className="text-xl font-black text-saas-text-main mb-6">
          💳 {lang === 'fr' ? 'Ajouter un Paiement' : 'إضافة دفعة'}
        </h3>

        <div className="space-y-4">
          <div className="bg-gradient-to-r from-saas-primary-start/10 to-saas-primary-end/10 rounded-xl p-4 border border-saas-primary-start/20">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-saas-text-main">{lang === 'fr' ? 'Reste à payer:' : 'المبلغ المتبقي:'}</span>
              <span className="font-black text-saas-text-main">{formatAmount(reservation.remainingPayment)} DA</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-saas-text-main">{lang === 'fr' ? 'Après paiement:' : 'بعد الدفع:'}</span>
              <span className={`font-black ${newRemaining === 0 ? 'text-green-600' : 'text-orange-600'}`}>{formatAmount(newRemaining)} DA</span>
            </div>
          </div>

          <div>
            <label className="block font-bold text-saas-text-main mb-2">
              💰 {lang === 'fr' ? 'Montant' : 'المبلغ'}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full p-3 border border-saas-border rounded-lg focus:ring-2 focus:ring-saas-primary-start focus:border-transparent"
              placeholder="0"
              min="0"
              max={reservation.remainingPayment}
            />
          </div>

          <div>
            <label className="block font-bold text-saas-text-main mb-2">
              💳 {lang === 'fr' ? 'Méthode de paiement' : 'طريقة الدفع'}
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as any)}
              className="w-full p-3 border border-saas-border rounded-lg focus:ring-2 focus:ring-saas-primary-start focus:border-transparent"
            >
              <option value="cash">{lang === 'fr' ? 'Espèces' : 'نقدي'}</option>
              <option value="card">{lang === 'fr' ? 'Carte' : 'بطاقة'}</option>
              <option value="transfer">{lang === 'fr' ? 'Virement' : 'تحويل'}</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-saas-text-main mb-2">
              📝 {lang === 'fr' ? 'Note (Optionnel)' : 'ملاحظة (اختياري)'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full p-3 border border-saas-border rounded-lg focus:ring-2 focus:ring-saas-primary-start focus:border-transparent"
              rows={2}
              placeholder={lang === 'fr' ? 'Détails supplémentaires...' : 'تفاصيل إضافية...'}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-saas-bg hover:bg-saas-secondary-start/10 text-saas-text-muted font-bold py-3 px-4 rounded-lg border border-saas-border hover:border-saas-secondary-start/20 transition-all"
          >
            {lang === 'fr' ? 'Annuler' : 'إلغاء'}
          </button>
          <button
            onClick={handleSave}
            disabled={paymentAmount <= 0}
            className="flex-1 btn-saas-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            💾 {lang === 'fr' ? 'Enregistrer' : 'حفظ'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};


// reusable signature pad component
const SignaturePad: React.FC<{ lang: Language; onSignatureChange: (signature: string) => void }> = ({ lang, onSignatureChange }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const [hasSignature, setHasSignature] = React.useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineTo(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      onSignatureChange(canvas.toDataURL());
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onSignatureChange('');
  };

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          className="w-full h-64 border border-indigo-300 rounded-lg cursor-crosshair bg-white"
          style={{ touchAction: 'none' }}
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-indigo-400">
              <FileText className="w-6 h-6 mx-auto mb-1" />
              <p className="text-xs font-bold">
                {lang === 'fr' ? 'Signez ici' : 'وقع هنا'}
              </p>
            </div>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center">
        <p className="text-xs text-indigo-700 font-bold">
          {lang === 'fr' ? 'Signature numérique' : 'التوقيع الرقمي'}
        </p>
        <button
          onClick={clearSignature}
          className="text-red-600 hover:text-red-800 font-bold text-xs underline"
        >
          {lang === 'fr' ? 'Effacer' : 'مسح'}
        </button>
      </div>
    </div>
  );
};

export const ActivationModal: React.FC<{ lang: Language; reservation: ReservationDetails; onClose: () => void; onActivate?: (reservation: ReservationDetails) => void }> = ({ lang, reservation, onClose, onActivate }) => {
  const [mileage, setMileage] = useState(reservation.departureInspection?.mileage?.toString() || '');
  const [location, setLocation] = useState(reservation.step1?.departureLocation || '');
  const [fuelLevel, setFuelLevel] = useState<'full' | 'half' | 'quarter' | 'eighth' | 'empty'>('full');
  const [notes, setNotes] = useState('');
  const [inspectionItems, setInspectionItems] = useState<InspectionItem[]>(
    reservation.departureInspection?.inspectionItems || []
  );
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoadingAgencies, setIsLoadingAgencies] = useState(true);
  
  // Load agencies on component mount
  useEffect(() => {
    const loadAgencies = async () => {
      try {
        setIsLoadingAgencies(true);
        const data = await DatabaseService.getAgencies();
        setAgencies(data || []);
      } catch (err) {
        console.error('Error loading agencies:', err);
        setAgencies([]);
      } finally {
        setIsLoadingAgencies(false);
      }
    };

    loadAgencies();
  }, []);


  const fuelLevels = [
    { value: 'full', label: 'PLEIN' },
    { value: 'half', label: '1/2' },
    { value: 'quarter', label: '1/4' },
    { value: 'eighth', label: '1/8' },
    { value: 'empty', label: 'VIDE' }
  ];

  const securityItems = inspectionItems.filter(i => i.category === 'security');
  const equipmentItems = inspectionItems.filter(i => i.category === 'equipment');
  const comfortItems = inspectionItems.filter(i => i.category === 'comfort' || i.category === 'cleanliness');

  const handleInspectionItemToggle = (itemId: string) => {
    setInspectionItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, checked: !item.checked } : item
      )
    );
  };

  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fx-overlay p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="fx-modal sm:max-w-4xl"
      >
        {/* Corps défilant : la modale garde une hauteur maximale et c'est CE
            conteneur qui défile — sans lui, `.fx-modal { overflow:hidden }`
            coupait le contenu trop haut sans permettre de le faire défiler. */}
        <div className="fx-modal-body custom-scrollbar p-5 sm:p-6" style={{ minHeight: 0 }}>
        {/* Bandeau vert : activer, c'est faire SORTIR le véhicule. L'action est
            engageante, on la signale autrement que par le rouge de la marque. */}
        <div
          className="mb-5 rounded-xl px-4 py-3.5 flex items-center gap-3"
          style={{
            backgroundImage: 'linear-gradient(135deg, rgba(16,164,111,0.18), rgba(10,115,80,0.05))',
            border: '1px solid rgba(52,211,153,0.4)',
          }}
        >
          <span className="text-2xl">✅</span>
          <div className="min-w-0">
            <h3 className="fx-title text-lg leading-tight" style={{ color: '#6EE7B7' }}>
              {lang === 'fr' ? 'Activer la location' : 'تفعيل التأجير'}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>
              {lang === 'fr'
                ? 'Inspection de départ : relevez le kilométrage, le carburant et l’état du véhicule avant remise des clés.'
                : 'فحص المغادرة: سجّل العداد والوقود وحالة المركبة قبل تسليم المفاتيح.'}
            </p>
          </div>
        </div>

        <div className="space-y-8">
          {/* CAR INFORMATION SECTION */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
            <h4 className="text-lg font-black text-saas-text-main mb-4">
              🚗 {lang === 'fr' ? 'Informations du Véhicule' : 'معلومات المركبة'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-bold text-saas-text-muted uppercase tracking-widest mb-1">
                  {lang === 'fr' ? 'Marque & Modèle' : 'الماركة والموديل'}
                </p>
                <p className="text-lg font-bold text-saas-text-main">
                  {reservation.car.brand} {reservation.car.model}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-saas-text-muted uppercase tracking-widest mb-1">
                  {lang === 'fr' ? 'Couleur' : 'اللون'}
                </p>
                <p className="text-lg font-bold text-saas-text-main">
                  {reservation.car.color}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-saas-text-muted uppercase tracking-widest mb-1">
                  {lang === 'fr' ? 'Immatriculation' : 'لوحة الترخيص'}
                </p>
                <p className="text-lg font-bold text-saas-text-main font-mono">
                  {reservation.car.registration}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-saas-text-muted uppercase tracking-widest mb-1">
                  {lang === 'fr' ? 'VIN' : 'رقم VIN'}
                </p>
                <p className="text-lg font-bold text-saas-text-main font-mono">
                  {reservation.car.vin || 'N/A'}
                </p>
              </div>
            </div>

            {/* Car Images Display */}
            {reservation.car.images && reservation.car.images.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold text-saas-text-muted uppercase tracking-widest mb-3">
                  {lang === 'fr' ? 'Photos du Véhicule' : 'صور المركبة'}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {reservation.car.images.slice(0, 4).map((image, idx) => (
                    <img
                      key={idx}
                      src={image}
                      alt={`Car ${idx + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-blue-200"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* DEPARTURE INSPECTION DETAILS */}
          <div className="text-center bg-gradient-to-r from-saas-primary-start/10 to-saas-primary-end/10 rounded-xl p-4 border border-saas-primary-start/20">
            <h4 className="text-lg font-black text-saas-text-main mb-2">
              🧭 {lang === 'fr' ? 'Détails du Départ' : 'تفاصيل المغادرة'}
            </h4>
            <p className="text-saas-text-muted">
              {lang === 'fr' ? 'Confirmez les informations de départ du véhicule' : 'تأكيد معلومات مغادرة المركبة'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block font-bold text-saas-text-main mb-2">
                🧭 {lang === 'fr' ? 'Kilométrage au départ' : 'عداد الكيلومترات عند المغادرة'}
              </label>
              <input
                type="number"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-saas-primary-start focus:border-transparent"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block font-bold text-saas-text-main mb-2">
                📍 {lang === 'fr' ? 'Lieu de prise en charge' : 'مكان الاستلام'}
              </label>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isLoadingAgencies}
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-saas-primary-start focus:border-transparent disabled:bg-slate-100"
              >
                <option value="">
                  {isLoadingAgencies
                    ? (lang === 'fr' ? 'Chargement des agences...' : 'جاري تحميل الوكالات...')
                    : (lang === 'fr' ? 'Sélectionner une agence...' : 'اختر وكالة...')}
                </option>
                {agencies.map(agency => (
                  <option key={agency.id} value={agency.name}>
                    {agency.name} {agency.city ? `(${agency.city})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-saas-text-main mb-3">
              ⛽ {lang === 'fr' ? 'Niveau de carburant' : 'مستوى الوقود'}
            </label>
            <div className="grid grid-cols-5 gap-2">
              {fuelLevels.map((level) => (
                <button
                  key={level.value}
                  onClick={() => setFuelLevel(level.value as any)}
                  className={`p-3 border-2 rounded-lg font-bold transition-all ${
                    fuelLevel === level.value
                      ? 'border-saas-primary-start bg-saas-primary-start text-white shadow-lg'
                      : 'border-slate-200 hover:border-saas-primary-start/50 hover:bg-saas-primary-start/10'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-bold text-saas-text-main mb-2">
              📝 {lang === 'fr' ? 'Notes rapides' : 'ملاحظات سريعة'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-saas-primary-start focus:border-transparent"
              rows={3}
              placeholder={lang === 'fr' ? 'Ex: Petit éraflure sur portière droite' : 'مثال: خدش صغير على الباب الأيمن'}
            />
          </div>

          {/* INSPECTION ITEMS */}
          <div className="bg-gradient-to-r from-saas-primary-start/10 to-saas-primary-end/10 rounded-xl p-6 border border-saas-primary-start/20">
            <h4 className="text-lg font-black text-saas-text-main mb-4">
              🔍 {lang === 'fr' ? 'Vérification du Véhicule' : 'فحص المركبة'}
            </h4>
            <div className="space-y-6">
              {/* Security Items */}
              <div>
                <h5 className="font-bold text-saas-text-main mb-2">🛡️ {lang === 'fr' ? 'Sécurité' : 'الأمان'}</h5>
                <div className="space-y-2">
                  {securityItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleInspectionItemToggle(item.id)}
                        className="w-5 h-5 text-saas-primary-start border-slate-300 rounded focus:ring-saas-primary-start"
                      />
                      <span className="font-bold capitalize text-saas-text-main">
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipment Items */}
              <div>
                <h5 className="font-bold text-saas-text-main mb-2">🔧 {lang === 'fr' ? 'Équipements' : 'المعدات'}</h5>
                <div className="space-y-2">
                  {equipmentItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleInspectionItemToggle(item.id)}
                        className="w-5 h-5 text-saas-primary-start border-slate-300 rounded focus:ring-saas-primary-start"
                      />
                      <span className="font-bold capitalize text-saas-text-main">
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Comfort & Cleanliness Items */}
              <div>
                <h5 className="font-bold text-saas-text-main mb-2">✨ {lang === 'fr' ? 'Confort & Propreté' : 'الراحة والنظافة'}</h5>
                <div className="space-y-2">
                  {comfortItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => handleInspectionItemToggle(item.id)}
                        className="w-5 h-5 text-saas-primary-start border-slate-300 rounded focus:ring-saas-primary-start"
                      />
                      <span className="font-bold capitalize text-saas-text-main">
                        {item.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 px-4 rounded-lg transition-colors"
          >
            {lang === 'fr' ? 'Annuler' : 'إلغاء'}
          </button>
          <button
            onClick={async () => {
              try {
                await ReservationsService.activateReservationWithInspection({
                  reservationId: reservation.id,
                  carId: reservation.car.id,
                  mileage: parseInt(mileage),
                  fuelLevel: fuelLevel as 'full' | 'half' | 'quarter' | 'eighth' | 'empty',
                  location,
                  notes,
                  inspectionItems,
                  departureAgencyId: reservation.step1?.departureAgency
                });

                // Update car mileage and fuel level only (no status changes for period-based availability)
                await supabase
                  .from('cars')
                  .update({ 
                    mileage: parseInt(mileage),
                    fuel_level: fuelLevel
                  })
                  .eq('id', reservation.car.id);

                // Update the local reservation state
                const updatedReservation = {
                  ...reservation,
                  status: 'active' as const,
                  activatedAt: new Date().toISOString(),
                  departureInspection: {
                    id: `departure-${reservation.id}`,
                    reservationId: reservation.id,
                    type: 'departure' as const,
                    mileage: parseInt(mileage),
                    fuelLevel: fuelLevel as 'full' | 'half' | 'quarter' | 'eighth' | 'empty',
                    location,
                    date: new Date().toLocaleDateString(),
                    time: new Date().toLocaleTimeString(),
                    interiorPhotos: [],
                    exteriorPhotos: [],
                    inspectionItems,
                    notes,
                    createdAt: new Date().toISOString()
                  }
                };

                onActivate?.(updatedReservation);
                onClose();
              } catch (error) {
                console.error('Error activating reservation:', error);
                alert(lang === 'fr' ? 'Erreur lors de l\'activation: ' + (error as any).message : 'خطأ في التفعيل: ' + (error as any).message);
              }
            }}
            className="flex-1 btn-saas-primary py-3"
          >
            ✅ {lang === 'fr' ? 'Confirmer et Activer' : 'تأكيد وتفعيل'}
          </button>
        </div>
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

/**
 * `inspection_checklist_items.category` (base) -> `InspectionItem.category` (front).
 * Les deux vocabulaires coexistent : la base est en français, le type en anglais.
 */
const DB_CATEGORY_TO_INSPECTION: Record<string, InspectionItem['category']> = {
  securite: 'security',
  equipements: 'equipment',
  confort: 'comfort',
};

export const CompletionModal: React.FC<{ lang: Language; reservation: ReservationDetails; onClose: () => void; onComplete?: (reservation: ReservationDetails) => void }> = ({ lang, reservation, onClose, onComplete }) => {
  const [returnMileage, setReturnMileage] = useState('');
  const [returnFuelLevel, setReturnFuelLevel] = useState<'full' | 'half' | 'quarter' | 'eighth' | 'empty'>('full');
  const [returnDate, setReturnDate] = useState(reservation.step1.returnDate);
  const [returnTime, setReturnTime] = useState(reservation.step1.returnTime);
  const [excessMileage, setExcessMileage] = useState('');
  const [missingFuel, setMissingFuel] = useState('');
  const [documentsRecovered, setDocumentsRecovered] = useState(true);
  const [returnInspectionItems, setReturnInspectionItems] = useState<InspectionItem[]>(
    reservation.departureInspection?.inspectionItems.map(item => ({ ...item })) || []
  );
  const [signature, setSignature] = useState('');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Une réservation créée sans inspection de départ (statut 'pending') n'a aucun
  // point de contrôle à recopier : la section retour serait alors vide. On charge
  // dans ce cas la liste maître, tous points décochés.
  useEffect(() => {
    if (returnInspectionItems.length > 0) return;
    let cancelled = false;

    (async () => {
      try {
        const masterItems = await DatabaseService.getInspectionChecklistItems();
        if (cancelled || !masterItems?.length) return;
        setReturnInspectionItems(masterItems.map((item: any) => ({
          id: item.id,
          name: item.item_name,
          checked: false,
          category: DB_CATEGORY_TO_INSPECTION[item.category] ?? 'cleanliness',
        })));
      } catch (err) {
        console.error('Error loading checklist items:', err);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const totalDistance = returnMileage && reservation.departureInspection?.mileage
    ? parseInt(returnMileage) - reservation.departureInspection.mileage
    : 0;

  const fuelLevels = [
    { value: 'full', label: 'PLEIN' },
    { value: 'half', label: '1/2' },
    { value: 'quarter', label: '1/4' },
    { value: 'eighth', label: '1/8' },
    { value: 'empty', label: 'VIDE' }
  ];

  const totalFees = (parseFloat(excessMileage) || 0) + (parseFloat(missingFuel) || 0);

  const securityItems = returnInspectionItems.filter(i => i.category === 'security');
  const equipmentItems = returnInspectionItems.filter(i => i.category === 'equipment');
  const comfortItems = returnInspectionItems.filter(i => i.category === 'comfort' || i.category === 'cleanliness');

  // Mêmes catégories, mêmes icônes et même ordre que l'étape 3 de la création :
  // l'agent retrouve la check-list de départ, à l'identique, au moment du retour.
  const returnChecklistCategories = [
    { key: 'security', title: lang === 'fr' ? 'Sécurité' : 'الأمان', icon: '🛡️', items: securityItems },
    { key: 'equipment', title: lang === 'fr' ? 'Équipements' : 'المعدات', icon: '🔧', items: equipmentItems },
    { key: 'comfort', title: lang === 'fr' ? 'Confort & Propreté' : 'الراحة والنظافة', icon: '✨', items: comfortItems },
  ];

  const checkedItemsCount = returnInspectionItems.filter(i => i.checked).length;

  const handleInspectionItemToggle = (itemId: string, checked?: boolean) => {
    setReturnInspectionItems(prev =>
      prev.map(item =>
        item.id === itemId ? { ...item, checked: checked !== undefined ? checked : !item.checked } : item
      )
    );
  };

  const setAllInspectionItems = (checked: boolean) => {
    setReturnInspectionItems(prev => prev.map(item => ({ ...item, checked })));
  };

  const handleComplete = async () => {
    try {
      // Validate required fields
      if (!returnMileage || returnMileage.trim() === '') {
        const msg = lang === 'fr' ? 'Le kilométrage de retour est obligatoire' : 'عداد العودة مطلوب';
        setErrorMessage(msg);
        console.warn('Validation: Missing return mileage');
        return;
      }

      if (isNaN(parseInt(returnMileage))) {
        const msg = lang === 'fr' ? 'Le kilométrage doit être un nombre valide' : 'العداد يجب أن يكون رقم صحيح';
        setErrorMessage(msg);
        console.warn('Validation: Invalid return mileage');
        return;
      }

      setErrorMessage(null);
      setIsLoading(true);

      console.log('🟢 Starting reservation completion for:', reservation.id);

      await ReservationsService.completeReservationWithInspection({
        reservationId: reservation.id,
        carId: reservation.carId,
        returnMileage: parseInt(returnMileage),
        returnFuelLevel: returnFuelLevel,
        returnLocation: reservation.step1.returnAgency || reservation.step1.departureAgency,
        returnAgencyId: reservation.step1.returnAgency || reservation.step1.departureAgency,
        excessMileage: parseFloat(excessMileage) || 0,
        missingFuel: parseFloat(missingFuel) || 0,
        signatureDataUrl: signature,
        notes: notes,
        inspectionItems: returnInspectionItems,
      });

      console.log('🟢 Reservation completion successful, updating car info...');

      // Update car mileage and fuel level
      const { error: carError } = await supabase
        .from('cars')
        .update({ 
          mileage: parseInt(returnMileage),
          fuel_level: returnFuelLevel
        })
        .eq('id', reservation.car.id);

      if (carError) {
        console.error('❌ Car update error:', carError);
        throw new Error(`Car update failed: ${carError.message}`);
      }

      console.log('🟢 Car info updated successfully');

      // Update the local reservation state
      const updatedReservation = {
        ...reservation,
        status: 'completed' as const,
        completedAt: new Date().toISOString(),
        returnInspection: {
          id: `return-${reservation.id}`,
          reservationId: reservation.id,
          type: 'return' as const,
          mileage: parseInt(returnMileage),
          fuelLevel: returnFuelLevel,
          location: reservation.step1.returnAgency || reservation.step1.departureAgency,
          date: returnDate,
          time: returnTime,
          interiorPhotos: [],
          exteriorPhotos: [],
          inspectionItems: returnInspectionItems,
          notes: notes,
          signature: signature,
          createdAt: new Date().toISOString()
        },
        excessMileage: parseFloat(excessMileage) || 0,
        missingFuel: parseFloat(missingFuel) || 0,
        additionalFees: totalFees,
        notes: notes
      };

      console.log('🟢 Reservation completed successfully');
      onComplete?.(updatedReservation);
      onClose();
    } catch (error: any) {
      const errorMsg = error?.message || error?.toString() || 'Unknown error';
      console.error('❌ Error completing reservation:', error);
      console.error('Error details:', {
        message: errorMsg,
        code: error?.code,
        details: error?.details
      });

      // Provide user-friendly error message
      let userMessage = lang === 'fr' 
        ? 'Erreur lors de la finalisation de la location'
        : 'خطأ في إنهاء التأجير';

      if (errorMsg.includes('permission') || errorMsg.includes('Policy')) {
        userMessage = lang === 'fr'
          ? 'Vous n\'avez pas la permission d\'effectuer cette action. Veuillez contacter l\'administrateur.'
          : 'ليس لديك صلاحية لإجراء هذا الإجراء. يرجى الاتصال بالمسؤول.';
      } else if (errorMsg.includes('not found') || errorMsg.includes('does not exist')) {
        userMessage = lang === 'fr'
          ? 'La réservation n\'existe pas ou a été supprimée'
          : 'التأجير غير موجود أو تم حذفه';
      }

      setErrorMessage(`${userMessage}: ${errorMsg}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fx-overlay p-4"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="fx-modal sm:max-w-5xl"
      >
        {/* Corps défilant : cf. modale d'activation — c'est ce conteneur qui
            défile pour que le contenu long reste entièrement accessible. */}
        <div className="fx-modal-body custom-scrollbar p-5 sm:p-6" style={{ minHeight: 0 }}>
        {/* Bandeau rouge : clôturer, c'est arrêter la facturation et figer les
            comptes de la location. C'est l'action la plus définitive de l'écran. */}
        <div
          className="mb-5 rounded-xl px-4 py-3.5 flex items-center gap-3"
          style={{
            backgroundImage: 'var(--fx-grad-red-tint)',
            border: '1px solid var(--fx-line-red)',
          }}
        >
          <span className="text-2xl">🏁</span>
          <div className="min-w-0">
            <h3 className="fx-title text-lg leading-tight" style={{ color: 'var(--fx-red-200)' }}>
              {lang === 'fr' ? 'Clôturer la location' : 'إنهاء التأجير'}
            </h3>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>
              {lang === 'fr'
                ? 'Inspection de retour : kilométrage, carburant et dommages éventuels. La facturation s’arrête ici.'
                : 'فحص العودة: العداد والوقود والأضرار. تتوقف الفوترة هنا.'}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Car Information */}
          <div className="bg-gradient-to-r from-saas-primary-start/10 to-saas-primary-end/10 rounded-xl p-4 border border-saas-primary-start/20">
            <h4 className="text-lg font-black text-saas-text-main mb-4">
              🚗 {lang === 'fr' ? 'Informations du Véhicule' : 'معلومات المركبة'}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="font-bold text-saas-text-main">{reservation.car.brand} {reservation.car.model}</p>
                <p className="text-saas-text-muted">{reservation.car.registration}</p>
              </div>
              <div>
                <p className="font-bold text-saas-text-main">{lang === 'fr' ? 'Couleur' : 'اللون'}</p>
                <p className="text-saas-text-muted">{reservation.car.color}</p>
              </div>
              <div>
                <p className="font-bold text-saas-text-main">{lang === 'fr' ? 'Énergie' : 'الطاقة'}</p>
                <p className="text-saas-text-muted">{reservation.car.energy}</p>
              </div>
              <div>
                <p className="font-bold text-saas-text-main">{lang === 'fr' ? 'Kilométrage Actuel' : 'العداد الحالي'}</p>
                <p className="text-saas-text-muted">{formatAmount(reservation.car.mileage)} km</p>
              </div>
            </div>
          </div>

          {/* KM Tracking */}
          <div className="bg-blue-50 rounded-2xl p-6 border border-blue-200">
            <h4 className="text-lg font-black text-blue-900 mb-4">
              🧭 {lang === 'fr' ? 'Kilométrage au Départ (Check-in)' : 'عداد الكيلومترات عند المغادرة (الدخول)'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  {lang === 'fr' ? 'Kilométrage au Départ' : 'عداد المغادرة'}
                </label>
                <input
                  type="number"
                  value={reservation.departureInspection?.mileage || ''}
                  className="w-full p-3 border border-blue-200 rounded-lg bg-slate-100"
                  readOnly
                />
              </div>
              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  {lang === 'fr' ? 'Kilométrage de Retour (Entrée Requise)' : 'عداد العودة (إدخال مطلوب)'}
                </label>
                <input
                  type="number"
                  value={returnMileage}
                  onChange={(e) => setReturnMileage(e.target.value)}
                  className="w-full p-3 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0"
                  required
                />
              </div>
              <div>
                <label className="block font-bold text-blue-900 mb-2">
                  {lang === 'fr' ? 'Distance Totale Parcourue' : 'المسافة الإجمالية المقطوعة'}
                </label>
                <input
                  type="number"
                  value={totalDistance}
                  className="w-full p-3 border border-blue-200 rounded-lg bg-slate-100"
                  readOnly
                />
              </div>
            </div>
          </div>

          {/* Fuel Level */}
          <div className="bg-green-50 rounded-2xl p-6 border border-green-200">
            <h4 className="text-lg font-black text-green-900 mb-4">
              ⛽ {lang === 'fr' ? 'Niveau Carburant' : 'مستوى الوقود'}
            </h4>
            <div className="space-y-4">
              <div>
                <p className="font-bold text-green-900">
                  {lang === 'fr' ? 'Départ' : 'المغادرة'}: {
                    reservation.departureInspection?.fuelLevel === 'full' ? 'PLEIN' :
                    reservation.departureInspection?.fuelLevel === 'half' ? '1/2' :
                    reservation.departureInspection?.fuelLevel === 'quarter' ? '1/4' :
                    reservation.departureInspection?.fuelLevel === 'eighth' ? '1/8' : 'VIDE'
                  }
                </p>
              </div>
              <div>
                <label className="block font-bold text-green-900 mb-3">
                  {lang === 'fr' ? 'Niveau de retour' : 'مستوى العودة'}
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {fuelLevels.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => setReturnFuelLevel(level.value as any)}
                      className={`p-3 border-2 rounded-lg font-bold transition-all ${
                        returnFuelLevel === level.value
                          ? 'border-green-600 bg-green-600 text-white shadow-lg'
                          : 'border-green-200 hover:border-green-400 hover:bg-green-50'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dates and Times */}
          <div className="bg-purple-50 rounded-2xl p-6 border border-purple-200">
            <h4 className="text-lg font-black text-purple-900 mb-4">
              📅 {lang === 'fr' ? 'Dates et Heures' : 'التواريخ والأوقات'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h5 className="font-bold text-purple-900 mb-2">{lang === 'fr' ? 'Départ' : 'المغادرة'}</h5>
                <p className="text-purple-800">{reservation.step1.departureDate} à {reservation.step1.departureTime}</p>
              </div>
              <div>
                <h5 className="font-bold text-purple-900 mb-2 flex items-center gap-2">
                  {lang === 'fr' ? 'Retour' : 'العودة'}
                  <button className="text-purple-600 hover:text-purple-800">
                    <Edit className="w-4 h-4" />
                  </button>
                </h5>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="flex-1 p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                  <input
                    type="time"
                    value={returnTime}
                    onChange={(e) => setReturnTime(e.target.value)}
                    className="flex-1 p-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Additional Fees */}
          <div className="bg-red-50 rounded-2xl p-6 border border-red-200">
            <h4 className="text-lg font-black text-red-900 mb-4">
              💸 {lang === 'fr' ? 'Frais Supplémentaires de Clôture' : 'رسوم الإغلاق الإضافية'}
            </h4>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-red-900 mb-2">
                    {lang === 'fr' ? 'Kilométrage Excédentaire' : 'عداد الكيلومترات الزائد'}
                  </label>
                  <p className="text-sm text-red-700 mb-1">{lang === 'fr' ? 'Facturé si dépassement forfait' : 'يتم احتسابه عند تجاوز الحد المسموح'}</p>
                  <input
                    type="number"
                    value={excessMileage}
                    onChange={(e) => setExcessMileage(e.target.value)}
                    className="w-full p-3 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block font-bold text-red-900 mb-2">
                    {lang === 'fr' ? 'Carburant Manquant' : 'الوقود المفقود'}
                  </label>
                  <p className="text-sm text-red-700 mb-1">{lang === 'fr' ? 'Différence par rapport au check-in' : 'الفرق مقارنة بالدخول'}</p>
                  <input
                    type="number"
                    value={missingFuel}
                    onChange={(e) => setMissingFuel(e.target.value)}
                    className="w-full p-3 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="bg-red-100 rounded-lg p-4">
                <p className="font-bold text-red-900">
                  {lang === 'fr' ? 'Total Frais de Clôture (TTC)' : 'إجمالي رسوم الإغلاق (شامل الضريبة)'}: {formatAmount(totalFees)} DA
                </p>
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="bg-yellow-50 rounded-2xl p-6 border border-yellow-200">
            <h4 className="text-lg font-black text-yellow-900 mb-4">
              📄 {lang === 'fr' ? 'Documents laissés par le client' : 'الوثائق المتروكة من قبل العميل'}
            </h4>
            <div className="space-y-4">
              <p className="text-yellow-800">
                {lang === 'fr' ? 'Aucun document trouvé pour ce client.' : 'لم يتم العثور على أي وثيقة لهذا العميل.'}
              </p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="documents"
                    checked={documentsRecovered}
                    onChange={() => setDocumentsRecovered(true)}
                    className="text-yellow-600"
                  />
                  <span className="font-bold text-yellow-900">
                    {lang === 'fr' ? 'Client a récupéré' : 'العميل استلم'}
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="documents"
                    checked={!documentsRecovered}
                    onChange={() => setDocumentsRecovered(false)}
                    className="text-yellow-600"
                  />
                  <span className="font-bold text-yellow-900">
                    {lang === 'fr' ? 'Notifier client (non récupéré)' : 'إشعار العميل (غير مستلم)'}
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Return Inspection — même check-list que l'étape « Inspection Départ » de la création */}
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xl font-black text-slate-900">
                  ✅ {lang === 'fr' ? 'Contrôle d\'État du Véhicule (Retour)' : 'فحص حالة المركبة (العودة)'}
                </h4>
                <p className="text-sm font-bold text-slate-500 mt-1">
                  {lang === 'fr'
                    ? `${checkedItemsCount} / ${returnInspectionItems.length} points conformes`
                    : `${checkedItemsCount} / ${returnInspectionItems.length} عناصر مطابقة`}
                </p>
              </div>
              {returnInspectionItems.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setAllInspectionItems(true)}
                    className="px-4 py-2 rounded-lg border-2 border-green-500 text-green-700 hover:bg-green-50 font-bold text-sm transition-colors"
                  >
                    {lang === 'fr' ? 'Tout conforme' : 'الكل مطابق'}
                  </button>
                  <button
                    onClick={() => setAllInspectionItems(false)}
                    className="px-4 py-2 rounded-lg border-2 border-red-300 text-red-700 hover:bg-red-50 font-bold text-sm transition-colors"
                  >
                    {lang === 'fr' ? 'Tout décocher' : 'إلغاء تحديد الكل'}
                  </button>
                </div>
              )}
            </div>

            {returnInspectionItems.length === 0 ? (
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
                <p className="font-bold text-slate-600">
                  {lang === 'fr'
                    ? 'Aucun point de contrôle disponible pour cette réservation.'
                    : 'لا توجد عناصر فحص متاحة لهذا الحجز.'}
                </p>
              </div>
            ) : (
              returnChecklistCategories
                .filter(category => category.items.length > 0)
                .map(category => {
                  const categoryCheckedCount = category.items.filter(i => i.checked).length;

                  return (
                    <div key={category.key} className="bg-white rounded-2xl shadow-lg p-6 border border-slate-200">
                      <h5 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
                        {category.icon} {category.title}
                        <span className="ml-auto text-sm font-bold text-slate-500">
                          {categoryCheckedCount} / {category.items.length}
                        </span>
                      </h5>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {category.items.map(item => (
                          <div
                            key={item.id}
                            onClick={() => handleInspectionItemToggle(item.id)}
                            role="checkbox"
                            aria-checked={item.checked}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleInspectionItemToggle(item.id);
                              }
                            }}
                            className={`flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              item.checked
                                ? 'border-green-500 bg-green-50'
                                : 'border-red-300 bg-red-50'
                            }`}
                          >
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                item.checked ? 'border-green-500 bg-green-500' : 'border-red-300 bg-red-300'
                              }`}
                            >
                              {item.checked && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={`font-bold flex-1 ${item.checked ? 'text-green-800' : 'text-red-800'}`}>
                              {item.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          {/* Signature */}
          <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-200">
            <h4 className="text-lg font-black text-indigo-900 mb-4">
              ✍️ {lang === 'fr' ? 'Signature du Client' : 'توقيع العميل'}
            </h4>
            <div className="max-w-xs mx-auto">
            <SignaturePad lang={lang} onSignatureChange={setSignature} />
          </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-900 mb-2">
              📝 {lang === 'fr' ? 'Note (Optionnel)' : 'ملاحظة (اختياري)'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder={lang === 'fr' ? 'Observations supplémentaires...' : 'ملاحظات إضافية...'}
            />
          </div>
        </div>

        {/* Error Message Display */}
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-4"
          >
            <p className="text-red-700 font-bold text-sm">
              ❌ {lang === 'fr' ? 'Erreur' : 'خطأ'}: {errorMessage}
            </p>
            <p className="text-red-600 text-xs mt-2">
              {lang === 'fr' 
                ? 'Vérifiez votre connexion et les données saisies. Voir la console pour plus de détails.'
                : 'تحقق من الاتصال والبيانات المدخلة. راجع وحدة التحكم لمزيد من التفاصيل.'}
            </p>
          </motion.div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 font-bold py-3 px-4 rounded-lg transition-colors"
          >
            {lang === 'fr' ? 'Annuler' : 'إلغاء'}
          </button>
          <button
            onClick={handleComplete}
            disabled={isLoading}
            className="flex-1 btn-saas-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="animate-spin">⏳</span>
                {lang === 'fr' ? 'Traitement...' : 'جاري المعالجة...'}
              </>
            ) : (
              <>✅ {lang === 'fr' ? 'Terminer la Location' : 'إنهاء التأجير'}</>
            )}
          </button>
        </div>
        </div>
      </motion.div>
    </motion.div>
  );
};