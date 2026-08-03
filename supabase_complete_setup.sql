-- ============================================================================
--  AUTO LOCATION SALAM — COMPLETE SUPABASE SETUP (single, authoritative file)
-- ============================================================================
--  Run this WHOLE file ONCE in the SQL Editor of the Supabase project:
--      https://gnddziizaazbipyxpygt.supabase.co
--
--  This is the ONE file that builds the entire backend for the application.
--  It merges the historical base setup + every migration into a single script:
--    • Every table read/written by every interface and every button action
--      (cars, clients, agencies, workers + payroll, reservations, payments,
--       inspections, expenses, maintenance, services, assurances, promo codes,
--       offers, website settings, document templates, conciergerie owners, …).
--    • The `admin_count` view read by the LOGIN page so the
--      "Create admin account" button hides once an admin exists.
--    • Auth alignment so LOGIN works directly for everyone:
--        - ADMIN accounts created from the LOGIN page  (auth.users -> profiles)
--        - WORKER accounts created from the TEAM (Équipe) interface
--          (workers -> auth.users + auth.identities, aligned by email+password)
--        - New auth users are auto-confirmed so they can sign in immediately.
--    • Every RPC the app calls via supabase.rpc(...).
--    • All storage buckets used by every image/PDF upload (public URL saved on
--      the row and displayed back from that URL).
--    • Row Level Security enabled with working policies.
--
--  Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE / idempotent policy drops
--  and ADD COLUMN IF NOT EXISTS, so it is safe to re-run.
--
--  After running, in the Supabase dashboard:
--    1. Authentication > Providers > Email: keep "Enable Email provider" ON.
--       (Email confirmation is handled automatically by a trigger below, so the
--        first admin can sign in right after creating the account.)
--    2. Open the app's LOGIN page and click "Créer un compte administrateur".
--       The admin appears under Authentication > Users and the button then
--       disappears automatically.
--    3. Add workers from the Team (Équipe) interface — each is mirrored to
--       Authentication > Users, aligned by email + password, and can log in.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid(), crypt(), gen_salt()
create extension if not exists "uuid-ossp";


-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

-- 1.1 PROFILES ----------------------------------------------------------------
-- One row per admin account. Linked 1:1 to auth.users(id). Populated
-- automatically when an admin account is created on the LOGIN page.
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  username      text,
  email         text,
  role          text not null default 'admin',
  profile_photo text,                             -- public URL ("website"/"worker" buckets)
  created_at    timestamptz not null default now()
);

-- 1.2 AGENCIES ----------------------------------------------------------------
create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  city        text,
  created_at  timestamptz not null default now()
);

-- 1.3 CARS --------------------------------------------------------------------
create table if not exists public.cars (
  id                  uuid primary key default gen_random_uuid(),
  brand               text not null,
  model               text not null,
  plate_number        text,
  year                int,
  color               text default 'Premium',
  vin                 text,
  energy              text default 'Essence',
  transmission        text default 'Automatique',
  seats               int default 5,
  doors               int default 4,
  price_per_day       numeric not null default 0,
  price_week          numeric,
  price_month         numeric,
  deposit             numeric,
  price_day_eur       numeric,                    -- euro tariffs (NULL = auto-convert from DZD)
  price_week_eur      numeric,
  price_month_eur     numeric,
  deposit_eur         numeric,
  image_url           text,                       -- public URL from the "cars" bucket
  mileage             int default 0,
  fuel_level          text,
  status              text default 'disponible',  -- only 'maintenance' is set manually
  is_hidden_from_site boolean not null default false,
  ownership_type      text not null default 'personal',  -- 'personal' | 'consignment'
  description         text,                        -- public text shown on the website
  created_at          timestamptz not null default now()
);

-- 1.4 CLIENTS -----------------------------------------------------------------
create table if not exists public.clients (
  id                        uuid primary key default gen_random_uuid(),
  first_name                text not null,
  last_name                 text not null,
  phone                     text,
  email                     text,
  date_of_birth             date,
  place_of_birth            text,
  id_card_number            text,
  license_number            text,
  license_expiration_date   date,
  license_delivery_date     date,
  license_delivery_place    text,
  document_type             text,
  document_number           text,
  document_delivery_date    date,
  document_expiration_date  date,
  document_delivery_address text,
  wilaya                    text,
  complete_address          text,
  profile_photo             text,                 -- public URL from the "clients" bucket
  scanned_documents         jsonb default '[]'::jsonb,  -- array of public URLs ("clients" bucket)
  agency_id                 uuid references public.agencies(id) on delete set null,
  created_at                timestamptz not null default now()
);

-- ============================================================================
-- 2. TEAM (ÉQUIPE) — WORKERS AND THEIR RECORDS
-- ============================================================================

-- 2.1 WORKERS -----------------------------------------------------------------
-- Created from the Team (Équipe) interface. Each worker also gets a matching
-- Supabase Authentication account (trigger in section 8) aligned by
-- email + password so they can log in directly from the LOGIN page.
create table if not exists public.workers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  date_of_birth date,
  phone         text,
  email         text unique,
  address       text,
  profile_photo text,                             -- public URL from the "worker" bucket
  type          text not null default 'worker',   -- 'admin' | 'worker' | 'driver'
  payment_type  text,                             -- 'daily' | 'monthly'
  base_salary   numeric default 0,
  username      text,
  password      text,                             -- used by login_worker() / update_worker_account()
  created_at    timestamptz not null default now()
);

-- 2.2 WORKER ADVANCES ---------------------------------------------------------
create table if not exists public.worker_advances (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers(id) on delete cascade,
  amount     numeric not null default 0,
  date       date not null default current_date,
  note       text,
  created_at timestamptz not null default now()
);

-- 2.3 WORKER ABSENCES ---------------------------------------------------------
create table if not exists public.worker_absences (
  id         uuid primary key default gen_random_uuid(),
  worker_id  uuid not null references public.workers(id) on delete cascade,
  cost       numeric not null default 0,
  date       date not null default current_date,
  note       text,
  created_at timestamptz not null default now()
);

