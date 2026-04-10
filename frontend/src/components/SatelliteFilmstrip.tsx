import React from 'react';
import { Cloud, Map } from 'lucide-react';
import type { ImagenSatelital } from '../types/satellite';

function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(' ');
}

// ─── Filmstrip Card ─────────────────────────────────────────────────────────

interface FilmstripCardProps {
  image: ImagenSatelital;
  isActive: boolean;
  onClick: () => void;
}

const FilmstripCard: React.FC<FilmstripCardProps> = ({ image, isActive, onClick }) => {
  // Compute color based on standard NDVI scale for the bar
  const getNdviColor = (v: number) => {
    if (v < 0.3) return '#d73027';
    if (v < 0.45) return '#fdae61';
    if (v < 0.55) return '#ffffbf';
    if (v < 0.65) return '#d9ef8b';
    if (v < 0.72) return '#a6d96a';
    return '#1a9850';
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "shrink-0 w-20 cursor-pointer rounded-lg border-2 overflow-hidden transition-all duration-150 relative bg-white",
        isActive ? "border-[#639922] shadow-md shadow-cyan-900/10 scale-105 z-10" : "border-slate-200 hover:border-slate-300"
      )}
    >
      <div className="w-full h-[58px] bg-[#2d3d2a] relative overflow-hidden flex items-center justify-center">
        {image.thumbnail_url ? (
          <img src={image.thumbnail_url} alt={image.fecha} className="w-full h-full object-cover opacity-90" />
        ) : (
          <Map size={18} className="text-white/20" />
        )}
      </div>

      <div className="px-1.5 py-1.5 bg-white flex flex-col">
        <span className="text-[11px] font-semibold text-slate-800 leading-none truncate">
          {image.fecha}
        </span>
        <div className="flex items-center gap-1 mt-1 text-slate-500">
          <Cloud size={10} />
          <span className="text-[10px] font-medium">{image.nubes_pct}%</span>
        </div>
        <div
          className="h-1 w-full rounded-sm mt-1.5"
          style={{ backgroundColor: getNdviColor(image.ndvi_promedio) }}
          title={`NDVI Promedio: ${image.ndvi_promedio}`}
        />
      </div>
    </div>
  );
};

// ─── Satellite Filmstrip ────────────────────────────────────────────────────

interface SatelliteFilmstripProps {
  images: ImagenSatelital[];
  activeIndex: number;
  onSelect: (index: number) => void;
  cloudFilterPct: number;
}

const SatelliteFilmstrip: React.FC<SatelliteFilmstripProps> = ({
  images,
  activeIndex,
  onSelect,
  cloudFilterPct
}) => {
  return (
    <div className="bg-white p-3 rounded-b-xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
          Imágenes disponibles — últimos 90 días
        </span>
        <span className="text-xs text-slate-400 font-medium">
          {images.length} imágenes · filtrado &lt;{cloudFilterPct}% nubes
        </span>
      </div>

      {images.length === 0 ? (
        <div className="text-sm text-slate-400 py-4 text-center border-2 border-dashed border-slate-100 rounded-lg">
          No hay imágenes satelitales disponibles con este índice y nubosidad para el rango de fechas actual.
        </div>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto pb-3 pt-1 px-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {images.map((img, idx) => (
            <FilmstripCard
              key={img.fecha_iso + idx}
              image={img}
              isActive={idx === activeIndex}
              onClick={() => onSelect(idx)}
            />
          ))}
          {/* spacer at end for smooth scrolling */}
          <div className="shrink-0 w-2" />
        </div>
      )}
    </div>
  );
};

export default SatelliteFilmstrip;
