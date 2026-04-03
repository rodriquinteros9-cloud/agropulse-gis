import ee
import pandas as pd
import datetime
import hashlib
import json
import os
import time
import requests
import numpy as np
from io import BytesIO
from dotenv import load_dotenv
import xml.etree.ElementTree as ET

load_dotenv()

EE_PROJECT = os.getenv("EE_PROJECT", "semiotic-joy-468402-d0")

_EE_INITIALIZED = False

def ensure_ee_initialized():
    global _EE_INITIALIZED
    if _EE_INITIALIZED:
        return
    try:
        ee.Initialize(project=EE_PROJECT)
        _EE_INITIALIZED = True
        return
    except Exception as e:
        raise RuntimeError(
            "Earth Engine no está inicializado. Configure credenciales (EE) en este entorno. "
            f"Detalle: {e}"
        )

# ─── Configuración SEPA INTA ───────────────────────────────────────────────────
SEPA_WMS_URL = "https://geo.inta.gob.ar/geoserver/wms"
SEPA_WFS_URL = "https://geo.inta.gob.ar/geoserver/wfs"
SEPA_CRS = "EPSG:4326"
SEPA_REQUEST_TIMEOUT_SEC = float(os.getenv("SEPA_REQUEST_TIMEOUT_SEC", "8"))
SEPA_MAX_POLYGON_SECONDS = float(os.getenv("SEPA_MAX_POLYGON_SECONDS", "10"))
SEPA_MAX_POINTS_PER_POLYGON = int(os.getenv("SEPA_MAX_POINTS_PER_POLYGON", "5"))
SEPA_TRY_MULTIPLE_FORMATS = os.getenv("SEPA_TRY_MULTIPLE_FORMATS", "false").strip().lower() in ("1", "true", "yes", "y", "on")
SEPA_DISCOVER_LAYERS = os.getenv("SEPA_DISCOVER_LAYERS", "false").strip().lower() in ("1", "true", "yes", "y", "on")

# Modo simulación para desarrollo/pruebas
SEPA_SIMULATION_MODE = os.getenv("SEPA_SIMULATION_MODE", "false").strip().lower() in ("1", "true", "yes", "y", "on")

# Capas de agua disponible (prioridad en orden de preferencia)
SEPA_WATER_LAYERS = [
    "sepa:agua_disponible_2m",
    "sepa:agua_disponible_ad_10d", 
    "sepa:ad_10d",
    "sepa:agua_disponible",
    "INTA:agua_disponible_2m",
    "geointa:agua_disponible"
]

def discover_sepa_layers():
    """
    Descubre automáticamente las capas disponibles de SEPA INTA
    relacionadas con agua disponible en suelo.
    """
    try:
        # Consultar capabilities del WMS
        params = {
            'SERVICE': 'WMS',
            'VERSION': '1.3.0',
            'REQUEST': 'GetCapabilities'
        }
        
        response = requests.get(SEPA_WMS_URL, params=params, timeout=30)
        response.raise_for_status()
        
        # Parsear XML para encontrar capas
        root = ET.fromstring(response.content)
        
        available_layers = []
        for layer in root.findall('.//{http://www.opengis.net/wms}Layer'):
            name_elem = layer.find('{http://www.opengis.net/wms}Name')
            title_elem = layer.find('{http://www.opengis.net/wms}Title')
            
            if name_elem is not None:
                layer_name = name_elem.text
                layer_title = title_elem.text if title_elem is not None else ""
                
                # Buscar capas relacionadas con agua
                if any(keyword in layer_name.lower() or keyword in layer_title.lower() 
                      for keyword in ['agua', 'water', 'ad_', 'disponible', 'available']):
                    available_layers.append({
                        'name': layer_name,
                        'title': layer_title
                    })
        
        print(f"Capas SEPA descubiertas: {[l['name'] for l in available_layers]}")
        return available_layers
        
    except Exception as e:
        print(f"Error descubriendo capas SEPA: {e}")
        return []

 # Intentar descubrir capas al importar el módulo (opt-in)
