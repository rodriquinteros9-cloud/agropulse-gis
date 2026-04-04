import ee
import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Any
from services.ee_service import ensure_ee_initialized

router = APIRouter()

class GeometriaLote(BaseModel):
    id: str       # Make sure it matches what the frontend occasionally sends, usually we only need the coords
    name: Optional[str] = None
    tipo: Optional[str] = "Polygon"
    coordinates: List[Any]
    area_ha: Optional[float] = None
    center_lat: Optional[float] = None
    center_lon: Optional[float] = None

class SatelliteImageryRequest(BaseModel):
    geometry: GeometriaLote
    fecha_inicio: datetime.date
    fecha_fin: datetime.date
    max_nubes: int = 25
    indice: str = "NDVI" # NDVI, NDVI_C, EVI, NDRE

@router.post("/lote/imagenes-ndvi")
async def get_lote_satellite_images(req: SatelliteImageryRequest):
    """
    Returns a list of Sentinel-2 images that overlap the geometry within the given dates,
    filtered by cloud percentage, calculating the requested index over the geometry.
    It returns tile URLs and thumbnails from Earth Engine.
    """
    try:
        ensure_ee_initialized()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        # Handle Polygon vs MultiPolygon geometries properly to avoid empty clips/bounds
        if req.geometry.tipo == "MultiPolygon":
            polygon = ee.Geometry.MultiPolygon(req.geometry.coordinates)
        else:
            polygon = ee.Geometry.Polygon(req.geometry.coordinates)
        
        # Parse Dates
        start_date = req.fecha_inicio.strftime('%Y-%m-%d')
        end_date = req.fecha_fin.strftime('%Y-%m-%d')
        
        # Load Collection
        collection = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
            .filterBounds(polygon)
            .filterDate(start_date, end_date)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', req.max_nubes)))
        
        col_list = collection.toList(50) 
        size = col_list.size().getInfo()
        
        if size == 0:
            return {"status": "success", "imagenes": []}
            
        palette = ['d73027', 'f46d43', 'fdae61', 'ffffbf', 'd9ef8b', 'a6d96a', '1a9850']
        results = []
        
        for i in range(size):
            img = ee.Image(col_list.get(i))
            
            # Metadata
            fecha_iso = ee.Date(img.get('system:time_start')).format("YYYY-MM-dd'T'HH:mm:ss").getInfo()
            fecha_obj = datetime.datetime.strptime(fecha_iso, "%Y-%m-%dT%H:%M:%S")
            # Create a label string like '03 oct 2024' manually here, or let frontend format it.
            # Frontend wants: "fecha", "fecha_iso", "nubes_pct".
            meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
            fecha_str = f"{fecha_obj.day} {meses[fecha_obj.month - 1]}"
            if fecha_obj.year != datetime.datetime.now().year:
                fecha_str += f" {fecha_obj.year}"
            
            nubes_pct = img.get('CLOUDY_PIXEL_PERCENTAGE').getInfo() or 0
            
            # Calculate Index
            indice_str = req.indice.upper()
            if indice_str in ["NDVI", "NDVI_C"]:
                img_idx = img.normalizedDifference(['B8', 'B4']).rename('INDEX')
            elif indice_str == "EVI":
                img_idx = img.expression(
                    '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
                        'NIR': img.select('B8'),
                        'RED': img.select('B4'),
                        'BLUE': img.select('B2')
                    }
                ).rename('INDEX')
            elif indice_str == "NDRE":
                img_idx = img.normalizedDifference(['B8', 'B5']).rename('INDEX')
            else:
                img_idx = img.normalizedDifference(['B8', 'B4']).rename('INDEX')

            # Clip
            img_clipped = img_idx.clip(polygon)
            
            # Stats (mean, min, max)
            reducer = ee.Reducer.mean().combine(
              reducer2=ee.Reducer.min(),
              sharedInputs=True
            ).combine(
              reducer2=ee.Reducer.max(),
              sharedInputs=True
            )
            
            # For 10m scale
            stats = img_clipped.reduceRegion(
                reducer=reducer,
                geometry=polygon,
                scale=10,
                maxPixels=1e9
            ).getInfo()
            
            # Stats fallbacks
            try:
                ndvi_promedio = float(stats.get('INDEX_mean', 0) or 0)
                ndvi_min = float(stats.get('INDEX_min', 0) or 0)
                ndvi_max = float(stats.get('INDEX_max', 0) or 0)
            except (ValueError, TypeError):
                ndvi_promedio = 0.0
                ndvi_min = 0.0
                ndvi_max = 0.0
                
            # Create Maps visualization
            # If standard NDVI, use fixed scale. If contrast, use intralot min/max.
            # EVI / NDRE could have their own typical scales, but we'll use same logic for now.
            if indice_str == "NDVI_C":
                vis_min = ndvi_min
                vis_max = ndvi_max
            elif indice_str == "NDVI":
                vis_min = -0.2
                vis_max = 0.9
            elif indice_str == "EVI":
                vis_min = 0.0
                vis_max = 1.0
            elif indice_str == "NDRE":
                vis_min = 0.0
                vis_max = 0.6
            else:
                vis_min = -0.2
                vis_max = 0.9

            # Keep extremes from merging into a single color if uniform:
            if vis_max <= vis_min:
                vis_max = vis_min + 0.1

            vis_params = {
                'min': vis_min,
                'max': vis_max,
                'palette': palette
            }

            map_id_dict = img_clipped.getMapId(vis_params)
            tile_url = map_id_dict['tile_fetcher'].url_format
            
            # Thumb URL
            try:
                # bounding box
                bbox = polygon.bounds()
                thumb_url = img_clipped.getThumbURL({
                    'min': vis_min, 'max': vis_max, 'palette': palette,
                    'dimensions': '80x58',
                    'region': bbox,
                    'format': 'png'
                })
            except Exception:
                thumb_url = ""

            results.append({
                "fecha": fecha_str,
                "fecha_iso": fecha_iso,
                "nubes_pct": round(nubes_pct, 1),
                "ndvi_promedio": round(ndvi_promedio, 2),
                "ndvi_min": round(ndvi_min, 2),
                "ndvi_max": round(ndvi_max, 2),
                "tile_url": tile_url,
                "thumbnail_url": thumb_url
            })
            
        # Reverse list so newest is first 
        results = sorted(results, key=lambda x: x['fecha_iso'], reverse=True)
            
        return {"status": "success", "imagenes": results}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=503, detail=f"Error validando contra Earth Engine: {str(e)}")
