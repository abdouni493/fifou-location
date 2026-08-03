/* Génère src/styles/theme-carbon.css : la peau sombre "Carbone" du back-office. */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src/styles/theme-carbon.css');

// Teintes Tailwind utilisées par l'admin : base (500) + variante lisible sur noir (300).
// MARQUE FIFOU AUTO : les teintes FROIDES (bleu/indigo/ciel/cyan) — l'ancien
// accent de marque — sont réécrites sur le ROUGE du logo, pour que le carbone
// parle la même couleur que le reste. Les signaux fonctionnels (vert, ambre…)
// gardent leur teinte.
const RED = ['#ef4444', '#fca5a5'];
const HUES = {
  red:     RED,
  rose:    ['#f43f5e', '#fda4af'],
  orange:  ['#f97316', '#fdba74'],
  amber:   ['#f59e0b', '#fcd34d'],
  yellow:  ['#eab308', '#fde047'],
  lime:    ['#84cc16', '#bef264'],
  green:   ['#22c55e', '#86efac'],
  emerald: ['#10b981', '#6ee7b7'],
  teal:    ['#14b8a6', '#5eead4'],
  cyan:    RED,   // ex-cyan  → rouge marque
  sky:     RED,   // ex-ciel  → rouge marque
  blue:    RED,   // ex-bleu  → rouge marque
  indigo:  RED,   // ex-indigo → rouge marque
  violet:  ['#8b5cf6', '#c4b5fd'],
  purple:  ['#a855f7', '#d8b4fe'],
  fuchsia: ['#d946ef', '#f0abfc'],
  pink:    ['#ec4899', '#f9a8d4'],
};

const S = 'html[data-admin-theme="carbon"]:not([data-surface="site"])';

const sel = (classes) => classes.map((c) => `${S} ${c}`).join(',\n');
// Échappe le ":" des variantes d'état (hover:, disabled:…) et le "/" des
// variantes d'opacité — mais pas le point initial, qui EST le sélecteur.
const esc = (c) => '.' + c.slice(1).replace(/([:/])/g, '\\$1');