-- 2.4 WORKER PAYMENTS ---------------------------------------------------------
create table if not exists public.worker_payments (
  id          uuid primary key default gen_random_uuid(),
  worker_id   uuid not null references public.workers(id) on delete cascade,
  amount      numeric not null default 0,
  date        date not null default current_date,
  base_salary numeric default 0,
  advances    numeric default 0,
  absences    numeric default 0,
  net_salary  numeric default 0,
  note        text,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- 3. EXPENSES, MAINTENANCE, SERVICES, ASSURANCES
-- ============================================================================

-- 3.1 STORE EXPENSES ----------------------------------------------------------
create table if not exists public.store_expenses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  cost       numeric not null default 0,
  date       date not null default current_date,
  note       text,
  icon       text,
  created_at timestamptz not null default now()
);

-- 3.2 VEHICLE EXPENSES --------------------------------------------------------
create table if not exists public.vehicle_expenses (
  id                  uuid primary key default gen_random_uuid(),
  car_id              uuid references public.cars(id) on delete cascade,
  type                text,                       -- vidange | assurance | controle | chaine | autre
  cost                numeric not null default 0,
  date                date not null default current_date,
  note                text,
  current_mileage     int,
  next_vidange_km     int,
  expiration_date     date,
  expense_name        text,
  oil_filter_changed  boolean not null default false,   -- vidange : filtre à huile changé
  air_filter_changed  boolean not null default false,   -- vidange : filtre à air changé
  fuel_filter_changed boolean not null default false,   -- vidange : filtre à carburant changé
  ac_filter_changed   boolean not null default false,   -- vidange : filtre de climatisation changé
  created_at          timestamptz not null default now()
);

-- 3.3 MAINTENANCE ALERTS ------------------------------------------------------
create table if not exists public.maintenance_alerts (
  id                   uuid primary key default gen_random_uuid(),
  car_id               uuid references public.cars(id) on delete cascade,
  car_info             text,
  type                 text,                  -- vidange | assurance | controle | chaine | other
  title                text,
  message              text,
  severity             text default 'medium', -- low | medium | high | critical
  due_date             date,
  is_expired           boolean default false,
  days_until_due       int,
  current_mileage      int,
  next_service_mileage int,
  created_at           timestamptz not null default now()
);

