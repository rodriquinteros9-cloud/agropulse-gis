import ee
import geemap
import pandas as pd
import datetime
import hashlib
import json
import os
from dotenv import load_dotenv

load_dotenv()

EE_PROJECT = os.getenv("EE_PROJECT", "semiotic-joy-468402-d0")

# Inicializar Earth Engine de manera segura
try:
    ee.Initialize(project=EE_PROJECT)
except Exception as e:
    print(f"EE no inicializado o token expirado. Intentando Auth... {e}")
    ee.Authenticate()
    ee.Initialize(project=EE_PROJECT)

# ─── Caché en Memoria con TTL ────────────────────────────────────────────────
# Estructura: { cache_key: {"data": DataFrame, "expires_at": datetime} }
_timeseries_cache: dict = {}
CACHE_TTL_HOURS = 24   # Las entradas viven 24h antes de recalcularse

def _make_cache_key(coords, start_date, end_date, index_name, satellite="Sentinel-2") -> str:
    """Genera una clave única y reproducible para la combinación lote+fechas+índice+satelite."""
    geom_str = json.dumps(coords, sort_keys=True)
    raw = f"{geom_str}|{start_date}|{end_date}|{index_name}|{satellite}"
    return hashlib.md5(raw.encode()).hexdigest()

def _get_from_cache(key: str):
    """Retorna el DataFrame cacheado si existe y no expiró, None en caso contrario."""
    entry = _timeseries_cache.get(key)
    if entry and datetime.datetime.utcnow() < entry["expires_at"]:
        return entry["data"]
    if entry:
        del _timeseries_cache[key]  # Limpiar entrada expirada
    return None

def _save_to_cache(key: str, df: pd.DataFrame):
    """Guarda un DataFrame en el caché con TTL."""
    _timeseries_cache[key] = {
        "data": df,
        "expires_at": datetime.datetime.utcnow() + datetime.timedelta(hours=CACHE_TTL_HOURS)
    }

def invalidate_cache():
    """Limpia todo el caché (útil cuando el usuario sube nuevos lotes)."""
    _timeseries_cache.clear()
    print("[Cache] Caché invalidado correctamente.")

def get_cache_stats() -> dict:
    """Devuelve estadísticas del estado actual del caché."""
    now = datetime.datetime.utcnow()
    active = sum(1 for e in _timeseries_cache.values() if now < e["expires_at"])
    return {"total_entries": len(_timeseries_cache), "active_entries": active}
# ─────────────────────────────────────────────────────────────────────────────

