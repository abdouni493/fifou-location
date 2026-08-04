import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Plus, Users, Wallet, AlertTriangle, KeyRound } from 'lucide-react';
import { Language, Worker, WorkerRole, WorkerAdvance, WorkerAbsence, WorkerPayment } from '../types';
import { WorkerService } from '../services/workerService';
import { computePayroll } from '../utils/payroll';
import { formatAmount } from '../utils/format';
import { useCan } from '../utils/permissions';
import { ConfirmModal } from './ConfirmModal';
import { WorkerCard } from './equipe/WorkerCard';
import { WorkerFormModal } from './equipe/WorkerFormModal';
import { WorkerPermissionsModal } from './equipe/WorkerPermissionsModal';
import { WorkerDetailsModal } from './equipe/WorkerDetailsModal';
import { WorkerAdvancesModal, WorkerAbsencesModal, WorkerPaymentModal } from './equipe/WorkerMoneyModals';
import {
  PageHeader, StatCard, StatGrid, Toolbar, SearchInput, Segmented, Btn,
  EmptyState, LoadingState, ErrorBanner, InfoBanner,
} from './ui/fx';

const DA = (n: number) => `${formatAmount(Math.round(n))} DA`;

type Filter = 'all' | 'due' | 'account' | 'noperm';
type ModalKind = 'form' | 'permissions' | 'details' | 'advance' | 'absence' | 'payment' | null;

/**
 * ÉQUIPE
 * ──────
 * Les employés en cartes, avec sur chacune les actions qui les concernent :
 * consulter, modifier, supprimer, régler les permissions, et — pour les
 * employés rémunérés — acompte, absence et paie.
 *
 * Le tri par défaut fait remonter ceux qui ont de l'argent en attente : c'est
 * la seule chose qui appelle une décision quand on ouvre cet écran.
 */
