import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Search, ChevronDown } from 'lucide-react';

/**
 * KIT « FX » — les briques visuelles du back-office carbone.
 *
 * Chaque page redessinée est assemblée à partir d'ici plutôt que de réinventer
 * un en-tête, une tuile de chiffre ou une modale. Les styles vivent dans
 * src/styles/fifou-carbon.css : ces composants ne font que poser la structure
 * et le comportement (responsive, accessibilité, animation d'entrée).
 *
 * Règle de responsive tenue par tout le kit : on empile sous 640 px, on ne
 * fait jamais déborder la page horizontalement, et les cibles tactiles font
 * au moins 40 px de haut.
 */

// ═══ En-tête de page ════════════════════════════════════════════════════════

export const PageHeader: React.FC<{
  icon?: React.ReactNode;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Actions à droite — empilées sous le titre sur téléphone. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon, eyebrow, title, subtitle, actions, children }) => (
  <motion.header
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    className="fx-hero p-4 sm:p-6 mb-5 sm:mb-7"
  >
    <div className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
      <div className="flex items-start gap-3.5 min-w-0 flex-1">
        {icon && (
          <div
            className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-2xl"
            style={{
              backgroundImage: 'var(--fx-grad-red-tint)',
              border: '1px solid var(--fx-line-red)',
              boxShadow: 'var(--fx-edge-red)',
            }}
          >
            {icon}
          </div>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="fx-eyebrow mb-1">{eyebrow}</p>}
          <h1 className="fx-title text-xl sm:text-2xl lg:text-[1.75rem] leading-tight">{title}</h1>
          {subtitle && (
            <p className="mt-1 text-xs sm:text-sm" style={{ color: 'var(--fx-ink-mute)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>

    {children && <div className="mt-4">{children}</div>}
  </motion.header>
);

// ═══ Tuile de chiffre ═══════════════════════════════════════════════════════

export type StatTone = 'red' | 'green' | 'amber' | 'steel' | 'ink';

const TONE: Record<StatTone, { fg: string; grad: string; ring: string }> = {
  red:   { fg: 'var(--fx-red-200)', grad: 'linear-gradient(135deg, rgba(200,16,46,0.22), rgba(116,8,26,0.06))', ring: 'var(--fx-line-red)' },
  green: { fg: '#6EE7B7', grad: 'linear-gradient(135deg, rgba(16,164,111,0.22), rgba(10,115,80,0.06))', ring: 'rgba(52,211,153,0.4)' },
  amber: { fg: '#FCD34D', grad: 'linear-gradient(135deg, rgba(217,132,16,0.22), rgba(168,92,8,0.06))', ring: 'rgba(251,191,36,0.4)' },
  steel: { fg: 'var(--fx-ink-soft)', grad: 'linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))', ring: 'var(--fx-line-strong)' },
  ink:   { fg: 'var(--fx-ink)', grad: 'var(--fx-grad-surface)', ring: 'var(--fx-line)' },
};

export const StatCard: React.FC<{
  label: string;
  value: React.ReactNode;
  /** Ligne d'appoint sous la valeur (variation, part, précision). */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  onClick?: () => void;
}> = ({ label, value, hint, icon, tone = 'steel', onClick }) => {
  const t = TONE[tone];
  const Tag: any = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`fx-card p-3.5 sm:p-4 text-left w-full ${onClick ? 'cursor-pointer' : 'fx-card-flat'}`}
      style={{ borderColor: t.ring }}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className="text-[10px] font-black uppercase tracking-[0.13em] leading-tight"
          style={{ color: 'var(--fx-ink-mute)' }}
        >
          {label}
        </p>
        {icon && (
          <span
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm"
            style={{ backgroundImage: t.grad, border: `1px solid ${t.ring}`, color: t.fg }}
          >
            {icon}
          </span>
        )}
      </div>
      <p
        className="mt-2 text-lg sm:text-xl lg:text-2xl font-black tracking-tight tabular-nums break-words"
        style={{ color: t.fg }}
      >
        {value}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] leading-snug" style={{ color: 'var(--fx-ink-dim)' }}>
          {hint}
        </p>
      )}
    </Tag>
  );
};

/** Grille de tuiles : 2 colonnes au pouce, jusqu'à 4 au bureau. */
export const StatGrid: React.FC<{ children: React.ReactNode; cols?: 2 | 3 | 4 | 5 }> = ({ children, cols = 4 }) => {
  const lg = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5' }[cols];
  return (
    <div className={`fx-stagger grid grid-cols-2 sm:grid-cols-3 ${lg} gap-2.5 sm:gap-3.5`}>
      {children}
    </div>
  );
};

