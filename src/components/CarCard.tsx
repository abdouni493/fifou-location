import React from 'react';
import { Car, Language } from '../types';
import { motion } from 'motion/react';
import { Eye, EyeOff, Pencil, History, TrendingDown, FileText, Trash2, Wrench } from 'lucide-react';
import { carUnitPrices, formatMoney, DEFAULT_EUR_RATE } from '../utils/currency';
import { Badge, ActionBtn } from './ui/fx';

interface CarCardProps {
  car: Car;
  lang: Language;
  // Actions admin — optionnelles : chaque bouton n'apparaît que si son callback est fourni,
  // ce qui permet de réutiliser la même carte dans l'interface Offres.
  onDelete?: (id: string) => void;
  onEdit?: (car: Car) => void;
  onViewDetails?: (car: Car) => void;
  onHistory?: (car: Car) => void;
  onExpenses?: (car: Car) => void;
  onReports?: (car: Car) => void;
  onStatusChange?: (carId: string, newStatus: string) => void;
  /** Toggle masquer/afficher la voiture sur le site public (interface Offres). */
  onToggleVisibility?: (car: Car) => void;
  /** Raccourci « Modifier commission » — véhicules en conciergerie uniquement. */
  onEditCommission?: (car: Car) => void;
  /** Réservation en cours pour ce véhicule (si louer/reserve) */
  activeReservationInfo?: { clientName: string; departureDate: string; returnDate: string } | null;
}

/** Les 4 statuts et leur teinte. Le rouge est réservé à « en location ». */
const STATUS: Record<string, { tone: 'green' | 'amber' | 'red' | 'steel'; fr: string; ar: string; dot: string }> = {
  disponible:  { tone: 'green', fr: 'Disponible', ar: 'متاح', dot: '#10A46F' },
  reserve:     { tone: 'amber', fr: 'Réservé', ar: 'محجوز', dot: '#D98410' },
  louer:       { tone: 'red', fr: 'En location', ar: 'في الإيجار', dot: '#E01331' },
  maintenance: { tone: 'steel', fr: 'En maintenance', ar: 'في الصيانة', dot: '#767C86' },
};

const shortDate = (s: string) =>
  new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

