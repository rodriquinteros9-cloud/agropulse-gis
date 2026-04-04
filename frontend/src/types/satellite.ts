export interface ImagenSatelital {
  fecha: string;
  fecha_iso: string;
  nubes_pct: number;
  ndvi_promedio: number;
  ndvi_min: number;
  ndvi_max: number;
  tile_url: string;
  thumbnail_url: string;
}

export type IndiceSatelital = 'NDVI' | 'NDVI_C' | 'EVI' | 'NDRE';
