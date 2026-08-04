import React from 'react';
import { Eye, Pencil, History, Trash2, Phone, Mail, MapPin, IdCard } from 'lucide-react';
import { Client, Language } from '../types';
import { motion } from 'motion/react';
import { Badge, ActionBtn } from './ui/fx';

interface ClientCardProps {
  client: Client;
  lang: Language;
  onEdit: () => void;
  onDelete: () => void;
  onViewDetails: () => void;
  onHistory: () => void;
  /** Filtre les actions selon les permissions de l'employé. */
  can?: (action: string) => boolean;
}

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—');

/** Le permis est-il périmé, ou sur le point de l'être ? */
function licenseState(expiration?: string): 'ok' | 'soon' | 'expired' | 'unknown' {
  if (!expiration) return 'unknown';
  const end = new Date(expiration).getTime();
  if (!Number.isFinite(end)) return 'unknown';
  const days = Math.ceil((end - Date.now()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= 60) return 'soon';
  return 'ok';
}

/**
 * Carte client.
 *
 * La photo passe en médaillon latéral plutôt qu'en grand rond centré : à
 * largeur égale, on gagne la place de montrer les informations qui décident
 * d'une location — le permis et sa validité.
 */
export const ClientCard: React.FC<ClientCardProps> = ({
  client, lang, onEdit, onDelete, onViewDetails, onHistory, can = () => true,
}) => {
  const fr = lang === 'fr';
  const initials = `${client.firstName?.[0] ?? ''}${client.lastName?.[0] ?? ''}`.toUpperCase();
  const state = licenseState(client.licenseExpirationDate ?? (client as any).licenseExpiration);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="fx-card p-4 flex flex-col gap-3.5"
    >
      {/* ── Identité ── */}
      <header className="flex items-start gap-3 min-w-0">
        <div className="shrink-0">
          {client.profilePhoto ? (
            <img
              src={client.profilePhoto}
              alt={`${client.firstName} ${client.lastName}`}
              className="w-14 h-14 rounded-xl object-cover"
              style={{ border: '1px solid var(--fx-line-red)' }}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center font-black text-white text-lg"
              style={{ backgroundImage: 'var(--fx-grad-red)', boxShadow: '0 0 18px -6px rgba(200,16,46,0.8)' }}
            >
              {initials || '👤'}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="fx-title text-sm leading-tight truncate">
            {client.firstName} {client.lastName}
          </h3>
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold truncate hover:underline"
              style={{ color: 'var(--fx-red-300)' }}
            >
              <Phone size={11} className="shrink-0" />
              {client.phone}
            </a>
          )}
          {client.email && (
            <a
              href={`mailto:${client.email}`}
              className="mt-0.5 flex items-center gap-1.5 text-[11px] truncate hover:underline"
              style={{ color: 'var(--fx-ink-mute)' }}
            >
              <Mail size={11} className="shrink-0" />
              {client.email}
            </a>
          )}
        </div>
      </header>

      {/* ── État du permis ── */}
      <div className="flex flex-wrap gap-1.5">
        {state === 'expired' && <Badge tone="red">⛔ {fr ? 'Permis expiré' : 'رخصة منتهية'}</Badge>}
        {state === 'soon' && <Badge tone="amber">⏳ {fr ? 'Permis bientôt expiré' : 'رخصة قرب الانتهاء'}</Badge>}
        {state === 'ok' && <Badge tone="green">✅ {fr ? 'Permis valide' : 'رخصة سارية'}</Badge>}
        {client.wilaya && (
          <Badge tone="steel">
            <MapPin size={10} /> {client.wilaya}
          </Badge>
        )}
      </div>

      {/* ── Documents ── */}
      <div className="fx-well p-3 space-y-1.5">
        <Line
          icon={<IdCard size={11} />}
          label={fr ? 'Permis n°' : 'رقم الرخصة'}
          value={client.licenseNumber || '—'}
        />
        <Line
          icon="📅"
          label={fr ? 'Délivré le' : 'تاريخ الإصدار'}
          value={fmtDate(client.licenseDeliveryDate ?? (client as any).licenseDelivery)}
        />
        <Line
          icon="⏱️"
          label={fr ? 'Expire le' : 'تاريخ الانتهاء'}
          value={fmtDate(client.licenseExpirationDate ?? (client as any).licenseExpiration)}
          tone={state === 'expired' ? 'danger' : state === 'soon' ? 'warn' : undefined}
        />
        {client.idCardNumber && (
          <Line icon="🪪" label={fr ? "Carte d'identité" : 'بطاقة الهوية'} value={client.idCardNumber} />
        )}
      </div>

      {/* ── Actions ── */}
      <div className="mt-auto grid grid-cols-2 xl:grid-cols-4 gap-1.5">
        {can('view') && (
          <ActionBtn icon={<Eye size={13} />} label={fr ? 'Détails' : 'تفاصيل'} showLabel onClick={onViewDetails} />
        )}
        {can('edit') && (
          <ActionBtn icon={<Pencil size={13} />} label={fr ? 'Modifier' : 'تعديل'} showLabel onClick={onEdit} />
        )}
        {can('history') && (
          <ActionBtn icon={<History size={13} />} label={fr ? 'Historique' : 'السجل'} showLabel tone="warning" onClick={onHistory} />
        )}
        {can('delete') && (
          <ActionBtn icon={<Trash2 size={13} />} label={fr ? 'Supprimer' : 'حذف'} showLabel tone="danger" onClick={onDelete} />
        )}
      </div>
    </motion.article>
  );
};

const Line: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'danger' | 'warn';
}> = ({ icon, label, value, tone }) => (
  <div className="flex items-baseline justify-between gap-2 text-[11px]">
    <span className="flex items-center gap-1.5 shrink-0" style={{ color: 'var(--fx-ink-mute)' }}>
      {icon} {label}
    </span>
    <span
      className="font-bold truncate text-right"
      style={{
        color: tone === 'danger' ? 'var(--fx-red-200)' : tone === 'warn' ? '#FCD34D' : 'var(--fx-ink)',
      }}
    >
      {value}
    </span>
  </div>
);
