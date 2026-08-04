-- ════════════════════════════════════════════════════════════════════════════
-- MIGRATION — ÉQUIPE (rôles + permissions + compte de connexion) & CAISSE
-- ────────────────────────────────────────────────────────────────────────────
-- Additive uniquement : aucune colonne existante n'est renommée ni supprimée,
-- aucune donnée n'est réécrite. Rejouable sans risque (IF NOT EXISTS partout).
--
-- À exécuter dans Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. RÔLES D'EMPLOYÉ ─────────────────────────────────────────────────────
-- Le rôle est un simple libellé créé par l'admin (« Chauffeur », « Agent
-- comptoir », « Responsable flotte »…). Il ne porte AUCUN droit : les droits
-- vivent dans workers.permissions, réglés employé par employé.
create table if not exists public.worker_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.worker_roles enable row level security;

drop policy if exists "worker_roles_all_authenticated" on public.worker_roles;
create policy "worker_roles_all_authenticated"
  on public.worker_roles for all
  to authenticated
  using (true) with check (true);

insert into public.worker_roles (name)
values ('Administrateur'), ('Agent comptoir'), ('Chauffeur')
on conflict (name) do nothing;

-- ─── 2. COLONNES SUPPLÉMENTAIRES SUR workers ────────────────────────────────
alter table public.workers add column if not exists id_card_number  text;
alter table public.workers add column if not exists role_name       text;
alter table public.workers add column if not exists start_date      date;
alter table public.workers add column if not exists payment_enabled boolean not null default true;
alter table public.workers add column if not exists account_enabled boolean not null default false;
-- Liaison vers auth.users : renseignée quand un compte de connexion est créé.
alter table public.workers add column if not exists auth_user_id    uuid;
-- Droits : tableau de clés "page:action" (cf. src/constants/permissions.ts).
alter table public.workers add column if not exists permissions     jsonb not null default '[]'::jsonb;

comment on column public.workers.permissions is
  'Tableau JSONB de clés "<page>:<action>". Vide = aucun accès. L''admin n''est jamais filtré.';

create index if not exists workers_email_idx on public.workers (lower(email));
create index if not exists workers_auth_user_idx on public.workers (auth_user_id);

-- ─── 3. NOTES OPTIONNELLES SUR LES MOUVEMENTS D'EMPLOYÉ ─────────────────────
-- La description devient facultative sur les paiements (demande explicite).
alter table public.worker_payments alter column note drop not null;
alter table public.worker_advances alter column note drop not null;
alter table public.worker_absences alter column note drop not null;

-- Période couverte par un paiement : permet de savoir quels mois / jours
-- restent dus sans deviner à partir de la seule date de règlement.
alter table public.worker_payments add column if not exists period_start date;
alter table public.worker_payments add column if not exists period_end   date;

-- ─── 4. CAISSE ──────────────────────────────────────────────────────────────
-- Mouvements d'espèces saisis à la main (dépôt / retrait). Les recettes des
-- locations et les dépenses vivent dans leurs tables d'origine : la Caisse les
-- agrège en lecture, elle ne les duplique pas.
create table if not exists public.caisse_transactions (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('deposit', 'withdraw')),
  amount      numeric(14, 2) not null check (amount >= 0),
  date        date not null default current_date,
  description text,
  created_by  text,
  created_at  timestamptz not null default now()
);

create index if not exists caisse_transactions_date_idx on public.caisse_transactions (date desc);

alter table public.caisse_transactions enable row level security;

drop policy if exists "caisse_all_authenticated" on public.caisse_transactions;
create policy "caisse_all_authenticated"
  on public.caisse_transactions for all
  to authenticated
  using (true) with check (true);

-- ─── 5. CONNEXION EMPLOYÉ ───────────────────────────────────────────────────
-- Les employés se connectent désormais via Supabase Auth (email + mot de passe),
-- exactement comme l'administrateur. `login_worker` reste en place pour les
-- comptes historiques créés avant cette migration : la page de connexion tente
-- Supabase Auth d'abord, puis retombe sur ce RPC.
--
-- Retourne aussi les permissions, pour que le front les ait dès la connexion.
create or replace function public.login_worker(
  p_email_or_username text,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker public.workers%rowtype;
begin
  select * into v_worker
  from public.workers
  where lower(email) = lower(p_email_or_username)
     or lower(username) = lower(p_email_or_username)
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  if v_worker.password is distinct from p_password then
    return jsonb_build_object('success', false, 'error', 'bad_password');
  end if;

  return jsonb_build_object(
    'success', true,
    'worker', jsonb_build_object(
      'id', v_worker.id,
      'full_name', v_worker.full_name,
      'email', v_worker.email,
      'username', v_worker.username,
      'type', v_worker.type,
      'role_name', v_worker.role_name,
      'profile_photo', v_worker.profile_photo,
      'permissions', coalesce(v_worker.permissions, '[]'::jsonb)
    )
  );
end;
$$;

grant execute on function public.login_worker(text, text) to anon, authenticated;

-- Un employé doit pouvoir relire SA propre ligne (pour charger ses permissions)
-- sans pouvoir lire celles des autres.
drop policy if exists "workers_read_self" on public.workers;
create policy "workers_read_self"
  on public.workers for select
  to authenticated
  using (
    lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or auth_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
