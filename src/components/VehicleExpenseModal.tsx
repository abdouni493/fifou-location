import React, { useState, useEffect } from 'react';
import { VehicleExpense, Language, Car } from '../types';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { CarPicker } from './ui/CarPicker';

interface VehicleExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<VehicleExpense>) => void;
  expense?: VehicleExpense;
  cars: Car[];
  lang: Language;
}

export const VehicleExpenseModal: React.FC<VehicleExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  expense,
  cars,
  lang,
}) => {
  const [formData, setFormData] = useState({
    carId: '',
    type: 'vidange' as const,
    cost: 0,
    date: new Date().toISOString().split('T')[0],
    note: '',
    currentMileage: 0,
    nextVidangeKm: 0,
    prochainKm: 0,
    expenseName: '',
    expirationDate: '',
    oilFilterChanged: false,
    airFilterChanged: false,
    fuelFilterChanged: false,
    acFilterChanged: false,
  });

  useEffect(() => {
    if (expense) {
      setFormData({
        carId: expense.carId,
        type: expense.type,
        cost: expense.cost,
        date: expense.date,
        note: expense.note || '',
        currentMileage: expense.currentMileage || 0,
        nextVidangeKm: expense.nextVidangeKm || 0,
        prochainKm: (expense.currentMileage || 0) + (expense.nextVidangeKm || 0),
        expenseName: expense.expenseName || '',
        expirationDate: expense.expirationDate || '',
        oilFilterChanged: (expense as any).oilFilterChanged || false,
        airFilterChanged: (expense as any).airFilterChanged || false,
        fuelFilterChanged: (expense as any).fuelFilterChanged || false,
        acFilterChanged: (expense as any).acFilterChanged || false,
      });
    } else {
      const selectedCar = cars.length > 0 ? cars[0] : null;
      const currentMileage = selectedCar?.mileage || 0;
      const nextVidangeKm = 10000;
      setFormData({
        carId: selectedCar?.id || '',
        type: 'vidange',
        cost: 0,
        date: new Date().toISOString().split('T')[0],
        note: '',
        currentMileage,
        nextVidangeKm,
        prochainKm: currentMileage + nextVidangeKm,
        expenseName: '',
        expirationDate: '',
        oilFilterChanged: false,
        airFilterChanged: false,
        fuelFilterChanged: false,
        acFilterChanged: false,
      });
    }
  }, [expense, isOpen, cars]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type: inputType } = e.target;
    
    // Handle checkbox changes
    if (inputType === 'checkbox') {
      const target = e.target as HTMLInputElement;
      setFormData(prev => ({
        ...prev,
        [name]: target.checked,
      }));
    } else {
      const numValue = ['cost', 'currentMileage', 'nextVidangeKm', 'prochainKm'].includes(name)
        ? parseInt(value) || 0
        : value;

      setFormData(prev => {
        const updated = {
          ...prev,
          [name]: numValue,
        };

        // Bidirectional calculation for vidange and chaine
        if ((formData.type === 'vidange' || formData.type === 'chaine') && 
            ['currentMileage', 'nextVidangeKm', 'prochainKm'].includes(name)) {
          
          if (name === 'nextVidangeKm') {
            // If user edits "Km pour Prochaine Vidange", calculate Prochain
            // Prochain = currentMileage + nextVidangeKm
            updated.prochainKm = (updated.currentMileage || prev.currentMileage) + numValue;
          } else if (name === 'prochainKm') {
            // If user edits "Prochain", calculate "Km pour Prochaine Vidange"
            // nextVidangeKm = Prochain - currentMileage
            updated.nextVidangeKm = numValue - (updated.currentMileage || prev.currentMileage);
          } else if (name === 'currentMileage') {
            // If user edits currentMileage, recalculate Prochain
            // Prochain = currentMileage + nextVidangeKm
            updated.prochainKm = numValue + (updated.nextVidangeKm || prev.nextVidangeKm);
          }
        }

        return updated;
      });
    }
  };

  const handleCarChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const carId = e.target.value;
    const selectedCar = cars.find(c => c.id === carId);
    const currentMileage = selectedCar?.mileage || 0;
    const nextVidangeKm = 10000;
    setFormData(prev => ({
      ...prev,
      carId,
      currentMileage,
      nextVidangeKm,
      prochainKm: currentMileage + nextVidangeKm,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData: Partial<VehicleExpense> = {
      carId: formData.carId,
      type: formData.type,
      cost: formData.cost,
      date: formData.date,
      note: formData.note || undefined,
    };

    if (formData.type === 'vidange' || formData.type === 'chaine') {
      submitData.currentMileage = formData.currentMileage;
      submitData.nextVidangeKm = formData.nextVidangeKm;
    } else if (formData.type === 'autre') {
      submitData.expenseName = formData.expenseName;
    }
    
    // Always include expirationDate for assurance and controle types
    if (formData.type === 'assurance' || formData.type === 'controle') {
      submitData.expirationDate = formData.expirationDate || undefined;
    }

    // Include filter tracking for vidange type
    if (formData.type === 'vidange') {
      (submitData as any).oilFilterChanged = formData.oilFilterChanged;
      (submitData as any).airFilterChanged = formData.airFilterChanged;
      (submitData as any).fuelFilterChanged = formData.fuelFilterChanged;
      (submitData as any).acFilterChanged = formData.acFilterChanged;
    }

    onSave(submitData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fx-overlay">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        className="fx-modal sm:max-w-lg"
      >
        <div className="fx-modal-head">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg"
              style={{ backgroundImage: 'var(--fx-grad-red-tint)', border: '1px solid var(--fx-line-red)' }}
            >
              🚗
            </span>
            <div className="min-w-0">
              <h2 className="fx-title text-base sm:text-lg leading-tight truncate">
                {{ fr: 'Dépense véhicule', ar: 'نفقة المركبة' }[lang]}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>
                {{ fr: 'Entretien, assurance, contrôle ou frais divers', ar: 'صيانة، تأمين، فحص' }[lang]}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="fx-icon-btn p-2 shrink-0">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="fx-modal-body space-y-4 custom-scrollbar">
          {/* Véhicule — recherche par marque, modèle, immatriculation ou châssis */}
          <div className="space-y-2">
            <label className="fx-label">🚗 {{ fr: 'Véhicule', ar: 'المركبة' }[lang]} *</label>
            <CarPicker
              cars={cars}
              value={formData.carId}
              lang={lang}
              required
              onChange={(carId) =>
                handleCarChange({ target: { value: carId } } as React.ChangeEvent<HTMLSelectElement>)
              }
            />
          </div>

          {/* Expense Type */}
          <div className="space-y-2">
            <label className="label-saas">💰 {{fr: 'Type de dépense *', ar: 'نوع النفقة *'}[lang]}</label>
            <div className="grid grid-cols-2 gap-2">
              {['vidange', 'assurance', 'controle', 'chaine', 'autre'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, type: type as any }))}
                  className={`py-2 px-2 rounded-lg font-bold text-xs transition-all flex flex-col items-center gap-1 ${
                    formData.type === type
                      ? 'btn-saas-primary'
                      : 'btn-saas-outline'
                  }`}
                >
                  {{
                    vidange: { icon: '🛢️', label: lang === 'fr' ? 'Vidange' : 'تغيير الزيت' },
                    assurance: { icon: '🛡️', label: lang === 'fr' ? 'Assurance' : 'التأمين' },
                    controle: { icon: '🛠️', label: lang === 'fr' ? 'Contrôle' : 'الفحص' },
                    chaine: { icon: '⛓️', label: lang === 'fr' ? 'Chaîne' : 'السلسلة' },
                    autre: { icon: '❓', label: lang === 'fr' ? 'Autre' : 'آخر' },
                  }[type] && (
                    <>
                      <span className="text-lg">{{
                        vidange: '🛢️',
                        assurance: '🛡️',
                        controle: '🛠️',
                        chaine: '⛓️',
                        autre: '❓',
                      }[type]}</span>
                      <span>{{
                        vidange: lang === 'fr' ? 'Vidange' : 'تغيير الزيت',
                        assurance: lang === 'fr' ? 'Assurance' : 'التأمين',
                        controle: lang === 'fr' ? 'Contrôle' : 'الفحص',
                        chaine: lang === 'fr' ? 'Chaîne' : 'السلسلة',
                        autre: lang === 'fr' ? 'Autre' : 'آخر',
                      }[type]}</span>
                    </>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* VIDANGE SECTION */}
          {formData.type === 'vidange' && (
            <>
              {/* Current Mileage - NOW EDITABLE */}
              <div className="space-y-2">
                <label className="label-saas">🚗 {{fr: 'Kilométrage Actuel', ar: 'المسافة الحالية'}[lang]}</label>
                <input
                  type="number"
                  name="currentMileage"
                  value={formData.currentMileage || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas text-lg font-bold text-center"
                  min="0"
                  required
                />
              </div>

              {/* Cost */}
              <div className="space-y-2">
                <label className="label-saas">💵 {{fr: 'Coût (DZD)', ar: 'التكلفة (دينار)'}[lang]}</label>
                <input
                  type="number"
                  name="cost"
                  value={formData.cost || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas"
                  min="0"
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="label-saas">📅 {{fr: 'Date', ar: 'التاريخ'}[lang]}</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="input-saas"
                  required
                />
              </div>

              {/* Next Vidange KM - Editable with automatic Prochain calculation */}
              <div className="space-y-2">
                <label className="label-saas">↩️ {{fr: 'Km pour Prochaine Vidange', ar: 'كم للتغيير التالي'}[lang]}</label>
                <input
                  type="number"
                  name="nextVidangeKm"
                  value={formData.nextVidangeKm || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas"
                  min="0"
                />
              </div>

              {/* Prochain - NOW EDITABLE with automatic nextVidangeKm calculation */}
              <div className="space-y-2">
                <label className="label-saas">🏁 {{fr: 'Prochain', ar: 'القادم'}[lang]}</label>
                <input
                  type="number"
                  name="prochainKm"
                  value={formData.prochainKm || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas text-lg font-bold text-center text-green-600"
                  min="0"
                />
              </div>

              {/* Filter Tracking Section */}
              <div className="space-y-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <label className="label-saas">🔧 {{fr: 'Filtres changés', ar: 'الفلاتر المتغيرة'}[lang]}</label>
                <div className="space-y-2">
                  {/* Oil Filter */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="oilFilterChanged"
                      name="oilFilterChanged"
                      checked={formData.oilFilterChanged}
                      onChange={handleChange}
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                    <label htmlFor="oilFilterChanged" className="cursor-pointer flex items-center gap-2 text-sm font-medium">
                      <span>🛢️</span>
                      <span>{{fr: 'Filtre à huile', ar: 'فلتر الزيت'}[lang]}</span>
                    </label>
                  </div>

                  {/* Air Filter */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="airFilterChanged"
                      name="airFilterChanged"
                      checked={formData.airFilterChanged}
                      onChange={handleChange}
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                    <label htmlFor="airFilterChanged" className="cursor-pointer flex items-center gap-2 text-sm font-medium">
                      <span>💨</span>
                      <span>{{fr: 'Filtre à air', ar: 'فلتر الهواء'}[lang]}</span>
                    </label>
                  </div>

                  {/* Fuel Filter */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="fuelFilterChanged"
                      name="fuelFilterChanged"
                      checked={formData.fuelFilterChanged}
                      onChange={handleChange}
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                    <label htmlFor="fuelFilterChanged" className="cursor-pointer flex items-center gap-2 text-sm font-medium">
                      <span>⛽</span>
                      <span>{{fr: 'Filtre à carburant', ar: 'فلتر الوقود'}[lang]}</span>
                    </label>
                  </div>

                  {/* AC Filter */}
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="acFilterChanged"
                      name="acFilterChanged"
                      checked={formData.acFilterChanged}
                      onChange={handleChange}
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                    <label htmlFor="acFilterChanged" className="cursor-pointer flex items-center gap-2 text-sm font-medium">
                      <span>❄️</span>
                      <span>{{fr: 'Filtre climatisation', ar: 'فلتر تكييف الهواء'}[lang]}</span>
                    </label>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* CHAÎNE SECTION */}
          {formData.type === 'chaine' && (
            <>
              {/* Current Mileage - EDITABLE */}
              <div className="space-y-2">
                <label className="label-saas">🚗 {{fr: 'Kilométrage Actuel', ar: 'المسافة الحالية'}[lang]}</label>
                <input
                  type="number"
                  name="currentMileage"
                  value={formData.currentMileage || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas text-lg font-bold text-center"
                  min="0"
                  required
                />
              </div>

              {/* Cost */}
              <div className="space-y-2">
                <label className="label-saas">💵 {{fr: 'Coût (DZD)', ar: 'التكلفة (دينار)'}[lang]}</label>
                <input
                  type="number"
                  name="cost"
                  value={formData.cost || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas"
                  min="0"
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="label-saas">📅 {{fr: 'Date', ar: 'التاريخ'}[lang]}</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="input-saas"
                  required
                />
              </div>

              {/* Next Chaîne KM - Editable with automatic Prochain calculation */}
              <div className="space-y-2">
                <label className="label-saas">↩️ {{fr: 'Km pour Prochaine Chaîne', ar: 'كم للسلسلة التالية'}[lang]}</label>
                <input
                  type="number"
                  name="nextVidangeKm"
                  value={formData.nextVidangeKm || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas"
                  min="0"
                />
              </div>

              {/* Prochain - NOW EDITABLE with automatic nextVidangeKm calculation */}
              <div className="space-y-2">
                <label className="label-saas">🏁 {{fr: 'Prochain', ar: 'القادم'}[lang]}</label>
                <input
                  type="number"
                  name="prochainKm"
                  value={formData.prochainKm || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas text-lg font-bold text-center text-green-600"
                  min="0"
                />
              </div>
            </>
          )}

          {/* AUTRE SECTION */}
          {formData.type === 'autre' && (
            <>
              {/* Expense Name */}
              <div className="space-y-2">
                <label className="label-saas">📝 {{fr: 'Nom de la dépense', ar: 'اسم النفقة'}[lang]}</label>
                <input
                  type="text"
                  name="expenseName"
                  value={formData.expenseName}
                  onChange={handleChange}
                  placeholder={{fr: 'Réparation pneu', ar: 'إصلاح الإطار'}[lang]}
                  className="input-saas"
                  required
                />
              </div>

              {/* Cost */}
              <div className="space-y-2">
                <label className="label-saas">💵 {{fr: 'Coût (DZD)', ar: 'التكلفة (دينار)'}[lang]}</label>
                <input
                  type="number"
                  name="cost"
                  value={formData.cost || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas"
                  min="0"
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="label-saas">📅 {{fr: 'Date', ar: 'التاريخ'}[lang]}</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="input-saas"
                  required
                />
              </div>
            </>
          )}

          {/* ASSURANCE SECTION */}
          {formData.type === 'assurance' && (
            <>
              {/* Cost */}
              <div className="space-y-2">
                <label className="label-saas">💵 {{fr: 'Coût (DZD)', ar: 'التكلفة (دينار)'}[lang]}</label>
                <input
                  type="number"
                  name="cost"
                  value={formData.cost || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas"
                  min="0"
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="label-saas">📅 {{fr: 'Date', ar: 'التاريخ'}[lang]}</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="input-saas"
                  required
                />
              </div>

              {/* Expiration Date */}
              <div className="space-y-2">
                <label className="label-saas">🛡️ {{fr: 'Date d\'expiration', ar: 'تاريخ الانتهاء'}[lang]}</label>
                <input
                  type="date"
                  name="expirationDate"
                  value={formData.expirationDate}
                  onChange={handleChange}
                  className="input-saas"
                />
              </div>
            </>
          )}

          {/* CONTRÔLE SECTION */}
          {formData.type === 'controle' && (
            <>
              {/* Cost */}
              <div className="space-y-2">
                <label className="label-saas">💵 {{fr: 'Coût (DZD)', ar: 'التكلفة (دينار)'}[lang]}</label>
                <input
                  type="number"
                  name="cost"
                  value={formData.cost || ''}
                  onChange={handleChange}
                  placeholder="0"
                  className="input-saas"
                  min="0"
                />
              </div>

              {/* Date */}
              <div className="space-y-2">
                <label className="label-saas">📅 {{fr: 'Date', ar: 'التاريخ'}[lang]}</label>
                <input
                  type="date"
                  name="date"
                  value={formData.date}
                  onChange={handleChange}
                  className="input-saas"
                  required
                />
              </div>

              {/* Expiration Date */}
              <div className="space-y-2">
                <label className="label-saas">🛠️ {{fr: 'Date d\'expiration', ar: 'تاريخ الانتهاء'}[lang]}</label>
                <input
                  type="date"
                  name="expirationDate"
                  value={formData.expirationDate}
                  onChange={handleChange}
                  className="input-saas"
                />
              </div>
            </>
          )}

          {/* Note */}
          <div className="space-y-2">
            <label className="label-saas">📄 {{fr: 'Note (optionnel)', ar: 'ملاحظة (اختياري)'}[lang]}</label>
            <textarea
              name="note"
              value={formData.note}
              onChange={handleChange}
              placeholder="Détails supplémentaires..."
              className="input-saas resize-none"
              rows={3}
            />
          </div>
        </form>

        {/* Footer */}
        <div className="fx-modal-foot">
          <button onClick={onClose} className="fx-btn fx-btn-ghost flex-1 py-3 px-4 rounded-xl font-bold text-sm">
            {{fr: 'Annuler', ar: 'إلغاء'}[lang]}
          </button>
          <button
            onClick={handleSubmit}
            className="fx-btn fx-btn-primary flex-1 py-3 px-4 rounded-xl font-bold text-sm"
          >
            {/* Une dépense pré-remplie depuis la maintenance n'a pas d'id : c'est
                un AJOUT à l'historique, pas une modification. Seule une dépense
                existante (avec id, éditée depuis la page Dépenses) affiche « Modifier ». */}
            {{fr: expense?.id ? 'Modifier' : 'Ajouter', ar: expense?.id ? 'تعديل' : 'إضافة'}[lang]}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