let out = '';
out += `/* ══════════════════════════════════════════════════════════════════════════
   THÈME "CARBONE" — la peau sombre du back-office
   ──────────────────────────────────────────────────────────────────────────
   GÉNÉRÉ par scripts/gen-theme-carbon.cjs — ne pas éditer à la main.

   Le back-office est écrit en clair (bg-white, slate-*, pastilles pastel).
   Plutôt que de retoucher 65 composants, on redéfinit ici ce que valent ces
   utilitaires quand <html data-admin-theme="carbon"> : les surfaces claires
   deviennent les noirs du site public, les textes foncés s'éclaircissent, et
   les pastilles pastel deviennent des teintes translucides de la même couleur.

   Le site public (data-surface="site") est exclu : il porte déjà sa palette.

   Palette : design-system/car_salam/MASTER.md (noir & rouge sang).
   ══════════════════════════════════════════════════════════════════════════ */

/* ── 1. Jetons sémantiques du back-office ──
   Les 1400 classes saas-* du code basculent d'un coup : Tailwind les compile
   en var(--color-saas-*), il suffit de redéfinir les variables. */
${S} {
  --color-saas-bg:              #0E0E11;  /* fond de page + creux dans les cartes */
  --color-saas-surface:         #151519;  /* cartes */
  --color-saas-border:          rgba(255, 255, 255, 0.09);
  --color-saas-text-main:       #F5F6F7;
  --color-saas-text-muted:      #9BA1AB;

  /* Rouge sang. -via est la valeur lisible en TEXTE (5.8:1 sur le noir) ;
     les surfaces pleines la reprennent en profondeur plus bas (§5). */
  --color-saas-primary-start:   #C8102E;
  --color-saas-primary-via:     #FF4D52;
  --color-saas-primary-end:     #8A0A1C;

  --color-saas-secondary-start: #2A2A31;
  --color-saas-secondary-end:   #3A3A44;

  color-scheme: dark;
}

/* ── 2. Surfaces neutres ── */
${sel(['.bg-white', '.glass-card'])} {
  background-color: #151519;
}
${sel(['.bg-slate-50', '.bg-gray-50'])} { background-color: #121216; }
${sel(['.bg-slate-100', '.bg-gray-100'])} { background-color: #1A1A20; }
${sel(['.bg-slate-200', '.bg-gray-200'])} { background-color: #24242B; }

${sel([esc('.hover:bg-white') + ':hover', esc('.hover:bg-slate-50') + ':hover', esc('.hover:bg-gray-50') + ':hover'])} {
  background-color: #1C1C22;
}
${sel([esc('.hover:bg-slate-100') + ':hover', esc('.hover:bg-gray-100') + ':hover', esc('.hover:bg-slate-200') + ':hover'])} {
  background-color: #24242B;
}
${sel([esc('.disabled:bg-slate-100') + ':disabled', esc('.disabled:bg-gray-400') + ':disabled'])} {
  background-color: #24242B;
}

/* Blancs translucides. Au-dessus de 40 % c'est une SURFACE (barre de nav
   floutée, carte de verre) : elle doit noircir. En dessous, c'est un VOILE
   posé sur un dégradé coloré (survol d'un bouton bleu) : on n'y touche pas,
   sinon le survol disparaît. */
${sel([40, 50, 60, 70, 80, 85, 90, 95].map((a) => esc(`.bg-white/${a}`)))} {
  background-color: rgba(21, 21, 25, 0.86);
}

/* bg-slate-700/800/900 restent tels quels : ils étaient déjà sombres. */

/* ── 3. Textes neutres — l'échelle claire s'inverse ── */
${sel(['.text-slate-900', '.text-slate-800', '.text-slate-700', '.text-gray-900', '.text-gray-800', '.text-gray-700'])} {
  color: #F5F6F7;
}
${sel(['.text-slate-600', '.text-gray-600'])} { color: #C7CBD2; }
${sel(['.text-slate-500', '.text-gray-500'])} { color: #9BA1AB; }
${sel(['.text-slate-400', '.text-gray-400'])} { color: #7A808B; }
/* text-slate-300 et plus clair : déjà posés sur des fonds foncés, on n'y touche pas. */

${sel([esc('.hover:text-slate-900') + ':hover', esc('.hover:text-gray-900') + ':hover'])} { color: #FFFFFF; }

/* ── 4. Bordures, anneaux, séparateurs ── */
${sel(['.border-slate-100', '.border-gray-100', '.border-slate-50'])} { border-color: rgba(255, 255, 255, 0.06); }
${sel(['.border-slate-200', '.border-gray-200'])} { border-color: rgba(255, 255, 255, 0.09); }
${sel(['.border-slate-300', '.border-gray-300'])} { border-color: rgba(255, 255, 255, 0.16); }
${sel([esc('.hover:border-slate-300') + ':hover', esc('.hover:border-gray-300') + ':hover'])} {
  border-color: rgba(200, 16, 46, 0.45);
}
${sel(['.divide-slate-100 > :not(:last-child)', '.divide-slate-200 > :not(:last-child)', '.divide-gray-100 > :not(:last-child)', '.divide-gray-200 > :not(:last-child)'])} {
  border-color: rgba(255, 255, 255, 0.07);
}
${sel(['.ring-slate-200', '.ring-gray-200'])} { --tw-ring-color: rgba(255, 255, 255, 0.09); }
`;

