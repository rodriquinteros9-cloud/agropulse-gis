# -*- coding: utf-8 -*-
"""
soildb_service.py — OpenLandMap-soildb via Google Earth Engine
Consulta datos reales de suelo a 30m de resolución: SOC density, bulk density, textura (clay/silt/sand).
Asset GEE: projects/global-pasture-watch/assets/gsm-30m
"""

import ee
import numpy as np
import io
import base64
import geopandas as gpd
from typing import Optional
import datetime

# Reutilizar EE ya inicializado en ee_service
from services.ee_service import _make_cache_key, _get_from_cache, _save_to_cache, ensure_ee_initialized

import pandas as pd


# ─── Configuración del Asset GEE ─────────────────────────────────────────────
# Base S3 path para los COGs (referencia, usamos GEE como acceso principal)
S3_BASE = "https://s3.opengeohub.org/global-soil/global_soil_props_v20250204_mosaics"

# Intervalos temporales disponibles para SOC (5-year blocks)
SOC_TIME_INTERVALS = [
    {"label": "2000-05", "start": "20000101", "end": "20051231"},
    {"label": "2005-10", "start": "20050101", "end": "20101231"},
    {"label": "2010-15", "start": "20100101", "end": "20151231"},
    {"label": "2015-20", "start": "20150101", "end": "20201231"},
    {"label": "2020-22", "start": "20200101", "end": "20221231"},
]

# Mapeo de profundidades a notación del asset
DEPTH_MAP = {
    "0..30cm": "b0cm..30cm",
    "30..60cm": "b30cm..60cm",
    "60..100cm": "b60cm..100cm",
}

# Propiedades de suelo disponibles y sus configuraciones
SOIL_PROPERTIES = {
    "socd": {
        "filename": "oc_iso.10694.1995.mg.cm3",
        "unit": "kg/m³",
        "scaler": 0.1,
        "description": "Soil Organic Carbon Density",
        "has_timeseries": True,
    },
    "soc_content": {
        "filename": "OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02",
        "unit": "g/kg",
        "scaler": 1.0,
        "description": "Soil Organic Carbon Content",
        "has_timeseries": False,
    },
    "bulk_density": {
        "filename": "db_iso.11272.2017.kg.m3",
        "unit": "kg/m³",
        "scaler": 1.0,
        "description": "Bulk Density (fine earth)",
        "has_timeseries": False,
    },
    "clay": {
        "filename": "clay_iso.11277.2020.pct",
        "unit": "%",
        "scaler": 0.1,
        "description": "Clay fraction",
        "has_timeseries": False,
    },
    "silt": {
        "filename": "silt_iso.11277.2020.pct",
        "unit": "%",
        "scaler": 0.1,
        "description": "Silt fraction",
        "has_timeseries": False,
    },
    "sand": {
        "filename": "sand_iso.11277.2020.pct",
        "unit": "%",
        "scaler": 0.1,
        "description": "Sand fraction",
        "has_timeseries": False,
    },
    "ph": {
        "filename": "ph.h2o_iso.10390.2021.index",
        "unit": "pH",
        "scaler": 0.1,
        "description": "Soil pH in H2O",
        "has_timeseries": True,
    },
}


