import pandas as pd
import requests
import datetime
import math
from fastapi import HTTPException
from services.ee_service import get_timeseries

# ──────────────────────────────────────────────────────────────────────────────
# Constantes Hídricas por textura (mm de agua útil por metro de profundidad)
# Fuente: INTA / FAO Soil Bulletin 55
# ──────────────────────────────────────────────────────────────────────────────
TEXTURE_AWC_MM_PER_METER = {
    'Arenoso': 80.0,
    'Franco arenoso': 120.0,
    'Franco': 160.0,
    'Franco limoso': 180.0,
    'Franco arcilloso': 150.0,
    'Arcilloso': 140.0,
    'Sin dato': 140.0
}

# CC y PMP típicos por textura (mm por metro de profundidad)
# CC = contenido volumétrico a -0.33 bar * 1000
# PMP = contenido volumétrico a -15 bar * 1000
# AUM = CC - PMP
TEXTURE_CC_PMP = {
    'Arenoso':          {'cc': 120.0, 'pmp': 40.0},   # AUM=80
    'Franco arenoso':   {'cc': 200.0, 'pmp': 80.0},   # AUM=120
    'Franco':           {'cc': 290.0, 'pmp': 130.0},   # AUM=160
    'Franco limoso':    {'cc': 330.0, 'pmp': 150.0},   # AUM=180
    'Franco arcilloso': {'cc': 340.0, 'pmp': 190.0},   # AUM=150
    'Arcilloso':        {'cc': 370.0, 'pmp': 230.0},   # AUM=140
    'Sin dato':         {'cc': 290.0, 'pmp': 130.0},   # AUM=160 (franco default)
}


def get_water_balance_info():
    return {
        'metodologia': 'Balance Hídrico Iterativo Diario (Intra-lote)',
        'fuente': 'Open-Meteo (ERA5-Land) + Sentinel-2 (NDVI)',
        'servicio': 'Motor Local AgroPulse',
        'descripcion': 'Balance hídrico diario: AW(t) = AW(t-1) + P - ETc. '
                       'ETc = ET0 * Kc(NDVI). Capacidad máxima = CC-PMP a 2m.',
        'profundidad': '2 metros',
        'actualizacion': 'Diaria',
        'cobertura': 'Global (30m)',
        'unidades': 'milímetros (mm)'
    }


