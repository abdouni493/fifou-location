import React from 'react';
import { motion } from 'motion/react';
import { Car, Language } from '../types';
import { MaintenanceStatus, getStatusColor, getStatusEmoji } from '../services/maintenanceService';
import { Edit2, Plus } from 'lucide-react';

interface MaintenanceCardProps {
  maintenance: MaintenanceStatus;
  lang: Language;
  onEditCar: (car: Car) => void;
  onVidangeClick: (car: Car, expenseId?: string) => void;
  onChaineClick: (car: Car, expenseId?: string) => void;
  onAssuranceClick: (car: Car, expenseId?: string) => void;
  onControleClick: (car: Car, expenseId?: string) => void;
  /** Dépense libre (type « Autres ») pour ce véhicule. Absent ⇒ bouton masqué. */
  onAutreClick?: (car: Car) => void;
}

export const MaintenanceCard: React.FC<MaintenanceCardProps> = ({
  maintenance,
  lang,
  onEditCar,
  onVidangeClick,
  onChaineClick,
  onAssuranceClick,
  onControleClick,
  onAutreClick,
}) => {
  const { car, vidange, chaine, assurance, controleTechnique } = maintenance;

  const getMaintenanceItems = () => {
    return [
      {
        type: 'vidange',
        icon: '🛢️',
        label: lang === 'fr' ? 'Vidange' : 'تغيير الزيت',
        status: vidange,
        statusValue: vidange.kmRemaining,
        threshold: 1000,
        suffix: lang === 'fr' ? ' KM' : ' كم',
        onClick: () => onVidangeClick(car, vidange.expense?.id),
        color: getStatusColor('vidange', vidange.kmRemaining),
        hoverColor: 'hover:bg-blue-100',
        borderColor: 'border-blue-200 hover:border-blue-400',
      },
      {
        type: 'chaine',
        icon: '⛓️',
        label: lang === 'fr' ? 'Chaîne' : 'السلسلة',
        status: chaine,
        statusValue: chaine.kmRemaining,
        threshold: 1000,
        suffix: lang === 'fr' ? ' KM' : ' كم',
        onClick: () => onChaineClick(car, chaine.expense?.id),
        color: getStatusColor('chaine', chaine.kmRemaining),
        hoverColor: 'hover:bg-purple-100',
        borderColor: 'border-purple-200 hover:border-purple-400',
      },
      {
        type: 'assurance',
        icon: '🛡️',
        label: lang === 'fr' ? 'Assurance' : 'التأمين',
        status: assurance,
        statusValue: assurance.daysRemaining,
        threshold: 30,
        suffix: lang === 'fr' ? ' Jours' : ' أيام',
        onClick: () => onAssuranceClick(car, assurance.expense?.id),
        color: getStatusColor('assurance', assurance.daysRemaining),
        hoverColor: 'hover:bg-green-100',
        borderColor: 'border-green-200 hover:border-green-400',
      },
      {
        type: 'controle',
        icon: '🛠️',
        label: lang === 'fr' ? 'Contrôle' : 'الفحص الفني',
        status: controleTechnique,
        statusValue: controleTechnique.daysRemaining,
        threshold: 30,
        suffix: lang === 'fr' ? ' Jours' : ' أيام',
        onClick: () => onControleClick(car, controleTechnique.expense?.id),
        color: getStatusColor('controle', controleTechnique.daysRemaining),
        hoverColor: 'hover:bg-orange-100',
        borderColor: 'border-orange-200 hover:border-orange-400',
      },
    ];
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      className="fx-card overflow-hidden flex flex-col group"
    >
      {/* ── Visuel ── */}
      <div className="relative h-36 sm:h-40 overflow-hidden shrink-0">
        <img
          src={car.images[0] || 'https://picsum.photos/seed/car/400/300'}
          alt={`${car.brand} ${car.model}`}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(8,8,11,0.2) 0%, transparent 40%, rgba(8,8,11,0.9) 100%)' }}
        />

        <span
          className="absolute top-2.5 ltr:right-2.5 rtl:left-2.5 px-2 py-1 rounded-lg text-[10px] font-black text-white backdrop-blur-sm"
          style={{ background: 'rgba(8,8,11,0.7)', border: '1px solid var(--fx-line-strong)' }}
        >
          {car.year}
        </span>

        <button
          onClick={() => onEditCar(car)}
          aria-label={lang === 'fr' ? 'Modifier le véhicule' : 'تعديل المركبة'}
          className="fx-icon-btn absolute top-2.5 ltr:left-2.5 rtl:right-2.5 p-2 backdrop-blur-sm"
          style={{ background: 'rgba(8,8,11,0.7)' }}
        >
          <Edit2 size={15} />
        </button>

        <div className="absolute bottom-2.5 inset-x-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className="fx-title text-sm leading-tight truncate">{car.brand} {car.model}</h3>
            <p className="text-[11px] font-bold" style={{ color: 'var(--fx-red-300)' }}>{car.registration}</p>
          </div>
          <span
            className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-black tabular-nums backdrop-blur-sm"
            style={{ background: 'rgba(8,8,11,0.7)', border: '1px solid var(--fx-line-strong)', color: 'var(--fx-ink-soft)' }}
          >
            {car.mileage.toLocaleString('fr-FR')} km
          </span>
        </div>
      </div>

      {/* ── Échéances ── */}
      <div className="p-3.5 flex-1 flex flex-col gap-2">
        {getMaintenanceItems().map((item) => {
          // Trois teintes seulement : dépassé (rouge), bientôt (ambre), bon (vert).
          const tint =
            item.color === 'critical'
              ? { bg: 'linear-gradient(135deg, rgba(240,51,60,0.16), rgba(116,8,26,0.04))', bd: 'var(--fx-line-red-hi)', fg: 'var(--fx-red-200)' }
              : item.color === 'warning'
              ? { bg: 'linear-gradient(135deg, rgba(217,132,16,0.15), rgba(168,92,8,0.04))', bd: 'rgba(251,191,36,0.42)', fg: '#FCD34D' }
              : { bg: 'linear-gradient(135deg, rgba(16,164,111,0.14), rgba(10,115,80,0.03))', bd: 'rgba(52,211,153,0.38)', fg: '#6EE7B7' };

          const status = item.status as any;

          return (
            <button
              key={item.type}
              onClick={item.onClick}
              className="w-full p-2.5 rounded-xl flex items-center gap-2.5 text-left transition-all hover:-translate-y-0.5"
              style={{ backgroundImage: tint.bg, border: `1px solid ${tint.bd}` }}
            >
              <span className="text-lg shrink-0">{item.icon}</span>

              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-black uppercase tracking-wide truncate" style={{ color: tint.fg }}>
                  {item.label}
                </p>
                {status.lastDate && (
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--fx-ink-dim)' }}>
                    {lang === 'fr' ? 'Dernier' : 'آخر'}{' '}
                    {new Date(status.lastDate).toLocaleDateString('fr-FR')}
                    {status.nextMileage != null && (
                      <> · {lang === 'fr' ? 'prochain à' : 'القادم'} {status.nextMileage.toLocaleString('fr-FR')} km</>
                    )}
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                <p className="text-base font-black tabular-nums leading-none" style={{ color: tint.fg }}>
                  {item.statusValue !== null && item.statusValue !== undefined
                    ? Math.abs(item.statusValue).toLocaleString('fr-FR')
                    : '—'}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-wide mt-0.5" style={{ color: 'var(--fx-ink-dim)' }}>
                  {item.statusValue !== null && item.statusValue !== undefined && item.statusValue < 0
                    ? (lang === 'fr' ? 'dépassé' : 'متجاوز')
                    : item.suffix.trim()}
                </p>
              </div>

              <span className="text-sm shrink-0">{getStatusEmoji(item.color)}</span>
            </button>
          );
        })}

        {/* Dépense libre — tout ce que les quatre échéances ne couvrent pas */}
        {onAutreClick && (
          <button
            onClick={() => onAutreClick(car)}
            className="fx-icon-btn w-full py-2.5 mt-0.5 text-[11px] font-bold"
          >
            <Plus size={14} />
            {lang === 'fr' ? 'Autre dépense pour ce véhicule' : 'مصروف آخر لهذه المركبة'}
          </button>
        )}
      </div>

      {/* ── Pied ── */}
      <div
        className="px-3.5 py-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wide"
        style={{ borderTop: '1px solid var(--fx-line)', backgroundImage: 'var(--fx-grad-well)', color: 'var(--fx-ink-mute)' }}
      >
        <span className="truncate">⚙️ {car.transmission}</span>
        <span className="truncate">⛽ {car.energy}</span>
      </div>
    </motion.div>
  );
};
