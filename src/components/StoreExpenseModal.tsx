import React, { useState, useEffect } from 'react';
import { StoreExpense, Language } from '../types';
import { motion } from 'motion/react';
import { X } from 'lucide-react';

interface StoreExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<StoreExpense>) => void;
  expense?: StoreExpense;
  lang: Language;
}

const ICONS = ['🏪', '📋', '☕', '🛠️', '🧹', '💡', '🔧', '📦', '🧴', '🪜'];

export const StoreExpenseModal: React.FC<StoreExpenseModalProps> = ({
  isOpen,
  onClose,
  onSave,
  expense,
  lang,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    cost: 0,
    date: new Date().toISOString().split('T')[0],
    note: '',
    icon: '🏪',
  });

  useEffect(() => {
    if (expense) {
      setFormData({
        name: expense.name,
        cost: expense.cost,
        date: expense.date,
        note: expense.note || '',
        icon: expense.icon || '🏪',
      });
    } else {
      setFormData({
        name: '',
        cost: 0,
        date: new Date().toISOString().split('T')[0],
        note: '',
        icon: '🏪',
      });
    }
  }, [expense, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'cost' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
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
              🏪
            </span>
            <div className="min-w-0">
              <h2 className="fx-title text-base sm:text-lg leading-tight truncate">
                {{ fr: 'Dépense agence', ar: 'نفقة المتجر' }[lang]}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>
                {{ fr: 'Loyer, fournitures, charges, services…', ar: 'إيجار، لوازم، خدمات…' }[lang]}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="fx-icon-btn p-2 shrink-0">
            <X size={17} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="fx-modal-body space-y-4 custom-scrollbar">
          {/* Icon Selection */}
          <div className="space-y-2">
            <label className="label-saas">🎨 {{fr: 'Icône', ar: 'الرمز'}[lang]}</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, icon }))}
                  className={`text-2xl p-2 rounded-lg transition-all ${
                    formData.icon === icon
                      ? 'bg-saas-primary-via/20 scale-125'
                      : 'bg-saas-bg hover:bg-saas-bg-light'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <label className="label-saas">📝 {{fr: 'Nom de la dépense *', ar: 'اسم النفقة *'}[lang]}</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Fournitures de bureau"
              className="input-saas"
              required
            />
          </div>

          {/* Cost */}
          <div className="space-y-2">
            <label className="label-saas">💵 {{fr: 'Coût (DZ) *', ar: 'التكلفة (دينار) *'}[lang]}</label>
            <input
              type="number"
              name="cost"
              value={formData.cost || ''}
              onChange={handleChange}
              placeholder="2500"
              className="input-saas"
              required
              min="0"
            />
          </div>

          {/* Date */}
          <div className="space-y-2">
            <label className="label-saas">📅 {{fr: 'Date *', ar: 'التاريخ *'}[lang]}</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="input-saas"
              required
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="label-saas">📌 {{fr: 'Note (optionnel)', ar: 'ملاحظة (اختياري)'}[lang]}</label>
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
            {{fr: expense ? 'Modifier' : 'Ajouter', ar: expense ? 'تعديل' : 'إضافة'}[lang]}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