// ── 5. Composants ──
out += `
/* ── 5. Classes composants (index.css) ── */
${S} .glass-card {
  border-color: rgba(255, 255, 255, 0.09);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 12px 32px rgba(0, 0, 0, 0.5);
}
${S} .input-saas {
  background-color: #1C1C22;
  border-color: rgba(255, 255, 255, 0.12);
  color: #F5F6F7;
}
${S} .input-saas:focus {
  border-color: #C8102E;
}
/* Le rouge de REMPLISSAGE est plus profond que le rouge de texte : blanc sur
   #C8102E = 5.9:1, blanc sur #FF4D52 ne passerait pas. */
${S} .btn-saas-primary,
${S} .bg-saas-primary-via,
${S} .bg-saas-primary-start {
  background-color: #C8102E;
  background-image: linear-gradient(135deg, #C8102E, #8A0A1C);
  box-shadow: 0 4px 14px rgba(200, 16, 46, 0.30);
}
${S} .btn-saas-primary:hover {
  box-shadow: 0 10px 28px rgba(200, 16, 46, 0.42);
}
${S} .via-saas-primary-via {
  --tw-gradient-via: #C8102E;
}
${S} .btn-saas-outline {
  border-color: rgba(255, 255, 255, 0.16);
}
${S} .btn-saas-outline:hover {
  border-color: rgba(200, 16, 46, 0.45);
  background-color: rgba(200, 16, 46, 0.08);
}
${S} .btn-saas-secondary {
  background-image: linear-gradient(135deg, #2A2A31, #3A3A44);
}

/* Champs natifs : sans cela le navigateur les rend en blanc sur blanc. */
${S} input,
${S} textarea,
${S} select {
  color-scheme: dark;
}
${S} input::placeholder,
${S} textarea::placeholder {
  color: #7A808B;
}
${S} option {
  background-color: #1C1C22;
  color: #F5F6F7;
}

/* Barres de défilement */
${S} ::-webkit-scrollbar-track,
${S} .custom-scrollbar::-webkit-scrollbar-track { background: #0E0E11; }
${S} ::-webkit-scrollbar-thumb,
${S} .custom-scrollbar::-webkit-scrollbar-thumb { background: #2A2A31; }
${S} ::-webkit-scrollbar-thumb:hover,
${S} .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #C8102E; }

/* Le fond de page : body lit --color-saas-bg, mais html[data-surface] gagne. */
html[data-admin-theme="carbon"][data-surface="admin"] body {
  background: #0E0E11;
  color: #F5F6F7;
}
`;

// ── 6. Teintes d'accent ──
out += `
/* ══════════════════════════════════════════════════════════════════════════
   6. PASTILLES ET ACCENTS COLORÉS
   L'admin signale ses états avec le triplet bg-{teinte}-50 / text-{teinte}-700
   / border-{teinte}-200. Sur noir, le pastel éblouit et le texte foncé devient
   illisible : la pastille devient une teinte translucide, le texte s'éclaircit.
   Les remplissages 400→900 (boutons pleins, dégradés à texte blanc) sont
   laissés intacts.
   ══════════════════════════════════════════════════════════════════════════ */
`;

for (const [hue, [base, bright]] of Object.entries(HUES)) {
  const tint = (pct) => `color-mix(in srgb, ${base} ${pct}%, #131318)`;
  const edge = (pct) => `color-mix(in srgb, ${base} ${pct}%, transparent)`;

  out += `
/* ${hue} */
${sel([`.bg-${hue}-50`, `.bg-${hue}-100`])} { background-color: ${tint(14)}; }
${sel([esc(`.hover:bg-${hue}-50`) + ':hover', esc(`.hover:bg-${hue}-100`) + ':hover'])} { background-color: ${tint(22)}; }
${sel([`.from-${hue}-50`, `.from-${hue}-100`])} { --tw-gradient-from: ${tint(14)}; }
${sel([`.to-${hue}-50`, `.to-${hue}-100`])} { --tw-gradient-to: ${tint(14)}; }
${sel([`.border-${hue}-100`])} { border-color: ${edge(24)}; }
${sel([`.border-${hue}-200`])} { border-color: ${edge(38)}; }
${sel([`.border-${hue}-300`])} { border-color: ${edge(52)}; }
${sel([`.ring-${hue}-200`])} { --tw-ring-color: ${edge(38)}; }
${sel([`.text-${hue}-600`, `.text-${hue}-700`, `.text-${hue}-800`, `.text-${hue}-900`])} { color: ${bright}; }
`;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out, 'utf8');
console.log('écrit :', OUT, fs.statSync(OUT).size, 'octets');
