"""
Servicio de precios históricos de commodities agropecuarios.
Fuente: World Bank Commodity Markets "Pink Sheet" (CMO-Historical-Data-Monthly.xlsx)
Licencia: CC-BY (Creative Commons Attribution)

Descarga el archivo mensual del World Bank, parsea las columnas relevantes
(Soja, Maíz, Trigo, Urea, DAP, TSP) y expone los datos como JSON.
"""
import io
import time
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

# ── URLs del Pink Sheet (World Bank) ──
# La URL contiene un hash que cambia con cada publicación mensual.
# Mantenemos múltiples URLs como fallback por si una expira.
PINK_SHEET_URLS = [
    # URL actual (Abril 2026)
    "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx",
    # URL alternativa (patrón conocido del World Bank)
    "https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx",
    # Datos anuales como último recurso (más estable)
    "https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Annual.xlsx",
]

# ── Cache en memoria (24 horas — datos mensuales, no necesitan refresco frecuente) ──
_history_cache: Optional[Dict[str, Any]] = None
_cache_timestamp: float = 0
CACHE_TTL_SECONDS = 24 * 3600  # 24 horas

# ── Mapeo de columnas del Pink Sheet a nuestros IDs internos ──
# Estas columnas representan los headers reales del xlsx del World Bank
# El archivo tiene estructura: primera columna es fecha, las demás son commodities
COMMODITY_SEARCH_TERMS = {
    "soja": ["soybeans", "soybean"],
    "maiz": ["maize", "corn"],
    "trigo": ["wheat"],
    "urea": ["urea"],
    "dap": ["dap"],
    "tsp": ["tsp"],
}

COMMODITY_LABELS = {
    "soja": "Soja",
    "maiz": "Maíz",
    "trigo": "Trigo",
    "urea": "Urea",
    "dap": "DAP (Fosfato Diamónico)",
    "tsp": "TSP (Superfosfato Triple)",
}

COMMODITY_UNITS = {
    "soja": "USD/mt",
    "maiz": "USD/mt",
    "trigo": "USD/mt",
    "urea": "USD/mt",
    "dap": "USD/mt",
    "tsp": "USD/mt",
}


def _find_column(columns: List[str], search_terms: List[str]) -> Optional[str]:
    """Busca una columna en el DataFrame que coincida con alguno de los términos de búsqueda."""
    for col in columns:
        col_lower = str(col).lower().strip()
        for term in search_terms:
            if term in col_lower:
                return col
    return None


