-- ============================================================================
--  HOTFIX — Enregistrement des informations de l'agence (page Configuration)
-- ----------------------------------------------------------------------------
--  Symptôme : en enregistrant les infos de l'agence, l'API répond
--    HTTP 400 · { code: '21000', message: 'UPDATE requires a WHERE clause' }
--  et, après rafraîchissement, tous les champs de l'agence sont vides
--  (la sauvegarde n'a jamais été persistée).
--
--  Cause : le trigger `sync_agency_settings_branding` (qui recopie le branding
--  de `website_settings` vers `agency_settings`) faisait un UPDATE SANS clause
--  WHERE. Ce projet Supabase refuse ce type d'UPDATE.
--
--  Correctif : on ajoute `where singleton` (la table `agency_settings` ne
--  contient qu'une ligne, marquée singleton = true).
--
--  À exécuter UNE FOIS dans le SQL Editor de Supabase. Idempotent.
--  (Alternative : ré-exécuter tout `supabase_complete_setup.sql`, déjà corrigé.)
-- ============================================================================

create or replace function public.sync_agency_settings_branding()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.agency_settings
     set agency_name = new.name,
         slogan      = new.description,
         address     = new.address,
         phone       = new.phone,
         logo        = new.logo,
         updated_at  = now()
   where singleton;                       -- <-- clause WHERE obligatoire

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

notify pgrst, 'reload schema';

-- ============================================================================
--  Vérification (optionnel) : enregistrez les infos de l'agence depuis la page
--  Configuration, puis :
--    select agency_name, phone, logo from public.agency_settings;   -- 1 ligne
--    select name, phone, logo        from public.website_settings;  -- identiques
-- ============================================================================