def fetch_weather_daily(lat: float, lon: float, days_back: int = 90) -> pd.DataFrame:
    """Clima diario de Open-Meteo (ERA5-Land reanalysis + forecast)."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "precipitation_sum,et0_fao_evapotranspiration",
        "past_days": days_back,
        "forecast_days": 1,
        "timezone": "auto"
    }
    response = requests.get(url, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()["daily"]

    df = pd.DataFrame({
        "date": pd.to_datetime(data["time"]),
        "precipitation": [v if v is not None else 0.0 for v in data["precipitation_sum"]],
        "et0": [v if v is not None else 3.5 for v in data["et0_fao_evapotranspiration"]]
    })
    df = df.set_index("date").sort_index()
    return df


def fetch_ndvi_daily(geojson_poly: dict, days_back: int = 90) -> pd.Series:
    """Serie NDVI interpolada a frecuencia diaria."""
    end_date = datetime.date.today()
    start_date = end_date - datetime.timedelta(days=days_back)

    df_ndvi = get_timeseries(
        geojson_poly, start_date, end_date,
        index_name="NDVI", satellite="Sentinel-2", use_cache=True
    )

    if df_ndvi.empty:
        dates = pd.date_range(start=start_date, end=end_date, freq="D")
        return pd.Series(0.25, index=dates, name="NDVI")

    df_ndvi["Fecha"] = pd.to_datetime(df_ndvi["Fecha"])
    df_ndvi = df_ndvi.set_index("Fecha").sort_index()
    df_ndvi = df_ndvi[~df_ndvi.index.duplicated(keep="first")]

    daily_index = pd.date_range(start=start_date, end=end_date, freq="D")
    df_daily = df_ndvi.reindex(daily_index)
    df_daily["NDVI"] = df_daily["NDVI_Mean"].interpolate(method="time")
    df_daily["NDVI"] = df_daily["NDVI"].bfill().ffill()
    return df_daily["NDVI"]


def ndvi_to_kc(ndvi: float) -> float:
    """Convierte NDVI a Kc (coeficiente de cultivo).
    Kc_min=0.15 (suelo desnudo), Kc_max=1.15 (cultivo pleno).
    Función lineal validada por Allen et al. (1998) / FAO-56.
    """
    kc = 1.25 * ndvi - 0.10
    return max(0.15, min(1.15, kc))


def calculate_manual_water_balance(
    lote_name: str, geojson_poly: dict,
    center_lat: float, center_lon: float,
    aum_total: float, cc: float, pmp: float
) -> dict:
    """
    Balance hídrico diario iterativo (90 días).
    
    Ecuación: AW(t) = AW(t-1) + P(t) - ETc(t)
    Donde: ETc = ET0 * Kc(NDVI)
    Límites: 0 <= AW <= AUM_total (= CC - PMP al perfil de 2m)
    
    Retorna au_mm (estado actual), aum_total, cc, pmp, history[].
    """
    # 1. Obtener clima diario (Open-Meteo = datos reales, no IMERG que tiene latencia)
    df_weather = fetch_weather_daily(center_lat, center_lon, days_back=90)

    # 2. Obtener NDVI diario (interpolado desde Sentinel-2)
    series_ndvi = fetch_ndvi_daily(geojson_poly, days_back=90)

    # 3. Join por fecha
    df_balance = df_weather.join(series_ndvi.rename("ndvi"), how="inner")

    if df_balance.empty:
        return {
            "au_mm": round(aum_total * 0.5, 1),
            "aum_total": round(aum_total, 1),
            "cc": round(cc, 1), "pmp": round(pmp, 1),
            "history": []
        }

    # 4. Inicializar al 50% de capacidad (conjetura razonable sin dato previo)
    current_water = aum_total * 0.5
    history = []

    for date, row in df_balance.iterrows():
        P = row.get("precipitation", 0.0)
        if math.isnan(P): P = 0.0
        
        ET0 = row.get("et0", 3.5)
        if math.isnan(ET0): ET0 = 3.5
        
        ndvi_val = row.get("ndvi", 0.25)
        if math.isnan(ndvi_val): ndvi_val = 0.25
        
        Kc = ndvi_to_kc(ndvi_val)
        ETc = ET0 * Kc

        # Balance del día
        new_water = current_water + P - ETc

        # Límites físicos
        if new_water > aum_total:
            new_water = aum_total
        elif new_water < 0:
            new_water = 0.0

        current_water = new_water

        history.append({
            "date": date.strftime("%Y-%m-%d"),
            "precip": round(P, 1),
            "et0": round(ET0, 1),
            "etc": round(ETc, 1),
            "kc": round(Kc, 2),
            "aw_mm": round(current_water, 1)
        })

    return {
        "au_mm": round(current_water, 1),
        "aum_total": round(aum_total, 1),
        "cc": round(cc, 1),
        "pmp": round(pmp, 1),
        "history": history
    }


def calculate_water_balance_for_lots(gdf_lotes, soil_props_dict, idecor_au):
    """Orquesta el balance hídrico para todos los lotes."""
    results = {}

    for idx, row in gdf_lotes.iterrows():
        lote_name = str(row.get('Lote_Name', f'Lote_{idx}'))
        props = soil_props_dict.get(lote_name, {})
        texture = props.get("texture_class", "Sin dato")

        # ── Determinar AUM, CC, PMP ──────────────────────────────────────
        id_data = idecor_au.get(lote_name, {})
        if id_data and "au_2m" in id_data:
            # IDECOR proporciona AUM directamente
            aum_total = float(id_data["au_2m"])
            # Si IDECOR da CC/PMP reales, usarlos; sino estimar desde textura
            if "cc" in id_data and "pmp" in id_data:
                cc = float(id_data["cc"])
                pmp = float(id_data["pmp"])
            else:
                # Estimar CC y PMP manteniendo la relación AUM = CC - PMP
                tex_data = TEXTURE_CC_PMP.get(texture, TEXTURE_CC_PMP['Sin dato'])
                ratio = tex_data['cc'] / (tex_data['cc'] - tex_data['pmp'])  # CC/(CC-PMP) 
                cc = round(aum_total * ratio, 1)
                pmp = round(cc - aum_total, 1)
        else:
            # Fallback: textura genérica
            tex_data = TEXTURE_CC_PMP.get(texture, TEXTURE_CC_PMP['Sin dato'])
            depth = 2.0
            aum_total = float(TEXTURE_AWC_MM_PER_METER.get(texture, 140.0) * depth)
            cc = round(tex_data['cc'] * depth, 1)
            pmp = round(tex_data['pmp'] * depth, 1)

        # Validación: AUM debe ser CC - PMP
        if abs((cc - pmp) - aum_total) > 10:
            print(f"[WB] WARNING {lote_name}: AUM={aum_total} != CC-PMP={cc}-{pmp}={cc-pmp}. Ajustando.")
            aum_total = cc - pmp

        # ── Geometría ────────────────────────────────────────────────────
        geom = row.geometry
        center_lat = geom.centroid.y
        center_lon = geom.centroid.x

        if geom.geom_type == 'Polygon':
            coords = [list(geom.exterior.coords)]
        elif geom.geom_type == 'MultiPolygon':
            coords = [list(geom.geoms[0].exterior.coords)]
        else:
            continue

        geojson_poly = {"type": "Polygon", "coordinates": coords}

        try:
            wb = calculate_manual_water_balance(
                lote_name, geojson_poly, center_lat, center_lon,
                aum_total, cc, pmp
            )
            results[lote_name] = wb
            print(f"[WB] {lote_name}: AU={wb['au_mm']}/{wb['aum_total']}mm "
                  f"(CC={wb['cc']}, PMP={wb['pmp']})")
        except Exception as e:
            import traceback
            print(f"Error water_balance in {lote_name}: {e}")
            traceback.print_exc()
            results[lote_name] = {
                "au_mm": round(aum_total * 0.5, 1),
                "aum_total": round(aum_total, 1),
                "cc": round(cc, 1), "pmp": round(pmp, 1),
                "history": []
            }

    return results
