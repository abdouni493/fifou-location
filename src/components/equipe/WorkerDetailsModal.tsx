import React from 'react';
import { Language, Worker } from '../../types';
import { computePayroll } from '../../utils/payroll';
import { formatAmount } from '../../utils/format';
import { PERMISSION_PAGES, permissionKey } from '../../constants/permissions';
import { Modal, Panel, Row, Badge, Btn, TableWrap, Th, Td, EmptyState } from '../ui/fx';

const DA = (n: number) => `${formatAmount(Math.round(n))} DA`;
const d = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '—');

/** Fiche complète en lecture seule : tout ce que l'agence sait de l'employé. */
export const WorkerDetailsModal: React.FC<{
  open: boolean;
  onClose: () => void;
  worker: Worker | null;
  lang: Language;
}> = ({ open, onClose, worker, lang }) => {
  const fr = lang === 'fr';
  if (!worker) return null;

  const payroll = computePayroll(worker);
  const granted = new Set(worker.permissions ?? []);
  const grantedPages = PERMISSION_PAGES
    .map(p => ({ page: p, actions: p.actions.filter(a => granted.has(permissionKey(p.id, a.id))) }))
    .filter(x => x.actions.length > 0);

  const advances = [...(worker.advances ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const absences = [...(worker.absences ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const payments = [...(worker.payments ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  const totalPaid = payments.reduce((s, p) => s + Number(p.netSalary || p.amount || 0), 0);

  return (
    <Modal
      open={open} onClose={onClose} size="lg" icon="👤"
      title={worker.fullName}
      subtitle={worker.roleName || (fr ? 'Employé' : 'موظف')}
      footer={<Btn tone="ghost" onClick={onClose}>{fr ? 'Fermer' : 'إغلاق'}</Btn>}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title={fr ? 'Identité' : 'الهوية'} icon="🪪">
            <Row label={fr ? 'Nom complet' : 'الاسم'} value={worker.fullName} />
            <Row label={fr ? 'Naissance' : 'الميلاد'} value={d(worker.dateOfBirth)} />
            <Row label={fr ? "Carte d'identité" : 'بطاقة الهوية'} value={worker.idCardNumber || '—'} />
            <Row label={fr ? 'Téléphone' : 'الهاتف'} value={worker.phone || '—'} />
            <Row label={fr ? 'Adresse' : 'العنوان'} value={worker.address || '—'} />
          </Panel>

          <Panel title={fr ? 'Poste' : 'الوظيفة'} icon="🎖️">
            <Row label={fr ? 'Rôle' : 'الدور'} value={worker.roleName || '—'} />
            <Row label={fr ? 'Entrée en fonction' : 'بدء العمل'} value={d(worker.startDate)} />
            <Row label={fr ? 'Créé le' : 'أُنشئ في'} value={d(worker.createdAt)} />
            <Row
              label={fr ? 'Rémunéré' : 'مأجور'}
              value={payroll.paid ? (fr ? 'Oui' : 'نعم') : (fr ? 'Non' : 'لا')}
            />
            {payroll.paid && (
              <>
                <Row
                  label={fr ? 'Base' : 'الأساس'}
                  value={`${DA(payroll.baseSalary)} / ${payroll.mode === 'monthly' ? (fr ? 'mois' : 'شهر') : (fr ? 'jour' : 'يوم')}`}
                />
                <Row
                  label={fr ? 'Périodes dues' : 'الفترات المستحقة'}
                  value={`${payroll.dueUnits}`}
                />
                <Row label={fr ? 'Net à payer' : 'الصافي'} value={DA(payroll.net)} strong />
              </>
            )}
          </Panel>
        </div>

        <Panel title={fr ? 'Compte de connexion' : 'حساب الدخول'} icon="🔐">
          <Row
            label={fr ? 'Statut' : 'الحالة'}
            value={
              worker.accountEnabled
                ? <Badge tone="green">{fr ? 'Actif' : 'نشط'}</Badge>
                : <Badge tone="neutral">{fr ? 'Aucun compte' : 'لا حساب'}</Badge>
            }
          />
          <Row label="E-mail" value={worker.email || '—'} />
          <Row label={fr ? "Nom d'utilisateur" : 'اسم المستخدم'} value={worker.username || '—'} />
        </Panel>

        <Panel
          title={fr ? 'Permissions accordées' : 'الصلاحيات الممنوحة'}
          icon="🔑"
          actions={<Badge tone={granted.size > 0 ? 'red' : 'neutral'}>{granted.size}</Badge>}
        >
          {grantedPages.length === 0 ? (
            <p className="text-sm py-2" style={{ color: 'var(--fx-ink-dim)' }}>
              {fr
                ? "Aucune permission : sa barre latérale est vide. Ouvrez-lui des interfaces depuis le bouton « Permissions »."
                : 'لا صلاحيات. افتح له الواجهات من زر «الصلاحيات».'}
            </p>
          ) : (
            <ul className="space-y-3">
              {grantedPages.map(({ page, actions }) => (
                <li key={page.id}>
                  <p className="text-xs font-black mb-1.5 flex items-center gap-2" style={{ color: 'var(--fx-ink)' }}>
                    <span>{page.icon}</span> {page.label[lang]}
                    <span className="font-normal" style={{ color: 'var(--fx-ink-dim)' }}>
                      ({actions.length}/{page.actions.length})
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {actions.map(a => <Badge key={a.id} tone="red">{a.label[lang]}</Badge>)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {payroll.paid && (
          <>
            <Panel
              title={fr ? 'Historique des paiements' : 'سجل الدفعات'} icon="💰"
              actions={<Badge tone="green">{DA(totalPaid)}</Badge>}
              bodyClassName="p-0"
            >
              {payments.length === 0 ? (
                <div className="p-4"><EmptyState icon="💰" title={fr ? 'Aucun paiement' : 'لا دفعات'} /></div>
              ) : (
                <TableWrap>
                  <thead className="fx-table-head">
                    <tr>
                      <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                      <Th>{fr ? 'Période' : 'الفترة'}</Th>
                      <Th align="right">{fr ? 'Brut' : 'الإجمالي'}</Th>
                      <Th align="right">{fr ? 'Retenues' : 'الاقتطاعات'}</Th>
                      <Th align="right">{fr ? 'Net versé' : 'الصافي'}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className="fx-table-row">
                        <Td>{d(p.date)}</Td>
                        <Td>{p.periodStart ? `${d(p.periodStart)} → ${d(p.periodEnd || p.date)}` : '—'}</Td>
                        <Td align="right" className="tabular-nums">{DA(Number(p.baseSalary || 0))}</Td>
                        <Td align="right" className="tabular-nums">
                          {DA(Number(p.advances || 0) + Number(p.absences || 0))}
                        </Td>
                        <Td align="right" className="tabular-nums font-bold">
                          {DA(Number(p.netSalary || p.amount || 0))}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              )}
            </Panel>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Panel
                title={fr ? 'Acomptes' : 'السلف'} icon="💸"
                actions={<Badge tone="amber">{advances.length}</Badge>}
                bodyClassName="p-0"
              >
                {advances.length === 0 ? (
                  <div className="p-4"><EmptyState icon="💸" title={fr ? 'Aucun acompte' : 'لا سلف'} /></div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--fx-line)' }}>
                    {advances.slice(0, 8).map(a => (
                      <li key={a.id} className="px-4 py-2.5 flex justify-between gap-3 text-xs">
                        <span style={{ color: 'var(--fx-ink-mute)' }}>{d(a.date)} {a.note ? `· ${a.note}` : ''}</span>
                        <span className="font-bold tabular-nums shrink-0">{DA(Number(a.amount || 0))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel
                title={fr ? 'Absences' : 'الغيابات'} icon="🚫"
                actions={<Badge tone="amber">{absences.length}</Badge>}
                bodyClassName="p-0"
              >
                {absences.length === 0 ? (
                  <div className="p-4"><EmptyState icon="🚫" title={fr ? 'Aucune absence' : 'لا غيابات'} /></div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--fx-line)' }}>
                    {absences.slice(0, 8).map(a => (
                      <li key={a.id} className="px-4 py-2.5 flex justify-between gap-3 text-xs">
                        <span style={{ color: 'var(--fx-ink-mute)' }}>{d(a.date)} {a.note ? `· ${a.note}` : ''}</span>
                        <span className="font-bold tabular-nums shrink-0">{DA(Number(a.cost || 0))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
