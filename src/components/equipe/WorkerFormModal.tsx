import React, { useEffect, useState } from 'react';
import { Plus, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Language, Worker, WorkerRole } from '../../types';
import { WorkerService } from '../../services/workerService';
import { Modal, Field, FormGrid, Btn, Toggle, Segmented, Select, Panel } from '../ui/fx';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (w: Worker) => void;
  worker?: Worker | null;
  roles: WorkerRole[];
  onRoleCreated: (r: WorkerRole) => void;
  lang: Language;
}

const blank = () => ({
  fullName: '',
  dateOfBirth: '',
  idCardNumber: '',
  phone: '',
  roleName: '',
  startDate: new Date().toISOString().slice(0, 10),

  paymentEnabled: true,
  paymentType: 'monthly' as 'monthly' | 'daily',
  baseSalary: '',

  accountEnabled: false,
  email: '',
  username: '',
  password: '',
});

/**
 * CRÉATION / MODIFICATION D'UN EMPLOYÉ
 *
 * Le formulaire suit l'ordre dans lequel on pense un recrutement :
 * qui il est → ce qu'il fait → comment il est payé → comment il se connecte.
 *
 * Deux réglages commandent le reste du formulaire :
 *  • « Rémunéré » — décoché, le bloc salaire disparaît (bénévole, stagiaire,
 *    associé). Les acomptes et la paie seront alors sans objet.
 *  • « Compte de connexion » — coché, l'employé est créé dans Supabase Auth et
 *    pourra se connecter avec son e-mail et son mot de passe.
 *
 * L'employé est créé SANS AUCUNE permission : l'admin les ouvre ensuite depuis
 * le bouton « Permissions » de sa carte. C'est volontaire — un compte neuf ne
 * doit jamais arriver avec des droits qu'on n'a pas choisis.
 */
