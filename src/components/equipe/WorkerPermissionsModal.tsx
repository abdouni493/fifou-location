import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, ChevronRight, ShieldCheck, ShieldOff } from 'lucide-react';
import { Language, Worker } from '../../types';
import { PERMISSION_PAGES, permissionKey, ALL_PERMISSION_KEYS } from '../../constants/permissions';
import { WorkerService } from '../../services/workerService';
import { Modal, Btn, Badge, InfoBanner } from '../ui/fx';

interface Props {
  open: boolean;
  onClose: () => void;
  worker: Worker | null;
  onSaved: (workerId: string, keys: string[]) => void;
  lang: Language;
}

/**
 * ÉDITEUR DE PERMISSIONS
 *
 * Deux colonnes qui se lisent de gauche à droite :
 *   1. la liste des INTERFACES de la barre latérale — on coche celles que
 *      l'employé doit voir ;
 *   2. les BOUTONS D'ACTION de l'interface sélectionnée — on coche ceux qu'il
 *      a le droit d'utiliser.
 *
 * Cocher une interface accorde d'office « consulter » : une interface visible
 * dont aucune action n'est ouverte serait un écran mort. Décocher la dernière
 * action d'une interface la retire de la barre latérale — c'est cohérent avec
 * la règle de lecture appliquée à l'exécution (cf. utils/permissions.tsx).
 *
 * Sur téléphone, les deux colonnes s'empilent : on choisit une interface, le
 * volet des actions apparaît en dessous.
 */
