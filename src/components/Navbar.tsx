import React from 'react';
import { Globe, Menu, Monitor } from 'lucide-react';
import { Language, User } from '../types';
import { TRANSLATIONS } from '../constants';

interface NavbarProps {
  user: User;
  lang: Language;
  setLang: (lang: Language) => void;
  toggleSidebar: () => void;
  onWebsiteToggle?: () => void;
}

/**
 * Barre du haut.
 *
 * Le sélecteur de thème a disparu : le back-office n'a plus qu'une peau
 * (carbone — noir & rouge sang). Le champ de recherche global a été retiré lui
 * aussi : il n'était branché sur rien et volait la moitié de la barre sur
 * téléphone. Chaque page porte sa propre recherche, contextuelle.
 */
export const Navbar: React.FC<NavbarProps> = ({ user, lang, setLang, toggleSidebar, onWebsiteToggle }) => {
  const t = TRANSLATIONS[lang];

  return (
    <header className="fx-topbar sticky top-0 z-40 h-16 sm:h-[4.5rem] px-3 sm:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggleSidebar}
          aria-label={lang === 'fr' ? 'Ouvrir le menu' : 'فتح القائمة'}
          className="fx-icon-btn p-2.5 lg:hidden"
        >
          <Menu size={19} />
        </button>

        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: 'var(--fx-red-300)' }}>
            {lang === 'fr' ? 'Back-office' : 'لوحة التحكم'}
          </p>
          <p className="text-sm font-bold truncate fx-chrome-text hidden sm:block">
            {lang === 'fr' ? 'Gestion de location' : 'إدارة التأجير'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setLang(lang === 'fr' ? 'ar' : 'fr')}
          className="fx-icon-btn px-2.5 sm:px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest"
          title={t.changeLang}
        >
          <Globe size={15} />
          <span className="hidden sm:inline">{t.changeLang}</span>
        </button>

        {onWebsiteToggle && (
          <button
            onClick={onWebsiteToggle}
            className="fx-icon-btn px-2.5 sm:px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest"
            title={lang === 'fr' ? 'Aperçu du site web' : 'عرض الموقع'}
          >
            <Monitor size={15} />
            <span className="hidden md:inline">{{ fr: 'Aperçu', ar: 'عرض' }[lang]}</span>
          </button>
        )}

        <div className="h-7 w-px bg-white/10 hidden sm:block" />

        <div className="flex items-center gap-2.5 min-w-0">
          <div className="text-right hidden md:block min-w-0">
            <p className="text-xs font-bold truncate max-w-[10rem]" style={{ color: 'var(--fx-ink)' }}>
              {user.name}
            </p>
            <p className="text-[9px] font-black uppercase tracking-[0.16em]" style={{ color: 'var(--fx-red-300)' }}>
              {user.role}
            </p>
          </div>
          <div className="relative shrink-0">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-9 h-9 rounded-full object-cover"
                style={{ border: '1px solid var(--fx-line-red)' }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-sm"
                style={{
                  backgroundImage: 'var(--fx-grad-red)',
                  boxShadow: '0 0 16px -4px rgba(200,16,46,0.7)',
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
            )}
            <span
              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400"
              style={{ boxShadow: '0 0 0 2px var(--fx-black-100)' }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