_discovered_layers = discover_sepa_layers() if SEPA_DISCOVER_LAYERS and not SEPA_SIMULATION_MODE else []
if _discovered_layers:
    # Usar la primera capa descubierta que coincida con agua disponible
    for layer_info in _discovered_layers:
        if any(keyword in layer_info['name'].lower() 
               for keyword in ['agua', 'ad_', 'disponible']):
            SEPA_WATER_AVAILABLE_LAYER = layer_info['name']
            break
    else:
        SEPA_WATER_AVAILABLE_LAYER = _discovered_layers[0]['name']
else:
    # Fallback a capa por defecto
    SEPA_WATER_AVAILABLE_LAYER = "sepa:agua_disponible_2m"

def _get_sepa_query_date() -> str:
    return datetime.datetime.utcnow().date().isoformat()

def _get_sepa_source_meta() -> dict:
    return {
        'metodologia': 'SEPA INTA - Agua Disponible hasta 2 metros',
        'institucion': 'Instituto Nacional de Tecnología Agropecuaria (INTA)',
        'servicio': 'SEPA - Seguimiento de la Producción Agropecuaria',
        'url': 'https://sepa.inta.gob.ar/productos/agua_en_suelo/ad/',
        'fecha_consulta_utc': _get_sepa_query_date(),
        'descripcion': 'Balance hídrico del suelo basado en modelos INTA validados para Argentina'
    }

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
    """Retorna el objeto cacheado si existe y no expiró, None en caso contrario."""
    entry = _timeseries_cache.get(key)
    if entry and datetime.datetime.utcnow() < entry["expires_at"]:
        return entry["data"]
    if entry:
        del _timeseries_cache[key]  # Limpiar entrada expirada
    return None

