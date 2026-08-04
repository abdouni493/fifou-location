import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LogOut, X } from 'lucide-react';
import { SIDEBAR_ITEMS, SIDEBAR_GROUPS } from '../constants';
import { Language, SidebarItem } from '../types';
import { AGENCY_BRANDING_EVENT, DatabaseService, DEFAULT_AGENCY_NAME } from '../services/DatabaseService';
import { BrandMark } from './BrandMark';
import { usePermissions } from '../utils/permissions';

interface SidebarProps {
  lang: Language;
  isVisible: boolean;
  setIsVisible: (val: boolean) => void;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  alertsCount?: number;
  webOrdersCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  lang, isVisible, setIsVisible, onLogout, activeTab, setActiveTab, alertsCount = 0, webOrdersCount = 0
}) => {
  const isRtl = lang === 'ar';
  const { canPage, isAdmin } = usePermissions();
  const [agencyData, setAgencyData] = useState({
    name: DEFAULT_AGENCY_NAME,
    logo: '',
    navbarLogo: '',
  });

  // Load agency data from database, et re-charge après chaque sauvegarde des
  // réglages : sans cela le nouveau nom/logo n'apparaissait qu'au rechargement.
  useEffect(() => {
    const loadAgencyData = async () => {
      try {
        const branding = await DatabaseService.getAgencyBranding();
        setAgencyData({
          name: branding.name,
          logo: branding.logo,
          navbarLogo: branding.navbar_logo,
        });
      } catch (error) {
        console.error('Error loading agency data:', error);
        setAgencyData({ name: DEFAULT_AGENCY_NAME, logo: '', navbarLogo: '' });
      }
    };

    loadAgencyData();
    window.addEventListener(AGENCY_BRANDING_EVENT, loadAgencyData);
    return () => window.removeEventListener(AGENCY_BRANDING_EVENT, loadAgencyData);
  }, []);

  // Les trois premiers mots suffisent : le premier en chrome, le reste en rouge.
  const [firstWord, ...restWords] = agencyData.name.trim().split(/\s+/).slice(0, 3);

  /**
   * La navigation visible.
   *
   * L'admin voit tout. Un employé ne voit que les interfaces cochées dans
   * Équipe → Permissions — et un groupe entièrement filtré disparaît avec son
   * titre, sinon la barre se retrouve criblée d'intertitres vides.
   */
  const groups = useMemo(() => {
    const byId = new Map(SIDEBAR_ITEMS.map(i => [i.id, i]));
    return SIDEBAR_GROUPS
      .map(g => ({
        label: g.label,
        items: g.items
          .map(id => byId.get(id))
          .filter((i): i is SidebarItem => Boolean(i) && (isAdmin || canPage(i!.id))),
      }))
      .filter(g => g.items.length > 0);
  }, [canPage, isAdmin]);

  const closeOnMobile = () => {
    if (window.innerWidth < 1024) setIsVisible(false);
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.aside
          initial={{ x: isRtl ? '100%' : '-100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: isRtl ? '100%' : '-100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 240 }}
          className="fx-rail fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] flex flex-col
                     ltr:left-0 rtl:right-0 lg:inset-y-0 lg:h-screen lg:max-w-none"
          style={{ [isRtl ? 'right' : 'left']: 0 }}
        >
          {/* ── Marque ── */}
          <div className="relative px-5 py-6 flex items-center justify-between gap-3 border-b border-white/[0.07]">
            {/* Souffle rouge derrière le logo : ancre la marque en haut du rail */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 -top-16 h-40 opacity-70"
              style={{ background: 'radial-gradient(50% 60% at 30% 100%, rgba(200,16,46,0.28), transparent 70%)' }}
            />
            <div className="relative flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div
                  aria-hidden
                  className="absolute -inset-1 rounded-xl blur-md opacity-60"
                  style={{ background: 'linear-gradient(135deg, rgba(240,51,60,0.55), transparent 65%)' }}
                />
                <BrandMark
                  logo={agencyData.navbarLogo}
                  fallbackLogo={agencyData.logo}
                  name={agencyData.name}
                  size={40}
                  className="relative"
                />
              </div>
              <span className="text-lg font-black tracking-tight uppercase truncate leading-tight">
                <span className="fx-chrome-text">{firstWord}</span>
                {restWords.length > 0 && (
                  <span style={{ color: 'var(--fx-red-300)' }}>&nbsp;{restWords.join(' ')}</span>
                )}
              </span>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              aria-label={lang === 'fr' ? 'Fermer le menu' : 'إغلاق القائمة'}
              className="fx-icon-btn relative p-2 lg:hidden"
            >
              <X size={18} />
            </button>
          </div>

          {/* ── Navigation ── */}
          <nav className="flex-1 overflow-y-auto px-3 py-5 custom-scrollbar">
            {groups.map((group, gi) => (
              <div key={group.label.fr} className={gi > 0 ? 'mt-5' : ''}>
                <p className="px-3 mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/25">
                  {group.label[lang]}
                </p>
                <div className="space-y-1">
                  {group.items.map(item => {
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id); closeOnMobile(); }}
                        aria-current={active ? 'page' : undefined}
                        className={`fx-nav-link ${active ? 'fx-nav-link-active' : ''}`}
                      >
                        <span className="fx-nav-icon">{item.icon}</span>
                        <span className="text-[11px] font-bold uppercase tracking-[0.11em] truncate flex-1">
                          {item.label[lang]}
                        </span>

                        {/* Alertes maintenance — point pulsé sur le tableau de bord */}
                        {item.id === 'dashboard' && alertsCount > 0 && (
                          <span
                            className="fx-pulse shrink-0 w-2.5 h-2.5 rounded-full"
                            style={{ background: 'linear-gradient(135deg, #FF4D52, #8A0A1C)' }}
                            title={
                              lang === 'fr'
                                ? `${alertsCount} alerte(s) maintenance`
                                : `${alertsCount} تنبيه صيانة`
                            }
                          />
                        )}

                        {/* Réservations du site en attente d'acceptation */}
                        {item.id === 'web-orders' && webOrdersCount > 0 && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center
                                       rounded-full text-[10px] font-black text-white"
                            style={{
                              backgroundImage: 'var(--fx-grad-red)',
                              boxShadow: '0 0 14px rgba(200,16,46,0.6)',
                            }}
                            title={lang === 'fr' ? 'Nouvelles réservations du site' : 'حجوزات جديدة من الموقع'}
                          >
                            {webOrdersCount}
                          </motion.span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {groups.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-white/40 leading-relaxed">
                {lang === 'fr'
                  ? "Aucune interface ne vous a encore été attribuée. Demandez à votre administrateur d'ouvrir vos permissions."
                  : 'لم يتم تعيين أي واجهة لك بعد. اطلب من المسؤول فتح صلاحياتك.'}
              </p>
            )}
          </nav>

          {/* ── Déconnexion ── */}
          <div className="p-4 border-t border-white/[0.07] fx-safe-b">
            <button
              onClick={onLogout}
              className="fx-nav-link w-full justify-start"
              style={{ color: 'var(--fx-red-300)' }}
            >
              <LogOut size={17} className="shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-[0.11em]">
                {lang === 'fr' ? 'Déconnexion' : 'تسجيل الخروج'}
              </span>
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