def _parse_pink_sheet(xlsx_bytes: bytes) -> Dict[str, Any]:
    """
    Parsea el archivo Excel del World Bank Pink Sheet.
    Retorna un dict con las series de tiempo de cada commodity.
    """
    # El Pink Sheet tiene múltiples hojas. Los precios mensuales están en la hoja "Monthly Prices"
    # o a veces "Monthly Indices". Intentamos ambas.
    df = None
    for sheet_name in ["Monthly Prices", "monthly prices", "Monthly prices", None]:
        try:
            if sheet_name is None:
                # Leer la primera hoja como fallback
                df = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=0, engine="openpyxl")
            else:
                df = pd.read_excel(io.BytesIO(xlsx_bytes), sheet_name=sheet_name, engine="openpyxl")
            if df is not None and len(df) > 10:
                break
        except Exception:
            continue

    if df is None or len(df) < 10:
        raise ValueError("No se pudo parsear ninguna hoja del Pink Sheet")

    # El Pink Sheet suele tener las primeras filas como headers complicados.
    # Buscamos la fila que contiene "Soybeans" o similar para identificar el header real.
    header_row = None
    for idx in range(min(10, len(df))):
        row_values = [str(v).lower() for v in df.iloc[idx].values if pd.notna(v)]
        row_text = " ".join(row_values)
        if "soybean" in row_text or "maize" in row_text or "wheat" in row_text:
            header_row = idx
            break

    if header_row is not None:
        # Reconstruir el DataFrame con el header correcto
        new_headers = df.iloc[header_row].values
        df = df.iloc[header_row + 1:].reset_index(drop=True)
        df.columns = new_headers

    # La primera columna siempre es la fecha (formato YYYYMXX donde XX es mes)
    date_col = df.columns[0]

    # Buscar las columnas de cada commodity
    found_columns = {}
    for commodity_id, search_terms in COMMODITY_SEARCH_TERMS.items():
        col = _find_column(list(df.columns), search_terms)
        if col is not None:
            found_columns[commodity_id] = col

    if not found_columns:
        raise ValueError(f"No se encontraron columnas de commodities. Columnas disponibles: {list(df.columns)[:20]}")

    # Construir las series de tiempo
    series = {}
    for commodity_id, col_name in found_columns.items():
        data_points = []
        for _, row in df.iterrows():
            date_val = row[date_col]
            price_val = row[col_name]

            # Parsear fecha (puede ser "2024M01" o datetime o float)
            date_str = None
            if isinstance(date_val, datetime):
                date_str = date_val.strftime("%Y-%m")
            elif isinstance(date_val, str):
                # Formato "2024M01" o "2024M1"
                date_val = date_val.strip()
                if "M" in date_val.upper():
                    parts = date_val.upper().split("M")
                    if len(parts) == 2:
                        try:
                            year = int(parts[0])
                            month = int(parts[1])
                            if 1960 <= year <= 2030 and 1 <= month <= 12:
                                date_str = f"{year}-{month:02d}"
                        except ValueError:
                            pass

            if date_str is None:
                continue

            # Parsear precio
            try:
                price = float(price_val)
                if price > 0 and price < 5000:  # Sanity check
                    data_points.append({"date": date_str, "price": round(price, 2)})
            except (ValueError, TypeError):
                continue

        if data_points:
            series[commodity_id] = {
                "id": commodity_id,
                "label": COMMODITY_LABELS.get(commodity_id, commodity_id),
                "unit": COMMODITY_UNITS.get(commodity_id, "USD/mt"),
                "data": data_points,
                "count": len(data_points),
                "last_date": data_points[-1]["date"] if data_points else None,
                "last_price": data_points[-1]["price"] if data_points else None,
            }

    return series


async def get_commodity_history() -> Dict[str, Any]:
    """
    Obtiene los precios históricos de commodities del World Bank Pink Sheet.
    Descarga y parsea el archivo con cache de 24 horas.
    """
    global _history_cache, _cache_timestamp

    # Retornar cache si es válido
    if _history_cache and (time.time() - _cache_timestamp) < CACHE_TTL_SECONDS:
        return {**_history_cache, "cached": True}

    error_msg = None
    series = {}

    try:
        # Intentar descargar de múltiples URLs (fallback si una expira)
        xlsx_bytes = None
        last_error = None
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            for url in PINK_SHEET_URLS:
                try:
                    resp = await client.get(url)
                    resp.raise_for_status()
                    xlsx_bytes = resp.content
                    logger.info(f"Pink Sheet descargado de: {url[:80]}... ({len(xlsx_bytes)} bytes)")
                    break
                except Exception as e:
                    last_error = e
                    logger.warning(f"URL fallida: {url[:60]}... — {e}")
                    continue

        if xlsx_bytes is None:
            raise Exception(f"Todas las URLs del Pink Sheet fallaron. Último error: {last_error}")

        # Parsear
        series = _parse_pink_sheet(xlsx_bytes)
        logger.info(f"Commodities parseados: {list(series.keys())}")

    except Exception as e:
        logger.error(f"Error descargando/parseando Pink Sheet: {e}")
        error_msg = str(e)

    result = {
        "series": series,
        "source": "World Bank Commodity Markets (Pink Sheet)",
        "source_url": "https://www.worldbank.org/en/research/commodity-markets",
        "license": "CC-BY",
        "updated": time.strftime("%Y-%m-%d %H:%M"),
        "error": error_msg,
        "cached": False,
    }

    if not error_msg and series:
        _history_cache = result
        _cache_timestamp = time.time()

    return result