def _save_to_cache(key: str, data):
    """Guarda un objeto en el caché con TTL."""
    _timeseries_cache[key] = {
        "data": data,
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

def get_timeseries(poly_geojson, start_date, end_date, index_name="NDVI", satellite="Sentinel-2", use_cache=True):
    """Extrae la serie temporal del índice dado para un polígono.
    
    Args:
        satellite: Sentinel-2, Landsat, MODIS, Mix
        use_cache: Si True (defecto), retorna resultado cacheado si existe.
                   Si False, fuerza recalculo en EE e invalida la entrada anterior.
    """
    ensure_ee_initialized()
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
    ensure_ee_initialized()
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
        
        # Limitamos los workers a 3 concurrentes para no ahogar los limites gratuitos de EE
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
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

def get_soc_evolution(gdf, years_back=2):
    """Calcula la media anual de NDVI (Proxy de COS) para los últimos N años."""
    ensure_ee_initialized()
    if gdf is None or gdf.empty:
        return {}
    
    try:
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf_wgs84 = gdf.to_crs(epsg=4326)
        else:
            gdf_wgs84 = gdf
            
        if 'Lote_Name' not in gdf_wgs84.columns:
            gdf_wgs84['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf_wgs84))]
            
        fc = ee.FeatureCollection([
            ee.Feature(row.geometry.__geo_interface__, {'Lote_Name': row.get('Lote_Name')})
            for _, row in gdf_wgs84.iterrows()
        ])
        
        current_year = datetime.datetime.today().year
        years = list(range(current_year - years_back, current_year + 1))
        
        result_dict = {str(lote): [] for lote in gdf_wgs84['Lote_Name']}
        
        for y in years:
            start_date = f'{y}-01-01'
            end_date = f'{y}-12-31'
            
            s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED') \
                .filterBounds(fc) \
                .filterDate(start_date, end_date) \
                .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                
            def cal_ndvi(image):
                return image.normalizedDifference(['B8', 'B4']).rename('NDVI')
                
            s2_ndvi = s2.map(cal_ndvi)
            
            if s2_ndvi.size().getInfo() == 0:
                for lote in result_dict:
                    result_dict[lote].append(0.0)
                continue
                
            mean_img = s2_ndvi.mean()
            
            stats = mean_img.reduceRegions(
                collection=fc,
                reducer=ee.Reducer.mean(),
                scale=20
            ).getInfo()
            
            for feat in stats['features']:
                lote_name = str(feat['properties'].get('Lote_Name'))
                val = feat['properties'].get('mean', 0.0)
                if val is None: val = 0.0
                if lote_name in result_dict:
                    result_dict[lote_name].append(round(val * 100, 2))
                    
        return result_dict
    except Exception as e:
        print(f"Error calculando Evolución COS: {e}")
        return {}

def get_water_availability_sepa(gdf, depth_mm=2000):
    """
    Calcula el Agua Disponible hasta 2 metros usando la metodología oficial de SEPA INTA.
    
    Utiliza los geoservicios WMS/WFS de INTA Digital Geo para obtener datos
    oficiales de agua disponible en el suelo validados para Argentina.
    """
    if gdf is None or gdf.empty:
        return {}
    
    try:
        # Asegurar CRS WGS84
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf_wgs84 = gdf.to_crs(epsg=4326)
        else:
            gdf_wgs84 = gdf.copy()
            
        # Asegurar nombres de lote
        if 'Lote_Name' not in gdf_wgs84.columns:
            gdf_wgs84['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf_wgs84))]
        
        result_dict = {}
        
        # Para cada polígono, obtener el valor de agua disponible de SEPA
        for idx, row in gdf_wgs84.iterrows():
            lote_name = str(row.get('Lote_Name', f'Lote_{idx+1}'))
            geom = row.geometry

            water_value = _get_sepa_water_value_for_polygon(geom)
            result_dict[lote_name] = water_value
        
        # Agregar información de fuente
        result_dict['_fuente'] = _get_sepa_source_meta()
            
        return result_dict
        
    except Exception as e:
        print(f"Error calculando Agua Disponible (SEPA): {e}")
        # En caso de error, retornar valores por defecto conservadores
        return {str(row.get('Lote_Name', f'Lote_{i+1}')): 0.0 
                for i, row in gdf.iterrows()}

def _get_sepa_water_value(lon, lat):
    """
    Obtiene el valor de agua disponible en mm para un punto específico
    utilizando los servicios WMS de SEPA INTA.
    
    Intenta múltiples capas y formatos para maximizar la probabilidad
    de obtener datos válidos.
    
    Args:
        lon: Longitud en grados decimales
        lat: Latitud en grados decimales
    
    Returns:
        float: Valor de agua disponible en mm
    """
    # Si está en modo simulación, generar valores realistas
    if SEPA_SIMULATION_MODE:
        return _simulate_sepa_water_value(lon, lat)
    
    # Lista de capas a intentar en orden de preferencia
    if _discovered_layers:
        layers_to_try = _discovered_layers
    else:
        # Fallback robusto: intentar todas las capas conocidas (en orden de prioridad)
        # en lugar de una sola capa fija.
        layers_to_try = [{'name': layer_name} for layer_name in SEPA_WATER_LAYERS]
    
    # Formatos a intentar (por defecto solo JSON por viabilidad)
    info_formats = ['application/json']
    if SEPA_TRY_MULTIPLE_FORMATS:
        info_formats = ['application/json', 'text/plain', 'application/vnd.ogc.gml']
    
    for layer_info in layers_to_try:
        layer_name = layer_info['name']
        
        for info_format in info_formats:
            try:
                # Parámetros para consulta WMS GetFeatureInfo
                params = {
                    'SERVICE': 'WMS',
                    'VERSION': '1.1.1',
                    'REQUEST': 'GetFeatureInfo',
                    'LAYERS': layer_name,
                    'QUERY_LAYERS': layer_name,
                    'INFO_FORMAT': info_format,
                    'FEATURE_COUNT': '1',
                    'X': '50',  # Centro del pixel
                    'Y': '50',  # Centro del pixel
                    'WIDTH': '101',
                    'HEIGHT': '101',
                    'BBOX': f'{lon-0.01},{lat-0.01},{lon+0.01},{lat+0.01}',
                    'SRS': SEPA_CRS,
                    'TIME': (datetime.date.today().replace(day=1) - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
                }
                
                # Realizar consulta WMS
                response = requests.get(SEPA_WMS_URL, params=params, timeout=SEPA_REQUEST_TIMEOUT_SEC)
                response.raise_for_status()
                
                # Procesar respuesta según formato
                water_value = _parse_sepa_response(response.content, info_format)
                
                if water_value is not None and water_value > 0:
                    print(f"Valor SEPA obtenido: {water_value}mm (capa: {layer_name}, formato: {info_format})")
                    return water_value
                    
            except Exception as e:
                print(f"Intento fallido para capa {layer_name} formato {info_format}: {e}")
                continue
    
    # Si todo falla, retornar valor conservador
    print(f"No se pudieron obtener datos SEPA para ({lon}, {lat})")
    return 0.0

def _get_sepa_water_value_for_polygon(geom, n_samples: int = 4) -> float:
    """Obtiene AU para un polígono muestreando varios puntos internos y usando mediana.

    Esto es más robusto que usar sólo el centroide (evita bordes, pixeles anómalos).
    """
    try:
        if geom is None or geom.is_empty:
            return 0.0

        t0 = time.perf_counter()

        # Siempre intentar un punto representativo primero (rápido)
        centroid = geom.representative_point()
        values = []
        v0 = _get_sepa_water_value(centroid.x, centroid.y)
        if v0 and v0 > 0:
            values.append(v0)

        # Muestrear puntos adicionales dentro del polígono (capado por tiempo)
        minx, miny, maxx, maxy = geom.bounds
        if not np.isfinite([minx, miny, maxx, maxy]).all():
            return float(np.median(values)) if values else 0.0

        from shapely.geometry import Point
        rng = np.random.default_rng(42)
        attempts = 0
        target_n = max(1, min(int(n_samples), SEPA_MAX_POINTS_PER_POLYGON))
        while len(values) < target_n and attempts < target_n * 10:
            if (time.perf_counter() - t0) > SEPA_MAX_POLYGON_SECONDS:
                break
            attempts += 1
            x = float(rng.uniform(minx, maxx))
            y = float(rng.uniform(miny, maxy))
            try:
                pt = Point(x, y)
                inside = geom.contains(pt)
            except Exception:
                inside = True
            if not inside:
                continue

            vv = _get_sepa_water_value(x, y)
            if vv and vv > 0:
                values.append(vv)

        if not values:
            return 0.0
        return float(np.median(values))
    except Exception as e:
        print(f"Error calculando AU polígono SEPA: {e}")
        try:
            c = geom.representative_point()
            return float(_get_sepa_water_value(c.x, c.y))
        except Exception:
            return 0.0

def _simulate_sepa_water_value(lon, lat):
    """
    Genera valores simulados realistas de agua disponible según la ubicación.
    Utiliza patrones basados en zonas agropecuarias de Argentina.
    
    Args:
        lon: Longitud en grados decimales
        lat: Latitud en grados decimales
    
    Returns:
        float: Valor simulado de agua disponible en mm
    """
    import random
    
    # Base aleatoria para variabilidad
    base_value = random.uniform(40, 120)
    
    # Ajustes según región (valores típicos para Argentina)
    # Zona Núcleo (Buenos Aires, Santa Fe, Córdoba) - valores más altos
    if (-64 <= lon <= -58) and (-34 <= lat <= -30):
        base_value *= 1.3
    # Zona semiárida (oeste) - valores más bajos  
    elif (-68 <= lon <= -64) and (-34 <= lat <= -30):
        base_value *= 0.7
    # Zona subtropical (noreste) - valores variables
    elif (-58 <= lon <= -54) and (-28 <= lat <= -24):
        base_value *= 1.1
    # Patagonia - valores bajos
    elif (-72 <= lon <= -68) and (-55 <= lat <= -40):
        base_value *= 0.4
    
    # Redondear a valores realistas
    water_value = round(base_value, 1)
    
    print(f"Valor SEPA simulado: {water_value}mm para ({lon}, {lat})")
    return water_value

def _parse_sepa_response(content, info_format):
    """
    Parsea la respuesta de SEPA según el formato y extrae el valor numérico.
    
    Args:
        content: Contenido de la respuesta
        info_format: Formato de la respuesta
    
    Returns:
        float: Valor de agua disponible o None si no se puede extraer
    """
    try:
        if info_format == 'application/json':
            data = json.loads(content)
            
            if 'features' in data and len(data['features']) > 0:
                feature = data['features'][0]
                properties = feature.get('properties', {})
                
                # Buscar campo con agua disponible (nombres posibles)
                water_fields = ['agua_disponible', 'water_available', 'valor', 'value', 'agua_mm', 
                               'ad', 'agua', 'disponible', 'mm', 'water']
                for field in water_fields:
                    if field in properties:
                        val = properties[field]
                        if isinstance(val, (int, float)) and not isinstance(val, bool):
                            return float(val)
                
                # Si no encuentra campos específicos, usar primer valor numérico
                for value in properties.values():
                    if isinstance(value, (int, float)) and not isinstance(value, bool):
                        return float(value)
        
        elif info_format == 'text/plain':
            # Para respuestas en texto plano, buscar números
            text = content.decode('utf-8')
            numbers = [float(x) for x in text.split() if x.replace('.', '').isdigit()]
            if numbers:
                return numbers[0]
        
        elif info_format == 'application/vnd.ogc.gml':
            # Para respuestas GML, parsear XML
            root = ET.fromstring(content)
            
            # Buscar valores numéricos en cualquier elemento
            for elem in root.iter():
                if elem.text and elem.text.strip():
                    try:
                        val = float(elem.text.strip())
                        if val > 0:  # Ignorar valores negativos o cero
                            return val
                    except ValueError:
                        continue
        
    except Exception as e:
        print(f"Error parseando respuesta {info_format}: {e}")
    
    return None

def test_sepa_connection():
    """
    Función de prueba para verificar la conexión con los servicios de SEPA INTA.
    Retorna información sobre el estado de la conexión y capas disponibles.
    """
    results = {
        'wms_connection': False,
        'wfs_connection': False,
        'available_layers': [],
        'test_point_value': None,
        'simulation_mode': SEPA_SIMULATION_MODE,
        'errors': []
    }
    
    if SEPA_SIMULATION_MODE:
        results['simulation_mode'] = True
        results['wms_connection'] = True  # Simulación exitosa
        results['wfs_connection'] = True
        results['available_layers'] = [{'name': 'SIMULATION_MODE', 'title': 'Modo Simulación Activado'}]
        results['test_point_value'] = _simulate_sepa_water_value(-58.4, -34.6)
        return results
    
    try:
        # Probar conexión WMS
        params = {
            'SERVICE': 'WMS',
            'VERSION': '1.3.0',
            'REQUEST': 'GetCapabilities'
        }
        
        response = requests.get(SEPA_WMS_URL, params=params, timeout=30)
        if response.status_code == 200:
            results['wms_connection'] = True
            results['available_layers'] = _discovered_layers
        else:
            results['errors'].append(f"WMS HTTP {response.status_code}")
            
    except Exception as e:
        results['errors'].append(f"WMS: {str(e)}")
    
    try:
        # Probar conexión WFS
        params = {
            'SERVICE': 'WFS',
            'VERSION': '2.0.0',
            'REQUEST': 'GetCapabilities'
        }
        
        response = requests.get(SEPA_WFS_URL, params=params, timeout=30)
        if response.status_code == 200:
            results['wfs_connection'] = True
        else:
            results['errors'].append(f"WFS HTTP {response.status_code}")
            
    except Exception as e:
        results['errors'].append(f"WFS: {str(e)}")
    
    try:
        # Probar obtención de valor en un punto de prueba (Buenos Aires)
        test_lon, test_lat = -58.4, -34.6
        test_value = _get_sepa_water_value(test_lon, test_lat)
        results['test_point_value'] = test_value
        
    except Exception as e:
        results['errors'].append(f"Test point: {str(e)}")
    
    return results

def get_imerg_monthly_precipitation(poly_geojson, start_year=2001, end_year=None):
    """
    Extrae la precipitación mensual acumulada usando NASA GPM IMERG V07 (Monthly)
    via Google Earth Engine para un polígono dado.
    
    IMERG (Integrated Multi-satellitE Retrievals for GPM) provee datos globales
    de precipitación con resolución ~0.1° desde junio 2000.
    
    Args:
        poly_geojson: dict con 'coordinates' del polígono
        start_year: Año inicial (default 2001, primer año completo de IMERG)
        end_year: Año final (default: año actual)
    
     Returns:
         list[dict]: Lista de {year, month, precipitation_mm}
     """
    ensure_ee_initialized()
    if end_year is None:
        end_year = datetime.datetime.utcnow().year

    coords = poly_geojson['coordinates'][0]
    
    # Caché
    cache_key = _make_cache_key(coords, f"{start_year}-01-01", f"{end_year}-12-31", "IMERG_PRECIP", "GPM")
    cached = _get_from_cache(cache_key)
    if cached is not None:
        print(f"[Cache] HIT IMERG key={cache_key[:8]}...")
        # cached es un DataFrame, convertir a lista de dicts
        return cached.to_dict(orient='records')
    print(f"[Cache] MISS IMERG — consultando Earth Engine (key={cache_key[:8]}...)")

    # Manejar MultiPolygon
    if isinstance(coords[0][0], list):
        coords = coords[0]

    roi = ee.Geometry.Polygon(coords)

    start_date = f'{start_year}-01-01'
    end_date = f'{end_year}-12-31'

    # NASA GPM IMERG V07 Monthly
    # Banda 'precipitation': mm/hr promedio mensual
    # Para obtener mm/mes: precipitation * horas_en_el_mes
    imerg = (ee.ImageCollection('NASA/GPM_L3/IMERG_MONTHLY_V07')
             .filterBounds(roi)
             .filterDate(start_date, end_date)
             .select('precipitation'))

    size = imerg.size().getInfo()
    if size == 0:
        print("[IMERG] Colección vacía, intentando V06...")
        # Fallback a V06 si V07 no tiene datos
        imerg = (ee.ImageCollection('NASA/GPM_L3/IMERG_MONTHLY_V06')
                 .filterBounds(roi)
                 .filterDate(start_date, end_date)
                 .select('precipitation'))
        size = imerg.size().getInfo()
        if size == 0:
            print("[IMERG] Sin datos disponibles para esta región/período.")
            return []

    # Extraer valores mensuales
    def get_monthly_precip(img):
        """Calcula la precipitación mensual total en mm para el polígono."""
        date = img.date()
        year = date.get('year')
        month = date.get('month')
        
        # Días en el mes para convertir mm/hr promedio a mm total
        days_in_month = date.advance(1, 'month').difference(date, 'day')
        hours_in_month = days_in_month.multiply(24)
        
        # precipitation está en mm/hr, multiplicar por horas del mes
        monthly_mm = img.multiply(hours_in_month)
        
        stats = monthly_mm.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10000,  # ~0.1° IMERG resolución nativa
            maxPixels=1e8
        )
        
        return ee.Feature(None, {
            'year': year,
            'month': month,
            'precipitation_mm': stats.get('precipitation')
        })

    results = imerg.map(get_monthly_precip).getInfo()

    data = []
    for f in results['features']:
        props = f['properties']
        precip = props.get('precipitation_mm')
        if precip is not None:
            data.append({
                'year': int(props['year']),
                'month': int(props['month']),
                'precipitation_mm': round(float(precip), 1)
            })

    if not data:
        return []

    df = pd.DataFrame(data)
    df = df.sort_values(['year', 'month'])

    # Guardar en caché
    _save_to_cache(cache_key, df)
    print(f"[Cache] GUARDADO IMERG key={cache_key[:8]}... ({len(df)} meses)")

    return df.to_dict(orient='records')


def get_water_availability_info():
    """
    Retorna información detallada sobre la actual fuente (NASA GLDAS).
    """
    return {
        'metodologia': 'NASA GLDAS NOAH Root Zone Soil Moisture',
        'fuente': 'NASA GSFC / Earth Engine',
        'servicio': 'Global Land Data Assimilation System (GLDAS)',
        'url_fuente': 'https://ldas.gsfc.nasa.gov/gldas',
        'url_producto': 'https://developers.google.com/earth-engine/datasets/catalog/NASA_GLDAS_V021_NOAH_G025_T3H',
        'descripcion': 'Humedad en la zona de raíces expresada en milímetros (kg/m²). Representa el agua disponible en ~1-2 metros superficiales.',
        'profundidad': '1 a 2 metros',
        'actualizacion': 'Mensual con un breve retraso por satélite',
        'cobertura': 'Global',
        'metodo_calculo': 'Modelado terrestre asimilando satélites NASA',
        'unidades': 'milímetros (mm)',
        'valores_tipicos': {
            'muy_bajo': '< 20 mm (estrés hídrico)',
            'bajo': '20-50 mm',
            'medio': '50-100 mm',
            'alto': '> 100 mm (adecuado)'
        }
    }

def get_water_availability_with_source(gdf, depth_mm=2000):
    """
    Retorna valores de agua disponible y fuente de datos.
    
    Returns:
        dict: {
            'valores': {nombre_lote: agua_disponible_mm},
            'fuente': {
                'metodologia': 'SEPA INTA - Agua Disponible hasta 2 metros',
                'institucion': 'Instituto Nacional de Tecnología Agropecuaria (INTA)',
                'servicio': 'SEPA - Seguimiento de la Producción Agropecuaria',
                'url': 'https://sepa.inta.gob.ar/productos/agua_en_suelo/ad/',
                'descripcion': 'Balance hídrico del suelo basado en modelos INTA validados para Argentina'
            }
        }
    """
    full_result = get_water_availability_sepa(gdf, depth_mm)
    
    # Separar valores y fuente
    valores = {k: v for k, v in full_result.items() if k != '_fuente'}
    fuente = full_result.get('_fuente', {})
    
    return {
        'valores': valores,
        'fuente': fuente
    }

def get_water_availability_gldas(gdf):
    """
    Calcula el Agua Disponible en la zona de raíces (Root Moisture) 
    utilizando datos satelitales globales de NASA GLDAS (NOAH model).
    
    Esta función reemplaza a los servicios WMS de SEPA INTA, los cuales
    presentan frecuentemente caídas de servicio (HTTP 404).
    """
    ensure_ee_initialized()
    if gdf is None or gdf.empty:
        return {}
    
    try:
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf_wgs84 = gdf.to_crs(epsg=4326)
        else:
            gdf_wgs84 = gdf.copy()
            
        if 'Lote_Name' not in gdf_wgs84.columns:
            gdf_wgs84['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf_wgs84))]
            
        result_dict = {}
        
        # Fecha de búsqueda: los últimos meses disponibles
        start_date = (datetime.date.today() - datetime.timedelta(days=90)).strftime('%Y-%m-%d')
        end_date = datetime.date.today().strftime('%Y-%m-%d')
        
        # 1. Obtener la última imagen global de GLDAS
        gldas_col = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H') \
            .filterDate(start_date, end_date) \
            .select('RootMoist_inst') \
            .sort('system:time_start', False)
        
        latest_img = gldas_col.first()
        
        # 2. Convertir GeoDataFrame a FeatureCollection de Earth Engine
        features = []
        for _, row in gdf_wgs84.iterrows():
            geom = row.geometry
            if geom.geom_type == 'Polygon':
                coords = [list(geom.exterior.coords)]
            elif geom.geom_type == 'MultiPolygon':
                coords = [list(p.exterior.coords) for p in geom.geoms][0]
            else:
                continue
                
            features.append(ee.Feature(ee.Geometry.Polygon(coords), {'Lote_Name': row.get('Lote_Name')}))
            
        if not features:
            return {}
            
        fc = ee.FeatureCollection(features)
        
        # 3. Zonal statistics (Promedio por polígono)
        stats = latest_img.reduceRegions(
            collection=fc,
            reducer=ee.Reducer.mean(),
            scale=10000
        ).getInfo()
        
        # 4. Procesar el resultado
        for feat in stats['features']:
            lote_name = str(feat['properties'].get('Lote_Name'))
            val = feat['properties'].get('mean', 0.0)
            if val is None: val = 0.0
            
            result_dict[lote_name] = max(0.0, float(val))
            
        result_dict['_fuente'] = get_water_availability_info()
        return result_dict
        
    except Exception as e:
        print(f"Error calculando Agua Disponible (GLDAS): {e}")
        return {str(row.get('Lote_Name', f'Lote_{i+1}')): 0.0 for i, row in gdf.iterrows()}

def get_water_availability(gdf, depth_mm=2000):
    """
    Función wrapper que llama a GLDAS para obtener agua útil real.
    """
    full_result = get_water_availability_gldas(gdf)
    return {k: v for k, v in full_result.items() if k != '_fuente'}

def fetch_imerg_precipitation(geojson_poly, start_date_str, end_date_str):
    """Extrae precipitaciones diarias promediadas de NASA GPM IMERG V06."""
    ensure_ee_initialized()
    coords = geojson_poly['coordinates'][0]
    if isinstance(coords[0][0], list): coords = coords[0]
    roi = ee.Geometry.Polygon(coords)
    
    start_dt = datetime.datetime.strptime(start_date_str, "%Y-%m-%d")
    end_dt = datetime.datetime.strptime(end_date_str, "%Y-%m-%d")
    days = (end_dt - start_dt).days
    
    # Check cache first
    cache_key = _make_cache_key(coords, start_date_str, end_date_str, "IMERG", "GPM")
    cached = _get_from_cache(cache_key)
    if cached is not None:
        print(f"[Cache] HIT para IMERG key={cache_key[:8]}...")
        return cached

    print(f"[Cache] MISS - consultando IMERG Earth Engine (key={cache_key[:8]}...)")
    
    def compute_daily(day_offset):
        d = ee.Date(start_date_str).advance(day_offset, 'day')
        daily_imgs = ee.ImageCollection("NASA/GPM_L3/IMERG_V06") \
            .filterDate(d, d.advance(1, 'day')) \
            .select('precipitationCal')
            
        # IMERG is mm/hr natively, and samples every 30 mins. 
        # But multiplying by 0.5 per sample and summing them estimates mm/day.
        daily_sum = daily_imgs.map(lambda img: img.multiply(0.5)).sum() 
        dict_res = daily_sum.reduceRegion(
            reducer=ee.Reducer.mean(),
            geometry=roi,
            scale=10000,
            maxPixels=1e9
        )
        return ee.Feature(None, dict_res).set('date', d.format('YYYY-MM-dd'))
        
    days_list = ee.List.sequence(0, days - 1)
    daily_precip_fc = ee.FeatureCollection(days_list.map(compute_daily))
    data = daily_precip_fc.getInfo()
    
    import pandas as pd
    records = []
    for feat in data['features']:
        val = feat['properties'].get('precipitationCal', 0.0)
        if val is None: val = 0.0
        records.append({
            "date": pd.to_datetime(feat['properties'].get('date')),
            "precipitation": val
        })
        
    df = pd.DataFrame(records)
    if not df.empty:
        df = df.set_index("date").sort_index()
    
    _save_to_cache(cache_key, df)
    return df


