import React, { useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { ImagenSatelital } from '../types/satellite';
import * as L from 'leaflet';

interface SatelliteMapProps {
  activeImage: ImagenSatelital | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  geojson: any;
}

// Subcomponent to handle recentering the map and changing the tile layer correctly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MapController = ({ geojson }: { geojson: any }) => {
  const map = useMap();
  useEffect(() => {
    if (geojson) {
      // Basic bounds calculation for a single polygon or feature
      try {
         const layer = L.geoJSON(geojson);
         map.fitBounds(layer.getBounds(), { padding: [20, 20] });
      } catch (e) {
         console.warn("Could not fit bounds to geojson", e);
      }
    }
  }, [geojson, map]);
  return null;
};

const SatelliteMap: React.FC<SatelliteMapProps> = ({ activeImage, geojson }) => {
  const center: [number, number] = [-34.6037, -58.3816]; // Fallback
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const styleFunction = (feature: any) => {
    if (activeImage) {
      return {
        fillColor: 'transparent',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0
      };
    }
    
    // Default coloration when no image overlays exist
    const gColor = feature?.properties?.Clase_Productiva === 'Muy Alta' ? '#006d2c' :
      feature?.properties?.Clase_Productiva === 'Alta' ? '#31a354' :
      feature?.properties?.Clase_Productiva === 'Media' ? '#74c476' :
      feature?.properties?.Clase_Productiva === 'Baja' ? '#c7e9c0' : '#2E8B57';
      
    return {
      fillColor: gColor,
      color: '#ffffff',
      weight: 2,
      fillOpacity: 0.65
    };
  };

  const geoJsonKey = activeImage ? 'hide-fill' : 'show-fill';

  return (
    <div className="relative w-full h-[380px] bg-[#2a3a2a] overflow-hidden rounded-none border-b border-slate-200">
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, zIndex: 0 }}
        zoomControl={false}
      >
        <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="&copy; Esri"
        />
        
        {/* Render GEE Tile Layer above basemap */}
        {activeImage && activeImage.tile_url && (
          <TileLayer
            key={activeImage.tile_url} // Force re-render when image changes to avoid caching old tiles
            url={activeImage.tile_url}
            zIndex={10}
            opacity={0.8}
          />
        )}

        {geojson && (
          <GeoJSON 
            key={geoJsonKey}
            data={geojson} 
            style={styleFunction} 
          />
        )}
        
        {geojson && <MapController geojson={geojson} />}
      </MapContainer>

      {/* Floating Info Overlays via Absolute Positioning */}
      {activeImage && (
        <>
          {/* Top Left Overlay */}
          <div className="absolute top-3 left-3 bg-black/60 rounded-md p-2.5 flex flex-col gap-1 backdrop-blur-sm shadow-md z-10 pointer-events-none border border-white/10">
            <span className="text-xs text-white/90">{activeImage.fecha}</span>
            <strong className="text-sm text-white font-semibold">Sentinel-2 Harmonizado</strong>
            <span className="text-xs text-white/80">Resolución 10m · Banda B8/B4</span>
          </div>

          {/* Bottom Left Legend */}
          <div className="absolute bottom-3 left-3 bg-black/60 rounded-md p-2.5 flex flex-col gap-1 backdrop-blur-sm shadow-md z-10 pointer-events-none border border-white/10">
            <div className="text-[11px] text-white/80 mb-0.5">Escala ({activeImage.ndvi_min} a {activeImage.ndvi_max})</div>
            <div className="w-32 h-2 rounded-sm bg-gradient-to-r from-[#d73027] via-[#ffffbf] to-[#1a9850]" />
            <div className="flex justify-between w-32 text-[10px] text-white/70">
              <span>Mín</span>
              <span>Med</span>
              <span>Máx</span>
            </div>
          </div>

          {/* Bottom Right Stats */}
          <div className="absolute bottom-3 right-3 bg-black/60 rounded-md py-2 px-3 text-right backdrop-blur-sm shadow-md z-10 pointer-events-none border border-white/10">
            <div className="text-[11px] text-white/80">NDVI promedio del lote</div>
            <div className="text-xl font-semibold text-[#a6d96a]">{activeImage.ndvi_promedio.toFixed(2)}</div>
            <div className="text-[10px] text-white/60">
              Imagen seleccionada
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default SatelliteMap;