export const WorkerFormModal: React.FC<Props> = ({
  open, onClose, onSaved, worker, roles, onRoleCreated, lang,
}) => {
  const fr = lang === 'fr';
  const isEdit = Boolean(worker);

  const [form, setForm] = useState(blank());
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newRole, setNewRole] = useState('');
  const [creatingRole, setCreatingRole] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setShowPassword(false);
    setNewRole('');
    if (worker) {
      setForm({
        fullName: worker.fullName ?? '',
        dateOfBirth: worker.dateOfBirth ?? '',
        idCardNumber: worker.idCardNumber ?? '',
        phone: worker.phone ?? '',
        roleName: worker.roleName ?? '',
        startDate: worker.startDate ?? '',
        paymentEnabled: worker.paymentEnabled ?? true,
        paymentType: (worker.paymentType as any) ?? 'monthly',
        baseSalary: worker.baseSalary ? String(worker.baseSalary) : '',
        accountEnabled: worker.accountEnabled ?? Boolean(worker.email),
        email: worker.email ?? '',
        username: worker.username ?? '',
        // On ne réaffiche jamais le mot de passe existant : laissé vide, il est
        // conservé tel quel.
        password: '',
      });
    } else {
      setForm(blank());
    }
  }, [open, worker]);

  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const createRole = async () => {
    const name = newRole.trim();
    if (!name) return;
    setCreatingRole(true);
    try {
      const role = await WorkerService.createRole(name);
      onRoleCreated(role);
      set('roleName', role.name);
      setNewRole('');
    } catch (err: any) {
      // Doublon : on se contente de sélectionner le rôle existant.
      if (/duplicate|unique/i.test(err?.message ?? '')) {
        set('roleName', name);
        setNewRole('');
      } else {
        setError(err?.message ?? String(err));
      }
    } finally {
      setCreatingRole(false);
    }
  };

  const validate = (): string | null => {
    if (!form.fullName.trim()) return fr ? 'Le nom complet est obligatoire.' : 'الاسم الكامل مطلوب.';
    if (!form.phone.trim()) return fr ? 'Le numéro de téléphone est obligatoire.' : 'رقم الهاتف مطلوب.';
    if (!form.roleName.trim()) return fr ? 'Choisissez un rôle (ou créez-en un).' : 'اختر دورًا.';
    if (form.paymentEnabled && !(Number(form.baseSalary) > 0)) {
      return fr ? 'Saisissez le montant de la rémunération.' : 'أدخل مبلغ الأجر.';
    }
    if (form.accountEnabled) {
      if (!form.email.trim() || !form.email.includes('@')) {
        return fr ? 'Un e-mail valide est requis pour le compte de connexion.' : 'بريد إلكتروني صالح مطلوب.';
      }
      if (!form.username.trim()) return fr ? "Le nom d'utilisateur est obligatoire." : 'اسم المستخدم مطلوب.';
      if (!isEdit && form.password.length < 6) {
        return fr ? 'Le mot de passe doit faire au moins 6 caractères.' : 'كلمة المرور 6 أحرف على الأقل.';
      }
    }
    return null;
  };

  const submit = async () => {
    const problem = validate();
    if (problem) { setError(problem); return; }

    setSaving(true);
    setError('');
    try {
      const payload: Partial<Worker> = {
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        idCardNumber: form.idCardNumber.trim() || undefined,
        phone: form.phone.trim(),
        roleName: form.roleName.trim(),
        startDate: form.startDate || undefined,
        // `type` pilote les listes historiques (ex. choix d'un chauffeur dans le
        // wizard). On le déduit du libellé du rôle, sans l'imposer à l'admin.
        type: /chauffeur|driver|سائق/i.test(form.roleName) ? 'driver' : 'worker',
        paymentEnabled: form.paymentEnabled,
        paymentType: form.paymentEnabled ? form.paymentType : undefined,
        baseSalary: form.paymentEnabled ? Number(form.baseSalary) : 0,
        accountEnabled: form.accountEnabled,
        email: form.accountEnabled ? form.email.trim() : (form.email.trim() || ''),
        username: form.accountEnabled ? form.username.trim() : '',
      };

      if (form.password) payload.password = form.password;
      if (!isEdit) payload.permissions = []; // aucun droit à la création

      const saved = worker
        ? await WorkerService.updateWorker(worker.id, { ...payload, authUserId: worker.authUserId })
        : await WorkerService.createWorker(payload);

      onSaved(saved);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      icon={isEdit ? '✏️' : '➕'}
      title={isEdit ? (fr ? "Modifier l'employé" : 'تعديل الموظف') : (fr ? 'Nouvel employé' : 'موظف جديد')}
      subtitle={form.fullName || (fr ? 'Fiche du personnel' : 'بطاقة الموظف')}
      footer={
        <>
          <Btn tone="ghost" onClick={onClose} disabled={saving}>{fr ? 'Annuler' : 'إلغاء'}</Btn>
          <Btn tone="primary" onClick={submit} disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {isEdit ? (fr ? 'Enregistrer' : 'حفظ') : (fr ? "Créer l'employé" : 'إنشاء')}
          </Btn>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── Identité ── */}
        <Panel title={fr ? 'Informations personnelles' : 'المعلومات الشخصية'} icon="👤">
          <FormGrid>
            <Field label={fr ? 'Nom complet' : 'الاسم الكامل'} required className="sm:col-span-2">
              <input
                className="fx-field"
                value={form.fullName}
                onChange={e => set('fullName', e.target.value)}
                placeholder={fr ? 'Ex. : Ahmed Boudjellal' : 'مثال: أحمد'}
              />
            </Field>
            <Field label={fr ? 'Date de naissance' : 'تاريخ الميلاد'}>
              <input type="date" className="fx-field" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} />
            </Field>
            <Field
              label={fr ? "N° de carte d'identité" : 'رقم بطاقة الهوية'}
              hint={fr ? 'Facultatif' : 'اختياري'}
            >
              <input className="fx-field" value={form.idCardNumber} onChange={e => set('idCardNumber', e.target.value)} />
            </Field>
            <Field label={fr ? 'Téléphone' : 'الهاتف'} required>
              <input
                type="tel" inputMode="tel" className="fx-field"
                value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+213 …"
              />
            </Field>
            <Field label={fr ? "Date d'entrée en fonction" : 'تاريخ بدء العمل'}>
              <input type="date" className="fx-field" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
            </Field>
          </FormGrid>
        </Panel>

        {/* ── Rôle ── */}
        <Panel title={fr ? 'Rôle' : 'الدور'} icon="🎖️">
          <Field label={fr ? 'Rôle attribué' : 'الدور'} required>
            <Select
              value={form.roleName}
              onChange={v => set('roleName', v)}
              options={[
                { value: '', label: fr ? '— Choisir un rôle —' : '— اختر دورًا —' },
                ...roles.map(r => ({ value: r.name, label: r.name })),
                // Un rôle saisi à la main mais absent du catalogue reste sélectionnable.
                ...(form.roleName && !roles.some(r => r.name === form.roleName)
                  ? [{ value: form.roleName, label: form.roleName }]
                  : []),
              ]}
            />
          </Field>

          <div className="mt-3 fx-well p-3">
            <p className="fx-label">{fr ? 'Créer un nouveau rôle' : 'إنشاء دور جديد'}</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="fx-field flex-1"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createRole(); } }}
                placeholder={fr ? 'Ex. : Responsable flotte' : 'مثال: مسؤول الأسطول'}
              />
              <Btn tone="steel" onClick={createRole} disabled={!newRole.trim() || creatingRole}>
                {creatingRole ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {fr ? 'Ajouter' : 'إضافة'}
              </Btn>
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: 'var(--fx-ink-dim)' }}>
              {fr
                ? "Le rôle est un simple libellé : il ne donne aucun droit. Les droits se règlent employé par employé, via le bouton « Permissions »."
                : 'الدور مجرد تسمية ولا يمنح أي صلاحية. تُضبط الصلاحيات لكل موظف على حدة.'}
            </p>
          </div>
        </Panel>

        {/* ── Rémunération ── */}
        <Panel title={fr ? 'Rémunération' : 'الأجر'} icon="💰">
          <Toggle
            checked={form.paymentEnabled}
            onChange={v => set('paymentEnabled', v)}
            label={fr ? 'Cet employé est rémunéré' : 'هذا الموظف يتقاضى أجرًا'}
            description={
              fr
                ? 'Désactivé, aucun salaire, acompte ni paie ne sera calculé pour lui.'
                : 'عند التعطيل، لن يُحتسب له أي راتب أو سلفة.'
            }
          />

          {form.paymentEnabled && (
            <div className="mt-3 space-y-3">
              <Field label={fr ? 'Base de calcul' : 'أساس الحساب'}>
                <Segmented
                  value={form.paymentType}
                  onChange={v => set('paymentType', v)}
                  options={[
                    { value: 'monthly' as const, label: fr ? '📆 Au mois' : '📆 شهري' },
                    { value: 'daily' as const, label: fr ? '📅 Au jour' : '📅 يومي' },
                  ]}
                  className="w-full"
                />
              </Field>

              <Field
                label={
                  form.paymentType === 'monthly'
                    ? (fr ? 'Salaire mensuel (DA)' : 'الراتب الشهري (دج)')
                    : (fr ? 'Tarif journalier (DA)' : 'الأجر اليومي (دج)')
                }
                required
              >
                <input
                  type="number" min="0" step="any" inputMode="decimal"
                  className="fx-field text-lg font-black tabular-nums"
                  value={form.baseSalary}
                  onChange={e => set('baseSalary', e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>
          )}
        </Panel>

        {/* ── Compte de connexion ── */}
        <Panel title={fr ? 'Compte de connexion' : 'حساب الدخول'} icon="🔐">
          <Toggle
            checked={form.accountEnabled}
            onChange={v => set('accountEnabled', v)}
            label={fr ? 'Autoriser cet employé à se connecter' : 'السماح لهذا الموظف بالدخول'}
            description={
              fr
                ? "Le compte est créé dans Supabase Authentication. L'employé se connecte avec son e-mail et son mot de passe."
                : 'يُنشأ الحساب في Supabase. يدخل الموظف ببريده وكلمة مروره.'
            }
          />

          {form.accountEnabled && (
            <div className="mt-3 space-y-3">
              <FormGrid>
                <Field label={fr ? 'E-mail' : 'البريد الإلكتروني'} required>
                  <input
                    type="email" inputMode="email" autoComplete="off"
                    className="fx-field"
                    value={form.email}
                    onChange={e => set('email', e.target.value)}
                    placeholder="employe@agence.com"
                  />
                </Field>
                <Field label={fr ? "Nom d'utilisateur" : 'اسم المستخدم'} required>
                  <input
                    className="fx-field" autoComplete="off"
                    value={form.username}
                    onChange={e => set('username', e.target.value)}
                    placeholder="a.boudjellal"
                  />
                </Field>
              </FormGrid>

              <Field
                label={fr ? 'Mot de passe' : 'كلمة المرور'}
                required={!isEdit}
                hint={isEdit ? (fr ? 'Laissez vide pour conserver le mot de passe actuel.' : 'اتركه فارغًا للاحتفاظ بكلمة المرور.') : undefined}
              >
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="fx-field ltr:pr-11 rtl:pl-11"
                    value={form.password}
                    onChange={e => set('password', e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? 'Masquer' : 'Afficher'}
                    className="absolute ltr:right-2 rtl:left-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-white/10"
                    style={{ color: 'var(--fx-ink-mute)' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </Field>

              <p
                className="text-[11px] leading-relaxed rounded-lg p-2.5"
                style={{
                  color: 'var(--fx-red-200)',
                  backgroundImage: 'var(--fx-grad-red-veil)',
                  border: '1px solid var(--fx-line-red)',
                }}
              >
                {fr
                  ? "À la création, l'employé n'a AUCUNE permission : sa barre latérale est vide. Ouvrez-lui les interfaces et les boutons voulus depuis le bouton « Permissions » de sa carte."
                  : 'عند الإنشاء، لا يملك الموظف أي صلاحية. افتح له الواجهات من زر «الصلاحيات».'}
              </p>
            </div>
          )}
        </Panel>

        {error && (
          <p
            className="text-sm font-semibold rounded-lg p-3"
            style={{
              color: 'var(--fx-red-200)',
              backgroundImage: 'linear-gradient(135deg, rgba(240,51,60,0.16), rgba(116,8,26,0.05))',
              border: '1px solid var(--fx-line-red-hi)',
            }}
          >
            ⚠️ {error}
          </p>
        )}
      </div>
    </Modal>
  );
};
