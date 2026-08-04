import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2, Wallet, CalendarX2, BadgeDollarSign } from 'lucide-react';
import { Language, Worker, WorkerAdvance, WorkerAbsence, WorkerPayment } from '../../types';
import { WorkerService } from '../../services/workerService';
import { computePayroll } from '../../utils/payroll';
import { formatAmount } from '../../utils/format';
import { Modal, Field, FormGrid, Btn, Panel, Row, Badge, EmptyState, TableWrap, Th, Td, ActionBtn } from '../ui/fx';

const DA = (n: number) => `${formatAmount(Math.round(n))} DA`;
const today = () => new Date().toISOString().slice(0, 10);

// ════════════════════════════════════════════════════════════════════════════
// ACOMPTES
// ════════════════════════════════════════════════════════════════════════════

export const WorkerAdvancesModal: React.FC<{
  open: boolean;
  onClose: () => void;
  worker: Worker | null;
  lang: Language;
  onChange: (workerId: string, advances: WorkerAdvance[]) => void;
}> = ({ open, onClose, worker, lang, onChange }) => {
  const fr = lang === 'fr';
  const [form, setForm] = useState({ amount: '', date: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setForm({ amount: '', date: today(), note: '' }); setError(''); }
  }, [open, worker]);

  if (!worker) return null;
  const list = [...(worker.advances ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, a) => s + Number(a.amount || 0), 0);

  const add = async () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) { setError(fr ? 'Montant invalide.' : 'مبلغ غير صالح.'); return; }
    setBusy(true); setError('');
    try {
      const created = await WorkerService.addAdvance(worker.id, {
        amount, date: form.date, note: form.note.trim() || undefined,
      });
      onChange(worker.id, [...(worker.advances ?? []), created]);
      setForm({ amount: '', date: today(), note: '' });
    } catch (err: any) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await WorkerService.deleteAdvance(id);
      onChange(worker.id, (worker.advances ?? []).filter(a => a.id !== id));
    } catch (err: any) { setError(err?.message ?? String(err)); }
  };

  return (
    <Modal
      open={open} onClose={onClose} size="md" icon="💸"
      title={fr ? 'Acomptes' : 'السلف'} subtitle={worker.fullName}
      footer={<Btn tone="ghost" onClick={onClose}>{fr ? 'Fermer' : 'إغلاق'}</Btn>}
    >
      <div className="space-y-4">
        <Panel title={fr ? 'Nouvel acompte' : 'سلفة جديدة'} icon={<Wallet size={16} />}>
          <FormGrid>
            <Field label={fr ? 'Montant (DA)' : 'المبلغ (دج)'} required>
              <input
                type="number" min="0" step="any" inputMode="decimal"
                className="fx-field font-black tabular-nums"
                value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field label={fr ? 'Date' : 'التاريخ'} required>
              <input type="date" className="fx-field" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
          </FormGrid>
          <Field label={fr ? 'Description' : 'الوصف'} hint={fr ? 'Facultative' : 'اختياري'} className="mt-3">
            <input
              className="fx-field" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder={fr ? 'Ex. : avance sur salaire de mars' : 'مثال: سلفة على راتب مارس'}
            />
          </Field>
          <div className="mt-3 flex justify-end">
            <Btn tone="primary" onClick={add} disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {fr ? "Enregistrer l'acompte" : 'حفظ السلفة'}
            </Btn>
          </div>
        </Panel>

        {error && <p className="text-sm font-semibold" style={{ color: 'var(--fx-red-300)' }}>⚠️ {error}</p>}

        <Panel
          title={fr ? 'Historique' : 'السجل'}
          icon="🧾"
          actions={<Badge tone="red">{DA(total)}</Badge>}
          bodyClassName="p-0"
        >
          {list.length === 0 ? (
            <div className="p-4"><EmptyState icon="💸" title={fr ? 'Aucun acompte' : 'لا سلف'} /></div>
          ) : (
            <TableWrap>
              <thead className="fx-table-head">
                <tr>
                  <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                  <Th>{fr ? 'Description' : 'الوصف'}</Th>
                  <Th align="right">{fr ? 'Montant' : 'المبلغ'}</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {list.map(a => (
                  <tr key={a.id} className="fx-table-row">
                    <Td>{new Date(a.date).toLocaleDateString('fr-FR')}</Td>
                    <Td>{a.note || '—'}</Td>
                    <Td align="right" className="font-bold tabular-nums">{DA(Number(a.amount || 0))}</Td>
                    <Td align="right">
                      <ActionBtn icon={<Trash2 size={13} />} label={fr ? 'Supprimer' : 'حذف'} tone="danger" onClick={() => remove(a.id)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>
      </div>
    </Modal>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// ABSENCES
// ════════════════════════════════════════════════════════════════════════════

export const WorkerAbsencesModal: React.FC<{
  open: boolean;
  onClose: () => void;
  worker: Worker | null;
  lang: Language;
  onChange: (workerId: string, absences: WorkerAbsence[]) => void;
}> = ({ open, onClose, worker, lang, onChange }) => {
  const fr = lang === 'fr';
  const [form, setForm] = useState({ cost: '', date: today(), note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Coût par défaut : une journée de salaire, la retenue la plus courante.
      const suggested = worker?.paymentType === 'daily'
        ? Number(worker?.baseSalary || 0)
        : Math.round(Number(worker?.baseSalary || 0) / 26);
      setForm({ cost: suggested ? String(suggested) : '', date: today(), note: '' });
      setError('');
    }
  }, [open, worker]);

  if (!worker) return null;
  const list = [...(worker.absences ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const total = list.reduce((s, a) => s + Number(a.cost || 0), 0);

  const add = async () => {
    const cost = Number(form.cost);
    if (!(cost >= 0)) { setError(fr ? 'Coût invalide.' : 'تكلفة غير صالحة.'); return; }
    setBusy(true); setError('');
    try {
      const created = await WorkerService.addAbsence(worker.id, {
        cost, date: form.date, note: form.note.trim() || undefined,
      });
      onChange(worker.id, [...(worker.absences ?? []), created]);
      setForm(f => ({ ...f, note: '' }));
    } catch (err: any) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await WorkerService.deleteAbsence(id);
      onChange(worker.id, (worker.absences ?? []).filter(a => a.id !== id));
    } catch (err: any) { setError(err?.message ?? String(err)); }
  };

  return (
    <Modal
      open={open} onClose={onClose} size="md" icon="🚫"
      title={fr ? 'Absences' : 'الغيابات'} subtitle={worker.fullName}
      footer={<Btn tone="ghost" onClick={onClose}>{fr ? 'Fermer' : 'إغلاق'}</Btn>}
    >
      <div className="space-y-4">
        <Panel title={fr ? 'Nouvelle absence' : 'غياب جديد'} icon={<CalendarX2 size={16} />}>
          <FormGrid>
            <Field label={fr ? 'Date' : 'التاريخ'} required>
              <input type="date" className="fx-field" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field
              label={fr ? 'Coût retenu (DA)' : 'التكلفة المقتطعة (دج)'}
              required
              hint={fr ? 'Pré-rempli avec une journée de salaire.' : 'مملوء مسبقًا بأجر يوم.'}
            >
              <input
                type="number" min="0" step="any" inputMode="decimal"
                className="fx-field font-black tabular-nums"
                value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
              />
            </Field>
          </FormGrid>
          <Field label={fr ? 'Description' : 'الوصف'} hint={fr ? 'Facultative' : 'اختياري'} className="mt-3">
            <input
              className="fx-field" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder={fr ? 'Ex. : arrêt maladie, absence non justifiée…' : 'مثال: إجازة مرضية…'}
            />
          </Field>
          <div className="mt-3 flex justify-end">
            <Btn tone="primary" onClick={add} disabled={busy}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              {fr ? "Enregistrer l'absence" : 'حفظ الغياب'}
            </Btn>
          </div>
        </Panel>

        {error && <p className="text-sm font-semibold" style={{ color: 'var(--fx-red-300)' }}>⚠️ {error}</p>}

        <Panel
          title={fr ? 'Historique' : 'السجل'} icon="🧾"
          actions={<Badge tone="amber">{DA(total)}</Badge>}
          bodyClassName="p-0"
        >
          {list.length === 0 ? (
            <div className="p-4"><EmptyState icon="🚫" title={fr ? 'Aucune absence' : 'لا غيابات'} /></div>
          ) : (
            <TableWrap>
              <thead className="fx-table-head">
                <tr>
                  <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                  <Th>{fr ? 'Description' : 'الوصف'}</Th>
                  <Th align="right">{fr ? 'Coût' : 'التكلفة'}</Th>
                  <Th align="right"> </Th>
                </tr>
              </thead>
              <tbody>
                {list.map(a => (
                  <tr key={a.id} className="fx-table-row">
                    <Td>{new Date(a.date).toLocaleDateString('fr-FR')}</Td>
                    <Td>{a.note || '—'}</Td>
                    <Td align="right" className="font-bold tabular-nums">{DA(Number(a.cost || 0))}</Td>
                    <Td align="right">
                      <ActionBtn icon={<Trash2 size={13} />} label={fr ? 'Supprimer' : 'حذف'} tone="danger" onClick={() => remove(a.id)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Panel>
      </div>
    </Modal>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// PAIEMENT
// ════════════════════════════════════════════════════════════════════════════

export const WorkerPaymentModal: React.FC<{
  open: boolean;
  onClose: () => void;
  worker: Worker | null;
  lang: Language;
  onPaid: (workerId: string, payment: WorkerPayment) => void;
}> = ({ open, onClose, worker, lang, onPaid }) => {
  const fr = lang === 'fr';
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const summary = useMemo(() => (worker ? computePayroll(worker) : null), [worker, open]);

  useEffect(() => {
    if (!open || !summary) return;
    setAmount(String(Math.round(summary.net)));
    setDate(today());
    setNote('');
    setManual(false);
    setError('');
  }, [open, summary]);

  if (!worker || !summary) return null;

  const history = [...(worker.payments ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  const pay = async () => {
    const value = Number(amount);
    if (!(value >= 0)) { setError(fr ? 'Montant invalide.' : 'مبلغ غير صالح.'); return; }
    setBusy(true); setError('');
    try {
      const first = summary.duePeriods[0];
      const last = summary.duePeriods[summary.duePeriods.length - 1];
      const created = await WorkerService.addPayment(worker.id, {
        amount: value,
        date,
        baseSalary: summary.baseSalary,
        advances: summary.advancesTotal,
        absences: summary.absencesTotal,
        netSalary: value,
        note: note.trim() || undefined,
        periodStart: first?.start,
        // Sans période due (paiement d'avance), on borne au jour du règlement :
        // le prochain calcul repartira de là.
        periodEnd: last?.end ?? date,
      });
      onPaid(worker.id, created);
      onClose();
    } catch (err: any) { setError(err?.message ?? String(err)); }
    finally { setBusy(false); }
  };

  const unitLabel = summary.mode === 'monthly'
    ? (fr ? 'mois' : 'أشهر')
    : (fr ? 'jours' : 'أيام');

  return (
    <Modal
      open={open} onClose={onClose} size="lg" icon="💰"
      title={fr ? 'Paiement du salaire' : 'دفع الراتب'} subtitle={worker.fullName}
      footer={
        <>
          <Btn tone="ghost" onClick={onClose} disabled={busy}>{fr ? 'Annuler' : 'إلغاء'}</Btn>
          <Btn tone="success" onClick={pay} disabled={busy || !summary.paid}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            <BadgeDollarSign size={15} />
            {fr ? 'Régler' : 'دفع'} {DA(Number(amount) || 0)}
          </Btn>
        </>
      }
    >
      {!summary.paid ? (
        <EmptyState
          icon="🚷"
          title={fr ? 'Employé non rémunéré' : 'موظف غير مأجور'}
          description={
            fr
              ? "La rémunération est désactivée sur sa fiche, ou le montant de base est à zéro. Modifiez l'employé pour l'activer."
              : 'الأجر معطّل في بطاقته أو المبلغ صفر.'
          }
        />
      ) : (
        <div className="space-y-4">
          {/* ── Ce qui reste dû ── */}
          <Panel
            title={fr ? 'Périodes non réglées' : 'الفترات غير المدفوعة'}
            icon="📆"
            actions={<Badge tone={summary.dueUnits > 0 ? 'red' : 'green'}>{summary.dueUnits} {unitLabel}</Badge>}
          >
            {summary.duePeriods.length === 0 ? (
              <p className="text-sm py-2" style={{ color: '#6EE7B7' }}>
                ✅ {fr ? 'Tout est à jour — aucune période due.' : 'كل شيء محدّث.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {summary.duePeriods.map(p => (
                  <Badge key={p.key} tone="red">{p.label}</Badge>
                ))}
              </div>
            )}
            <p className="mt-2.5 text-[11px]" style={{ color: 'var(--fx-ink-dim)' }}>
              {fr
                ? `Calcul depuis le ${new Date(summary.cutoff).toLocaleDateString('fr-FR')} (fin de la dernière période réglée).`
                : `الحساب منذ ${new Date(summary.cutoff).toLocaleDateString('fr-FR')}.`}
            </p>
          </Panel>

          {/* ── Le décompte ── */}
          <Panel title={fr ? 'Décompte' : 'الحساب'} icon="🧮">
            <div className="space-y-0.5">
              <Row
                label={
                  summary.mode === 'monthly'
                    ? (fr ? 'Salaire mensuel' : 'الراتب الشهري')
                    : (fr ? 'Tarif journalier' : 'الأجر اليومي')
                }
                value={DA(summary.baseSalary)}
              />
              <Row
                label={fr ? `× ${summary.dueUnits} ${unitLabel}` : `× ${summary.dueUnits}`}
                value={DA(summary.gross)}
              />
              <hr className="fx-divider my-2" />
              <Row
                label={`− ${fr ? 'Acomptes non déduits' : 'سلف غير مقتطعة'} (${summary.pendingAdvances.length})`}
                value={<span style={{ color: 'var(--fx-red-200)' }}>−{DA(summary.advancesTotal)}</span>}
              />
              <Row
                label={`− ${fr ? 'Absences' : 'غيابات'} (${summary.pendingAbsences.length})`}
                value={<span style={{ color: '#FCD34D' }}>−{DA(summary.absencesTotal)}</span>}
              />
              <hr className="fx-divider my-2" />
              <Row label={fr ? 'Net à payer (calculé)' : 'الصافي المحسوب'} value={DA(summary.net)} strong />
            </div>

            {(summary.pendingAdvances.length > 0 || summary.pendingAbsences.length > 0) && (
              <div className="mt-3 fx-well p-3 space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                {summary.pendingAdvances.map(a => (
                  <div key={a.id} className="flex justify-between gap-3 text-[11px]">
                    <span style={{ color: 'var(--fx-ink-mute)' }}>
                      💸 {new Date(a.date).toLocaleDateString('fr-FR')} {a.note ? `· ${a.note}` : ''}
                    </span>
                    <span className="tabular-nums font-bold shrink-0" style={{ color: 'var(--fx-red-200)' }}>
                      −{DA(Number(a.amount || 0))}
                    </span>
                  </div>
                ))}
                {summary.pendingAbsences.map(a => (
                  <div key={a.id} className="flex justify-between gap-3 text-[11px]">
                    <span style={{ color: 'var(--fx-ink-mute)' }}>
                      🚫 {new Date(a.date).toLocaleDateString('fr-FR')} {a.note ? `· ${a.note}` : ''}
                    </span>
                    <span className="tabular-nums font-bold shrink-0" style={{ color: '#FCD34D' }}>
                      −{DA(Number(a.cost || 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* ── Le règlement ── */}
          <Panel title={fr ? 'Règlement' : 'الدفع'} icon="💵">
            <FormGrid>
              <Field
                label={fr ? 'Montant versé (DA)' : 'المبلغ المدفوع (دج)'}
                required
                hint={
                  manual
                    ? (fr ? 'Montant saisi manuellement.' : 'مبلغ يدوي.')
                    : (fr ? 'Modifiable : ajustez si vous versez un montant différent.' : 'قابل للتعديل.')
                }
              >
                <input
                  type="number" min="0" step="any" inputMode="decimal"
                  className="fx-field text-lg font-black tabular-nums"
                  value={amount}
                  onChange={e => { setAmount(e.target.value); setManual(true); }}
                />
              </Field>
              <Field label={fr ? 'Date du paiement' : 'تاريخ الدفع'} required>
                <input type="date" className="fx-field" value={date} onChange={e => setDate(e.target.value)} />
              </Field>
            </FormGrid>

            <Field label={fr ? 'Description' : 'الوصف'} hint={fr ? 'Facultative' : 'اختياري'} className="mt-3">
              <input
                className="fx-field" value={note} onChange={e => setNote(e.target.value)}
                placeholder={fr ? 'Ex. : virement, espèces…' : 'مثال: تحويل، نقدًا…'}
              />
            </Field>

            {manual && Number(amount) !== Math.round(summary.net) && (
              <p className="mt-2 text-[11px]" style={{ color: '#FCD34D' }}>
                ⚠️ {fr
                  ? `Écart de ${DA(Math.abs(Number(amount) - summary.net))} avec le net calculé.`
                  : `فرق ${DA(Math.abs(Number(amount) - summary.net))} عن الصافي المحسوب.`}
              </p>
            )}
          </Panel>

          {error && <p className="text-sm font-semibold" style={{ color: 'var(--fx-red-300)' }}>⚠️ {error}</p>}

          {history.length > 0 && (
            <Panel title={fr ? 'Paiements précédents' : 'الدفعات السابقة'} icon="📜" bodyClassName="p-0">
              <TableWrap>
                <thead className="fx-table-head">
                  <tr>
                    <Th>{fr ? 'Date' : 'التاريخ'}</Th>
                    <Th>{fr ? 'Période' : 'الفترة'}</Th>
                    <Th>{fr ? 'Description' : 'الوصف'}</Th>
                    <Th align="right">{fr ? 'Versé' : 'المدفوع'}</Th>
                  </tr>
                </thead>
                <tbody>
                  {history.slice(0, 10).map(p => (
                    <tr key={p.id} className="fx-table-row">
                      <Td>{new Date(p.date).toLocaleDateString('fr-FR')}</Td>
                      <Td>
                        {p.periodStart
                          ? `${new Date(p.periodStart).toLocaleDateString('fr-FR')} → ${new Date(p.periodEnd || p.date).toLocaleDateString('fr-FR')}`
                          : '—'}
                      </Td>
                      <Td>{p.note || '—'}</Td>
                      <Td align="right" className="font-bold tabular-nums">{DA(Number(p.netSalary || p.amount || 0))}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </Panel>
          )}
        </div>
      )}
    </Modal>
  );
};