// ═══ Barre d'outils ═════════════════════════════════════════════════════════

export const Toolbar: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 mb-4 sm:mb-5 ${className}`}>
    {children}
  </div>
);

export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, placeholder, className = '' }) => (
  <div className={`relative flex-1 min-w-0 ${className}`}>
    <Search
      size={16}
      className="absolute ltr:left-3.5 rtl:right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: 'var(--fx-ink-dim)' }}
    />
    <input
      type="search"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="fx-field w-full ltr:pl-10 rtl:pr-10"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        aria-label="Effacer"
        className="absolute ltr:right-2 rtl:left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-white/10"
        style={{ color: 'var(--fx-ink-dim)' }}
      >
        <X size={14} />
      </button>
    )}
  </div>
);

/** Onglets segmentés. Défile horizontalement plutôt que d'élargir la page. */
export function Segmented<T extends string>({
  value, onChange, options, className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; badge?: number }[];
  className?: string;
}) {
  return (
    <div className={`fx-tabs max-w-full overflow-x-auto fx-scroll-x ${className}`} role="tablist">
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`fx-tab flex items-center gap-1.5 ${value === o.value ? 'fx-tab-active' : ''}`}
        >
          {o.label}
          {o.badge !== undefined && o.badge > 0 && (
            <span
              className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-black flex items-center justify-center"
              style={{
                background: value === o.value ? 'rgba(0,0,0,0.28)' : 'var(--fx-red-500)',
                color: '#fff',
              }}
            >
              {o.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export const Select: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
  'aria-label'?: string;
}> = ({ value, onChange, options, className = '', ...rest }) => (
  <div className={`relative ${className}`}>
    <select
      {...rest}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="fx-field w-full appearance-none ltr:pr-9 rtl:pl-9 cursor-pointer"
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
    <ChevronDown
      size={15}
      className="absolute ltr:right-3 rtl:left-3 top-1/2 -translate-y-1/2 pointer-events-none"
      style={{ color: 'var(--fx-ink-dim)' }}
    />
  </div>
);

// ═══ Boutons ════════════════════════════════════════════════════════════════

type BtnTone = 'primary' | 'ghost' | 'steel' | 'danger' | 'success' | 'warning';

export const Btn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: BtnTone; size?: 'sm' | 'md' | 'lg' }
> = ({ tone = 'ghost', size = 'md', className = '', children, ...rest }) => {
  const pad = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-6 py-3 text-sm' }[size];
  return (
    <button
      {...rest}
      className={`fx-btn fx-btn-${tone} inline-flex items-center justify-center gap-2 rounded-xl
                  font-bold tracking-wide whitespace-nowrap disabled:opacity-45
                  disabled:pointer-events-none ${pad} ${className}`}
    >
      {children}
    </button>
  );
};

/** Bouton d'action de carte : icône + libellé qui s'efface sur petit écran. */
export const ActionBtn: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: React.ReactNode;
    label: string;
    tone?: 'default' | 'danger' | 'success' | 'warning';
    /** Le libellé reste visible quelle que soit la largeur. */
    showLabel?: boolean;
  }
> = ({ icon, label, tone = 'default', showLabel = false, className = '', ...rest }) => (
  <button
    {...rest}
    title={label}
    aria-label={label}
    className={`fx-icon-btn ${tone !== 'default' ? `fx-icon-btn-${tone}` : ''}
                px-2.5 py-2 text-[11px] font-bold ${className}`}
  >
    {icon}
    <span className={showLabel ? 'inline' : 'hidden xl:inline'}>{label}</span>
  </button>
);

// ═══ Modale ═════════════════════════════════════════════════════════════════

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  /** Largeur maximale au bureau. Sur téléphone la modale prend toute la place. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
  children: React.ReactNode;
}> = ({ open, onClose, title, subtitle, icon, size = 'md', footer, children }) => {
  // Escape ferme, et le fond ne défile pas derrière la modale.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const max = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-4xl', xl: 'sm:max-w-6xl' }[size];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fx-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={`fx-modal ${max}`}
          >
            <div className="fx-modal-head">
              <div className="flex items-center gap-3 min-w-0">
                {icon && (
                  <span
                    className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg"
                    style={{ backgroundImage: 'var(--fx-grad-red-tint)', border: '1px solid var(--fx-line-red)' }}
                  >
                    {icon}
                  </span>
                )}
                <div className="min-w-0">
                  <h2 className="fx-title text-base sm:text-lg leading-tight truncate">{title}</h2>
                  {subtitle && (
                    <p className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--fx-ink-mute)' }}>
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={onClose} aria-label="Fermer" className="fx-icon-btn p-2 shrink-0">
                <X size={17} />
              </button>
            </div>

            <div className="fx-modal-body custom-scrollbar">{children}</div>

            {footer && <div className="fx-modal-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ═══ États ══════════════════════════════════════════════════════════════════

export const EmptyState: React.FC<{
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon = '🗂️', title, description, action }) => (
  <div className="fx-card fx-card-flat py-12 sm:py-16 px-6 text-center">
    <div className="text-4xl sm:text-5xl mb-3 opacity-40">{icon}</div>
    <p className="fx-title text-base sm:text-lg">{title}</p>
    {description && (
      <p className="mt-1.5 text-sm max-w-sm mx-auto" style={{ color: 'var(--fx-ink-mute)' }}>
        {description}
      </p>
    )}
    {action && <div className="mt-5 flex justify-center">{action}</div>}
  </div>
);

export const LoadingState: React.FC<{ label?: string; rows?: number }> = ({ label, rows = 6 }) => (
  <div>
    {label && (
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em]" style={{ color: 'var(--fx-ink-mute)' }}>
        {label}
      </p>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="fx-skeleton h-36 rounded-2xl" />
      ))}
    </div>
  </div>
);

export const ErrorBanner: React.FC<{ message: string; onRetry?: () => void; retryLabel?: string }> = ({
  message, onRetry, retryLabel = 'Réessayer',
}) => (
  <div
    className="mb-4 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-3"
    style={{
      backgroundImage: 'linear-gradient(135deg, rgba(240,51,60,0.16), rgba(116,8,26,0.05))',
      border: '1px solid var(--fx-line-red-hi)',
    }}
  >
    <p className="flex-1 text-sm font-medium" style={{ color: 'var(--fx-red-200)' }}>⚠️ {message}</p>
    {onRetry && <Btn tone="ghost" size="sm" onClick={onRetry}>{retryLabel}</Btn>}
  </div>
);

/** Bandeau d'information — migration à jouer, réglage manquant… */
export const InfoBanner: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    className="mb-4 rounded-xl p-3.5 text-sm leading-relaxed"
    style={{
      backgroundImage: 'linear-gradient(135deg, rgba(217,132,16,0.14), rgba(168,92,8,0.04))',
      border: '1px solid rgba(251,191,36,0.35)',
      color: '#FCD34D',
    }}
  >
    {children}
  </div>
);

// ═══ Champs de formulaire ═══════════════════════════════════════════════════

export const Field: React.FC<{
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, required, hint, error, className = '', children }) => (
  <div className={className}>
    <label className="fx-label">
      {label}
      {required && <span style={{ color: 'var(--fx-red-300)' }}> *</span>}
    </label>
    {children}
    {hint && !error && (
      <p className="mt-1 text-[11px]" style={{ color: 'var(--fx-ink-dim)' }}>{hint}</p>
    )}
    {error && (
      <p className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--fx-red-300)' }}>{error}</p>
    )}
  </div>
);

/** Grille de formulaire : 1 colonne au pouce, 2 dès 640 px. */
export const FormGrid: React.FC<{ children: React.ReactNode; cols?: 1 | 2 | 3 }> = ({ children, cols = 2 }) => {
  const c = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[cols];
  return <div className={`grid grid-cols-1 ${c} gap-3.5`}>{children}</div>;
};

/** Interrupteur — plus lisible qu'une case à cocher pour un réglage binaire. */
export const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}> = ({ checked, onChange, label, description }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => onChange(!checked)}
    className="fx-well w-full p-3.5 flex items-center gap-3 text-left transition-colors"
    style={{ borderColor: checked ? 'var(--fx-line-red)' : 'var(--fx-line)' }}
  >
    <span
      className="shrink-0 w-11 h-6 rounded-full relative transition-all duration-200"
      style={{
        backgroundImage: checked ? 'var(--fx-grad-red)' : 'linear-gradient(135deg,#26262F,#1A1A21)',
        border: '1px solid var(--fx-line-strong)',
      }}
    >
      <span
        className="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all duration-200"
        style={{ left: checked ? 'calc(100% - 21px)' : '3px', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
      />
    </span>
    <span className="min-w-0">
      <span className="block text-sm font-bold" style={{ color: 'var(--fx-ink)' }}>{label}</span>
      {description && (
        <span className="block text-[11px] mt-0.5" style={{ color: 'var(--fx-ink-mute)' }}>{description}</span>
      )}
    </span>
  </button>
);

// ═══ Affichage de données ═══════════════════════════════════════════════════

/** Une ligne « libellé → valeur ». La brique des panneaux de détail. */
export const Row: React.FC<{ label: React.ReactNode; value: React.ReactNode; strong?: boolean }> = ({
  label, value, strong,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <span className="text-[11px] font-semibold uppercase tracking-wide shrink-0" style={{ color: 'var(--fx-ink-mute)' }}>
      {label}
    </span>
    <span
      className={`text-right tabular-nums min-w-0 break-words ${strong ? 'text-base font-black' : 'text-sm font-semibold'}`}
      style={{ color: strong ? 'var(--fx-red-200)' : 'var(--fx-ink)' }}
    >
      {value}
    </span>
  </div>
);

export const Badge: React.FC<{
  tone?: 'red' | 'green' | 'amber' | 'steel' | 'neutral';
  children: React.ReactNode;
  className?: string;
}> = ({ tone = 'neutral', children, className = '' }) => (
  <span className={`fx-badge ${tone !== 'neutral' ? `fx-badge-${tone}` : ''} ${className}`}>{children}</span>
);

/** Panneau titré : le conteneur standard d'une section de page. */
export const Panel: React.FC<{
  title: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, icon, actions, className = '', bodyClassName = 'p-4 sm:p-5', children }) => (
  <section className={`fx-panel ${className}`}>
    <header className="fx-panel-head">
      {icon && <span className="text-lg shrink-0">{icon}</span>}
      <h3 className="fx-title text-sm sm:text-base flex-1 min-w-0 truncate">{title}</h3>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
    <div className={bodyClassName}>{children}</div>
  </section>
);

/** Tableau responsive : défile dans son cadre, jamais la page entière. */
export const TableWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="fx-table-wrap custom-scrollbar">
    <table className="w-full text-sm border-collapse min-w-[36rem]">{children}</table>
  </div>
);

export const Th: React.FC<{ children: React.ReactNode; align?: 'left' | 'right' | 'center' }> = ({
  children, align = 'left',
}) => (
  <th
    className="px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] whitespace-nowrap"
    style={{ color: 'var(--fx-ink-mute)', textAlign: align }}
  >
    {children}
  </th>
);

export const Td: React.FC<{
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}> = ({ children, align = 'left', className = '' }) => (
  <td
    className={`px-3 py-2.5 border-t ${className}`}
    style={{ borderColor: 'var(--fx-line)', textAlign: align, color: 'var(--fx-ink-soft)' }}
  >
    {children}
  </td>
);

// ═══ Graphiques (SVG pur — aucune dépendance) ═══════════════════════════════

/** Palette des séries. Le rouge de la marque ouvre toujours la marche. */
export const SERIES = ['#E01331', '#FF6B70', '#8A0A1C', '#D98410', '#10A46F', '#8B7BD8', '#5EA8D9', '#C3C8CF'];

/**
 * Anneau de répartition. `size` est en pixels ; le conteneur le laisse
 * rétrécir sur téléphone via `max-width: 100%`.
 */
export const Donut: React.FC<{
  data: { label: string; value: number; color?: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: React.ReactNode;
}> = ({ data, size = 180, thickness = 22, centerLabel, centerValue }) => {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size, maxWidth: '100%' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full h-auto -rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={thickness}
          />
          {total > 0 && data.map((d, i) => {
            const frac = Math.max(0, d.value) / total;
            const len = frac * c;
            const el = (
              <circle
                key={i}
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke={d.color ?? SERIES[i % SERIES.length]}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              >
                <animate attributeName="stroke-dasharray" from={`0 ${c}`} to={`${len} ${c - len}`} dur="0.7s" fill="freeze" />
              </circle>
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          {centerValue !== undefined && (
            <span className="text-lg sm:text-xl font-black tabular-nums" style={{ color: 'var(--fx-ink)' }}>
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="text-[9px] font-black uppercase tracking-[0.14em] mt-0.5" style={{ color: 'var(--fx-ink-dim)' }}>
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      <ul className="flex-1 min-w-0 w-full space-y-1.5">
        {data.map((d, i) => {
          const pct = total > 0 ? (Math.max(0, d.value) / total) * 100 : 0;
          return (
            <li key={i} className="flex items-center gap-2.5 text-xs">
              <span
                className="shrink-0 w-2.5 h-2.5 rounded-sm"
                style={{ background: d.color ?? SERIES[i % SERIES.length] }}
              />
              <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--fx-ink-soft)' }}>{d.label}</span>
              <span className="tabular-nums font-bold shrink-0" style={{ color: 'var(--fx-ink)' }}>
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

/** Histogramme vertical. Défile horizontalement si les barres sont nombreuses. */
export const BarChart: React.FC<{
  data: { label: string; value: number; color?: string }[];
  height?: number;
  format?: (v: number) => string;
}> = ({ data, height = 180, format = v => String(Math.round(v)) }) => {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="fx-table-wrap custom-scrollbar">
      <div className="flex items-end gap-2 sm:gap-3 min-w-max px-1" style={{ height: height + 44 }}>
        {data.map((d, i) => {
          const h = Math.max(2, (d.value / max) * height);
          return (
            <div key={i} className="flex flex-col items-center gap-1.5 w-11 sm:w-14 shrink-0">
              <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--fx-ink-soft)' }}>
                {format(d.value)}
              </span>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={{ duration: 0.55, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                className="w-full rounded-t-md"
                style={{
                  backgroundImage: d.color
                    ? `linear-gradient(180deg, ${d.color}, ${d.color}55)`
                    : 'linear-gradient(180deg, #E01331, #74081A)',
                  boxShadow: '0 -4px 18px -6px rgba(200,16,46,0.6)',
                }}
              />
              <span
                className="text-[9px] font-bold uppercase tracking-wide text-center leading-tight w-full truncate"
                style={{ color: 'var(--fx-ink-dim)' }}
                title={d.label}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Barres horizontales : idéal pour un classement (top véhicules, top postes). */
export const RankBars: React.FC<{
  data: { label: string; value: number; sub?: string; color?: string }[];
  format?: (v: number) => string;
}> = ({ data, format = v => String(Math.round(v)) }) => {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-xs font-semibold truncate min-w-0" style={{ color: 'var(--fx-ink-soft)' }}>
              {d.label}
              {d.sub && <span className="ml-1.5 opacity-60 font-normal">{d.sub}</span>}
            </span>
            <span className="text-xs font-black tabular-nums shrink-0" style={{ color: 'var(--fx-ink)' }}>
              {format(d.value)}
            </span>
          </div>
          <div className="fx-meter">
            <motion.div
              className="fx-meter-fill"
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              style={d.color ? { backgroundImage: `linear-gradient(90deg, ${d.color}, ${d.color}88)` } : undefined}
            />
          </div>
        </li>
      ))}
    </ul>
  );
};

/** Courbe d'évolution (aire remplie). */
export const LineChart: React.FC<{
  data: { label: string; value: number }[];
  height?: number;
  format?: (v: number) => string;
}> = ({ data, height = 160, format = v => String(Math.round(v)) }) => {
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-xs" style={{ color: 'var(--fx-ink-dim)' }}>
        Pas assez de points pour tracer une courbe.
      </p>
    );
  }

  const W = 600;
  const H = height;
  const pad = 6;
  const max = Math.max(1, ...data.map(d => d.value));
  const stepX = (W - pad * 2) / (data.length - 1);
  const pts = data.map((d, i) => [pad + i * stepX, H - pad - (d.value / max) * (H - pad * 2)] as const);
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${pad},${H - pad} ${line} ${W - pad},${H - pad}`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id="fx-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E01331" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#E01331" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => (
          <line key={f} x1={pad} x2={W - pad} y1={pad + f * (H - pad * 2)} y2={pad + f * (H - pad * 2)}
                stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        <polygon points={area} fill="url(#fx-line-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="#FF4D52"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#08080B" stroke="#FF4D52" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="flex justify-between mt-1.5 gap-1 overflow-hidden">
        {data.map((d, i) => (
          <span key={i} className="text-[9px] font-bold uppercase truncate" style={{ color: 'var(--fx-ink-dim)' }}>
            {d.label}
          </span>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-right" style={{ color: 'var(--fx-ink-dim)' }}>
        max {format(max)}
      </p>
    </div>
  );
};

/** Jauge circulaire d'un pourcentage isolé (taux d'occupation, marge…). */
export const Gauge: React.FC<{
  value: number;
  label: string;
  size?: number;
  tone?: string;
}> = ({ value, label, size = 108, tone = '#E01331' }) => {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="10" />
          <motion.circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={tone} strokeWidth="10" strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${c}` }}
            animate={{ strokeDasharray: `${(pct / 100) * c} ${c}` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 8px ${tone}88)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-black tabular-nums" style={{ color: 'var(--fx-ink)' }}>
            {pct.toFixed(0)}%
          </span>
        </div>
      </div>
      <span className="text-[10px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--fx-ink-mute)' }}>
        {label}
      </span>
    </div>
  );
};
