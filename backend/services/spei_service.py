import math
import datetime
import calendar
import requests
import pandas as pd
import numpy as np
import scipy.stats as stats
from services.ee_service import get_imerg_monthly_precipitation, _get_from_cache, _save_to_cache, _make_cache_key

def calculate_extraterrestrial_radiation(lat_deg, month):
    """
    Calcula radiacion extraterrestre mensual (Ra) segun la ecuacion de la FAO
    lat_deg: latitud en grados
    month: mes del 1 al 12
    Retorna Ra en mm/dia (equivalente de evaporacion)
    """
    lat_rad = math.radians(lat_deg)
    
    # Dia juliano representativo del mes
    J = int(30.42 * month - 15.23)
    
    # Declinacion solar (rad)
    solar_dec = 0.409 * math.sin((2 * math.pi / 365) * J - 1.39)
    
    # Angulo horario del atardecer (rad)
    ws = math.acos(max(min(-math.tan(lat_rad) * math.tan(solar_dec), 1.0), -1.0))
    
    # Inversa de la distancia relativa Tierra-Sol
    dr = 1 + 0.033 * math.cos((2 * math.pi / 365) * J)
    
    # Constante solar = 0.0820 MJ m-2 min-1
    # Multiplicar por 24(60)/pi = 37.586
    # Para pasar a mm/dia dividir por lambda (aprox 2.45)
    # 37.586 / 2.45 = 15.34
    Ra_mm_day = (24 * 60 / math.pi) * 0.0820 * dr * (
        ws * math.sin(lat_rad) * math.sin(solar_dec) +
        math.cos(lat_rad) * math.cos(solar_dec) * math.sin(ws)
    ) / 2.45
    
    return max(Ra_mm_day, 0.1)

def fetch_nasa_power_temperatures(lat, lon, start_year, end_year):
    """
    Obtiene temperaturas minimas y maximas mensuales de NASA POWER 
    """
    # Caché
    cache_key = _make_cache_key([lon, lat], f"{start_year}", f"{end_year}", "NASA_POWER", "TEMPS")
    cached = _get_from_cache(cache_key)
    if cached is not None:
        print(f"[Cache] HIT NASA POWER key={cache_key[:8]}...")
        return cached

    print(f"[Cache] MISS NASA POWER - consultando API (key={cache_key[:8]}...)")
    
    url = "https://power.larc.nasa.gov/api/temporal/monthly/point"
    params = {
        "parameters": "T2M_MAX,T2M_MIN",
        "community": "AG",
        "longitude": lon,
        "latitude": lat,
        "start": start_year,
        "end": end_year,
        "format": "JSON"
    }
    
    response = requests.get(url, params=params, timeout=30)
    
    # Si NASA POWER falla con 422 (frecuente a principios de año si no habilitaron el nuevo año en el endpoint mensual)
    if response.status_code == 422 and end_year == datetime.datetime.now().year:
        print(f"[NASA POWER] 422 con año {end_year}. Reintentando con {end_year - 1}...")
        params["end"] = end_year - 1
        response = requests.get(url, params=params, timeout=30)
        
    response.raise_for_status()
    data = response.json()
    
    # Procesar
    features = data.get("properties", {}).get("parameter", {})
    tmax_data = features.get("T2M_MAX", {})
    tmin_data = features.get("T2M_MIN", {})
    
    records = []
    
    for key, tmax in tmax_data.items():
        if len(key) != 6: continue # Skip '13' (annual)
        year = int(key[:4])
        month = int(key[4:6])
        if month > 12: continue
        
        tmin = tmin_data.get(key)
        
        if tmax is None or tmax == -999.0 or tmin is None or tmin == -999.0:
            continue
            
        records.append({
            'year': year,
            'month': month,
            'tmax': tmax,
            'tmin': tmin
        })
        
    df = pd.DataFrame(records)
    if not df.empty:
        df = df.sort_values(['year', 'month'])
        _save_to_cache(cache_key, df)
        
    return df

def calculate_hargreaves_pet(row, lat):
    # Ra en mm/día
    Ra = calculate_extraterrestrial_radiation(lat, row['month'])
    
    # Días en el mes
    try:
        days_in_month = calendar.monthrange(int(row['year']), int(row['month']))[1]
    except Exception:
        days_in_month = 30
        
    tmean = (row['tmax'] + row['tmin']) / 2.0
    trange = max(row['tmax'] - row['tmin'], 0.1)
    
    pet_daily = 0.0023 * Ra * (tmean + 17.8) * math.sqrt(trange)
    return max(pet_daily * days_in_month, 0.0)