export const CarCard: React.FC<CarCardProps> = ({
  car, lang, onDelete, onEdit, onViewDetails, onHistory, onExpenses, onReports,
  onStatusChange, onToggleVisibility, onEditCommission, activeReservationInfo,
}) => {
  const fr = lang === 'fr';
  const status = STATUS[car.status ?? 'disponible'] ?? STATUS.disponible;
  const isMaintenance = car.status === 'maintenance';
  const isHidden = car.isHiddenFromSite === true;
  const isConsignment = car.ownershipType === 'consignment';
  const owner = car.ownerInfo;
  const hasAdminActions = Boolean(onViewDetails || onEdit || onHistory || onExpenses || onReports || onDelete);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: isHidden ? 0.65 : 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="fx-card overflow-hidden flex flex-col group"
    >
      {/* ── Visuel ── */}
      <div className="relative h-40 sm:h-44 overflow-hidden shrink-0">
        <img
          src={car.images?.[0] || 'https://picsum.photos/seed/car/400/300'}
          alt={`${car.brand} ${car.model}`}
          className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 ${isHidden ? 'grayscale' : ''}`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
        {/* Fondu vers le carbone : la carte et la photo ne se touchent jamais franchement */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(8,8,11,0.15) 0%, transparent 38%, rgba(8,8,11,0.88) 100%)' }}
        />

        <span
          className="absolute top-2.5 ltr:right-2.5 rtl:left-2.5 px-2 py-1 rounded-lg text-[10px] font-black text-white backdrop-blur-sm"
          style={{ background: 'rgba(8,8,11,0.7)', border: '1px solid var(--fx-line-strong)' }}
        >
          {car.year}
        </span>

        {isHidden && (
          <span
            className="absolute top-2.5 ltr:left-2.5 rtl:right-2.5 flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black text-white backdrop-blur-sm"
            style={{ background: 'rgba(8,8,11,0.75)', border: '1px solid var(--fx-line-strong)' }}
          >
            <EyeOff size={11} />
            {fr ? 'Masqué' : 'مخفي'}
          </span>
        )}

        {/* Statut posé sur le bas de l'image : lisible sans consommer de hauteur */}
        <span
          className="absolute bottom-2.5 ltr:left-2.5 rtl:right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black backdrop-blur-sm"
          style={{
            background: 'rgba(8,8,11,0.75)',
            border: `1px solid ${status.dot}66`,
            color: status.tone === 'red' ? 'var(--fx-red-200)'
                 : status.tone === 'green' ? '#6EE7B7'
                 : status.tone === 'amber' ? '#FCD34D' : 'var(--fx-ink-soft)',
          }}
        >
          <span
            className={`w-2 h-2 rounded-full ${car.status === 'louer' ? 'fx-pulse' : ''}`}
            style={{ background: status.dot }}
          />
          {fr ? status.fr : status.ar}
        </span>

        {isConsignment && (
          <span
            className="absolute bottom-2.5 ltr:right-2.5 rtl:left-2.5 px-2 py-1 rounded-lg text-[10px] font-black backdrop-blur-sm"
            style={{ background: 'rgba(8,8,11,0.75)', border: '1px solid rgba(251,191,36,0.5)', color: '#FCD34D' }}
          >
            🤝 {fr ? 'Conciergerie' : 'بالوكالة'}
          </span>
        )}
      </div>

      {/* ── Corps ── */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="min-w-0">
          <h3 className="fx-title text-sm leading-tight truncate">{car.brand} {car.model}</h3>
          <p className="text-[11px] font-bold tracking-wide mt-0.5" style={{ color: 'var(--fx-red-300)' }}>
            {car.registration}
          </p>
        </div>

        {/* Caractéristiques */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]" style={{ color: 'var(--fx-ink-mute)' }}>
          <span className="flex items-center gap-1.5 truncate">⛽ {car.energy}</span>
          <span className="flex items-center gap-1.5 truncate">⚙️ {car.transmission}</span>
          <span className="flex items-center gap-1.5 truncate">👥 {car.seats} {fr ? 'places' : 'مقاعد'}</span>
          <span className="flex items-center gap-1.5 truncate">🎨 {car.color}</span>
        </div>

        {/* Réservation en cours */}
        {activeReservationInfo && (car.status === 'louer' || car.status === 'reserve') && (
          <div className="fx-well p-2.5 text-[11px]">
            <p className="font-bold truncate" style={{ color: 'var(--fx-ink)' }}>
              {activeReservationInfo.clientName}
            </p>
            <p style={{ color: 'var(--fx-ink-mute)' }}>
              {shortDate(activeReservationInfo.departureDate)} → {shortDate(activeReservationInfo.returnDate)}
            </p>
          </div>
        )}

        {/* Conciergerie — données PRIVÉES, jamais rendues sur le site public */}
        {isConsignment && (
          <div
            className="rounded-xl p-3 space-y-1.5"
            style={{
              backgroundImage: 'linear-gradient(135deg, rgba(217,132,16,0.14), rgba(168,92,8,0.04))',
              border: '1px solid rgba(251,191,36,0.35)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: '#FCD34D' }}>
                🔒 {fr ? 'Propriétaire' : 'المالك'}
              </span>
              {owner?.internalRef && (
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded" dir="ltr"
                      style={{ background: 'rgba(251,191,36,0.18)', color: '#FCD34D' }}>
                  {owner.internalRef}
                </span>
              )}
            </div>
            {owner && (
              <div className="space-y-0.5 text-[11px] font-semibold" style={{ color: 'var(--fx-ink-soft)' }}>
                <p className="truncate">👤 {owner.ownerName}</p>
                {owner.ownerPhone && <p dir="ltr" className="text-start truncate">📞 {owner.ownerPhone}</p>}
                <p>
                  💰 {owner.commissionValue.toLocaleString('fr-FR')}{' '}
                  {owner.commissionType === 'percentage' ? '%' : 'DA'}
                </p>
              </div>
            )}
            {onEditCommission && (
              <button
                onClick={() => onEditCommission(car)}
                className="w-full mt-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors"
                style={{ background: 'rgba(251,191,36,0.16)', color: '#FCD34D' }}
              >
                {fr ? 'Modifier la commission' : 'تعديل العمولة'}
              </button>
            )}
          </div>
        )}

        {/* Tarifs */}
        <div className="fx-well p-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-black tabular-nums leading-none" style={{ color: 'var(--fx-red-200)' }}>
              {car.priceDay.toLocaleString('fr-FR')}
              <span className="text-[9px] font-bold uppercase ms-1" style={{ color: 'var(--fx-ink-dim)' }}>
                DZD / {fr ? 'jour' : 'يوم'}
              </span>
            </p>
            <p
              className="text-[11px] font-black mt-1"
              style={{ color: '#FCD34D' }}
              title={
                car.priceDayEur === undefined
                  ? `Converti au taux de ${DEFAULT_EUR_RATE} DA/€`
                  : 'Tarif en euros défini pour ce véhicule'
              }
            >
              {car.priceDayEur === undefined && '≈ '}
              {formatMoney(carUnitPrices(car, 'EUR', DEFAULT_EUR_RATE).day, 'EUR')}
              <span className="text-[9px] font-bold uppercase ms-1" style={{ color: 'var(--fx-ink-dim)' }}>
                / {fr ? 'jour' : 'يوم'}
              </span>
            </p>
          </div>
          <Badge tone="steel">{car.mileage.toLocaleString('fr-FR')} km</Badge>
        </div>

        {/* Maintenance : le seul basculement de statut manuel */}
        {onStatusChange && (
          <button
            onClick={() => onStatusChange(car.id, isMaintenance ? 'disponible' : 'maintenance')}
            className={`fx-icon-btn w-full py-2 text-[11px] font-bold ${isMaintenance ? 'fx-icon-btn-success' : 'fx-icon-btn-warning'}`}
          >
            <Wrench size={13} />
            {isMaintenance
              ? (fr ? 'Terminer la maintenance' : 'إنهاء الصيانة')
              : (fr ? 'Mettre en maintenance' : 'وضع في الصيانة')}
          </button>
        )}

        {/* Visibilité sur le site public */}
        {onToggleVisibility && (
          <button
            onClick={() => onToggleVisibility(car)}
            className={`fx-icon-btn w-full py-2 text-[11px] font-bold ${isHidden ? 'fx-icon-btn-success' : ''}`}
          >
            {isHidden ? <Eye size={13} /> : <EyeOff size={13} />}
            {isHidden
              ? (fr ? 'Afficher sur le site' : 'إظهار على الموقع')
              : (fr ? 'Masquer du site' : 'إخفاء من الموقع')}
          </button>
        )}

        {/* Actions */}
        {hasAdminActions && (
          <div className="mt-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
            {onViewDetails && (
              <ActionBtn icon={<Eye size={13} />} label={fr ? 'Détails' : 'تفاصيل'} showLabel
                         className="flex-col !gap-0.5 py-2" onClick={() => onViewDetails(car)} />
            )}
            {onEdit && (
              <ActionBtn icon={<Pencil size={13} />} label={fr ? 'Modifier' : 'تعديل'} showLabel
                         className="flex-col !gap-0.5 py-2" onClick={() => onEdit(car)} />
            )}
            {onHistory && (
              <ActionBtn icon={<History size={13} />} label={fr ? 'Historique' : 'السجل'} showLabel
                         className="flex-col !gap-0.5 py-2" onClick={() => onHistory(car)} />
            )}
            {onExpenses && (
              <ActionBtn icon={<TrendingDown size={13} />} label={fr ? 'Dépenses' : 'المصاريف'} showLabel tone="warning"
                         className="flex-col !gap-0.5 py-2" onClick={() => onExpenses(car)} />
            )}
            {onReports && (
              <ActionBtn icon={<FileText size={13} />} label={fr ? 'Rapport' : 'تقرير'} showLabel
                         className="flex-col !gap-0.5 py-2" onClick={() => onReports(car)} />
            )}
            {onDelete && (
              <ActionBtn icon={<Trash2 size={13} />} label={fr ? 'Supprimer' : 'حذف'} showLabel tone="danger"
                         className="flex-col !gap-0.5 py-2" onClick={() => onDelete(car.id)} />
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
};