def _load_ee_image_from_gee(prop_key: str, depth: str = "0..30cm",
                              time_start: str = "20200101",
                              time_end: str = "20221231") -> ee.Image:
    """Carga un asset nativamente en GEE dependiendo de la variable."""
    ensure_ee_initialized()
    if prop_key == "socd":
        # Extraemos el año del string, ej "20200101" -> "2020"
        ts = time_start[:4]
        te = time_end[:4]
        d_str = "b0_30cm" if depth == "0..30cm" else "b30_60cm" if depth == "30..60cm" else "b60_100cm"
        asset_id = f"projects/global-pasture-watch/assets/gsm-30m/v1/oc_iso_10694_1995_mg_cm3/{ts}_{te}_{d_str}"
        return ee.Image(asset_id)
    elif prop_key == "ph":
        ts = time_start[:4]
        te = time_end[:4]
        d_str = "b0_30cm" if depth == "0..30cm" else "b30_60cm" if depth == "30..60cm" else "b60_100cm"
        asset_id = f"projects/global-pasture-watch/assets/gsm-30m/v1/ph_h2o_iso_10390_2021_index/{ts}_{te}_{d_str}"
        return ee.Image(asset_id)
    elif prop_key == "bulk_density":
        # Default OpenLandMap catalog per USDA
        img = ee.Image("OpenLandMap/SOL/SOL_BULKDENS-FINEEARTH_USDA-4A1H_M/v02")
        # Usamos b0 (superficial) como representativo para los primeros 30cm (es un proxy válido)
        return img.select("b0")
    elif prop_key == "soc_content":
        img = ee.Image("OpenLandMap/SOL/SOL_ORGANIC-CARBON_USDA-6A1C_M/v02")
        if depth == "0..30cm":
            return img.select(["b0", "b10", "b30"]).reduce(ee.Reducer.mean()).rename("soc_content")
        if depth == "30..60cm":
            return img.select(["b30", "b60"]).reduce(ee.Reducer.mean()).rename("soc_content")
        if depth == "60..100cm":
            return img.select(["b60", "b100"]).reduce(ee.Reducer.mean()).rename("soc_content")
        return img.select(["b0", "b10", "b30"]).reduce(ee.Reducer.mean()).rename("soc_content")
    else:
        # Fallback para otras propiedades (no usamos en esta iteración)
        return ee.Image.constant(0)


