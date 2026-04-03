import requests
import geopandas as gpd
import hashlib
import datetime
from typing import Optional

# ─── Caché en memoria para datos de suelo WFS ────────────────────────────────
_wfs_cache: dict = {}
_WFS_TTL_SECONDS = 7 * 24 * 3600   # 7 días

def _wfs_cache_key(minx, miny, maxx, maxy) -> str:
    raw = f"{round(minx,4)},{round(miny,4)},{round(maxx,4)},{round(maxy,4)}"
    return hashlib.md5(raw.encode()).hexdigest()

def _get_wfs_cache(key: str) -> Optional[gpd.GeoDataFrame]:
    entry = _wfs_cache.get(key)
    if entry and datetime.datetime.utcnow() < entry["expires"]:
        return entry["data"]
    return None

def _save_wfs_cache(key: str, gdf: gpd.GeoDataFrame):
    _wfs_cache[key] = {
        "data": gdf,
        "expires": datetime.datetime.utcnow() + datetime.timedelta(seconds=_WFS_TTL_SECONDS)
    }

def invalidate_wfs_cache():
    _wfs_cache.clear()


def fetch_soil_data_from_wfs(gdf_lotes: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """Obtiene datos de suelo desde IDECOR (Mapas Córdoba) usando WFS."""
    try:
        if gdf_lotes is None or gdf_lotes.empty:
            return None
        if gdf_lotes.crs is None or gdf_lotes.crs.to_epsg() != 4326:
            gdf_bounds = gdf_lotes.to_crs(epsg=4326)
        else:
            gdf_bounds = gdf_lotes
        bounds = gdf_bounds.total_bounds
        buffer_deg = 0.01
        minx, miny, maxx, maxy = (bounds[0]-buffer_deg, bounds[1]-buffer_deg,
                                   bounds[2]+buffer_deg, bounds[3]+buffer_deg)
        key = _wfs_cache_key(minx, miny, maxx, maxy)
        cached = _get_wfs_cache(key)
        if cached is not None:
            print(f"[WFS Cache] HIT — key={key[:8]}")
            return cached
        print(f"[WFS Cache] MISS — consultando IDECOR WFS (key={key[:8]})")

        url = 'https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/wfs'
        params = {
            'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
            'typeName': 'idecor:cartas_suelo_unidas_2025_ip',
            'outputFormat': 'application/json',
            'bbox': f'{minx},{miny},{maxx},{maxy},EPSG:4326',
        }
        response = requests.get(url, params=params, timeout=45)
        response.raise_for_status()
        data = response.json()
        if not data.get('features'):
            return None
        gdf_suelos = gpd.GeoDataFrame.from_features(data["features"])
        gdf_suelos.set_crs(epsg=4326, inplace=True)
        _save_wfs_cache(key, gdf_suelos)
        print(f"[WFS Cache] GUARDADO key={key[:8]} ({len(gdf_suelos)} features)")
        return gdf_suelos
    except Exception as e:
        print(f"Error consultando API de Suelos IDECOR: {e}")
        return None


def calculate_ip_ponderado(gdf_lotes, gdf_suelos, ip_col, clase_col):
    """Calcula el IP Ponderado para cada lote."""
    if gdf_suelos is None or gdf_suelos.empty:
        return gdf_lotes, False
    try:
        original_crs = gdf_lotes.crs
        gdf_lotes_proj = gdf_lotes.to_crs(epsg=3857)
        if gdf_suelos.crs is None:
            gdf_suelos.set_crs(epsg=4326, inplace=True)
        gdf_suelos_proj = gdf_suelos.to_crs(epsg=3857)
        gdf_lotes_proj['geometry'] = gdf_lotes_proj.geometry.buffer(0)
        gdf_suelos_proj['geometry'] = gdf_suelos_proj.geometry.buffer(0).simplify(10)
        interseccion = gpd.overlay(gdf_lotes_proj, gdf_suelos_proj, how='intersection')
        if interseccion.empty:
            return gdf_lotes, False
        interseccion['Area_suelo'] = interseccion.geometry.area
        if ip_col and ip_col != "Auto-Detectar":
            interseccion[ip_col] = interseccion[ip_col].fillna(0).astype(float)
            interseccion['IP_Area'] = interseccion[ip_col] * interseccion['Area_suelo']
            resumen_lote = interseccion.groupby('temp_id').agg({
                'Area_suelo': 'sum', 'IP_Area': 'sum'
            }).reset_index()
            resumen_lote['Index_Ponderado'] = (resumen_lote['IP_Area'] / resumen_lote['Area_suelo']).round(2)
            gdf_lotes_proj = gdf_lotes_proj.merge(
                resumen_lote[['temp_id', 'Index_Ponderado']], on='temp_id', how='left'
            )
        gdf_final = gdf_lotes_proj.to_crs(original_crs)
        return gdf_final, True
    except Exception as e:
        print(f"Error procesando el corte espacial con suelo: {str(e)}")
        import traceback
        traceback.print_exc()
        return gdf_lotes, False


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES HÍDRICAS
# ─────────────────────────────────────────────────────────────────────────────
# Relación CC/AU por gran grupo de suelo (valores medios de laboratorio INTA).
# Fuente: Estimación constantes hídricas - INTA Manfredi / FAO Soil Bulletin 55
# CC_total es siempre > AU porque parte del agua la retiene el suelo (PMP).
# La relación CC/(CC-PMP) varía según textura:
#   - Suelos arenosos: retienen poco → ratio bajo (~1.5)
#   - Suelos arcillosos: retienen mucho → ratio alto (~2.6)
#   - Suelos francos: intermedio (~1.8)
# ─────────────────────────────────────────────────────────────────────────────

# CC_PMP_RATIO: CC_total / AUM — para derivar CC y PMP desde el AUM que da IDECOR
# Estos ratios salen de las tablas de constantes hídricas del INTA:
# CC(mm/m) | PMP(mm/m) | AUM(mm/m) | Ratio CC/AUM
#   120    |    40     |    80     | 1.50  (Arenoso)
#   200    |    80     |   120     | 1.67  (Franco arenoso)
#   290    |   130     |   160     | 1.81  (Franco)
#   330    |   150     |   180     | 1.83  (Franco limoso)
#   340    |   190     |   150     | 2.27  (Franco arcilloso)
#   370    |   230     |   140     | 2.64  (Arcilloso)
# Para Córdoba pampeana (predominan francos y franco-limosos): ratio ≈ 1.82
DEFAULT_CC_AU_RATIO = 1.82


def get_agua_util_idecor_for_lots(gdf_lotes: gpd.GeoDataFrame) -> dict:
    """
    Extrae AU a 1m, 1.5m y 2m (en mm) ponderado por área desde IDECOR.
    
    Fuente: Cartas de Suelo de Córdoba (INTA + MinBioagroindustria + IDECOR)
            Escala 1:50.000 (preferida) o 1:100.000 (fallback)
    
    El campo au_2m ya viene calculado por INTA sumando la capacidad de retención
    hídrica (CC-PMP) de cada horizonte del perfil hasta 200cm, ponderado por las
    series de suelo de la Unidad Cartográfica y sus proporciones.
    
    CC y PMP se derivan del au_2m usando el ratio CC/AU típico de la zona.
    La identidad AU = CC - PMP se mantiene siempre.
    """
    au_dict = {}
    if gdf_lotes is None or gdf_lotes.empty:
        return au_dict
    try:
        if gdf_lotes.crs is None or gdf_lotes.crs.to_epsg() != 4326:
            gdf_bounds = gdf_lotes.to_crs(epsg=4326)
        else:
            gdf_bounds = gdf_lotes
        bounds = gdf_bounds.total_bounds
        buffer_deg = 0.02
        minx, miny, maxx, maxy = (bounds[0]-buffer_deg, bounds[1]-buffer_deg,
                                   bounds[2]+buffer_deg, bounds[3]+buffer_deg)

        # ── Intentar primera la capa dedicada de agua útil (más fiable) ─────
        gdf_suelos = None
        
        # Opción A: capa específica de agua útil 2025 en gn-idecor
        au_capas = [
            ('https://gn-idecor.mapascordoba.gob.ar/geoserver/idecor/wfs',
             'idecor:cartas_suelo_agua_util_2025_2m'),
        ]
        # Opción B: capa 50mil / 100mil full en idecor-ws (tiene au_2m + series)
        detail_capas = [
            ('https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/wfs',
             'idecor:carta_suelo_50mil_2025'),
            ('https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/wfs',
             'idecor:carta_suelo_100mil_2025'),
        ]
        
        # Primero intentar la capa de detalle (50mil) que tiene más atributos
        for server, capa in detail_capas:
            try:
                r = requests.get(server, params={
                    'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
                    'typeName': capa,
                    'outputFormat': 'application/json',
                    'bbox': f'{minx},{miny},{maxx},{maxy},EPSG:4326'
                }, timeout=30)
                if r.status_code == 200:
                    data = r.json()
                    feats = data.get("features", [])
                    # Filtrar features que tienen au_2m > 0
                    valid = [f for f in feats if f.get('properties', {}).get('au_2m', 0) > 0]
                    if valid:
                        gdf_suelos = gpd.GeoDataFrame.from_features(feats)
                        gdf_suelos.set_crs(epsg=4326, inplace=True)
                        print(f"[IDECOR AU] Usando {capa}: {len(feats)} features ({len(valid)} con au>0)")
                        break
            except Exception:
                pass
        
        # Fallback a capa de agua útil dedicada
        if gdf_suelos is None or gdf_suelos.empty:
            for server, capa in au_capas:
                try:
                    r = requests.get(server, params={
                        'service': 'WFS', 'version': '2.0.0', 'request': 'GetFeature',
                        'typeName': capa,
                        'outputFormat': 'application/json',
                        'bbox': f'{minx},{miny},{maxx},{maxy},EPSG:4326'
                    }, timeout=20)
                    if r.status_code == 200:
                        data = r.json()
                        feats = data.get("features", [])
                        if feats:
                            gdf_suelos = gpd.GeoDataFrame.from_features(feats)
                            gdf_suelos.set_crs(epsg=4326, inplace=True)
                            print(f"[IDECOR AU] Usando {capa}: {len(feats)} features")
                            break
                except Exception:
                    pass

        if gdf_suelos is None or gdf_suelos.empty or 'au_2m' not in gdf_suelos.columns:
            print("[IDECOR AU] No se encontraron datos de agua util")
            return au_dict

        # ── Ponderación espacial por área ──────────────────────────────────
        gdf_lotes_proj = gdf_lotes.to_crs(epsg=3857)
        gdf_suelos_proj = gdf_suelos.to_crs(epsg=3857)
        gdf_lotes_proj['geometry'] = gdf_lotes_proj.geometry.buffer(0)
        gdf_suelos_proj['geometry'] = gdf_suelos_proj.geometry.buffer(0)

        interseccion = gpd.overlay(gdf_lotes_proj, gdf_suelos_proj, how='intersection')
        if interseccion.empty:
            return au_dict

        interseccion['Area_suelo'] = interseccion.geometry.area
        
        # Filtrar features sin dato (au_2m=0 son Cárcavas, Lagunas, etc.)
        interseccion['au_2m'] = interseccion['au_2m'].fillna(0).astype(float)
        
        # Solo ponderar con features que tienen dato real (au_2m > 0)
        inter_valid = interseccion[interseccion['au_2m'] > 0].copy()
        
        if inter_valid.empty:
            print("[IDECOR AU] Todos los features en la interseccion tienen au_2m=0")
            return au_dict
        
        inter_valid['au_Area'] = inter_valid['au_2m'] * inter_valid['Area_suelo']
        
        # También ponderar au_1m y au_1_5m si están disponibles
        has_au1m = 'au_1m' in inter_valid.columns
        has_au15m = 'au_1_5m' in inter_valid.columns
        
        if has_au1m:
            inter_valid['au_1m'] = inter_valid['au_1m'].fillna(0).astype(float)
            inter_valid['au_1m_Area'] = inter_valid['au_1m'] * inter_valid['Area_suelo']
        if has_au15m:
            inter_valid['au_1_5m'] = inter_valid['au_1_5m'].fillna(0).astype(float)
            inter_valid['au_15m_Area'] = inter_valid['au_1_5m'] * inter_valid['Area_suelo']
        
        agg_dict = {'Area_suelo': 'sum', 'au_Area': 'sum'}
        if has_au1m: agg_dict['au_1m_Area'] = 'sum'
        if has_au15m: agg_dict['au_15m_Area'] = 'sum'
        
        resumen = inter_valid.groupby('temp_id').agg(agg_dict).reset_index()
        resumen['au_2m_pond'] = (resumen['au_Area'] / resumen['Area_suelo']).round(1)
        if has_au1m:
            resumen['au_1m_pond'] = (resumen['au_1m_Area'] / resumen['Area_suelo']).round(1)
        if has_au15m:
            resumen['au_15m_pond'] = (resumen['au_15m_Area'] / resumen['Area_suelo']).round(1)

        for _, row in resumen.iterrows():
            temp_id = row['temp_id']
            match = gdf_lotes[gdf_lotes['temp_id'] == temp_id]
            if not match.empty:
                lote_name = match.iloc[0].get('Lote_Name', str(temp_id))
                aum = float(row['au_2m_pond'])
                
                # Validación de rango (suelos agrícolas de Córdoba: 100-400mm a 2m)
                if aum < 50:
                    print(f"[IDECOR AU] WARNING {lote_name}: aum={aum}mm muy bajo, usando mínimo 100mm")
                    aum = 100.0
                
                # ── Derivar CC y PMP ──────────────────────────────────────
                # CC_total = AUM * ratio (mantiene AU = CC - PMP)
                cc = round(aum * DEFAULT_CC_AU_RATIO, 1)
                pmp = round(cc - aum, 1)
                
                result = {"au_2m": aum, "cc": cc, "pmp": pmp}
                
                # Incluir AU a 1m y 1.5m si disponibles
                if has_au1m and 'au_1m_pond' in row:
                    result["au_1m"] = float(row['au_1m_pond'])
                if has_au15m and 'au_15m_pond' in row:
                    result["au_1_5m"] = float(row['au_15m_pond'])
                
                au_dict[lote_name] = result
                
                print(f"[IDECOR AU] {lote_name}: AUM={aum}mm "
                      f"CC={cc}mm PMP={pmp}mm "
                      f"(AU_1m={result.get('au_1m','N/A')} "
                      f"AU_1.5m={result.get('au_1_5m','N/A')})")

        return au_dict
    except Exception as e:
        print(f"Error idecor au_2m: {e}")
        import traceback
        traceback.print_exc()
        return au_dict


def fetch_soil_humidity_idecor(gdf_lotes: gpd.GeoDataFrame) -> dict:
    """
    Consulta la humedad de suelo (%) desde IDECOR WMS (capas DSS_MSM_1..7).
    Derivado de misión SAOCOM (CONAE). Perfil integrado 0-50cm.
    Día 1 = ayer, Día 7 = hace 7 días.
    Retorna dict: {lote_name: {"humedad_pct": float, "dia": int}}
    """
    results = {}
    if gdf_lotes is None or gdf_lotes.empty:
        return results
    try:
        if gdf_lotes.crs is not None and gdf_lotes.crs.to_epsg() != 4326:
            gdf_4326 = gdf_lotes.to_crs(epsg=4326)
        else:
            gdf_4326 = gdf_lotes

        base_url = "https://gn-idecor.mapascordoba.gob.ar/geoserver/idecor/wms"
        NODATA = 255.0

        for idx, row in gdf_4326.iterrows():
            lote_name = str(row.get('Lote_Name', f'Lote_{idx}'))
            centroid = row.geometry.centroid
            lat, lon = centroid.y, centroid.x

            bbox_size = 0.002
            minx, maxx = lon - bbox_size, lon + bbox_size
            miny, maxy = lat - bbox_size, lat + bbox_size

            best_val = None
            best_day = None

            for day in range(1, 8):
                layer = f"idecor:DSS_MSM_{day}"
                try:
                    url = (
                        f"{base_url}?"
                        f"SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo&"
                        f"LAYERS={layer}&QUERY_LAYERS={layer}&"
                        f"SRS=EPSG:4326&BBOX={minx},{miny},{maxx},{maxy}&"
                        f"WIDTH=256&HEIGHT=256&X=128&Y=128&"
                        f"INFO_FORMAT=application/json"
                    )
                    r = requests.get(url, timeout=12)
                    if r.status_code != 200:
                        continue
                    data = r.json()
                    features = data.get("features", [])
                    if features:
                        val = features[0].get("properties", {}).get("HUMEDAD_DE_SUELO")
                        if val is not None:
                            val_f = float(val)
                            if val_f < NODATA and val_f >= 0:
                                best_val = val_f
                                best_day = day
                                break
                except Exception:
                    continue

            if best_val is not None:
                results[lote_name] = {
                    "humedad_pct": round(best_val, 1),
                    "dia": best_day
                }
                print(f"[IDECOR Humedad] {lote_name}: {best_val}% (dia -{best_day})")
            else:
                print(f"[IDECOR Humedad] {lote_name}: sin dato")

        return results
    except Exception as e:
        print(f"Error fetch_soil_humidity_idecor: {e}")
        import traceback
        traceback.print_exc()
        return results
