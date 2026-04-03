from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional, Any
import datetime
import time
import json
import os
import geopandas as gpd
import pandas as pd

from services.idecor_service import fetch_soil_data_from_wfs, calculate_ip_ponderado
from services.ee_service import get_timeseries, get_benchmark_timeseries, get_cache_stats, invalidate_cache, get_soc_evolution, get_water_availability, test_sepa_connection, get_water_availability_info, get_water_availability_with_source, get_imerg_monthly_precipitation
from services.mo_service import get_mo_idecor_for_lots
from services.soildb_service import get_property_evolution_soildb, get_soil_properties_for_lots, get_intralot_heatmap, get_property_percentiles_evolution
from services.weather_service import get_weather_data
from services.spei_service import calculate_spei_for_lot

router = APIRouter()

# Modelos Pydantic para recibir peticiones JSON estructuradas
class GeometriaLote(BaseModel):
    id: str
    name: str
    coordinates: List[Any]
    area_ha: float
    center_lat: float
    center_lon: float

class RequerimientoAnalisis(BaseModel):
    lotes: List[GeometriaLote]
    fecha_inicio: datetime.date
    fecha_fin: datetime.date
    indice: str = "NDVI"
    satellite: str = "Sentinel-2"   # Sentinel-2, Landsat, MODIS, Mix
    force_refresh: bool = False   # Si True, ignora el caché y recalcula en EE


@router.post("/ranking")
async def generar_ranking(lotes: List[GeometriaLote]):
    """Cruza los lotes directamente con IDECOR para generar el Índice Productivo."""
    try:
        # Reconstruir un GeoDataFrame a partir de los datos recibidos
        features = []
        for lote in lotes:
            polygon = {"type": "Polygon", "coordinates": lote.coordinates}
            features.append({
                "type": "Feature",
                "geometry": polygon,
                "properties": {
                    "temp_id": lote.id,
                    "Lote_Name": lote.name,
                    "Area_ha": lote.area_ha,
                    "centroide_lat": lote.center_lat,
                    "centroide_lon": lote.center_lon
                }
            })
            
        gdf_lotes = gpd.GeoDataFrame.from_features(features)
        gdf_lotes.set_crs(epsg=4326, inplace=True)
        
        # Consultar Suelos WFS
        gdf_suelos = fetch_soil_data_from_wfs(gdf_lotes)
        if gdf_suelos is None or gdf_suelos.empty:
            return {"status": "warning", "msg": "No hay datos de suelo en esta ubicación", "ranking": []}
            
        # Cruzar para obtener el IP
        gdf_procesado, procesado = calculate_ip_ponderado(gdf_lotes, gdf_suelos, ip_col='ip', clase_col='cap')
        
        # Preparar respuesta base JSON
        ranking_data = []
        for idx, row in gdf_procesado.iterrows():
            raw_ip_val = row.get('Index_Ponderado', 0)
            if raw_ip_val is None or pd.isna(raw_ip_val):
                ip_val = 0.0
            else:
                try:
                    ip_val = float(raw_ip_val)
                except (ValueError, TypeError):
                    ip_val = 0.0
                    
            clase = "Desconocida"
            if ip_val > 80: clase = "Muy Alta"
            elif ip_val > 60: clase = "Alta"
            elif ip_val > 40: clase = "Media"
            elif ip_val > 0: clase = "Baja"
            else: clase = "Sin Dato"
            
            ranking_data.append({
                "id": row.get('temp_id'),
                "name": row.get('Lote_Name', f"Lote {idx}"),
                "area_ha": row.get('Area_ha', 0),
                "ip_ponderado": ip_val,
                "clase_productiva": clase
            })
            
        ranking_data = sorted(ranking_data, key=lambda i: i['ip_ponderado'], reverse=True)
        
        return {"status": "success", "ranking": ranking_data}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from services.water_balance_service import calculate_water_balance_for_lots, get_water_balance_info

def run_water_balance_future(gdf, fut_soil, fut_au_idecor):
    try:
        soil_props = fut_soil.result(timeout=60)
        idecor_au = fut_au_idecor.result(timeout=60)
        return calculate_water_balance_for_lots(gdf, soil_props, idecor_au)
    except Exception as e:
        print(f"Error orchestrating water balance: {e}")
        return {}