export const EquipePage: React.FC<{ lang: Language }> = ({ lang }) => {
  const fr = lang === 'fr';
  const can = useCan('team');

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [roles, setRoles] = useState<WorkerRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [modal, setModal] = useState<ModalKind>(null);
  const [current, setCurrent] = useState<Worker | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Worker | null>(null);

  // ─── Chargement ───────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, r] = await Promise.all([
        WorkerService.getWorkers(),
        WorkerService.getRoles().catch(() => []),
      ]);
      setWorkers(w);
      setRoles(r);
    } catch (err: any) {
      console.error('[Équipe]', err);
      setError(
        /JWT|auth|PGRST301/i.test(err?.message ?? '')
          ? (fr ? 'Session expirée. Reconnectez-vous.' : 'انتهت الجلسة.')
          : (fr ? "Impossible de charger l'équipe." : 'تعذر تحميل الفريق.'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // ─── Statistiques d'en-tête ───────────────────────────────────────────────
  const stats = useMemo(() => {
    const payrolls = workers.map(w => ({ worker: w, p: computePayroll(w) }));
    const paidStaff = payrolls.filter(x => x.p.paid);
    return {
      total: workers.length,
      withAccount: workers.filter(w => w.accountEnabled).length,
      withoutPerms: workers.filter(w => (w.permissions?.length ?? 0) === 0).length,
      totalDue: paidStaff.reduce((s, x) => s + x.p.net, 0),
      pendingAdvances: paidStaff.reduce((s, x) => s + x.p.advancesTotal, 0),
      monthlyPayroll: paidStaff.reduce(
        (s, x) => s + (x.p.mode === 'monthly' ? x.p.baseSalary : x.p.baseSalary * 26),
        0,
      ),
    };
  }, [workers]);

  // ─── Filtrage + tri ───────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workers
      .filter(w => {
        if (q) {
          const hay = `${w.fullName} ${w.email} ${w.phone} ${w.roleName ?? ''} ${w.username ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (filter === 'due') return computePayroll(w).net > 0;
        if (filter === 'account') return Boolean(w.accountEnabled);
        if (filter === 'noperm') return (w.permissions?.length ?? 0) === 0;
        return true;
      })
      // Ce qui réclame une décision passe devant.
      .sort((a, b) => computePayroll(b).net - computePayroll(a).net);
  }, [workers, search, filter]);

  // ─── Mutations locales ────────────────────────────────────────────────────
  const upsert = (w: Worker) =>
    setWorkers(prev => {
      const i = prev.findIndex(x => x.id === w.id);
      if (i === -1) return [w, ...prev];
      // Le service ne renvoie pas les relations : on garde celles déjà chargées.
      const next = [...prev];
      next[i] = { ...w, advances: prev[i].advances, absences: prev[i].absences, payments: prev[i].payments };
      return next;
    });

  const patch = (id: string, fields: Partial<Worker>) =>
    setWorkers(prev => prev.map(w => (w.id === id ? { ...w, ...fields } : w)));

  const open = (kind: ModalKind, worker: Worker | null) => { setCurrent(worker); setModal(kind); };
  const close = () => { setModal(null); setCurrent(null); };

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      await WorkerService.deleteWorker(confirmDelete.id);
      setWorkers(prev => prev.filter(w => w.id !== confirmDelete.id));
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setConfirmDelete(null);
    }
  };

  // Le worker courant, relu depuis l'état : les modales doivent voir les
  // acomptes/absences ajoutés sans être remontées.
  const live = current ? workers.find(w => w.id === current.id) ?? current : null;

  return (
    <div className="max-w-[92rem] mx-auto">
      <PageHeader
        icon="🤝"
        eyebrow={fr ? 'Ressources humaines' : 'الموارد البشرية'}
        title={fr ? 'Équipe' : 'الفريق'}
        subtitle={
          fr
            ? 'Fiches du personnel, permissions, acomptes, absences et paie.'
            : 'بطاقات الموظفين والصلاحيات والسلف والغيابات والرواتب.'
        }
        actions={
          can('create') ? (
            <Btn tone="primary" onClick={() => open('form', null)}>
              <Plus size={16} />
              {fr ? 'Nouvel employé' : 'موظف جديد'}
            </Btn>
          ) : null
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} retryLabel={fr ? 'Réessayer' : 'إعادة'} />}
      {!WorkerService.migrationApplied && (
        <InfoBanner>
          {fr
            ? 'Les colonnes « rôle, permissions, date d’entrée, compte » ne sont pas encore dans la base. Exécutez migration_equipe_caisse.sql dans Supabase → SQL Editor pour activer ces fonctions. Le reste de l’écran fonctionne déjà.'
            : 'أعمدة الدور والصلاحيات غير موجودة بعد. نفّذ migration_equipe_caisse.sql في Supabase.'}
        </InfoBanner>
      )}

      {/* ── Chiffres clés ── */}
      <div className="mb-5">
        <StatGrid cols={4}>
          <StatCard label={fr ? 'Employés' : 'الموظفون'} value={stats.total} icon={<Users size={15} />} tone="steel" />
          <StatCard
            label={fr ? 'Net à payer' : 'الصافي المستحق'}
            value={DA(stats.totalDue)}
            hint={fr ? 'Toutes périodes non réglées' : 'كل الفترات غير المدفوعة'}
            icon={<Wallet size={15} />}
            tone={stats.totalDue > 0 ? 'red' : 'green'}
            onClick={() => setFilter(filter === 'due' ? 'all' : 'due')}
          />
          <StatCard
            label={fr ? 'Acomptes en cours' : 'السلف الجارية'}
            value={DA(stats.pendingAdvances)}
            icon={<AlertTriangle size={15} />}
            tone="amber"
          />
          <StatCard
            label={fr ? 'Masse salariale / mois' : 'كتلة الأجور / شهر'}
            value={DA(stats.monthlyPayroll)}
            hint={fr ? 'Journaliers estimés à 26 j.' : 'اليوميون بـ 26 يومًا'}
            icon="📊"
            tone="steel"
          />
          <StatCard
            label={fr ? 'Comptes de connexion' : 'حسابات الدخول'}
            value={stats.withAccount}
            hint={`${stats.total - stats.withAccount} ${fr ? 'sans compte' : 'بدون حساب'}`}
            icon="🔐"
            tone="steel"
            onClick={() => setFilter(filter === 'account' ? 'all' : 'account')}
          />
          <StatCard
            label={fr ? 'Sans permission' : 'بلا صلاحيات'}
            value={stats.withoutPerms}
            hint={fr ? 'Barre latérale vide' : 'شريط جانبي فارغ'}
            icon={<KeyRound size={15} />}
            tone={stats.withoutPerms > 0 ? 'amber' : 'green'}
            onClick={() => setFilter(filter === 'noperm' ? 'all' : 'noperm')}
          />
        </StatGrid>
      </div>

      {/* ── Recherche et filtres ── */}
      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={fr ? 'Rechercher un employé, un rôle, un téléphone…' : 'ابحث عن موظف…'}
        />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: fr ? 'Tous' : 'الكل', badge: workers.length },
            { value: 'due', label: fr ? '💰 À payer' : '💰 مستحق' },
            { value: 'account', label: fr ? '🔐 Connectés' : '🔐 حسابات' },
            { value: 'noperm', label: fr ? '🔑 Sans droits' : '🔑 بلا صلاحيات' },
          ]}
        />
      </Toolbar>

      {/* ── Cartes ── */}
      {loading ? (
        <LoadingState label={fr ? 'Chargement de l’équipe…' : 'جاري التحميل…'} rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="🤝"
          title={
            workers.length === 0
              ? (fr ? 'Aucun employé' : 'لا موظفين')
              : (fr ? 'Aucun résultat' : 'لا نتائج')
          }
          description={
            workers.length === 0
              ? (fr ? 'Créez votre premier employé pour lui ouvrir un accès et suivre sa paie.' : 'أنشئ أول موظف.')
              : (fr ? 'Modifiez votre recherche ou changez de filtre.' : 'غيّر البحث أو الفلتر.')
          }
          action={
            workers.length === 0 && can('create') ? (
              <Btn tone="primary" onClick={() => open('form', null)}>
                <Plus size={16} />
                {fr ? 'Nouvel employé' : 'موظف جديد'}
              </Btn>
            ) : undefined
          }
        />
      ) : (
        <div className="fx-stagger grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          <AnimatePresence mode="popLayout">
            {visible.map(w => (
              <WorkerCard
                key={w.id}
                worker={w}
                lang={lang}
                can={can}
                onView={() => open('details', w)}
                onEdit={() => open('form', w)}
                onDelete={() => setConfirmDelete(w)}
                onPermissions={() => open('permissions', w)}
                onAdvance={() => open('advance', w)}
                onAbsence={() => open('absence', w)}
                onPayment={() => open('payment', w)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Modales ── */}
      <WorkerFormModal
        open={modal === 'form'}
        onClose={close}
        worker={modal === 'form' ? current : null}
        roles={roles}
        onRoleCreated={r => setRoles(prev => [...prev, r].sort((a, b) => a.name.localeCompare(b.name)))}
        onSaved={upsert}
        lang={lang}
      />

      <WorkerPermissionsModal
        open={modal === 'permissions'}
        onClose={close}
        worker={live}
        onSaved={(id, keys) => patch(id, { permissions: keys })}
        lang={lang}
      />

      <WorkerDetailsModal open={modal === 'details'} onClose={close} worker={live} lang={lang} />

      <WorkerAdvancesModal
        open={modal === 'advance'}
        onClose={close}
        worker={live}
        lang={lang}
        onChange={(id, advances: WorkerAdvance[]) => patch(id, { advances })}
      />

      <WorkerAbsencesModal
        open={modal === 'absence'}
        onClose={close}
        worker={live}
        lang={lang}
        onChange={(id, absences: WorkerAbsence[]) => patch(id, { absences })}
      />

      <WorkerPaymentModal
        open={modal === 'payment'}
        onClose={close}
        worker={live}
        lang={lang}
        onPaid={(id, payment: WorkerPayment) =>
          setWorkers(prev => prev.map(w => (w.id === id ? { ...w, payments: [...(w.payments ?? []), payment] } : w)))
        }
      />

      <ConfirmModal
        isOpen={Boolean(confirmDelete)}
        title={fr ? "Supprimer l'employé" : 'حذف الموظف'}
        message={
          fr
            ? `Supprimer ${confirmDelete?.fullName} ? Ses acomptes, absences et paiements seront perdus. Cette action est irréversible.`
            : `حذف ${confirmDelete?.fullName}؟ هذا الإجراء لا يمكن التراجع عنه.`
        }
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(null)}
        lang={lang}
      />
    </div>
  );
};
