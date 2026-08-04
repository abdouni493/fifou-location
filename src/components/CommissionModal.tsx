import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2 } from 'lucide-react';
import { Car, CommissionType, Language } from '../types';
import { updateCommission } from '../services/consignmentService';

interface CommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Appelé après une mise à jour réussie, pour rafraîchir la liste. */
  onSaved: () => void;
  car: Car | null;
  lang: Language;
}

/**
 * Mini-modal « Modifier commission » — raccourci depuis la carte véhicule, sans
 * ouvrir tout le CarModal. La commission est modifiable à tout moment : les
 * locations déjà terminées gardent le montant figé à leur clôture.
 */
export const CommissionModal: React.FC<CommissionModalProps> = ({ isOpen, onClose, onSaved, car, lang }) => {
  const [commissionType, setCommissionType] = useState<CommissionType>('percentage');
  const [commissionValue, setCommissionValue] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (car?.ownerInfo) {
      setCommissionType(car.ownerInfo.commissionType);
      setCommissionValue(car.ownerInfo.commissionValue);
    }
    setError(null);
  }, [car, isOpen]);

  if (!isOpen || !car) return null;

  const isPercentage = commissionType === 'percentage';

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    const result = await updateCommission(car.id, commissionType, commissionValue);
    setIsSaving(false);

    if (result.success) {
      onSaved();
      onClose();
    } else {
      setError(result.error || (lang === 'fr' ? 'Échec de la mise à jour' : 'فشل التحديث'));
    }
  };

  return (
    <div className="fx-overlay">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl overflow-hidden border border-saas-border"
      >
        <div className="p-6 border-b border-saas-border flex items-center justify-between bg-amber-50">
          <div>
            <h2 className="text-lg font-black uppercase tracking-tighter text-amber-900">
              💰 {lang === 'fr' ? 'Modifier la commission' : 'تعديل العمولة'}
            </h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-700/80 mt-1">
              {car.ownerInfo?.internalRef ? `${car.ownerInfo.internalRef} · ` : ''}
              {car.brand} {car.model}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-amber-100 rounded-xl transition-colors text-amber-900">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
              !isPercentage ? 'bg-amber-50 border-amber-400' : 'border-saas-border hover:border-amber-300'
            }`}>
              <input
                type="radio"
                checked={!isPercentage}
                onChange={() => setCommissionType('amount')}
                className="accent-amber-600"
              />
              <span className="text-xs font-bold">{lang === 'fr' ? 'En dinars (DA)' : 'بالدينار (DA)'}</span>
            </label>
            <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
              isPercentage ? 'bg-amber-50 border-amber-400' : 'border-saas-border hover:border-amber-300'
            }`}>
              <input
                type="radio"
                checked={isPercentage}
                onChange={() => setCommissionType('percentage')}
                className="accent-amber-600"
              />
              <span className="text-xs font-bold">{lang === 'fr' ? 'En pourcentage (%)' : 'بالنسبة المئوية (%)'}</span>
            </label>
          </div>

          <div className="space-y-2">
            <label className="label-saas">{lang === 'fr' ? 'Valeur' : 'القيمة'}</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={isPercentage ? 100 : undefined}
                step={isPercentage ? 0.5 : 100}
                value={commissionValue}
                onChange={e => setCommissionValue(Math.max(0, Number(e.target.value) || 0))}
                className="input-saas pe-16"
                dir="ltr"
                autoFocus
              />
              <span className="absolute end-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700">
                {isPercentage ? '%' : 'DA'}
              </span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-2.5 rounded-xl text-xs font-bold">
              {error}
            </div>
          )}
        </div>

        <div className="p-6 border-t border-saas-border flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn-saas-outline px-6" disabled={isSaving}>
            {lang === 'fr' ? 'Annuler' : 'إلغاء'}
          </button>
          <button onClick={handleSave} disabled={isSaving} className="btn-saas-primary px-8 flex items-center gap-2">
            {isSaving && <Loader2 size={16} className="animate-spin" />}
            {lang === 'fr' ? 'Enregistrer' : 'حفظ'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
