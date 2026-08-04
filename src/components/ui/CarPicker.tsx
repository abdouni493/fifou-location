import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Search, Check, X, Car as CarIcon } from 'lucide-react';
import { Car, Language } from '../../types';

/**
 * Sélecteur de véhicule avec RECHERCHE.
 *
 * Une liste déroulante native devient inutilisable passé une quinzaine de
 * voitures : on cherche par marque, modèle, immatriculation ou n° de châssis,
 * et le résultat s'affiche avec la vignette du véhicule pour lever tout doute
 * entre deux modèles identiques.
 *
 * Fermeture au clic extérieur et à Échap ; navigation clavier à la flèche.
 */
export const CarPicker: React.FC<{
  cars: Car[];
  value: string;
  onChange: (carId: string, car: Car | null) => void;
  lang?: Language;
  placeholder?: string;
  required?: boolean;
}> = ({ cars, value, onChange, lang = 'fr', placeholder, required }) => {
  const fr = lang === 'fr';
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => cars.find(c => c.id === value) ?? null, [cars, value]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cars.slice(0, 60);
    return cars
      .filter(c =>
        `${c.brand} ${c.model} ${c.registration} ${c.vin ?? ''} ${c.year ?? ''}`.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [cars, query]);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (car: Car) => {
    onChange(car.id, car);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" ref={boxRef}>
      {/* Champ fermé : montre le véhicule choisi */}
      {!open && (
        <button
          type="button"
          onClick={() => { setOpen(true); setHighlight(0); }}
          className="fx-field w-full flex items-center gap-3 text-left"
          style={{ borderColor: selected ? 'var(--fx-line-red)' : undefined }}
        >
          {selected?.images?.[0] ? (
            <img src={selected.images[0]} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0" />
          ) : (
            <span
              className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
              style={{ backgroundImage: 'var(--fx-grad-well)', border: '1px solid var(--fx-line)' }}
            >
              <CarIcon size={16} style={{ color: 'var(--fx-ink-dim)' }} />
            </span>
          )}
          <span className="min-w-0 flex-1">
            {selected ? (
              <>
                <span className="block text-sm font-bold truncate" style={{ color: 'var(--fx-ink)' }}>
                  {selected.brand} {selected.model}
                </span>
                <span className="block text-[11px] truncate" style={{ color: 'var(--fx-ink-mute)' }}>
                  {selected.registration}
                  {selected.year ? ` · ${selected.year}` : ''}
                </span>
              </>
            ) : (
              <span className="text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
                {placeholder ?? (fr ? 'Rechercher un véhicule…' : 'ابحث عن مركبة…')}
                {required && <span style={{ color: 'var(--fx-red-300)' }}> *</span>}
              </span>
            )}
          </span>
          <Search size={15} className="shrink-0" style={{ color: 'var(--fx-ink-dim)' }} />
        </button>
      )}

      {/* Champ ouvert : la recherche */}
      {open && (
        <div className="relative">
          <Search
            size={15}
            className="absolute ltr:left-3.5 rtl:right-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--fx-red-300)' }}
          />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlight(0); }}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
              if (e.key === 'Enter' && results[highlight]) { e.preventDefault(); pick(results[highlight]); }
            }}
            placeholder={fr ? 'Marque, modèle, immatriculation, châssis…' : 'العلامة، الطراز، اللوحة…'}
            className="fx-field w-full ltr:pl-10 rtl:pr-10 ltr:pr-10 rtl:pl-10"
          />
          <button
            type="button"
            onClick={() => { setOpen(false); setQuery(''); }}
            aria-label={fr ? 'Fermer' : 'إغلاق'}
            className="absolute ltr:right-2 rtl:left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md hover:bg-white/10"
            style={{ color: 'var(--fx-ink-dim)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Résultats */}
      {open && (
        <ul
          className="absolute z-50 mt-1.5 w-full max-h-72 overflow-y-auto custom-scrollbar rounded-xl p-1.5"
          style={{
            backgroundImage: 'var(--fx-grad-surface)',
            border: '1px solid var(--fx-line-strong)',
            boxShadow: 'var(--fx-shadow-lg)',
          }}
          role="listbox"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm" style={{ color: 'var(--fx-ink-dim)' }}>
              {fr ? 'Aucun véhicule trouvé.' : 'لم يتم العثور على مركبة.'}
            </li>
          )}
          {results.map((car, i) => {
            const active = i === highlight;
            const chosen = car.id === value;
            return (
              <li key={car.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={chosen}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => pick(car)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors"
                  style={{
                    backgroundImage: active ? 'var(--fx-grad-red-veil)' : undefined,
                    border: `1px solid ${active ? 'var(--fx-line-red)' : 'transparent'}`,
                  }}
                >
                  {car.images?.[0] ? (
                    <img src={car.images[0]} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <span
                      className="w-10 h-10 rounded-lg shrink-0 flex items-center justify-center"
                      style={{ backgroundImage: 'var(--fx-grad-well)' }}
                    >
                      <CarIcon size={16} style={{ color: 'var(--fx-ink-dim)' }} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold truncate" style={{ color: 'var(--fx-ink)' }}>
                      {car.brand} {car.model}
                    </span>
                    <span className="block text-[11px] truncate" style={{ color: 'var(--fx-ink-mute)' }}>
                      {car.registration}
                      {car.year ? ` · ${car.year}` : ''}
                      {car.mileage ? ` · ${car.mileage.toLocaleString('fr-FR')} km` : ''}
                    </span>
                  </span>
                  {chosen && <Check size={15} className="shrink-0" style={{ color: 'var(--fx-red-300)' }} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