def get_timeseries(poly_geojson, start_date, end_date, index_name="NDVI", satellite="Sentinel-2", use_cache=True):
    """Extrae la serie temporal del índice dado para un polígono.
    
    Args:
        satellite: Sentinel-2, Landsat, MODIS, Mix
        use_cache: Si True (defecto), retorna resultado cacheado si existe.
                   Si False, fuerza recalculo en EE e invalida la entrada anterior.
    """
    # Convertir las coordenadas de 2D a la forma esperada por EE
    coords = poly_geojson['coordinates'][0]

    # ── Verificar caché ANTES de llamar a EE ──────────────────────────────────
    cache_key = _make_cache_key(coords, start_date, end_date, index_name, satellite)
    if use_cache:
        cached = _get_from_cache(cache_key)
        if cached is not None:
            print(f"[Cache] HIT para key={cache_key[:8]}...")
            return cached
    print(f"[Cache] MISS — consultando Earth Engine (key={cache_key[:8]}...)")
    # ─────────────────────────────────────────────────────────────────────────
    
    # Manejar caso de polígonos complejos (multipolygon vs polygon)
    if isinstance(coords[0][0], list):
        # Es un MultiPolygon, tomamos el primer polígono
        coords = coords[0]
        
    roi = ee.Geometry.Polygon(coords)

    # ── Helpers for Harmonization ──
    def prep_sentinel2(img):
        # S2: Blue=B2, Green=B3, Red=B4, NIR=B8
        return img.select(['B2', 'B3', 'B4', 'B8'], ['BLUE', 'GREEN', 'RED', 'NIR']).set('sat', 'S2')
        
    def prep_landsat(img):
        # L8/L9: Blue=SR_B2, Green=SR_B3, Red=SR_B4, NIR=SR_B5
        optical = img.select(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5']).multiply(0.0000275).add(-0.2)
        # Rename them properly
        return optical.rename(['BLUE', 'GREEN', 'RED', 'NIR']) \
            .set('system:time_start', img.get('system:time_start')) \
            .set('sat', 'L89')

    # ── Collections ──
    s2_col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                 .filterBounds(roi)
                 .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
                 .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                 .map(prep_sentinel2))
                 
    l8_col = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                 .filterBounds(roi)
                 .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
                 .filter(ee.Filter.lt('CLOUD_COVER', 20))
                 .map(prep_landsat))
    l9_col = (ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
                 .filterBounds(roi)
                 .filterDate(start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'))
                 .filter(ee.Filter.lt('CLOUD_COVER', 20))
                 .map(prep_landsat))

    # ── Switch based on requested satellite ──
    if satellite == "Sentinel-2":
        collection = s2_col
    elif satellite == "Landsat":
        collection = l8_col.merge(l9_col)
    else:
        # Fallback
        collection = s2_col

    # Mapear función para calcular el índice
    def calculate_index(image):
        if index_name == "NDVI":
            index_img = image.normalizedDifference(['NIR', 'RED']).rename(index_name)
        elif index_name == "EVI":
            # EVI = 2.5 * ((NIR - Red) / (NIR + 6 * Red - 7.5 * Blue + 1))
            nir = image.select('NIR')
            red = image.select('RED')
            blue = image.select('BLUE')
            index_img = image.expression(
                '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1.0))', {
                    'NIR': nir,
                    'RED': red,
                    'BLUE': blue
                }).rename(index_name)
        elif index_name == "GNDVI":
            # GNDVI = (NIR - Green) / (NIR + Green)
            index_img = image.normalizedDifference(['NIR', 'GREEN']).rename(index_name)
        else:
            index_img = image.normalizedDifference(['NIR', 'RED']).rename("NDVI") # fallback
            
        # Añadir banda de fecha
        return image.addBands(index_img).set('system:time_start', image.get('system:time_start'))

    index_collection = collection.map(calculate_index)

    # Si la coleccion está vacía
    if index_collection.size().getInfo() == 0:
        return pd.DataFrame()

    def get_stats(img):
        # scale=20m: ~2x más rápido que 10m con diferencia de NDVI < 0.005 a nivel de lote
        reducer_combined = ee.Reducer.mean().combine(
            reducer2=ee.Reducer.stdDev(),
            sharedInputs=True
        )
        stats_dict = img.select(index_name).reduceRegion(
            reducer=reducer_combined,
            geometry=roi,
            scale=20,
            maxPixels=1e8
        )
        mean_dict = {index_name: stats_dict.get(f"{index_name}_mean")}
        std_dict  = {index_name: stats_dict.get(f"{index_name}_stdDev")}
        return ee.Feature(None, {
            'date': img.date().format('YYYY-MM-dd'),
            'mean': mean_dict.get(index_name),
            'std': std_dict.get(index_name)
        })

    # Mapear reducer
    stats = index_collection.map(get_stats).getInfo()

    # Extraer a pandas DataFrame
    data = []
    for f in stats['features']:
        props = f['properties']
        if props.get('mean') is not None:
            data.append({
                'Fecha': props['date'],
                f'{index_name}_Mean': props['mean'],
                f'{index_name}_Std': props.get('std', 0)
            })

    if not data:
        return pd.DataFrame()
        
    df = pd.DataFrame(data)
    df['Fecha'] = pd.to_datetime(df['Fecha'])
    df = df.sort_values('Fecha')
    
    # Calcular Coeficiente de Variación (CV) = (Std / Mean) * 100
    # Cuidado con medias cercanas a cero
    df['CV_%'] = (df[f'{index_name}_Std'] / df[f'{index_name}_Mean'].clip(lower=0.01)) * 100

    # ── Guardar en caché ────────────────────────────────────────────────────
    _save_to_cache(cache_key, df)
    print(f"[Cache] GUARDADO key={cache_key[:8]}... ({len(df)} filas)")
    # ─────────────────────────────────────────────────────────────────────────
    return df

def get_benchmark_timeseries(gdf_lotes, start_date, end_date, index_name="NDVI", satellite="Sentinel-2"):
    """
    Calcula la serie temporal media para cada lote iterativamente para evitar 
    errores de Timeout (Computation timed out) de Earth Engine en cuentas gratuitas,
    y devuelve un DataFrame multi-linea apto para Benchmarking comparativo.
    """
    if gdf_lotes is None or gdf_lotes.empty:
        return pd.DataFrame()

    try:
        # Reproyectar a WGS84 para Earth Engine
        if gdf_lotes.crs is None or gdf_lotes.crs.to_epsg() != 4326:
            gdf_wgs84 = gdf_lotes.to_crs(epsg=4326)
        else:
            gdf_wgs84 = gdf_lotes

        all_series = []

        def _process_lot(args):
            idx, row = args
            lote_name = row.get('Lote_Name') or row.get('Name') or row.get('LOTE') or str(row.get('temp_id', f'Lote_{idx}'))
            
            # Reutilizar nuestra funcion individual que funciona bien y no genera timeouts
            # Construir el geojson del poligono actual
            geom = row.geometry
            if geom.geom_type == 'Polygon':
                coords = [list(geom.exterior.coords)]
            elif geom.geom_type == 'MultiPolygon':
                coords = [list(p.exterior.coords) for p in geom.geoms]
                coords = coords[0] # Tomar solo el primero para simplificar por ahora
            else:
                return None
                
            poly_geojson = {
                'type': 'Polygon',
                'coordinates': coords
            }
            
            # Llamada síncrona/bloqueante a EE (ideal para hilos)
            df_lote = get_timeseries(poly_geojson, start_date, end_date, index_name, satellite)
            
            if not df_lote.empty:
                # Solo nos importa la media para el benchmark
                df_lote = df_lote[['Fecha', f'{index_name}_Mean']].copy()
                df_lote = df_lote.rename(columns={f'{index_name}_Mean': lote_name})
                
                # Agrupar por Fecha para promediar si Sentinel-2 detectó pasadas duplicadas el mismo día
                df_lote = df_lote.groupby('Fecha', as_index=False).mean()
                
                return df_lote
            return None

        # Procesar todos los lotes concurrentemente
        import concurrent.futures
        args_list = [(idx, row) for idx, row in gdf_wgs84.iterrows()]
        
        # Limitamos los workers a 10 concurrentes para no ahogar los limites gratuitos de EE
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            results = executor.map(_process_lot, args_list)
            
        for res in results:
            if res is not None:
                all_series.append(res)

        if not all_series:
            return pd.DataFrame()

        # Unir todas las series temporales por la columna 'Fecha'
        from functools import reduce
        # Merge de todos los DataFrames usando 'outer' join por Fecha
        df_merged = reduce(lambda left, right: pd.merge(left, right, on='Fecha', how='outer'), all_series)
        
        # Ordenar por fecha cronológicamente
        df_merged = df_merged.sort_values('Fecha')
        
        # El index_name anterior usaba df.pivot_table, aquí lo hacemos seteando la Fecha como index
        df_merged.set_index('Fecha', inplace=True)
        
        # Calcular el promedio global de la zona para el Benchmark
        df_merged['Promedio_Global'] = df_merged.mean(axis=1)
        
        return df_merged
        
    except Exception as e:
        print(f"Error generando benchmark temporal: {e}")
        return pd.DataFrame()
