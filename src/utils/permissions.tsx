import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '../supabase';
import { User } from '../types';
import { permissionKey } from '../constants/permissions';

/**
 * PERMISSIONS À L'EXÉCUTION
 * ─────────────────────────
 * L'administrateur voit tout. Un employé ne voit que ce que l'admin lui a
 * explicitement coché depuis Équipe → Permissions.
 *
 * Les droits sont stockés dans `workers.permissions` (tableau JSONB de clés
 * `"<page>:<action>"`). On les charge une fois à la connexion et on les garde
 * en contexte : filtrer un bouton ne doit jamais coûter un aller-retour réseau.
 *
 * Règle de rendu : un bouton non autorisé n'est PAS rendu. Un bouton visible
 * mais mort est une invitation à réessayer — et une fuite d'information sur ce
 * que l'application sait faire.
 */

interface PermissionsValue {
  /** true tant que les droits n'ont pas été chargés (on n'affiche rien de sensible). */
  loading: boolean;
  isAdmin: boolean;
  /** Ensemble brut des clés autorisées. */
  keys: Set<string>;
  /** L'utilisateur a-t-il accès à cette interface ? */
  canPage: (pageId: string) => boolean;
  /** L'utilisateur a-t-il le droit d'exécuter cette action sur cette interface ? */
  can: (pageId: string, actionId: string) => boolean;
  reload: () => Promise<void>;
}

const EMPTY = new Set<string>();

/**
 * Droits mis de côté à la connexion.
 *
 * Un employé créé AVANT la bascule vers Supabase Auth se connecte encore par
 * le RPC `login_worker` : il n'a donc pas de session authentifiée, et la
 * lecture de sa ligne `workers` serait refusée par RLS. Le RPC renvoie ses
 * permissions — on les garde ici pour que sa barre latérale soit correcte
 * malgré tout. La lecture en base reste la source prioritaire.
 */
const CACHE_KEY = 'fifou:worker-permissions';

export const cacheWorkerPermissions = (email: string, keys: string[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ email: email.toLowerCase(), keys }));
  } catch { /* stockage bloqué : on s'en passe */ }
};

const readCachedPermissions = (email: string): string[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.email !== email.toLowerCase() || !Array.isArray(parsed.keys)) return null;
    return parsed.keys.filter((k: unknown) => typeof k === 'string');
  } catch {
    return null;
  }
};

const PermissionsContext = createContext<PermissionsValue>({
  loading: false,
  isAdmin: true,
  keys: EMPTY,
  canPage: () => true,
  can: () => true,
  reload: async () => {},
});

export const usePermissions = () => useContext(PermissionsContext);

/** Raccourci : `const can = useCan('planner')` puis `can('activate')`. */
export const useCan = (pageId: string) => {
  const { can } = usePermissions();
  return useCallback((actionId: string) => can(pageId, actionId), [can, pageId]);
};

interface ProviderProps {
  user: User | null;
  children: React.ReactNode;
}

export const PermissionsProvider: React.FC<ProviderProps> = ({ user, children }) => {
  const [keys, setKeys] = useState<Set<string>>(EMPTY);
  const [loading, setLoading] = useState(false);

  const isAdmin = !user || user.role === 'admin';

  const load = useCallback(async () => {
    if (!user || user.role === 'admin') {
      setKeys(EMPTY);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('workers')
        .select('permissions')
        .eq('email', user.email)
        .maybeSingle();

      // Lecture refusée ou colonne absente : on retombe sur les droits mis de
      // côté à la connexion plutôt que d'enfermer l'employé dehors.
      if (error || !data) {
        if (error) console.warn('[Permissions] Lecture en base impossible :', error.message);
        setKeys(new Set(readCachedPermissions(user.email) ?? []));
        return;
      }

      const raw = (data as any)?.permissions;
      const list: string[] = Array.isArray(raw)
        ? raw
        : typeof raw === 'string'
          ? safeParse(raw)
          : [];

      // La base fait foi : on rafraîchit le cache au passage, pour que la
      // prochaine connexion en mode dégradé parte de droits à jour.
      cacheWorkerPermissions(user.email, list);
      setKeys(new Set(list));
    } catch (err) {
      console.warn('[Permissions] Erreur de chargement :', err);
      setKeys(new Set(readCachedPermissions(user.email) ?? []));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<PermissionsValue>(() => ({
    loading,
    isAdmin,
    keys,
    canPage: (pageId: string) => {
      if (isAdmin) return true;
      // Une interface est visible dès qu'au moins une de ses actions est
      // accordée — cocher une action sans cocher la page serait un piège.
      const prefix = `${pageId}:`;
      for (const k of keys) if (k.startsWith(prefix)) return true;
      return false;
    },
    can: (pageId: string, actionId: string) => {
      if (isAdmin) return true;
      return keys.has(permissionKey(pageId, actionId));
    },
    reload: load,
  }), [loading, isAdmin, keys, load]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
};

function safeParse(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Garde de rendu déclarative :
 *   <Can page="planner" action="delete"><button …/></Can>
 * Rien n'est rendu si le droit manque.
 */
export const Can: React.FC<{
  page: string;
  action: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ page, action, children, fallback = null }) => {
  const { can } = usePermissions();
  return <>{can(page, action) ? children : fallback}</>;
};