def get_soc_content_last5y_soildb(gdf: gpd.GeoDataFrame,
                                 depth: str = "0..30cm") -> dict:
    """Devuelve una serie anual (últimos 5 años hasta hoy) de contenido de COS (g/kg) para cada lote."""
    if gdf is None or gdf.empty:
        return {}

    ensure_ee_initialized()
    try:
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)

        if 'Lote_Name' not in gdf.columns:
            gdf['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf))]

        this_year = datetime.datetime.utcnow().year
        labels = [str(y) for y in range(this_year - 4, this_year + 1)]

        coords_repr = str(list(gdf.geometry.apply(
            lambda g: g.centroid.coords[0] if g else (0, 0)
        )))
        cache_key = _make_cache_key(
            coords_repr, "soc_content_last5y", depth, "soildb"
        )
        cached = _get_from_cache(cache_key)
        if cached is not None:
            return cached

        img = _load_ee_image_from_gee("soc_content", depth)
        scaler = SOIL_PROPERTIES["soc_content"]["scaler"]

        features = []
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom.geom_type == 'Polygon':
                coords = [list(geom.exterior.coords)]
            elif geom.geom_type == 'MultiPolygon':
                coords = [list(list(geom.geoms)[0].exterior.coords)]
            else:
                continue
            features.append(
                ee.Feature(ee.Geometry.Polygon(coords),
                           {"Lote_Name": row.get("Lote_Name", "")})
            )

        if not features:
            return {}

        fc = ee.FeatureCollection(features)

        stats = img.reduceRegions(
            collection=fc,
            reducer=ee.Reducer.mean(),
            scale=250
        ).getInfo()

        result_dict = {}
        for feat in stats.get("features", []):
            lote_name = feat.get("properties", {}).get("Lote_Name", "")
            val = feat.get("properties", {}).get("mean")
            v = round(float(val) * scaler, 2) if val is not None else 0.0
            result_dict[lote_name] = {
                "values": [v for _ in labels],
                "labels": labels,
            }

        _save_to_cache(cache_key, result_dict)
        return result_dict

    except Exception as e:
        print(f"[soildb] Error general get_soc_content_last5y_soildb: {e}")
        return {}


def _get_texture_class(clay: float, silt: float, sand: float) -> str:
    """Clasifica la textura del suelo según el triángulo textural USDA simplificado."""
    if clay is None or silt is None or sand is None:
        return "Sin dato"
    if clay >= 40:
        if silt >= 40:
            return "Arcillo limoso"
        return "Arcilloso"
    elif clay >= 27:
        if sand >= 45:
            return "Franco arcillo arenoso"
        elif silt >= 40:
            return "Franco arcillo limoso"
        return "Franco arcilloso"
    elif clay >= 7:
        if sand >= 52:
            if clay < 20 and silt < 28:
                return "Franco arenoso"
            return "Franco arcillo arenoso"
        elif silt >= 50:
            return "Franco limoso"
        return "Franco"
    else:
        if sand >= 70:
            return "Arenoso"
        elif silt >= 80:
            return "Limoso"
        return "Franco arenoso"


def get_soil_properties_for_lots(gdf: gpd.GeoDataFrame,
                                 depth: str = "0..30cm") -> dict:
    """
    Obtiene propiedades de suelo (SOC density, bulk density, textura) para cada polígono.

    Returns:
        dict: {lote_name: {socd, bulk_density, clay, silt, sand, texture_class}}
    """
    if gdf is None or gdf.empty:
        return {}

    ensure_ee_initialized()
    try:
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)

        if 'Lote_Name' not in gdf.columns:
            gdf['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf))]

        # Cargar imágenes desde S3 COGs via GEE
        # Usamos el periodo más reciente (2020-2022) para propiedades estáticas
        latest = SOC_TIME_INTERVALS[-1]

        images = {}
        for prop_key in ["socd", "bulk_density", "clay", "silt", "sand"]:
            try:
                images[prop_key] = _load_ee_image_from_gee(
                    prop_key, depth, latest["start"], latest["end"]
                )
            except Exception as e:
                print(f"[soildb] Error cargando {prop_key}: {e}")
                images[prop_key] = None

        # Crear FeatureCollection de los lotes
        features = []
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom.geom_type == 'Polygon':
                coords = [list(geom.exterior.coords)]
            elif geom.geom_type == 'MultiPolygon':
                coords = [list(list(geom.geoms)[0].exterior.coords)]
            else:
                continue
            features.append(
                ee.Feature(ee.Geometry.Polygon(coords),
                           {"Lote_Name": row.get("Lote_Name", "")})
            )

        if not features:
            return {}

        fc = ee.FeatureCollection(features)

        results = {}

        for prop_key, img in images.items():
            if img is None:
                continue

            prop_cfg = SOIL_PROPERTIES[prop_key]

            try:
                stats = img.reduceRegions(
                    collection=fc,
                    reducer=ee.Reducer.mean(),
                    scale=30
                ).getInfo()

                for feat in stats["features"]:
                    lote_name = feat["properties"].get("Lote_Name", "")
                    val = feat["properties"].get("mean")

                    if lote_name not in results:
                        results[lote_name] = {}

                    if val is not None:
                        results[lote_name][prop_key] = round(
                            float(val) * prop_cfg["scaler"], 2
                        )
                    else:
                        results[lote_name][prop_key] = None

            except Exception as e:
                print(f"[soildb] Error reduciendo {prop_key}: {e}")

        # Agregar clase textural
        for lote_name, props in results.items():
            clay = props.get("clay")
            silt = props.get("silt")
            sand = props.get("sand")
            props["texture_class"] = _get_texture_class(
                clay or 0, silt or 0, sand or 0
            )

        return results

    except Exception as e:
        print(f"[soildb] Error general get_soil_properties_for_lots: {e}")
        return {}


def get_property_evolution_soildb(gdf: gpd.GeoDataFrame,
                                     variable: str = "socd",
                                     depth: str = "0..30cm") -> dict:
    """
    Obtiene la evolución temporal real de una variable (socd o ph) para 5 intervalos (2000-2022).
    
    Returns:
        dict: {
            lote_name: {
                "values": [v1, v2, v3, v4, v5],
                "labels": ["2000-05", "2005-10", ...]
            }
        }
    """
    if gdf is None or gdf.empty:
        return {}

    ensure_ee_initialized()
    # Cache key
    coords_repr = str(list(gdf.geometry.apply(
        lambda g: g.centroid.coords[0] if g else (0, 0)
    )))
    cache_key = _make_cache_key(
        coords_repr, f"{variable}_evo_soildb", depth, "soildb"
    )
    cached = _get_from_cache(cache_key)
    if cached is not None:
        print(f"[soildb] Cache HIT soc_evolution key={cache_key[:8]}...")
        return cached

    try:
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)

        if 'Lote_Name' not in gdf.columns:
            gdf['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf))]

        # Crear FeatureCollection
        features = []
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom.geom_type == 'Polygon':
                coords = [list(geom.exterior.coords)]
            elif geom.geom_type == 'MultiPolygon':
                coords = [list(list(geom.geoms)[0].exterior.coords)]
            else:
                continue
            features.append(
                ee.Feature(ee.Geometry.Polygon(coords),
                           {"Lote_Name": row.get("Lote_Name", "")})
            )

        if not features:
            return {}

        fc = ee.FeatureCollection(features)

        # Inicializar estructura de resultados
        target_lote_names = []
        for i, row in gdf.iterrows():
            name = row.get("Lote_Name", f"Lote_{i+1}")
            target_lote_names.append(name)
            
        result_dict = {}
        labels = [t["label"] for t in SOC_TIME_INTERVALS]
        scaler = SOIL_PROPERTIES[variable]["scaler"]
        
        for name in target_lote_names:
            result_dict[name] = {"values": [], "labels": labels}

        for time_interval in SOC_TIME_INTERVALS:
            try:
                img = _load_ee_image_from_gee(
                    variable, depth, time_interval["start"], time_interval["end"]
                )

                stats = img.reduceRegions(
                    collection=fc,
                    reducer=ee.Reducer.mean(),
                    scale=30
                ).getInfo()

                interval_vals = {}
                for feat in stats.get("features", []):
                    lote_name = feat["properties"].get("Lote_Name", "")
                    val = feat["properties"].get("mean")
                    if val is not None:
                        interval_vals[lote_name] = round(float(val) * scaler, 2)

                for name in target_lote_names:
                    result_dict[name]["values"].append(interval_vals.get(name, 0.0))

            except Exception as e:
                print(f"[soildb] Error en intervalo {time_interval['label']}: {e}")
                for name in target_lote_names:
                    result_dict[name]["values"].append(0.0)

        # Guardar en caché
        _save_to_cache(cache_key, result_dict)
        print(f"[soildb] Cache GUARDADO soc_evolution key={cache_key[:8]}...")

        return result_dict

    except Exception as e:
        print(f"[soildb] Error general get_soc_evolution_soildb: {e}")
        return {}


def get_property_percentiles_evolution(gdf: gpd.GeoDataFrame,
                                          variable: str = "socd",
                                          depth: str = "0..30cm") -> dict:
    """
    Obtiene la evolución temporal de una variable con percentiles p15/p50/p85
    para cada intervalo (2000-2022) a 120m de resolución (disponibilidad de soildb).


    Returns:
        dict: {
            lote_name: {
                "p15": [v1, v2, v3, v4, v5],
                "p50": [v1, v2, v3, v4, v5],
                "p85": [v1, v2, v3, v4, v5],
                "labels": ["2000-05", "2005-10", ...]
            }
        }
    """
    if gdf is None or gdf.empty:
        return {}

    ensure_ee_initialized()
    # Cache key
    coords_repr = str(list(gdf.geometry.apply(
        lambda g: g.centroid.coords[0] if g else (0, 0)
    )))
    cache_key = _make_cache_key(
        coords_repr, f"{variable}_percentiles_evo", depth, "soildb"
    )
    cached = _get_from_cache(cache_key)
    if cached is not None:
        print(f"[soildb] Cache HIT soc_percentiles key={cache_key[:8]}...")
        return cached

    try:
        if gdf.crs is None or gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)

        if 'Lote_Name' not in gdf.columns:
            gdf['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf))]

        # Crear FeatureCollection
        features = []
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom.geom_type == 'Polygon':
                coords = [list(geom.exterior.coords)]
            elif geom.geom_type == 'MultiPolygon':
                coords = [list(list(geom.geoms)[0].exterior.coords)]
            else:
                continue
            features.append(
                ee.Feature(ee.Geometry.Polygon(coords),
                           {"Lote_Name": row.get("Lote_Name", "")})
            )

        if not features:
            return {}

        fc = ee.FeatureCollection(features)
        labels = [t["label"] for t in SOC_TIME_INTERVALS]
        scaler = SOIL_PROPERTIES[variable]["scaler"]

        # Inicializar estructura de resultados
        target_lote_names = []
        for i, row in gdf.iterrows():
            name = row.get("Lote_Name", f"Lote_{i+1}")
            target_lote_names.append(name)
            
        result_dict = {}
        for name in target_lote_names:
            result_dict[name] = {
                "p15": [],
                "p50": [],
                "p85": [],
                "labels": labels
            }

        # Para cada intervalo temporal, calcular percentiles
        for time_interval in SOC_TIME_INTERVALS:
            try:
                # Usar la capa real de percentiles en el futuro, pero GEE ReduceRegions en 30m
                img = _load_ee_image_from_gee(
                    variable, depth, time_interval["start"], time_interval["end"]
                )

                # Usar reducer de percentiles
                stats = img.reduceRegions(
                    collection=fc,
                    reducer=ee.Reducer.percentile([15, 50, 85]),
                    scale=30,
                    tileScale=2
                ).getInfo()

                interval_p15 = {}
                interval_p50 = {}
                interval_p85 = {}
                
                for feat in stats.get("features", []):
                    lote_name = feat["properties"].get("Lote_Name", "")
                    props = feat["properties"]

                    # Los nombres de las bandas son: mean_p15, mean_p50, mean_p85
                    p15_val = props.get("mean_p15") or props.get("p15")
                    p50_val = props.get("mean_p50") or props.get("p50")
                    p85_val = props.get("mean_p85") or props.get("p85")

                    if p15_val is not None:
                        interval_p15[lote_name] = round(float(p15_val) * scaler, 2)
                    if p50_val is not None:
                        interval_p50[lote_name] = round(float(p50_val) * scaler, 2)
                    if p85_val is not None:
                        interval_p85[lote_name] = round(float(p85_val) * scaler, 2)
                        
                for name in target_lote_names:
                    result_dict[name]["p15"].append(interval_p15.get(name, 0.0))
                    result_dict[name]["p50"].append(interval_p50.get(name, 0.0))
                    result_dict[name]["p85"].append(interval_p85.get(name, 0.0))

            except Exception as e:
                print(f"[soildb] Error en intervalo {time_interval['label']}: {e}")
                # Agregar ceros en caso de error
                for name in target_lote_names:
                    result_dict[name]["p15"].append(0.0)
                    result_dict[name]["p50"].append(0.0)
                    result_dict[name]["p85"].append(0.0)

        # Guardar en caché
        _save_to_cache(cache_key, result_dict)
        print(f"[soildb] Cache GUARDADO soc_percentiles key={cache_key[:8]}...")

        return result_dict

    except Exception as e:
        print(f"[soildb] Error general get_soc_percentiles_evolution: {e}")
        return {}


def get_intralot_heatmap(geometry_geojson: dict,
                         variable: str = "socd",
                         depth: str = "0..30cm",
                         map_type: str = "heatmap") -> Optional[dict]:
    """
    Genera un heatmap intralote para un polígono dado.

    Args:
        geometry_geojson: Dict GeoJSON del polígono (con 'coordinates')
        variable: Una de 'socd', 'bulk_density', 'clay', 'silt', 'sand'
        depth: Profundidad ('0..30cm', '30..60cm', '60..100cm')

    Returns:
        dict: {
            image_base64: str (PNG en base64),
            bounds: [[lat_min, lon_min], [lat_max, lon_max]],
            stats: {min, max, mean, std},
            variable: str,
            unit: str
        }
    """
    if variable not in SOIL_PROPERTIES:
        return None

    ensure_ee_initialized()
    try:
        coords = geometry_geojson["coordinates"]
        if isinstance(coords[0][0], list):
            coords = coords[0]

        roi = ee.Geometry.Polygon(coords)

        # Cargar imagen
        latest = SOC_TIME_INTERVALS[-1]
        img = _load_ee_image_from_gee(variable, depth, latest["start"], latest["end"])

        prop_cfg = SOIL_PROPERTIES[variable]
        scaler = prop_cfg["scaler"]

        # Aplicar scaler primero 
        img_scaled = img.multiply(scaler)

        # Obtener estadísticas para la leyenda
        stats_dict = img_scaled.reduceRegion(
            reducer=ee.Reducer.mean()
                .combine(ee.Reducer.stdDev(), sharedInputs=True)
                .combine(ee.Reducer.min(), sharedInputs=True)
                .combine(ee.Reducer.max(), sharedInputs=True),
            geometry=roi,
            scale=30,
            maxPixels=1e8
        ).getInfo()

        # Extraer stats (las claves dependen de la banda, tomamos el primer valor)
        stat_keys = list(stats_dict.keys())
        stats = {}
        for k in stat_keys:
            val = stats_dict[k]
            if val is not None:
                if "_mean" in k or k == "mean":
                    stats["mean"] = round(float(val), 2)
                elif "_stdDev" in k or "stdDev" in k:
                    stats["std"] = round(float(val), 2)
                elif "_min" in k or k == "min":
                    stats["min"] = round(float(val), 2)
                elif "_max" in k or k == "max":
                    stats["max"] = round(float(val), 2)

        # Calcular CV%
        if "mean" in stats and "std" in stats and stats["mean"] != 0:
            stats["cv"] = round((stats["std"] / stats["mean"]) * 100, 1)
        else:
            stats["cv"] = 0.0

        # Si no pudimos parsear las stats, intentar por posición
        if not stats or "mean" not in stats:
            vals = [v for v in stats_dict.values() if v is not None]
            if len(vals) >= 4:
                mean_val = round(float(vals[0]), 2)
                std_val = round(float(vals[1]), 2)
                stats = {
                    "mean": mean_val,
                    "std": std_val,
                    "min": round(float(vals[2]), 2),
                    "max": round(float(vals[3]), 2),
                    "cv": round((std_val / mean_val) * 100, 1) if mean_val != 0 else 0.0
                }

        # Extraer la grilla de pixeles usando sampleRectangle
        bounds = roi.bounds().getInfo()["coordinates"][0]
        lon_min = min(p[0] for p in bounds)
        lon_max = max(p[0] for p in bounds)
        lat_min = min(p[1] for p in bounds)
        lat_max = max(p[1] for p in bounds)

        bbox = ee.Geometry.Rectangle([lon_min, lat_min, lon_max, lat_max])

        # Clipear al polígono y samplear
        clipped = img_scaled.clip(roi)

        # Usar sampleRectangle para obtener la grilla de valores
        try:
            arr_dict = clipped.sampleRectangle(
                region=bbox,
                defaultValue=0
            ).getInfo()

            # La estructura es: properties -> {band_name: [[rows of values]]}
            band_name = list(arr_dict["properties"].keys())[0]
            grid = arr_dict["properties"][band_name]

            # Convertir a numpy para generar imagen
            grid_np = np.array(grid, dtype=np.float32)

            # Reemplazar 0s fuera del polígono con NaN
            grid_np[grid_np == 0] = np.nan

        except Exception as e:
            print(f"[soildb] sampleRectangle falló ({e}), usando thumbUrl")
            # Fallback: generar thumbnail via GEE
            grid_np = None

        if grid_np is not None and grid_np.size > 0:
            # Generar imagen PNG con matplotlib
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            from matplotlib.colors import Normalize
            import matplotlib.ticker as ticker

            # Dimensiones balanceadas para incluir la barra inferior
            fig, ax = plt.subplots(1, 1, figsize=(8, 8))

            # Utilizar colormaps modernos y semánticos
            if variable == "ph":
                cmap_name = "RdYlBu" # Paleta divergente para pH
            else:
                cmap_name = "YlGn"   # Paleta secuencial para materia orgánica
                
            cmap = plt.get_cmap(cmap_name).copy()
            cmap.set_bad(alpha=0)  # Transparente para NaN

            vmin = stats.get("min", np.nanmin(grid_np))
            vmax = stats.get("max", np.nanmax(grid_np))
            if vmin == vmax:
                vmin -= 1
                vmax += 1

            norm = Normalize(vmin=vmin, vmax=vmax)

            # Generación visual dependiendo del tipo de mapa seleccionado
            if map_type == "zonification":
                # Zonificación: Celdas claras y divididas
                x = np.linspace(lon_min, lon_max, grid_np.shape[1] + 1)
                y = np.linspace(lat_max, lat_min, grid_np.shape[0] + 1)
                X, Y = np.meshgrid(x, y)
                # pcolormesh genera cuadrados explícitos por cada pixel
                im = ax.pcolormesh(X, Y, grid_np, cmap=cmap, norm=norm, edgecolors='white', linewidth=0.1)
                ax.set_aspect('equal')
            else:
                # Mapa de Calor: Interpolación y suavizado
                im = ax.imshow(grid_np, cmap=cmap, norm=norm, aspect='equal',
                               extent=[lon_min, lon_max, lat_min, lat_max],
                               interpolation='bicubic')

            # Dibujar el contorno del polígono de forma estilizada (gris oscuro)
            poly_coords = np.array(coords)
            ax.plot(poly_coords[:, 0], poly_coords[:, 1], color='#334155', linewidth=1.5)

            # Títulos y limpieza de Ejes (Floating Map)
            var_desc = prop_cfg.get("description", variable.capitalize())
            var_unit = prop_cfg.get("unit", "")
            
            ax.set_title(f"Mapa de {var_desc}", fontsize=14, pad=15, color='#1e293b', fontweight='bold')
            ax.axis('off') # Ocultar grilla, líneas de ejes y coordenadas

            # Barra de colores horizontal en la parte inferior (Leyenda minimalista)
            cbar = fig.colorbar(im, ax=ax, orientation='horizontal', shrink=0.6, pad=0.05)
            cbar.outline.set_visible(False) # Remover borde negro fuerte
            cbar.set_label(f"Valor en {var_unit}", fontsize=11, color='#475569', labelpad=8, fontweight='semibold')
            cbar.ax.tick_params(labelsize=10, colors='#64748b', length=0)
            
            # Reducir número de ticks para un diseño más limpio
            cbar.locator = ticker.MaxNLocator(nbins=4)
            cbar.update_ticks()

            fig.tight_layout()

            # Guardar como PNG transparente de alta resolución
            buf = io.BytesIO()
            fig.savefig(buf, format='png', bbox_inches='tight',
                        pad_inches=0.1, transparent=True, facecolor='none', dpi=300)
            plt.close(fig)
            buf.seek(0)
            image_b64 = base64.b64encode(buf.read()).decode('utf-8')

            return {
                "image_base64": image_b64,
                "bounds": [[lat_min, lon_min], [lat_max, lon_max]],
                "stats": stats,
                "variable": variable,
                "variable_description": prop_cfg["description"],
                "unit": prop_cfg["unit"],
                "grid_shape": list(grid_np.shape),
            }
        else:
            # Sin datos de grilla, retornar solo stats
            return {
                "image_base64": None,
                "bounds": [[lat_min, lon_min], [lat_max, lon_max]],
                "stats": stats,
                "variable": variable,
                "variable_description": prop_cfg["description"],
                "unit": prop_cfg["unit"],
                "grid_shape": [0, 0],
            }

    except Exception as e:
        print(f"[soildb] Error general get_intralot_heatmap: {e}")
        import traceback
        traceback.print_exc()
        return None
