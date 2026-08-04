import { useEffect, useState } from 'react';

/**
 * Thème du back-office.
 *
 * - `carbon` : la peau noir & rouge du site public (cf. src/styles/theme-carbon.css).
 *              C'est le DÉFAUT : le back-office est carbone tant que l'utilisateur
 *              n'a pas demandé le clair.
 * - `light`  : le SaaS clair d'origine, désormais opt-in via le bouton de la navbar.
 *
 * Le thème vit sur <html data-admin-theme>, pas dans un contexte React : la
 * feuille de style fait tout le travail, donc aucun composant n'a besoin de
 * connaître la couleur courante — seul le bouton de la navbar la lit.
 */
export type AdminTheme = 'carbon';

const STORAGE_KEY = 'salam:admin-theme';
export const ADMIN_THEME_EVENT = 'salam:admin-theme-change';

export const getAdminTheme = (): AdminTheme => 'carbon';

/** Conservé pour compatibilité d'API : la peau est désormais unique. */
export const setAdminTheme = (_theme?: AdminTheme) => {
  document.documentElement.dataset.adminTheme = 'carbon';
  window.dispatchEvent(new CustomEvent(ADMIN_THEME_EVENT, { detail: 'carbon' }));
};

export const toggleAdminTheme = () => setAdminTheme('carbon');

// Le back-office est carbone, point. On purge la préférence 'light' héritée :
// sans cela un ancien localStorage rendrait la moitié des écrans en clair.
try {
  localStorage.removeItem(STORAGE_KEY);
} catch {
  /* stockage bloqué : l'attribut ci-dessous suffit pour la session */
}
document.documentElement.dataset.adminTheme = 'carbon';

/** Rend le composant à chaque bascule (pour l'icône et le libellé du bouton). */
export const useAdminTheme = (): [AdminTheme, () => void] => {
  const [theme, setTheme] = useState<AdminTheme>(getAdminTheme);

  useEffect(() => {
    const sync = () => setTheme(getAdminTheme());
    window.addEventListener(ADMIN_THEME_EVENT, sync);
    return () => window.removeEventListener(ADMIN_THEME_EVENT, sync);
  }, []);

  return [theme, toggleAdminTheme];
};
