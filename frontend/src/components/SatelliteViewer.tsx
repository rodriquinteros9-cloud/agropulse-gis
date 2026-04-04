import React, { useState, useEffect } from 'react';
import type { ImagenSatelital, IndiceSatelital } from '../types/satellite';
import SatelliteTopbar from './SatelliteTopbar';
import SatelliteMap from './SatelliteMap';
import SatelliteFilmstrip from './SatelliteFilmstrip';
import { Loader2, AlertTriangle } from 'lucide-react';

interface SatelliteViewerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeLot: any; // geojson feature
}

const SatelliteViewer: React.FC<SatelliteViewerProps> = ({ activeLot }) => {
  const [images, setImages] = useState<ImagenSatelital[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [selectedIndex, setSelectedIndex] = useState<IndiceSatelital>('NDVI');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Cloud filter percentage (fixed per instructions or could be state)
  const cloudFilterPct = 25;

  const fetchImages = async () => {
    if (!activeLot) return;
    setLoading(true);
    setError(null);
    setImages([]);
    setActiveIndex(0);

    try {
      // Setup payload: trailing 180 days to avoid empty results during cloudy seasons
      const dFin = new Date();
      const dIni = new Date();
      dIni.setDate(dIni.getDate() - 180);

      const payload = {
        geometry: {
          id: activeLot.properties?.temp_id || "temp",
          name: activeLot.properties?.Lote_Name || "Lote",
          tipo: activeLot.geometry.type || "Polygon",
          area_ha: activeLot.properties?.Area_ha || 0,
          center_lat: activeLot.properties?.centroide_lat || 0,
          center_lon: activeLot.properties?.centroide_lon || 0,
          coordinates: activeLot.geometry.coordinates
        },
        fecha_inicio: dIni.toISOString().split('T')[0],
        fecha_fin: dFin.toISOString().split('T')[0],
        max_nubes: cloudFilterPct,
        indice: selectedIndex
      };

      const resp = await fetch('http://127.0.0.1:8000/api/lote/imagenes-ndvi', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.detail || "Error al obtener imágenes satelitales");
      }

      const data = await resp.json();
      if (data.status === 'success') {
        setImages(data.imagenes || []);
      } else {
        throw new Error("Error procesando cálculo en Earth Engine");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLot?.properties?.temp_id, selectedIndex]);

  const activeImage = images.length > 0 && activeIndex < images.length ? images[activeIndex] : null;

  return (
    <div className="flex flex-col bg-slate-50 border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
      <SatelliteTopbar
        lotName={activeLot?.properties?.Lote_Name || 'Seleccioná un lote'}
        lotArea={activeLot?.properties?.Area_ha || 0}
        selectedIdx={selectedIndex}
        onChangeIdx={setSelectedIndex}
        cloudFilterPct={cloudFilterPct}
      />

      <div className="relative w-full h-[380px] bg-[#2a3a2a]">
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
            <Loader2 size={40} className="text-white animate-spin mb-4" />
            <span className="text-white font-medium">Buscando imágenes en Earth Engine...</span>
            <span className="text-white/70 text-sm mt-1">Calculando índice interactivo</span>
          </div>
        )}

        {error && !loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-900/80 p-6 text-center">
            <AlertTriangle size={48} className="text-red-400 mb-3" />
            <strong className="text-white text-lg">Error satelital</strong>
            <p className="text-red-200 mt-2 max-w-sm">{error}</p>
            <button onClick={fetchImages} className="mt-4 px-4 py-2 border border-white/20 rounded-md text-white hover:bg-white/10 transition">
              Reintentar
            </button>
          </div>
        )}

        <SatelliteMap
          activeImage={activeImage}
          geojson={activeLot || null}
        />
      </div>

      <SatelliteFilmstrip
        images={images}
        activeIndex={activeIndex}
        onSelect={setActiveIndex}
        cloudFilterPct={cloudFilterPct}
      />
    </div>
  );
};

export default SatelliteViewer;