def compute_ip_ratios(series: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Calcula las Relaciones Insumo-Producto (IP) a partir de las series de precios.
    
    Relación IP = Precio Insumo (USD/tn) / Precio Grano (USD/tn) × 10
    Resultado en: quintales de grano por tonelada de insumo
    
    Se calculan las siguientes relaciones:
    - Soja / Urea
    - Maíz / Urea  
    - Soja / DAP
    """
    RATIOS_CONFIG = [
        {"id": "soja_urea", "grain": "soja", "input": "urea", 
         "label": "Soja / Urea", "description": "qq de Soja por tn de Urea",
         "unit": "qq Soja / tn Urea"},
        {"id": "maiz_urea", "grain": "maiz", "input": "urea",
         "label": "Maíz / Urea", "description": "qq de Maíz por tn de Urea",
         "unit": "qq Maíz / tn Urea"},
        {"id": "soja_dap", "grain": "soja", "input": "dap",
         "label": "Soja / DAP", "description": "qq de Soja por tn de DAP",
         "unit": "qq Soja / tn DAP"},
    ]

    ratios = []

    for config in RATIOS_CONFIG:
        grain_series = series.get(config["grain"])
        input_series = series.get(config["input"])

        if not grain_series or not input_series:
            continue

        # Crear diccionarios de fecha → precio
        grain_prices = {dp["date"]: dp["price"] for dp in grain_series["data"]}
        input_prices = {dp["date"]: dp["price"] for dp in input_series["data"]}

        # Calcular ratio para cada fecha en común
        data_points = []
        for date in sorted(grain_prices.keys()):
            if date in input_prices and grain_prices[date] > 0:
                # Ratio = (Precio Insumo USD/tn) / (Precio Grano USD/tn) × 10
                # El ×10 convierte toneladas a quintales
                ratio = (input_prices[date] / grain_prices[date]) * 10
                data_points.append({
                    "date": date,
                    "ratio": round(ratio, 2),
                    "grain_price": grain_prices[date],
                    "input_price": input_prices[date],
                })

        if not data_points:
            continue

        # Calcular estadísticas
        all_ratios = [dp["ratio"] for dp in data_points]
        avg_ratio = sum(all_ratios) / len(all_ratios)
        
        # Percentiles para banda de referencia
        sorted_ratios = sorted(all_ratios)
        p25_idx = int(len(sorted_ratios) * 0.25)
        p75_idx = int(len(sorted_ratios) * 0.75)
        p25 = sorted_ratios[p25_idx]
        p75 = sorted_ratios[p75_idx]
        
        current = data_points[-1] if data_points else None
        current_ratio = current["ratio"] if current else 0
        
        # Semáforo: por debajo del promedio = FAVORABLE (comprar), por encima = DESFAVORABLE (esperar)
        pct_vs_avg = ((current_ratio - avg_ratio) / avg_ratio) * 100 if avg_ratio > 0 else 0
        if pct_vs_avg <= -10:
            signal = "favorable"
            signal_label = f"🟢 {abs(pct_vs_avg):.0f}% por debajo del promedio — Momento favorable para comprar"
        elif pct_vs_avg <= 10:
            signal = "neutral"
            signal_label = f"🟡 Dentro del rango normal (±10% del promedio histórico)"
        else:
            signal = "desfavorable"
            signal_label = f"🔴 {pct_vs_avg:.0f}% por encima del promedio — Ratio desfavorable"

        ratios.append({
            "id": config["id"],
            "label": config["label"],
            "description": config["description"],
            "unit": config["unit"],
            "data": data_points,
            "stats": {
                "mean": round(avg_ratio, 2),
                "p25": round(p25, 2),
                "p75": round(p75, 2),
                "min": round(min(all_ratios), 2),
                "max": round(max(all_ratios), 2),
                "count": len(data_points),
            },
            "current": {
                "date": current["date"] if current else None,
                "ratio": current_ratio,
                "grain_price": current["grain_price"] if current else None,
                "input_price": current["input_price"] if current else None,
                "signal": signal,
                "signal_label": signal_label,
                "pct_vs_avg": round(pct_vs_avg, 1),
            },
        })

    return ratios