@router.post("/ranking/advanced")
async def generar_ranking_avanzado(lotes: List[GeometriaLote]):
    """Calcula la evolucion del COS, propiedades de suelo, MO y Balance Hidrico."""
    try:
        if not lotes: return {"status": "error", "message": "No enviaron geometria."}
        
        # Reconstruir un GeoDataFrame a partir de los datos recibidos
        features = []
        for lote in lotes:
            polygon = {"type": "Polygon", "coordinates": lote.coordinates}
            features.append({
                "type": "Feature",
                "geometry": polygon,
                "properties": {
                    "temp_id": lote.id,
                    "Lote_Name": lote.name
                }
            })
            
        gdf_lotes = gpd.GeoDataFrame.from_features(features)
        gdf_lotes.set_crs(epsg=4326, inplace=True)

        stage_timeout_sec = float(os.getenv("ADVANCED_STAGE_TIMEOUT_SEC", "120"))
        total_t0 = time.perf_counter()

        soc_dict = {}
        ph_dict = {}
        mo_dict = {}
        soil_props = {}
        au_dict = {}
        humidity_dict = {}

        import concurrent.futures

        ex = concurrent.futures.ThreadPoolExecutor(max_workers=6)
        
        fut_soil = ex.submit(get_soil_properties_for_lots, gdf_lotes)
        from services.ee_service import get_water_availability_sepa
        from services.idecor_service import get_agua_util_idecor_for_lots
        from services.water_balance_service import calculate_water_balance_for_lots
        
        def run_water_balance_future(gdf, fut_soil, fut_au_idecor):
            try:
                soil_props = fut_soil.result(timeout=60)
                idecor_au = fut_au_idecor.result(timeout=60)
                return calculate_water_balance_for_lots(gdf, soil_props, idecor_au)
            except Exception as e:
                print(f"Error orchestrating water balance: {e}")
                return {}

        fut_au_idecor = ex.submit(get_agua_util_idecor_for_lots, gdf_lotes)

        futures = {
            'soc': ex.submit(get_property_evolution_soildb, gdf_lotes, variable="socd", depth="0..30cm"),
            'ph_evo': ex.submit(get_property_evolution_soildb, gdf_lotes, variable="ph", depth="0..30cm"),
            'mo': ex.submit(get_mo_idecor_for_lots, gdf_lotes),
            'soil': fut_soil,
            'au_sepa': ex.submit(get_water_availability_sepa, gdf_lotes),
            'au_balance': ex.submit(run_water_balance_future, gdf_lotes, fut_soil, fut_au_idecor),
        }

        try:
            for name, fut in futures.items():
                t_stage = time.perf_counter()
                try:
                    res = fut.result(timeout=stage_timeout_sec)
                    if name == 'soc':
                        soc_dict = res or {}
                    elif name == 'ph_evo':
                        ph_dict = res or {}
                    elif name == 'mo':
                        mo_dict = res or {}
                    elif name == 'soil':
                        soil_props = res or {}
                    elif name == 'au_sepa':
                        au_sepa_dict = res or {}
                    elif name == 'au_balance':
                        au_balance_dict = res or {}
                except concurrent.futures.TimeoutError:
                    print(f"[ranking/advanced] {name.upper()} timeout after {stage_timeout_sec:.0f}s")
                    try:
                        fut.cancel()
                    except Exception:
                        pass
                except Exception as e:
                    print(f"[ranking/advanced] {name.upper()} error: {e}")
                finally:
                    print(f"[ranking/advanced] {name.upper()} seconds={(time.perf_counter() - t_stage):.2f}")
        finally:
            try:
                ex.shutdown(wait=False, cancel_futures=True)
            except TypeError:
                ex.shutdown(wait=False)


        print(f"[ranking/advanced] TOTAL seconds={(time.perf_counter() - total_t0):.2f}")
        
        results = []
        for lote in lotes:
            soc_data = soc_dict.get(lote.name, {})
            lot_soil = soil_props.get(lote.name, {})

            sepa_val = au_sepa_dict.get(lote.name)
            balance_val = float(au_balance_dict.get(lote.name, {}).get("au_mm", 0.0))
            
            final_au = sepa_val if sepa_val is not None and sepa_val > 0 else balance_val

            results.append({
                "id": lote.id,
                "name": lote.name,
                # SOC/pH evolution: 5 temporal intervals (2000-2022) in 0–30 cm
                "soc_evolution": soc_data.get("values", []) if isinstance(soc_data, dict) else soc_data,
                "soc_evolution_labels": soc_data.get("labels", []) if isinstance(soc_data, dict) else [],
                "soc_unit": "kg/m³",
                "ph_evolution": ph_dict.get(lote.name, {}).get("values", []),
                "ph_evolution_labels": ph_dict.get(lote.name, {}).get("labels", []),
                "ph_unit": "pH",
                # MO
                "mo_actual": mo_dict.get(lote.name, 0.0),
                # Soil properties from soildb
                "clay_pct": lot_soil.get("clay"),
                "silt_pct": lot_soil.get("silt"),
                "sand_pct": lot_soil.get("sand"),
                "texture_class": lot_soil.get("texture_class", "Sin dato"),
                # Agua Util 
                "au_mm": float(final_au),
                "au_fallback": (sepa_val is None or sepa_val <= 0),
            })
            
        return {
            "status": "success",
            "data": results,
            "soildb_meta": {
                "source": "OpenLandMap-soildb",
                "resolution": "30m",
                "method": "Quantile Regression Random Forest",
                "url": "https://github.com/openlandmap/soildb",
                "doi": "https://doi.org/10.5194/essd-2025-336",
                "license": "CC-BY 4.0",
            },
            "au_meta": au_sepa_dict.get("_fuente", {})
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/timeseries/individual")
async def calcular_serie_individual(req: RequerimientoAnalisis):
    """Calcula NDVI/EVI en serie temporal por Earth Engine para un lote especifico"""
    try:
        if not req.lotes:
             return {"status": "error", "message": "No enviaron geometria."}
             
        lote = req.lotes[0]
        # Crear dic tipo geojson
        geojson_poly = {"type": "Polygon", "coordinates": lote.coordinates}
        
        # Extraer a DataFrame
        df = get_timeseries(geojson_poly, req.fecha_inicio, req.fecha_fin, req.indice,
                            satellite=req.satellite, use_cache=not req.force_refresh)
        if df.empty:
            return {"status": "success", "data": []}
            
        # Convertir timestamps a string
        df['Fecha'] = df['Fecha'].dt.strftime('%Y-%m-%d')
        
        return {"status": "success", "data": df.to_dict(orient="records")}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
@router.post("/timeseries/benchmark")
async def calcular_serie_benchmark(req: RequerimientoAnalisis):
    """Calcula NDVI en masa para comparar Lotes cruzados y un Promedio General"""
    try:
        if not req.lotes: return {"data": []}
        
        features = [{"type": "Feature", "geometry": {"type": "Polygon", "coordinates": l.coordinates}, "properties": {"temp_id": l.id, "Lote_Name": l.name}} for l in req.lotes]
        gdf_lotes = gpd.GeoDataFrame.from_features(features)
        gdf_lotes.set_crs(epsg=4326, inplace=True)
        
        # Se bloquea sincrónicamente hasta que Earth Engine devuelva
        df_bench = get_benchmark_timeseries(gdf_lotes, req.fecha_inicio, req.fecha_fin, req.indice, satellite=req.satellite)
        
        if df_bench is None or df_bench.empty:
            return {"status": "success", "data": []}
            
        df_bench = df_bench.reset_index()
        if 'Fecha' in df_bench.columns:
            df_bench['Fecha'] = pd.to_datetime(df_bench['Fecha']).dt.strftime('%Y-%m-%d')
            
        df_bench = df_bench.fillna(0) # EE puede tener nulls en nubes severas
        
        return {"status": "success", "data": df_bench.to_dict(orient="records")}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/weather")
async def obtener_clima(lat: float, lon: float):
    weather = get_weather_data(lat, lon)
    if not weather:
        raise HTTPException(status_code=503, detail="Fallo petición a Open-Meteo")
    return weather

# ─── Endpoints de gestión de caché ─────────────────────────────────────────
@router.get("/timeseries/cache")
def cache_status():
    """Devuelve el estado actual del caché en memoria."""
    return {"status": "ok", **get_cache_stats()}

@router.delete("/timeseries/cache")
def clear_cache():
    """Invalida todo el caché de series temporales."""
    invalidate_cache()
    return {"status": "ok", "message": "Caché vaciado correctamente."}

@router.get("/water/sepa/test")
def test_sepa():
    """Prueba la conexión con los servicios de SEPA INTA."""
    try:
        results = test_sepa_connection()
        return {
            "status": "ok",
            "sepa_connection": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error probando SEPA: {str(e)}")

@router.get("/water/sepa/info")
def get_sepa_info():
    """Retorna información sobre la metodología SEPA implementada."""
    try:
        info = get_water_availability_info()
        return {
            "status": "ok",
            "metodologia": info
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo info SEPA: {str(e)}")

@router.post("/water/sepa/with-source")
def get_water_with_source(lotes: List[GeometriaLote]):
    """
    Retorna valores de agua disponible con información de la fuente SEPA.
    Ideal para mostrar en interfaz la fuente de los datos.
    """
    try:
        # Reconstruir GeoDataFrame
        features = []
        for lote in lotes:
            polygon = {"type": "Polygon", "coordinates": lote.coordinates}
            features.append({
                "type": "Feature",
                "geometry": polygon,
                "properties": {
                    "temp_id": lote.id,
                    "Lote_Name": lote.name,
                    "Area_ha": lote.area_ha,
                    "centroide_lat": lote.center_lat,
                    "centroide_lon": lote.center_lon
                }
            })
        
        gdf = gpd.GeoDataFrame.from_features(features, crs="EPSG:4326")
        
        # Obtener valores con fuente
        result = get_water_availability_with_source(gdf)
        
        return {
            "status": "ok",
            "agua_disponible": result["valores"],
            "fuente": result["fuente"]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo agua con fuente: {str(e)}")

@router.post("/precipitation/imerg")
async def get_precipitation_imerg(lotes: List[GeometriaLote]):
    """
    Retorna la precipitación mensual histórica de NASA GPM IMERG para el primer lote.
    Utiliza todos los años disponibles (2001 - presente) para construir box-plots.
    """
    try:
        if not lotes:
            raise HTTPException(status_code=400, detail="No se enviaron lotes.")
        
        lote = lotes[0]
        geojson_poly = {"type": "Polygon", "coordinates": lote.coordinates}
        
        data = get_imerg_monthly_precipitation(geojson_poly)
        
        return {
            "status": "success",
            "lote_name": lote.name,
            "data": data,
            "source": {
                "dataset": "NASA GPM IMERG V07 Monthly",
                "description": "Integrated Multi-satellitE Retrievals for GPM - Precipitación mensual global",
                "resolution": "0.1° (~10 km)",
                "coverage": "Global (60°N - 60°S)",
                "url": "https://gpm.nasa.gov/data/imerg",
                "band": "precipitation (mm/hr → mm/mes)"
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error obteniendo precipitación IMERG: {str(e)}")


class HeatmapRequest(BaseModel):
    lote: GeometriaLote
    variable: str = "socd"  # socd, bulk_density, clay, silt, sand, ph
    depth: str = "0..30cm"
    map_type: str = "heatmap" # heatmap o zonification


class SOCPercentilesRequest(BaseModel):
    lotes: List[GeometriaLote]
    depth: str = "0..30cm"


@router.post("/analysis/intralot-heatmap")
async def generar_heatmap_intralote(req: HeatmapRequest):
    """
    Genera un mapa de calor o zonificación intralote para un polígono individual
    usando datos de OpenLandMap-soildb a 30m de resolución.
    """
    try:
        geojson_poly = {"type": "Polygon", "coordinates": req.lote.coordinates}

        result = get_intralot_heatmap(
            geometry_geojson=geojson_poly,
            variable=req.variable,
            depth=req.depth,
            map_type=req.map_type
        )

        if result is None:
            raise HTTPException(
                status_code=500,
                detail="No se pudo generar el heatmap para este polígono."
            )

        return {
            "status": "success",
            "lote_name": req.lote.name,
            "heatmap": result,
            "source": {
                "dataset": "OpenLandMap-soildb",
                "resolution": "30m",
                "depth": req.depth,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error generando heatmap intralote: {str(e)}"
        )

@router.post("/analysis/spei")
async def generar_spei_historico(req: HeatmapRequest):
    """
    Toma un lote individual y extrae 20+ años históricos de NASA POWER e IMERG
    para calcular y devolver la serie temporal de SPEI y el estatus actual.
    Note: Reusa HeatmapRequest ya que tiene toda la definicion de lote necesaria.
    """
    try:
        if not req.lote:
            raise HTTPException(status_code=400, detail="No se envió geometría de lote.")
            
        geojson_poly = {"type": "Polygon", "coordinates": req.lote.coordinates}
        lat = req.lote.center_lat
        lon = req.lote.center_lon
        
        result = calculate_spei_for_lot(geojson_poly, lat, lon)
        
        return {
            "status": "success",
            "lote_name": req.lote.name,
            "data": result,
            "source": {
                "precipitation": "NASA GPM IMERG V07",
                "temperature": "NASA POWER",
                "method": "Hargreaves-Samani PET + Fisk Distribution SPEI"
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error procesando SPEI: {str(e)}")
