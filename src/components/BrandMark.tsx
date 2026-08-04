import React, { useEffect, useState } from 'react';

/**
 * Emblème de l'agence sur les surfaces CLAIRES de l'admin (barre latérale, page
 * de connexion).
 *
 * Deux logos coexistent dans `website_settings` (cf. migration
 * 20260712_website_navbar_logo.sql) :
 *
 *   • `logo`        — le wordmark « CAR SALAM », sur fond NOIR OPAQUE, ratio 3:2.
 *                     Il part tel quel dans les documents imprimés.
 *   • `navbar_logo` — l'écusson « CS », sur fond TRANSPARENT, encre quasi carrée.
 *
 * L'écusson est le seul des deux qui tienne dans une pastille : il est carré et
 * détouré. Mais son encre n'occupe que ~34 % de la largeur de son canevas, le
 * reste étant du vide transparent — un `object-contain` naïf le rendrait deux
 * fois trop petit et décentré. On mesure donc la boîte englobante des pixels
 * opaques et on cadre dessus.
 *
 * La mesure est générique : un logo déjà détouré au plus juste donne une boîte
 * égale au canevas, et le rendu retombe sur un `contain` classique. Si l'image
 * est illisible (CORS, 404), on retombe sur l'initiale du nom.
 */

/** Canevas et boîte englobante de l'encre, dans une même unité (px mesurés). */
interface InkBox {
  canvasW: number;
  canvasH: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Une seule mesure par URL, partagée par la sidebar et la page de connexion. */
const inkCache = new Map<string, Promise<InkBox | null>>();

function measureInk(src: string): Promise<InkBox | null> {
  const cached = inkCache.get(src);
  if (cached) return cached;

  const job = new Promise<InkBox | null>((resolve) => {
    const img = new Image();
    // Sans `crossOrigin`, le canvas est « teinté » et getImageData lève.
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      try {
        // On mesure sur une réduction : la précision au pixel près est inutile
        // et scanner 1536×1024 à chaque montage serait gâché.
        const scale = Math.min(1, 200 / Math.max(img.naturalWidth, img.naturalHeight));
        const cw = Math.max(1, Math.round(img.naturalWidth * scale));
        const ch = Math.max(1, Math.round(img.naturalHeight * scale));

        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, cw, ch);

        const { data } = ctx.getImageData(0, 0, cw, ch);
        let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
        for (let y = 0; y < ch; y++) {
          for (let x = 0; x < cw; x++) {
            if (data[(y * cw + x) * 4 + 3] > 24) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        // Image entièrement transparente : rien à cadrer.
        if (x1 < 0) return resolve(null);

        resolve({ canvasW: cw, canvasH: ch, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      } catch {
        // Canvas teinté (bucket sans en-têtes CORS) : pas de mesure possible.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });

  inkCache.set(src, job);
  return job;
}

export const BrandMark: React.FC<{
  /** Emblème préféré (`navbar_logo`). */
  logo?: string;
  /** Repli si aucun emblème n'a été téléversé (`logo`). */
  fallbackLogo?: string;
  name?: string;
  /** Côté de la pastille en px. */
  size?: number;
  className?: string;
}> = ({ logo, fallbackLogo, name, size = 44, className = '' }) => {
  const src = (logo || '').trim() || (fallbackLogo || '').trim();

  const [ink, setInk] = useState<InkBox | null>(null);
  // `imgError` = l'image ne charge même pas en <img> simple (URL cassée / 404).
  // C'est le SEUL cas qui doit retomber sur l'initiale : un canevas « teinté »
  // (bucket sans en-têtes CORS) empêche seulement la MESURE, pas l'affichage.
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setInk(null);
    setImgError(false);
    if (!src) return;

    let alive = true;
    // La mesure peut échouer (CORS) et renvoyer null : on n'en fait pas un échec
    // d'affichage, on retombe simplement sur un rendu « contain » plus bas.
    measureInk(src).then((box) => { if (alive) setInk(box); });
    return () => { alive = false; };
  }, [src]);

  // Pas de logo, ou image réellement illisible : initiale sur le dégradé marque.
  if (!src || imgError) {
    const initial = (name || 'A').trim().charAt(0).toUpperCase() || 'A';
    return (
      <span
        className={`rounded-xl shrink-0 flex items-center justify-center font-black italic text-white bg-linear-to-br from-saas-primary-start to-saas-primary-end ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.45 }}
      >
        {initial}
      </span>
    );
  }

  // Mesure indisponible (en cours, ou canevas teinté par l'absence de CORS) :
  // on affiche quand même le logo en « contain ». Un onError retombe sur
  // l'initiale seulement si l'URL est vraiment cassée.
  if (!ink) {
    return (
      <span className={`shrink-0 block ${className}`} style={{ width: size, height: size }}>
        <img
          src={src}
          alt={name || 'Logo'}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </span>
    );
  }

  // Cadrage sur l'encre. On agrandit le canevas entier du facteur qui fait tenir
  // sa boîte d'encre dans la pastille, puis on décale pour centrer cette boîte.
  // Les dimensions sont posées explicitement : l'aspect du canevas est conservé,
  // donc aucun `object-fit` n'intervient et les décalages restent exacts.
  const k = size / Math.max(ink.w, ink.h);
  const left = size / 2 - (ink.x + ink.w / 2) * k;
  const top = size / 2 - (ink.y + ink.h / 2) * k;

  return (
    <span
      className={`relative overflow-hidden shrink-0 block ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={src}
        alt={name || 'Logo'}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        style={{
          position: 'absolute',
          width: ink.canvasW * k,
          height: ink.canvasH * k,
          left,
          top,
          maxWidth: 'none',
        }}
      />
    </span>
  );
};