def standardize_series(series):
    """
    Ajusta una distribución log-logística (Fisk) a una serie de datos
    y devuelve la probabilidad convertida a distribución normal estandar (SPEI).
    """
    valid_data = series.dropna()
    if len(valid_data) < 10: 
        # Insufficient data to fit a distribution reliably
        return pd.Series(np.nan, index=series.index)
        
    if np.std(valid_data) == 0:
        # Zero variance: return exactly 0 for SPEI
        return pd.Series(0.0, index=series.index)
        
    try:
        # Ajuste de distribución Log-Logística
        # stats.fisk usa c, loc, scale
        c, loc, scale = stats.fisk.fit(valid_data)
        
        # Calcular CDF real
        cdf = stats.fisk.cdf(series, c, loc=loc, scale=scale)
        
        # Invertir normal estandar para obtener SPEI
        # Se restringe CDF para no dar infs
        cdf = np.clip(cdf, 0.0001, 0.9999)
        spei_vals = stats.norm.ppf(cdf)
        
        # Filtrar valores extremos irreales generados por malos ajustes
        spei_vals = np.clip(spei_vals, -3.5, 3.5)
        
        return pd.Series(spei_vals, index=series.index)
    except Exception as e:
        print(f"Error ajustando distribución en SPEI: {e}")
        return pd.Series(np.nan, index=series.index)

def calculate_spei_for_lot(geojson_poly, lat, lon):
    """
    Calcula el SPEI historico y devuelve data util para frontend
    """
    end_year = datetime.datetime.now().year
    start_year = 2001 # 20+ años historico de IMERG
    
    # 1. P = Precipitacion
    precip_records = get_imerg_monthly_precipitation(geojson_poly, start_year, end_year)
    if not precip_records:
        raise ValueError("No se pudo extraer precipitacion historica de IMERG para SPEI")
    df_p = pd.DataFrame(precip_records)
    
    # 2. T = Temperatura
    df_t = fetch_nasa_power_temperatures(lat, lon, start_year, end_year)
    if df_t.empty:
         raise ValueError("No se pudo extraer temperatura historica de NASA POWER para SPEI")
         
    # Merge left to keep all precipitation data (IMERG is usually more up-to-date than NASA POWER)
    df = pd.merge(df_p, df_t, on=['year', 'month'], how='left')
    
    # Fill missing TMAX/TMIN with historical monthly averages to avoid dropping the current month
    df['tmax'] = df.groupby('month')['tmax'].transform(lambda x: x.fillna(x.mean()))
    df['tmin'] = df.groupby('month')['tmin'].transform(lambda x: x.fillna(x.mean()))
    
    if df.empty or df['tmax'].isnull().all():
         raise ValueError("No hay datos validos suficientes para calcular SPEI")
         
    # 3. Calculate PET
    df['pet'] = df.apply(lambda r: calculate_hargreaves_pet(r, lat), axis=1)
    
    # 4. Deficit
    df['D'] = df['precipitation_mm'] - df['pet']
    
    # Sort just in case
    df = df.sort_values(['year', 'month']).reset_index(drop=True)
    
    # Create Date variable for plotting later
    df['date'] = pd.to_datetime(df[['year', 'month']].assign(day=1))
    
    results = df[['year', 'month', 'date']].copy()
    
    # 5. Acumulaciones D y Estandarizacion
    scales = [1, 3, 6]
    
    for scale in scales:
        col_accum = f'D_accum_{scale}'
        col_spei = f'spei_{scale}'
        
        # Suma rodante (rolling sum)
        df[col_accum] = df['D'].rolling(window=scale, min_periods=scale).sum()
        
        # Estandarizacion PER MES para eliminar estacionalidad
        df[col_spei] = df.groupby('month')[col_accum].transform(standardize_series)
        results[col_spei] = df[col_spei]
        
    results = results.dropna(subset=[f'spei_{max(scales)}'])
    
    # Extraer el ultimo año de datos para decision board y ultimos 5 años para grafico
    last_year_data = results.tail(12).copy()
    last_5_years = results.tail(12 * 5).copy()
    
    # Current values
    current = results.iloc[-1]
    
    return {
        "current": {
            "spei_1": round(current['spei_1'], 2),
            "spei_3": round(current['spei_3'], 2),
            "spei_6": round(current['spei_6'], 2),
            "date": current['date'].strftime('%Y-%m'),
        },
        "history_5y": last_5_years.assign(date_str=lambda x: x['date'].dt.strftime('%b %Y')).drop(columns=['date']).to_dict(orient='records')
    }
