import React from 'react';
import { motion } from 'motion/react';
import { Eye, Pencil, Trash2, KeyRound, Wallet, CalendarX2, BadgeDollarSign, Phone } from 'lucide-react';
import { Language, Worker } from '../../types';
import { computePayroll } from '../../utils/payroll';
import { formatAmount } from '../../utils/format';
import { Badge, ActionBtn } from '../ui/fx';

const DA = (n: number) => `${formatAmount(Math.round(n))} DA`;

interface Props {
  worker: Worker;
  lang: Language;
  can: (action: string) => boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPermissions: () => void;
  onAdvance: () => void;
  onAbsence: () => void;
  onPayment: () => void;
}

/**
 * Carte d'employé.
 *
 * Elle répond en un coup d'œil aux trois questions qu'on se pose devant une
 * équipe : qui est-ce, est-il à jour de paie, et que puis-je faire pour lui.
 * Les actions financières (acompte / absence / paie) sont regroupées et
 * disparaissent si l'employé n'est pas rémunéré — il n'y a rien à y faire.
 */
export const WorkerCard: React.FC<Props> = ({
  worker, lang, can, onView, onEdit, onDelete, onPermissions, onAdvance, onAbsence, onPayment,
}) => {
  const fr = lang === 'fr';
  const payroll = computePayroll(worker);
  const initials = worker.fullName.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('');
  const permCount = worker.permissions?.length ?? 0;

  return (
    <motion.article layout className="fx-card p-4 flex flex-col gap-3.5">
      {/* ── En-tête ── */}
      <header className="flex items-start gap-3 min-w-0">
        <div className="relative shrink-0">
          {worker.profilePhoto ? (
            <img
              src={worker.profilePhoto}
              alt={worker.fullName}
              className="w-12 h-12 rounded-xl object-cover"
              style={{ border: '1px solid var(--fx-line-red)' }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-base text-white"
              style={{ backgroundImage: 'var(--fx-grad-red)', boxShadow: '0 0 18px -6px rgba(200,16,46,0.8)' }}
            >
              {initials || '?'}
            </div>
          )}
          {/* Pastille de connexion : vert = compte actif */}
          <span
            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
            style={{
              background: worker.accountEnabled ? '#10A46F' : '#26262F',
              boxShadow: '0 0 0 2px var(--fx-black-300)',
            }}
            title={worker.accountEnabled ? (fr ? 'Peut se connecter' : 'يمكنه الدخول') : (fr ? 'Pas de compte' : 'لا حساب')}
          >
            {worker.accountEnabled ? '🔓' : ''}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="fx-title text-sm leading-tight truncate">{worker.fullName}</h3>
          <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--fx-red-300)' }}>
            {worker.roleName || (worker.type === 'driver' ? (fr ? 'Chauffeur' : 'سائق') : (fr ? 'Employé' : 'موظف'))}
          </p>
          {worker.phone && (
            <p className="text-[11px] mt-1 flex items-center gap-1.5 truncate" style={{ color: 'var(--fx-ink-mute)' }}>
              <Phone size={11} className="shrink-0" />
              {worker.phone}
            </p>
          )}
        </div>
      </header>

      {/* ── Étiquettes d'état ── */}
      <div className="flex flex-wrap gap-1.5">
        {payroll.paid ? (
          <Badge tone="steel">
            {DA(payroll.baseSalary)} / {payroll.mode === 'monthly' ? (fr ? 'mois' : 'شهر') : (fr ? 'jour' : 'يوم')}
          </Badge>
        ) : (
          <Badge tone="neutral">{fr ? 'Non rémunéré' : 'غير مأجور'}</Badge>
        )}

        {payroll.paid && payroll.dueUnits > 0 && (
          <Badge tone="red">
            {payroll.dueUnits} {payroll.mode === 'monthly' ? (fr ? 'mois dus' : 'أشهر مستحقة') : (fr ? 'jours dus' : 'أيام مستحقة')}
          </Badge>
        )}
        {payroll.paid && payroll.dueUnits === 0 && <Badge tone="green">{fr ? 'À jour' : 'محدّث'}</Badge>}

        {payroll.advancesTotal > 0 && (
          <Badge tone="amber">{fr ? 'Acomptes' : 'سلف'} {DA(payroll.advancesTotal)}</Badge>
        )}

        <Badge tone={permCount > 0 ? 'green' : 'neutral'}>
          🔑 {permCount > 0 ? `${permCount} ${fr ? 'droits' : 'صلاحيات'}` : (fr ? 'Aucun droit' : 'لا صلاحيات')}
        </Badge>
      </div>

      {/* ── Net à payer ── */}
      {payroll.paid && (
        <div
          className="fx-well p-3 flex items-baseline justify-between gap-3"
          style={{ borderColor: payroll.net > 0 ? 'var(--fx-line-red)' : 'var(--fx-line)' }}
        >
          <span className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: 'var(--fx-ink-mute)' }}>
            {fr ? 'Net à payer' : 'الصافي المستحق'}
          </span>
          <span
            className="text-lg font-black tabular-nums"
            style={{ color: payroll.net > 0 ? 'var(--fx-red-200)' : '#6EE7B7' }}
          >
            {DA(payroll.net)}
          </span>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="mt-auto pt-1 flex flex-wrap gap-1.5">
        {can('view') && (
          <ActionBtn icon={<Eye size={13} />} label={fr ? 'Voir' : 'عرض'} showLabel onClick={onView} />
        )}
        {can('edit') && (
          <ActionBtn icon={<Pencil size={13} />} label={fr ? 'Modifier' : 'تعديل'} showLabel onClick={onEdit} />
        )}
        {can('permissions') && (
          <ActionBtn icon={<KeyRound size={13} />} label={fr ? 'Permissions' : 'الصلاحيات'} showLabel onClick={onPermissions} />
        )}
        {payroll.paid && can('advance') && (
          <ActionBtn icon={<Wallet size={13} />} label={fr ? 'Acompte' : 'سلفة'} showLabel tone="warning" onClick={onAdvance} />
        )}
        {payroll.paid && can('absence') && (
          <ActionBtn icon={<CalendarX2 size={13} />} label={fr ? 'Absence' : 'غياب'} showLabel tone="warning" onClick={onAbsence} />
        )}
        {payroll.paid && can('payment') && (
          <ActionBtn icon={<BadgeDollarSign size={13} />} label={fr ? 'Paiement' : 'الدفع'} showLabel tone="success" onClick={onPayment} />
        )}
        {can('delete') && (
          <ActionBtn icon={<Trash2 size={13} />} label={fr ? 'Supprimer' : 'حذف'} showLabel tone="danger" onClick={onDelete} />
        )}
      </div>
    </motion.article>
  );
};