-- 3.4 SERVICES (additional paid services offered on reservations) -------------
create table if not exists public.services (
  id           uuid primary key default gen_random_uuid(),
  category     text,
  service_name text not null,
  description  text,
  price        numeric not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

-- 3.5 PROTECTION ASSURANCES (insurance packages) -----------------------------
create table if not exists public.protection_assurances (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price_per_day numeric not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.protection_assurance_items (
  id            uuid primary key default gen_random_uuid(),
  item_name     text not null,
  display_order int default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.protection_assurance_item_links (
  id           uuid primary key default gen_random_uuid(),
  assurance_id uuid not null references public.protection_assurances(id) on delete cascade,
  item_id      uuid not null references public.protection_assurance_items(id) on delete cascade,
  status       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ============================================================================
-- 4. RESERVATIONS, PAYMENTS, INSPECTIONS
-- ============================================================================

-- 4.1 RESERVATIONS ------------------------------------------------------------
-- Named FK constraints below are REQUIRED so PostgREST embeds like
-- agencies!reservations_departure_agency_fkey work from the app.
create table if not exists public.reservations (
  id                          uuid primary key default gen_random_uuid(),
  client_id                   uuid references public.clients(id) on delete set null,
  car_id                      uuid references public.cars(id) on delete set null,

  departure_date              date,
  departure_time              text,
  departure_agency_id         uuid,
  return_date                 date,
  return_time                 text,
  return_agency_id            uuid,

  price_per_day               numeric default 0,
  price_week                  numeric,
  price_month                 numeric,
  total_days                  int default 0,
  total_price                 numeric default 0,
  deposit                     numeric default 0,
  additional_fees             numeric default 0,
  discount_amount             numeric default 0,
  discount_type               text,
  advance_payment             numeric default 0,
  remaining_payment           numeric default 0,

  -- Devise de règlement (le dinar reste la référence comptable)
  payment_currency            text not null default 'DZD',   -- 'DZD' | 'EUR'
  total_price_eur             numeric,
  advance_payment_eur         numeric,
  remaining_payment_eur       numeric,

  caution_amount_dzd          numeric,
  caution_currency            text default 'DZD',
  euro_rate                   numeric default 145,

  assurance_enabled           boolean default false,
  assurance_percentage        numeric,
  protection_assurance_id     uuid,
  protection_assurance_name   text,
  protection_assurance_price  numeric default 0,

  -- Livraison (conciergerie) : payeur fixé par trigger selon la durée
  delivery_fee                numeric not null default 0,
  delivery_fee_payer          text,                          -- 'client' | 'owner' | null
  -- Commission conciergerie figée (snapshot) au passage en 'completed'
  commission_type             text,
  commission_value            numeric,
  commission_amount           numeric,

  tva_applied                 boolean default false,
  excess_mileage              numeric,
  missing_fuel                numeric,
  notes                       text,
  conditions                  text,

  -- 'website' = order placed from the public site, 'agency' = created by admin
  source                      text default 'agency',
  status                      text not null default 'pending',

  created_by                  text,
  created_by_name             text,
  created_at                  timestamptz not null default now(),
  activated_at                timestamptz,
  completed_at                timestamptz,

  constraint reservations_departure_agency_fkey
    foreign key (departure_agency_id) references public.agencies(id) on delete set null,
  constraint reservations_return_agency_fkey
    foreign key (return_agency_id) references public.agencies(id) on delete set null,
  constraint reservations_protection_assurance_fkey
    foreign key (protection_assurance_id) references public.protection_assurances(id) on delete set null
);

create index if not exists idx_reservations_car    on public.reservations(car_id);
create index if not exists idx_reservations_client on public.reservations(client_id);
create index if not exists idx_reservations_status on public.reservations(status);

-- 4.2 RESERVATION SERVICES (snapshot of selected extra services) --------------
-- driver_id / driver_caution : un chauffeur (worker de type 'driver') peut être
-- attaché à un service avec une caution encaissée.
create table if not exists public.reservation_services (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  category       text,
  service_name   text,
  description    text,
  price          numeric not null default 0,
  driver_id      uuid references public.workers(id) on delete set null,
  driver_caution numeric not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists idx_reservation_services_driver on public.reservation_services(driver_id);

-- 4.3 PAYMENTS ----------------------------------------------------------------
create table if not exists public.payments (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  amount         numeric not null default 0,
  date           date not null default current_date,
  method         text default 'cash',   -- cash | card | transfer | check
  status         text default 'paid',
  note           text,
  created_at     timestamptz not null default now()
);

-- 4.4 INSPECTION CHECKLIST ITEMS (master list) --------------------------------
create table if not exists public.inspection_checklist_items (
  id            uuid primary key default gen_random_uuid(),
  category      text,                  -- security | equipment | comfort | cleanliness
  item_name     text not null,
  display_order int default 0,
  created_at    timestamptz not null default now()
);

-- 4.5 VEHICLE INSPECTIONS (departure / return) --------------------------------
create table if not exists public.vehicle_inspections (
  id                    uuid primary key default gen_random_uuid(),
  reservation_id        uuid not null references public.reservations(id) on delete cascade,
  type                  text not null,        -- 'departure' | 'return'
  mileage               int,
  fuel_level            text,
  agency_id             uuid references public.agencies(id) on delete set null,
  exterior_front_photo  text,                 -- public URL ("inspection" bucket)
  exterior_rear_photo   text,                 -- public URL ("inspection" bucket)
  interior_photo        text,                 -- public URL ("inspection" bucket)
  other_photos          jsonb default '[]'::jsonb,   -- array of public URLs
  client_signature      text,
  notes                 text,
  date                  date,
  time                  text,
  created_at            timestamptz not null default now(),
  constraint vehicle_inspections_res_type_unique unique (reservation_id, type)
);

-- 4.6 INSPECTION RESPONSES (checklist answers per inspection) -----------------
create table if not exists public.inspection_responses (
  id                uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references public.vehicle_inspections(id) on delete cascade,
  checklist_item_id uuid references public.inspection_checklist_items(id) on delete cascade,
  status            boolean not null default false,
  note              text,
  created_at        timestamptz not null default now(),
  constraint inspection_responses_unique unique (inspection_id, checklist_item_id)
);

-- ============================================================================
-- 5. WEBSITE / OFFERS / PROMO CODES / DOCUMENT TEMPLATES
-- ============================================================================

-- 5.1 SPECIAL OFFERS (promotions attached to a car) ---------------------------
create table if not exists public.special_offers (
  id             uuid primary key default gen_random_uuid(),
  car_id         uuid references public.cars(id) on delete cascade,
  old_price      numeric,
  new_price      numeric,
  note           text,
  is_active      boolean not null default true,
  label          text,
  discount_type  text,                 -- 'percentage' | 'fixed'
  discount_value numeric,
  start_date     date,
  end_date       date,
  created_at     timestamptz not null default now()
);

-- 5.2 OFFERS (deprecated, kept for backward compatibility) --------------------
create table if not exists public.offers (
  id         uuid primary key default gen_random_uuid(),
  car_id     uuid references public.cars(id) on delete cascade,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5.3 PROMO CODES -------------------------------------------------------------
create table if not exists public.promo_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null,
  discount_percentage numeric not null default 0,
  is_active           boolean not null default true,
  is_used             boolean not null default false,
  used_at             timestamptz,
  reservation_id      uuid references public.reservations(id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint promo_codes_code_unique unique (code)
);

-- 5.4 WEBSITE CONTACTS --------------------------------------------------------
create table if not exists public.website_contacts (
  id         uuid primary key default gen_random_uuid(),
  facebook   text,
  instagram  text,
  tiktok     text,
  whatsapp   text,
  phone      text,
  address    text,
  email      text,
  updated_at timestamptz not null default now()
);

-- 5.5 WEBSITE SETTINGS --------------------------------------------------------
-- Source unique du nom + logo de l'agence (barre latérale, contrats, factures…).
-- navbar_logo : logo dédié à la barre de navigation du site public.
-- singleton : verrou "au plus une ligne" (index unique plus bas).
create table if not exists public.website_settings (
  id                 uuid primary key default gen_random_uuid(),
  name               text,
  description        text,
  logo               text,                -- public URL ("website" bucket)
  navbar_logo        text default '',     -- public URL ("website" bucket) — repli sur logo si vide
  phone_number_2     text,
  bank_number        text,
  address            text,
  phone              text,
  landing_background text,                -- public URL ("website" bucket)
  singleton          boolean not null default true,
  updated_at         timestamptz not null default now()
);

-- 5.6 AGENCY SETTINGS (miroir lecture du branding + modèles de documents) -----
create table if not exists public.agency_settings (
  id                 uuid primary key default gen_random_uuid(),
  agency_name        text,
  slogan             text,
  address            text,
  phone              text,
  logo               text,
  document_templates jsonb default '{}'::jsonb,
  singleton          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 5.7 DOCUMENT TEMPLATES (positioned fields for contracts/invoices/…) ---------
create table if not exists public.document_templates (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid,
  template_type text not null,        -- contrat | devis | facture | recu | engagement
  name          text,
  template      jsonb not null default '{}'::jsonb,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- 6. CONCIERGERIE — PROPRIÉTAIRES DE VÉHICULES CONFIÉS (données privées)
--    Jamais exposée au rôle anon. Une ligne au maximum par véhicule.
-- ============================================================================
create table if not exists public.car_owners (
  id               uuid primary key default gen_random_uuid(),
  car_id           uuid not null unique references public.cars(id) on delete cascade,
  owner_name       text not null,
  owner_phone      text,
  internal_ref     text unique,                    -- CS-001, CS-002… (trigger)
  consignment_date date default current_date,
  commission_type  text not null default 'percentage'
                     check (commission_type in ('amount', 'percentage')),
  commission_value numeric not null default 0 check (commission_value >= 0),
  contract_url     text,                           -- public/private URL ("contracts" bucket)
  private_notes    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_car_owners_car on public.car_owners(car_id);

-- ============================================================================
-- 7. ADMIN SESSIONS (audit trail for the database-backed session service)
-- ============================================================================
create table if not exists public.admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  expires_at    bigint not null,
  user_agent    text,
  ip_address    text,
  is_valid      boolean not null default true,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);
create index if not exists idx_admin_sessions_token on public.admin_sessions(access_token);


-- ============================================================================
-- 7b. COLUMN TOP-UPS (idempotent) — converge an already-existing schema to the
--     final column set. No-ops on a fresh database created by the section above.
-- ============================================================================
alter table public.profiles           add column if not exists profile_photo text;
alter table public.cars
  add column if not exists ownership_type text not null default 'personal',
  add column if not exists description    text,
  add column if not exists price_day_eur  numeric,
  add column if not exists price_week_eur numeric,
  add column if not exists price_month_eur numeric,
  add column if not exists deposit_eur    numeric;
alter table public.vehicle_expenses
  add column if not exists oil_filter_changed  boolean not null default false,
  add column if not exists air_filter_changed  boolean not null default false,
  add column if not exists fuel_filter_changed boolean not null default false,
  add column if not exists ac_filter_changed   boolean not null default false;
alter table public.reservations
  add column if not exists payment_currency      text not null default 'DZD',
  add column if not exists total_price_eur       numeric,
  add column if not exists advance_payment_eur   numeric,
  add column if not exists remaining_payment_eur numeric,
  add column if not exists caution_amount_dzd    numeric,
  add column if not exists euro_rate             numeric default 145,
  add column if not exists delivery_fee          numeric not null default 0,
  add column if not exists delivery_fee_payer    text,
  add column if not exists commission_type       text,
  add column if not exists commission_value      numeric,
  add column if not exists commission_amount     numeric;
alter table public.reservation_services
  add column if not exists driver_id      uuid references public.workers(id) on delete set null,
  add column if not exists driver_caution numeric not null default 0;
alter table public.website_settings
  add column if not exists navbar_logo text default '',
  add column if not exists singleton   boolean not null default true;
alter table public.agency_settings
  add column if not exists singleton boolean not null default true;

-- CHECK constraints (added only if absent, so re-runs never fail)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cars_ownership_type_check') then
    alter table public.cars add constraint cars_ownership_type_check
      check (ownership_type in ('personal', 'consignment'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cars_eur_prices_non_negative') then
    alter table public.cars add constraint cars_eur_prices_non_negative check (
      coalesce(price_day_eur,0) >= 0 and coalesce(price_week_eur,0) >= 0 and
      coalesce(price_month_eur,0) >= 0 and coalesce(deposit_eur,0) >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_payment_currency_check') then
    alter table public.reservations add constraint reservations_payment_currency_check
      check (payment_currency in ('DZD', 'EUR'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_delivery_fee_payer_check') then
    alter table public.reservations add constraint reservations_delivery_fee_payer_check
      check (delivery_fee_payer is null or delivery_fee_payer in ('client', 'owner'));
  end if;
end $$;

create index if not exists idx_cars_ownership_type on public.cars(ownership_type);


-- ============================================================================
-- 8. VIEWS
-- ============================================================================

-- 8.1 admin_count — read by the LOGIN page to know whether an admin already
--     exists (so the "Create admin account" button hides after first admin).
create or replace view public.admin_count as
  select count(*)::int as count
  from public.profiles
  where role = 'admin';

-- 8.2 consignment_earnings — gains conciergerie (admin only).
--     security_invoker : la vue s'exécute avec les droits de l'appelant, donc
--     anon ne peut rien en lire (aucune policy anon sur car_owners).
drop view if exists public.consignment_earnings;
create view public.consignment_earnings
with (security_invoker = true)
as
select
  c.id                                as car_id,
  c.brand,
  c.model,
  c.plate_number,
  o.internal_ref,
  o.owner_name,
  o.owner_phone,
  o.commission_type,
  o.commission_value,
  count(r.id) filter (where r.status = 'completed')            as completed_rentals,
  coalesce(sum(r.total_price)      filter (where r.status = 'completed'), 0) as gross_revenue,
  coalesce(sum(r.commission_amount) filter (where r.status = 'completed'), 0) as agency_commission,
  coalesce(sum(r.delivery_fee)
           filter (where r.status = 'completed' and r.delivery_fee_payer = 'owner'), 0)
                                                                as owner_delivery_fees,
  coalesce(sum(r.total_price)       filter (where r.status = 'completed'), 0)
    - coalesce(sum(r.commission_amount) filter (where r.status = 'completed'), 0)
    - coalesce(sum(r.delivery_fee)
               filter (where r.status = 'completed' and r.delivery_fee_payer = 'owner'), 0)
                                                                as owner_payout
from public.cars c
join public.car_owners o on o.car_id = c.id
left join public.reservations r on r.car_id = c.id
where c.ownership_type = 'consignment'
group by c.id, c.brand, c.model, c.plate_number,
         o.internal_ref, o.owner_name, o.owner_phone,
         o.commission_type, o.commission_value;

-- 8.3 inspections — compatibility view over vehicle_inspections. The planner
--     cleans up a return inspection via .from('inspections').delete(); this
--     view keeps that call working (auto-updatable, runs as caller/RLS).
drop view if exists public.inspections;
create view public.inspections
with (security_invoker = true)
as select * from public.vehicle_inspections;


-- ============================================================================
-- 9. AUTH ALIGNMENT — LOGIN WORKS DIRECTLY FOR ADMINS AND WORKERS
-- ============================================================================

-- 9.1 Auto-confirm new auth users (BEFORE INSERT on auth.users)
-- So the first admin created from the LOGIN page — and every worker mirrored to
-- auth.users — can sign in immediately, regardless of the "Confirm email"
-- dashboard setting.
create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer set search_path = public, auth
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirm on auth.users;
create trigger on_auth_user_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_new_user();

-- 9.2 auth.users -> profiles (AFTER INSERT)
-- When an admin account is created from the LOGIN page (supabase.auth.signUp),
-- ensure a matching profiles row exists (the app also inserts it explicitly;
-- this trigger is a safety net so the two stay aligned).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, username, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'admin')
  )
  on conflict (id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        username  = coalesce(excluded.username,  public.profiles.username),
        email     = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 9.3 workers -> auth.users (AFTER INSERT)
-- When a worker is created from the TEAM (Équipe) interface, create a matching
-- Supabase Authentication account so their login information (email + password)
-- appears in the Authentication interface, aligned to that worker, and they can
-- log in directly. If auth creation fails on your GoTrue version, the worker is
-- still created and can log in via the login_worker() RPC — the insert is never
-- aborted.
create or replace function public.handle_new_worker()
returns trigger
language plpgsql
security definer set search_path = public, auth, extensions
as $$
declare
  v_uid uuid;
begin
  if new.email is null or btrim(new.email) = '' then
    return new;
  end if;

  -- Don't duplicate an already-existing auth account for this email.
  if exists (select 1 from auth.users where email = new.email) then
    return new;
  end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', new.email,
    crypt(coalesce(nullif(new.password, ''), 'ChangeMe123!'), gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'full_name', new.full_name,
      'username',  new.username,
      'role',      new.type
    ),
    '', '', '', ''
  );

  -- Identity record required by GoTrue for email/password sign-in.
  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, new.email,
    jsonb_build_object('sub', v_uid::text, 'email', new.email),
    'email', now(), now(), now()
  );

  return new;
exception when others then
  -- Never block worker creation because of an auth-sync problem.
  raise warning 'handle_new_worker: could not create auth user for %: %', new.email, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_worker_created on public.workers;
create trigger on_worker_created
  after insert on public.workers
  for each row execute function public.handle_new_worker();


-- ============================================================================
-- 10. CONCIERGERIE / LIVRAISON / BRANDING — TRIGGERS
-- ============================================================================

-- 10.1 Référence interne CS-001, CS-002… générée automatiquement
create or replace function public.set_car_owner_internal_ref()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_next int;
begin
  if new.internal_ref is null or btrim(new.internal_ref) = '' then
    select coalesce(max((regexp_replace(internal_ref, '\D', '', 'g'))::int), 0) + 1
      into v_next
      from public.car_owners
     where internal_ref ~ '^CS-\d+$';
    new.internal_ref := 'CS-' || lpad(v_next::text, 3, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_car_owners_internal_ref on public.car_owners;
create trigger trg_car_owners_internal_ref
  before insert on public.car_owners
  for each row execute function public.set_car_owner_internal_ref();

-- 10.2 car_owners.updated_at auto
create or replace function public.touch_car_owner_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_car_owners_touch on public.car_owners;
create trigger trg_car_owners_touch
  before update on public.car_owners
  for each row execute function public.touch_car_owner_updated_at();

-- 10.3 Payeur des frais de livraison : >= 10 jours -> propriétaire, sinon client
create or replace function public.set_delivery_fee_payer()
returns trigger language plpgsql as $$
begin
  if coalesce(new.delivery_fee, 0) > 0 then
    if coalesce(new.total_days, 0) >= 10 then
      new.delivery_fee_payer := 'owner';
    else
      new.delivery_fee_payer := 'client';
    end if;
  else
    new.delivery_fee_payer := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservations_delivery_fee_payer on public.reservations;
create trigger trg_reservations_delivery_fee_payer
  before insert or update of delivery_fee, total_days on public.reservations
  for each row execute function public.set_delivery_fee_payer();

-- 10.4 Snapshot de la commission conciergerie au passage en 'completed'
create or replace function public.snapshot_reservation_commission()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_owner public.car_owners%rowtype;
begin
  if new.status = 'completed'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed')
     and new.commission_amount is null
  then
    select o.* into v_owner
      from public.car_owners o
      join public.cars c on c.id = o.car_id
     where o.car_id = new.car_id
       and c.ownership_type = 'consignment'
     limit 1;

    if found then
      new.commission_type  := v_owner.commission_type;
      new.commission_value := v_owner.commission_value;
      new.commission_amount := case
        when v_owner.commission_type = 'percentage'
          then round(coalesce(new.total_price, 0) * v_owner.commission_value / 100.0, 2)
        else round(v_owner.commission_value, 2)
      end;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reservations_commission_snapshot on public.reservations;
create trigger trg_reservations_commission_snapshot
  before insert or update of status on public.reservations
  for each row execute function public.snapshot_reservation_commission();

-- 10.5 agency_settings = miroir lecture du branding de website_settings
create or replace function public.sync_agency_settings_branding()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- `agency_settings` ne contient qu'une ligne (colonne `singleton` = true,
  -- index unique). Le WHERE est OBLIGATOIRE : certains projets Supabase
  -- rejettent tout UPDATE sans clause WHERE (« 21000 UPDATE requires a WHERE
  -- clause »), ce qui faisait échouer l'enregistrement des infos de l'agence.
  update public.agency_settings
     set agency_name = new.name,
         slogan      = new.description,
         address     = new.address,
         phone       = new.phone,
         logo        = new.logo,
         updated_at  = now()
   where singleton;

  if not found then
    insert into public.agency_settings (
      id, agency_name, slogan, address, phone, logo, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000001',
      new.name, new.description, new.address, new.phone, new.logo, now()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_website_settings_sync_agency on public.website_settings;
create trigger trg_website_settings_sync_agency
  after insert or update on public.website_settings
  for each row execute function public.sync_agency_settings_branding();

-- 10.6 Verrou singleton "au plus une ligne" pour website_settings / agency_settings
create unique index if not exists website_settings_one_row on public.website_settings (singleton);
create unique index if not exists agency_settings_one_row  on public.agency_settings  (singleton);


-- ============================================================================
-- 11. APPLICATION RPC FUNCTIONS (called by the app via supabase.rpc(...))
-- ============================================================================

-- 11.1 login_worker(email_or_username, password)
-- Worker sign-in fallback from the LOGIN page (after Supabase Auth). Returns a
-- JSON object { success, worker } or { success:false, error }.
create or replace function public.login_worker(
  p_email_or_username text,
  p_password          text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  w public.workers%rowtype;
begin
  select * into w
  from public.workers
  where (lower(email) = lower(p_email_or_username)
         or lower(username) = lower(p_email_or_username))
    and password = p_password
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_credentials');
  end if;

  return jsonb_build_object(
    'success', true,
    'worker', jsonb_build_object(
      'id', w.id,
      'full_name', w.full_name,
      'email', w.email,
      'username', w.username,
      'type', w.type,
      'profile_photo', w.profile_photo
    )
  );
end;
$$;

-- 11.2 get_worker_account(email, current_password) — lecture de sa fiche par l'employé
create or replace function public.get_worker_account(
  p_email            text,
  p_current_password text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_worker public.workers%rowtype;
begin
  select * into v_worker
    from public.workers
   where lower(email) = lower(btrim(p_email))
   limit 1;

  if not found or v_worker.password is distinct from p_current_password then
    return jsonb_build_object('success', false);
  end if;

  return jsonb_build_object(
    'success', true,
    'id', v_worker.id,
    'full_name', v_worker.full_name,
    'username', v_worker.username,
    'email', v_worker.email,
    'profile_photo', v_worker.profile_photo
  );
end;
$$;

-- 11.3 update_worker_account(...) — l'employé met à jour son propre compte
-- Preuve d'identité : e-mail + mot de passe actuel (même contrat que login_worker).
-- Chaque paramètre NULL/vide conserve la valeur existante.
create or replace function public.update_worker_account(
  p_email            text,
  p_current_password text,
  p_full_name        text default null,
  p_username         text default null,
  p_new_email        text default null,
  p_new_password     text default null,
  p_profile_photo    text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_worker public.workers%rowtype;
  v_email  text := lower(btrim(coalesce(p_new_email, '')));
begin
  select * into v_worker
    from public.workers
   where lower(email) = lower(btrim(p_email))
   limit 1;

  if not found then
    raise exception 'WORKER_NOT_FOUND';
  end if;

  if p_current_password is null
     or v_worker.password is distinct from p_current_password then
    raise exception 'WRONG_PASSWORD';
  end if;

  if v_email <> '' and v_email <> lower(v_worker.email)
     and exists (select 1 from public.workers where lower(email) = v_email) then
    raise exception 'EMAIL_TAKEN';
  end if;

  update public.workers set
    full_name     = coalesce(nullif(btrim(p_full_name), ''),     full_name),
    username      = coalesce(nullif(btrim(p_username), ''),      username),
    email         = coalesce(nullif(v_email, ''),                email),
    password      = coalesce(nullif(p_new_password, ''),         password),
    profile_photo = coalesce(nullif(btrim(p_profile_photo), ''), profile_photo)
  where id = v_worker.id;

  return jsonb_build_object('success', true, 'id', v_worker.id);
end;
$$;

-- 11.4 get_reserved_periods(car_id) — plages réservées d'une voiture (calendrier public)
create or replace function public.get_reserved_periods(p_car_id uuid)
returns table (departure_date date, return_date date)
language sql
security definer set search_path = public
as $$
  select departure_date, return_date
  from public.reservations
  where car_id = p_car_id
    and status in ('website_reservation', 'pending', 'accepted', 'confirmed', 'active');
$$;

-- 11.5 get_unavailable_car_ids(from, to) — voitures indisponibles sur une période
create or replace function public.get_unavailable_car_ids(p_from date, p_to date)
returns table (id uuid)
language sql
security definer set search_path = public
as $$
  select distinct car_id
  from public.reservations
  where car_id is not null
    and status in ('website_reservation', 'pending', 'accepted', 'confirmed', 'active')
    and departure_date <= p_to
    and return_date   >= p_from;
$$;

-- 11.6 verify_promo_code(code) — validation serveur d'un code promo (anon-safe)
create or replace function public.verify_promo_code(p_code text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  pc public.promo_codes%rowtype;
begin
  select * into pc
  from public.promo_codes
  where upper(code) = upper(btrim(p_code))
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'reason', 'not_found');
  end if;
  if not pc.is_active then
    return jsonb_build_object('valid', false, 'reason', 'inactive');
  end if;
  if pc.is_used then
    return jsonb_build_object('valid', false, 'reason', 'already_used');
  end if;

  return jsonb_build_object('valid', true, 'discount_percentage', pc.discount_percentage);
end;
$$;

-- 11.7 create_website_reservation(client, reservation, services, promo_code)
-- Chemin d'écriture unique pour le SITE PUBLIC (le rôle anon n'a pas d'INSERT
-- direct sur clients/reservations). Crée client + réservation + services,
-- consomme le code promo, garde contre le double-booking et mémorise la devise.
create or replace function public.create_website_reservation(
  p_client      jsonb,
  p_reservation jsonb,
  p_services    jsonb default '[]'::jsonb,
  p_promo_code  text  default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_client_id uuid;
  v_res_id    uuid;
  v_car_id    uuid := (p_reservation->>'car_id')::uuid;
  v_from      date  := (p_reservation->>'departure_date')::date;
  v_to        date  := (p_reservation->>'return_date')::date;
  v_svc       jsonb;
  v_pc        public.promo_codes%rowtype;
  v_currency  text := case
                        when upper(coalesce(p_reservation->>'payment_currency','DZD')) = 'EUR'
                        then 'EUR' else 'DZD'
                      end;
  v_eur_rate  numeric := nullif(p_reservation->>'euro_rate','')::numeric;
begin
  -- Availability guard (overlapping active-ish reservations, incl. website orders
  -- still waiting for agency acceptance 'website_reservation')
  if exists (
    select 1 from public.reservations
    where car_id = v_car_id
      and status in ('website_reservation','pending','accepted','confirmed','active')
      and departure_date <= v_to
      and return_date   >= v_from
  ) then
    raise exception 'CAR_UNAVAILABLE';
  end if;

  -- Optional promo code
  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    select * into v_pc from public.promo_codes
      where upper(code) = upper(btrim(p_promo_code)) limit 1;
    if not found or not v_pc.is_active or v_pc.is_used then
      raise exception 'PROMO_CODE_INVALID';
    end if;
  end if;

  -- Client
  insert into public.clients (
    first_name, last_name, phone, email, license_number,
    wilaya, complete_address, profile_photo, scanned_documents
  ) values (
    p_client->>'first_name', p_client->>'last_name', p_client->>'phone',
    p_client->>'email', p_client->>'license_number',
    p_client->>'wilaya', p_client->>'complete_address',
    p_client->>'profile_photo',
    coalesce(p_client->'scanned_documents', '[]'::jsonb)
  )
  returning id into v_client_id;

  -- Reservation (always from the public website -> status 'website_reservation')
  insert into public.reservations (
    client_id, car_id, departure_date, departure_time, departure_agency_id,
    return_date, return_time, return_agency_id, total_days, total_price,
    additional_fees, protection_assurance_id, protection_assurance_name,
    protection_assurance_price, status, source,
    payment_currency, total_price_eur, euro_rate
  ) values (
    v_client_id, v_car_id,
    v_from, p_reservation->>'departure_time', (p_reservation->>'departure_agency_id')::uuid,
    v_to, p_reservation->>'return_time', (p_reservation->>'return_agency_id')::uuid,
    coalesce((p_reservation->>'total_days')::int, 0),
    coalesce((p_reservation->>'total_price')::numeric, 0),
    coalesce((p_reservation->>'additional_fees')::numeric, 0),
    nullif(p_reservation->>'protection_assurance_id','')::uuid,
    p_reservation->>'protection_assurance_name',
    coalesce((p_reservation->>'protection_assurance_price')::numeric, 0),
    'website_reservation', 'website',
    v_currency,
    case when v_currency = 'EUR'
         then nullif(p_reservation->>'total_price_eur','')::numeric
         else null end,
    coalesce(v_eur_rate, 145)
  )
  returning id into v_res_id;

  -- Extra services
  if p_services is not null then
    for v_svc in select * from jsonb_array_elements(p_services)
    loop
      insert into public.reservation_services (reservation_id, category, service_name, description, price)
      values (
        v_res_id, v_svc->>'category', v_svc->>'service_name',
        v_svc->>'description', coalesce((v_svc->>'price')::numeric, 0)
      );
    end loop;
  end if;

  -- Consume promo code
  if v_pc.id is not null then
    update public.promo_codes
       set is_used = true, used_at = now(), reservation_id = v_res_id
     where id = v_pc.id;
  end if;

  return jsonb_build_object('reservation_id', v_res_id, 'client_id', v_client_id);
end;
$$;

-- 11.8 Database-backed session helpers (audit trail; localStorage is primary)
create or replace function public.create_admin_session(
  p_access_token  text,
  p_refresh_token text,
  p_expires_at    bigint,
  p_user_agent    text,
  p_ip_address    text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.admin_sessions (user_id, access_token, refresh_token, expires_at, user_agent, ip_address)
  values (auth.uid(), p_access_token, p_refresh_token, p_expires_at, p_user_agent, p_ip_address)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.validate_session(p_token text)
returns table (is_valid boolean, is_expired boolean, seconds_until_expiry bigint)
language sql
security definer set search_path = public
as $$
  select
    s.is_valid,
    (s.expires_at <= extract(epoch from now())::bigint) as is_expired,
    (s.expires_at - extract(epoch from now())::bigint)  as seconds_until_expiry
  from public.admin_sessions s
  where s.access_token = p_token
  order by s.created_at desc
  limit 1;
$$;

create or replace function public.invalidate_session(p_token text)
returns void
language sql
security definer set search_path = public
as $$
  update public.admin_sessions set is_valid = false where access_token = p_token;
$$;


-- ============================================================================
-- 12. STORAGE BUCKETS (one per upload feature in the app)
--     Every uploaded file is stored in its bucket; its public URL is saved on
--     the matching table row and the app displays it back from that URL.
-- ============================================================================
insert into storage.buckets (id, name, public)
values
  ('cars',       'cars',       true),    -- car photos            -> cars.image_url
  ('clients',    'clients',    true),    -- client photos & docs  -> clients.profile_photo / scanned_documents
  ('worker',     'worker',     true),    -- worker profile photos -> workers.profile_photo (uploadWorkerImage)
  ('workers',    'workers',    true),    -- worker profile photos -> workers.profile_photo (ConfigPage)
  ('inspection', 'inspection', true),    -- inspection photos     -> vehicle_inspections.*_photo
  ('website',    'website',    true),    -- logo & landing bg     -> website_settings.logo / navbar_logo / landing_background
  ('contracts',  'contracts',  false)    -- conciergerie contracts (privé) -> car_owners.contract_url
on conflict (id) do update set public = excluded.public;

-- Public buckets: read for everyone; write/update/delete for anon + authenticated.
do $$
declare b text;
begin
  foreach b in array array['cars','clients','worker','workers','inspection','website']
  loop
    execute format('drop policy if exists "%s_read"   on storage.objects;', b);
    execute format('drop policy if exists "%s_write"  on storage.objects;', b);
    execute format('drop policy if exists "%s_update" on storage.objects;', b);
    execute format('drop policy if exists "%s_delete" on storage.objects;', b);

    execute format($p$create policy "%1$s_read"   on storage.objects for select using (bucket_id = '%1$s');$p$, b);
    execute format($p$create policy "%1$s_write"  on storage.objects for insert with check (bucket_id = '%1$s');$p$, b);
    execute format($p$create policy "%1$s_update" on storage.objects for update using (bucket_id = '%1$s') with check (bucket_id = '%1$s');$p$, b);
    execute format($p$create policy "%1$s_delete" on storage.objects for delete using (bucket_id = '%1$s');$p$, b);
  end loop;
end $$;

-- Private "contracts" bucket: authenticated only (never exposed to anon).
drop policy if exists "contracts_read"   on storage.objects;
drop policy if exists "contracts_write"  on storage.objects;
drop policy if exists "contracts_update" on storage.objects;
drop policy if exists "contracts_delete" on storage.objects;
create policy "contracts_read"   on storage.objects for select to authenticated using (bucket_id = 'contracts');
create policy "contracts_write"  on storage.objects for insert to authenticated with check (bucket_id = 'contracts');
create policy "contracts_update" on storage.objects for update to authenticated using (bucket_id = 'contracts') with check (bucket_id = 'contracts');
create policy "contracts_delete" on storage.objects for delete to authenticated using (bucket_id = 'contracts');


-- ============================================================================
-- 13. ROW LEVEL SECURITY
--       • authenticated users (admins/workers logged in via Supabase Auth) get
--         full access everywhere.
--       • public/anon can READ what the public website needs.
--       • public site WRITES go through the SECURITY DEFINER RPCs above.
--       • car_owners has NO anon policy (private owner data).
-- ============================================================================

-- 13.1 Enable RLS on all app tables
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','agencies','cars','clients','workers','worker_advances',
    'worker_absences','worker_payments','store_expenses','vehicle_expenses',
    'maintenance_alerts','services','protection_assurances',
    'protection_assurance_items','protection_assurance_item_links',
    'reservations','reservation_services','payments',
    'inspection_checklist_items','vehicle_inspections','inspection_responses',
    'special_offers','offers','promo_codes','website_contacts',
    'website_settings','agency_settings','document_templates','admin_sessions',
    'car_owners'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- 13.2 Full access for authenticated users (admins + workers)
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','agencies','cars','clients','workers','worker_advances',
    'worker_absences','worker_payments','store_expenses','vehicle_expenses',
    'maintenance_alerts','services','protection_assurances',
    'protection_assurance_items','protection_assurance_item_links',
    'reservations','reservation_services','payments',
    'inspection_checklist_items','vehicle_inspections','inspection_responses',
    'special_offers','offers','promo_codes','website_contacts',
    'website_settings','agency_settings','document_templates','admin_sessions',
    'car_owners'
  ]
  loop
    execute format('drop policy if exists "%1$s_authenticated_all" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_authenticated_all" on public.%1$I for all to authenticated using (true) with check (true);',
      t);
  end loop;
end $$;

-- 13.3 Public (anon) READ access for the tables the public website reads
do $$
declare t text;
begin
  foreach t in array array[
    'cars','agencies','services','special_offers','offers',
    'protection_assurances','protection_assurance_items',
    'protection_assurance_item_links','website_contacts','website_settings'
  ]
  loop
    execute format('drop policy if exists "%1$s_public_read" on public.%1$I;', t);
    execute format(
      'create policy "%1$s_public_read" on public.%1$I for select to anon using (true);',
      t);
  end loop;
end $$;

-- 13.4 Login page: read admin_count/profiles anonymously (decide whether to show
--      the "Create admin account" button) and insert the first admin's profile.
drop policy if exists "profiles_public_read"    on public.profiles;
drop policy if exists "profiles_signup_insert"  on public.profiles;
create policy "profiles_public_read"   on public.profiles for select to anon, authenticated using (true);
create policy "profiles_signup_insert" on public.profiles for insert to anon, authenticated with check (true);

grant select on public.admin_count to anon, authenticated;

-- 13.5 Public website reads reservation dates (calendar fallback).
drop policy if exists "reservations_public_read" on public.reservations;
create policy "reservations_public_read" on public.reservations for select to anon using (true);

-- 13.6 car_owners + consignment_earnings : authenticated only, never anon.
revoke all on public.car_owners          from anon;
grant select, insert, update, delete on public.car_owners to authenticated;
revoke all on public.consignment_earnings from anon;
grant select on public.consignment_earnings to authenticated;


-- ============================================================================
-- 14. GRANTS FOR RPC FUNCTIONS (callable by anon + authenticated)
-- ============================================================================
grant execute on function public.login_worker(text, text)                              to anon, authenticated;
grant execute on function public.get_worker_account(text, text)                         to anon, authenticated;
grant execute on function public.update_worker_account(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_reserved_periods(uuid)                             to anon, authenticated;
grant execute on function public.get_unavailable_car_ids(date, date)                    to anon, authenticated;
grant execute on function public.verify_promo_code(text)                                to anon, authenticated;
grant execute on function public.create_website_reservation(jsonb, jsonb, jsonb, text)  to anon, authenticated;
grant execute on function public.create_admin_session(text, text, bigint, text, text)   to authenticated;
grant execute on function public.validate_session(text)                                 to anon, authenticated;
grant execute on function public.invalidate_session(text)                               to anon, authenticated;


-- ============================================================================
-- 15. SEED — a single settings row so branding reads never return empty.
-- ============================================================================
insert into public.website_settings (id, name, description, logo, navbar_logo,
  phone_number_2, bank_number, address, phone, landing_background, singleton, updated_at)
select '00000000-0000-0000-0000-000000000001', 'AutoLocation', '', '', '',
       '', '', '', '', '', true, now()
where not exists (select 1 from public.website_settings);

-- Force PostgREST to reload its schema cache so every new column/RPC is visible
-- to the REST API immediately (otherwise the first calls may return PGRST204).
notify pgrst, 'reload schema';

-- ============================================================================
--  DONE. Create your first admin from the app's LOGIN page.
-- ============================================================================