export const WorkerPermissionsModal: React.FC<Props> = ({ open, onClose, worker, onSaved, lang }) => {
  const fr = lang === 'fr';

  const [keys, setKeys] = useState<Set<string>>(new Set());
  const [selectedPage, setSelectedPage] = useState<string>(PERMISSION_PAGES[0].id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !worker) return;
    setKeys(new Set(worker.permissions ?? []));
    setSelectedPage(PERMISSION_PAGES[0].id);
    setError('');
  }, [open, worker]);

  const countFor = (pageId: string) => {
    const prefix = `${pageId}:`;
    let n = 0;
    keys.forEach(k => { if (k.startsWith(prefix)) n++; });
    return n;
  };

  const page = useMemo(
    () => PERMISSION_PAGES.find(p => p.id === selectedPage) ?? PERMISSION_PAGES[0],
    [selectedPage],
  );

  const toggleAction = (pageId: string, actionId: string) => {
    setKeys(prev => {
      const next = new Set(prev);
      const k = permissionKey(pageId, actionId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  /** Coche/décoche une interface entière. */
  const togglePage = (pageId: string) => {
    const p = PERMISSION_PAGES.find(x => x.id === pageId);
    if (!p) return;
    setKeys(prev => {
      const next = new Set(prev);
      const all = p.actions.map(a => permissionKey(pageId, a.id));
      const isOn = all.some(k => next.has(k));
      if (isOn) all.forEach(k => next.delete(k));
      else all.forEach(k => next.add(k));
      return next;
    });
    setSelectedPage(pageId);
  };

  const save = async () => {
    if (!worker) return;
    setSaving(true);
    setError('');
    try {
      const list = [...keys];
      await WorkerService.setPermissions(worker.id, list);
      onSaved(worker.id, list);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setSaving(false);
    }
  };

  const totalGranted = keys.size;
  const pagesGranted = PERMISSION_PAGES.filter(p => countFor(p.id) > 0).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      icon="🔑"
      title={fr ? 'Permissions' : 'الصلاحيات'}
      subtitle={worker?.fullName}
      footer={
        <>
          <div className="flex-1 text-[11px] hidden sm:block" style={{ color: 'var(--fx-ink-mute)' }}>
            {fr
              ? `${pagesGranted} interface(s) · ${totalGranted} action(s) accordée(s)`
              : `${pagesGranted} واجهة · ${totalGranted} إجراء`}
          </div>
          <Btn tone="ghost" size="sm" onClick={() => setKeys(new Set())} disabled={saving}>
            <ShieldOff size={14} />
            {fr ? 'Tout retirer' : 'إزالة الكل'}
          </Btn>
          <Btn tone="steel" size="sm" onClick={() => setKeys(new Set(ALL_PERMISSION_KEYS))} disabled={saving}>
            <ShieldCheck size={14} />
            {fr ? 'Tout accorder' : 'منح الكل'}
          </Btn>
          <Btn tone="primary" onClick={save} disabled={saving}>
            {saving && <Loader2 size={15} className="animate-spin" />}
            {fr ? 'Enregistrer' : 'حفظ'}
          </Btn>
        </>
      }
    >
      {!WorkerService.migrationApplied && (
        <InfoBanner>
          {fr
            ? 'La colonne « permissions » est absente de la table workers. Exécutez migration_equipe_caisse.sql dans Supabase → SQL Editor, sinon l’enregistrement échouera.'
            : 'عمود permissions غير موجود. نفّذ migration_equipe_caisse.sql في Supabase.'}
        </InfoBanner>
      )}

      <p className="mb-4 text-xs leading-relaxed" style={{ color: 'var(--fx-ink-mute)' }}>
        {fr
          ? "À gauche, les interfaces que l'employé verra dans sa barre latérale. Sélectionnez-en une pour choisir, à droite, les boutons d'action qu'il pourra utiliser. Un bouton non accordé n'apparaît pas du tout dans son interface."
          : 'على اليسار الواجهات التي سيراها الموظف. اختر واحدة لتحديد الأزرار المسموح بها على اليمين.'}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,20rem)_1fr] gap-4">
        {/* ── Colonne 1 : les interfaces ── */}
        <div className="fx-well p-2 max-h-[22rem] lg:max-h-[30rem] overflow-y-auto custom-scrollbar">
          <p className="px-2 py-1.5 fx-label mb-0">{fr ? 'Interfaces' : 'الواجهات'}</p>
          <ul className="space-y-1">
            {PERMISSION_PAGES.map(p => {
              const n = countFor(p.id);
              const on = n > 0;
              const active = selectedPage === p.id;
              return (
                <li key={p.id}>
                  <div
                    className="flex items-center gap-1 rounded-xl transition-colors"
                    style={{
                      backgroundImage: active ? 'var(--fx-grad-red-veil)' : undefined,
                      border: `1px solid ${active ? 'var(--fx-line-red)' : 'transparent'}`,
                    }}
                  >
                    {/* La case coche/décoche l'interface entière */}
                    <button
                      type="button"
                      onClick={() => togglePage(p.id)}
                      aria-pressed={on}
                      aria-label={`${on ? 'Retirer' : 'Accorder'} ${p.label[lang]}`}
                      className="shrink-0 ml-2 w-5 h-5 rounded-md flex items-center justify-center transition-all"
                      style={{
                        backgroundImage: on ? 'var(--fx-grad-red)' : 'linear-gradient(135deg,#26262F,#18181E)',
                        border: `1px solid ${on ? 'var(--fx-line-red-hi)' : 'var(--fx-line-strong)'}`,
                        boxShadow: on ? '0 0 10px -2px rgba(200,16,46,0.8)' : undefined,
                      }}
                    >
                      {on && <Check size={12} strokeWidth={3.5} color="#fff" />}
                    </button>

                    {/* Le libellé ouvre le volet des actions */}
                    <button
                      type="button"
                      onClick={() => setSelectedPage(p.id)}
                      className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 text-left"
                    >
                      <span className="text-base shrink-0">{p.icon}</span>
                      <span
                        className="flex-1 min-w-0 truncate text-xs font-bold"
                        style={{ color: on ? 'var(--fx-ink)' : 'var(--fx-ink-mute)' }}
                      >
                        {p.label[lang]}
                      </span>
                      {n > 0 && (
                        <Badge tone="red" className="shrink-0">
                          {n}/{p.actions.length}
                        </Badge>
                      )}
                      <ChevronRight size={14} className="shrink-0 rtl:rotate-180" style={{ color: 'var(--fx-ink-dim)' }} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* ── Colonne 2 : les actions de l'interface choisie ── */}
        <div className="fx-well p-3 max-h-[22rem] lg:max-h-[30rem] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="fx-label mb-0 flex items-center gap-2">
              <span className="text-base">{page.icon}</span>
              {fr ? 'Boutons de' : 'أزرار'} « {page.label[lang]} »
            </p>
            <div className="flex gap-1.5 shrink-0">
              <Btn
                tone="ghost" size="sm"
                onClick={() =>
                  setKeys(prev => {
                    const n = new Set(prev);
                    page.actions.forEach(a => n.add(permissionKey(page.id, a.id)));
                    return n;
                  })
                }
              >
                {fr ? 'Tout' : 'الكل'}
              </Btn>
              <Btn
                tone="ghost" size="sm"
                onClick={() =>
                  setKeys(prev => {
                    const n = new Set(prev);
                    page.actions.forEach(a => n.delete(permissionKey(page.id, a.id)));
                    return n;
                  })
                }
              >
                {fr ? 'Aucun' : 'لا شيء'}
              </Btn>
            </div>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {page.actions.map(a => {
              const k = permissionKey(page.id, a.id);
              const on = keys.has(k);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => toggleAction(page.id, a.id)}
                    aria-pressed={on}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all"
                    style={{
                      backgroundImage: on
                        ? 'var(--fx-grad-red-tint)'
                        : 'linear-gradient(135deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))',
                      border: `1px solid ${on ? 'var(--fx-line-red)' : 'var(--fx-line)'}`,
                    }}
                  >
                    <span
                      className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center"
                      style={{
                        backgroundImage: on ? 'var(--fx-grad-red)' : 'linear-gradient(135deg,#26262F,#18181E)',
                        border: `1px solid ${on ? 'var(--fx-line-red-hi)' : 'var(--fx-line-strong)'}`,
                      }}
                    >
                      {on && <Check size={12} strokeWidth={3.5} color="#fff" />}
                    </span>
                    <span
                      className="text-xs font-semibold leading-snug"
                      style={{ color: on ? 'var(--fx-ink)' : 'var(--fx-ink-mute)' }}
                    >
                      {a.label[lang]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {countFor(page.id) === 0 && (
            <p className="mt-4 text-[11px] leading-relaxed" style={{ color: 'var(--fx-ink-dim)' }}>
              {fr
                ? "Aucune action accordée : cette interface n'apparaîtra pas dans la barre latérale de l'employé."
                : 'لا إجراءات ممنوحة: لن تظهر هذه الواجهة في الشريط الجانبي.'}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p
          className="mt-4 text-sm font-semibold rounded-lg p-3"
          style={{
            color: 'var(--fx-red-200)',
            backgroundImage: 'linear-gradient(135deg, rgba(240,51,60,0.16), rgba(116,8,26,0.05))',
            border: '1px solid var(--fx-line-red-hi)',
          }}
        >
          ⚠️ {error}
        </p>
      )}
    </Modal>
  );
};
