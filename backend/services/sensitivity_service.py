"""
Servicio de Análisis de Sensibilidad Avanzado.

Calcula la matriz de sensibilidad Precio × Rendimiento con percentiles
históricos de precios derivados del World Bank Pink Sheet (misma fuente
ya integrada en commodity_history_service.py).

La lógica replica y extiende la planilla Excel del profesor:
- Ejes de precio: P5 a P95 de los últimos N años (configurable).
- Ejes de rendimiento: rango configurable por cultivo.
- Valores de celda: Margen Bruto en USD/ha o porcentaje sobre costos.
"""

import logging
import math
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

from services.commodity_history_service import get_commodity_history

logger = logging.getLogger(__name__)

# ── Mapeo de cultivos internos a commodity IDs del Pink Sheet ──
CROP_TO_COMMODITY = {
    "Soja": "soja",
    "Soja Segunda": "soja",
    "Maíz": "maiz",
    "Trigo": "trigo",
    "Girasol": None,  # No está en Pink Sheet
    "Sorgo": None,
    "Cebada": None,
    "Maní": None,
}

# ── Retenciones vigentes (DEX) ──
RETENCIONES = {
    "Soja": 0.33,
    "Soja Segunda": 0.33,
    "Maíz": 0.12,
    "Trigo": 0.12,
    "Girasol": 0.07,
    "Sorgo": 0.12,
    "Cebada": 0.12,
    "Maní": 0.0,
}

# ── Gastos de comercialización (comisiones, paritarias, etc.) ──
COMERCIALIZACION = {
    "Soja": 0.02,
    "Soja Segunda": 0.02,
    "Maíz": 0.02,
    "Trigo": 0.02,
    "Girasol": 0.02,
    "Sorgo": 0.02,
    "Cebada": 0.02,
    "Maní": 0.03,
}

# ── Costo de secada (USD/tn) ──
SECADA = {
    "Soja": 0,
    "Soja Segunda": 0,
    "Maíz": 4,
    "Trigo": 5,
    "Girasol": 0,
    "Sorgo": 3,
    "Cebada": 4,
    "Maní": 12,
}

# Rangos de rendimiento por cultivo (qq/ha) — Rango grande como pide el profesor
YIELD_RANGES = {
    "Soja":         {"min": 10, "max": 80, "step": 5, "medio": 37},
    "Soja Segunda": {"min": 8,  "max": 55, "step": 5, "medio": 27},
    "Maíz":         {"min": 20, "max": 150, "step": 10, "medio": 88},
    "Trigo":        {"min": 10, "max": 100, "step": 5, "medio": 42},
    "Girasol":      {"min": 8,  "max": 40, "step": 3, "medio": 21},
    "Sorgo":        {"min": 20, "max": 100, "step": 10, "medio": 60},
    "Cebada":       {"min": 15, "max": 80, "step": 5, "medio": 40},
    "Maní":         {"min": 10, "max": 55, "step": 5, "medio": 30},
}


def _percentile(sorted_values: List[float], p: float) -> float:
    """Calcula percentil p (0-100) de una lista ya ordenada."""
    if not sorted_values:
        return 0
    k = (len(sorted_values) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    d0 = sorted_values[int(f)] * (c - k)
    d1 = sorted_values[int(c)] * (k - f)
    return d0 + d1


@dataclass
class PriceDistribution:
    """Distribución de precios históricos de un commodity."""
    commodity_id: str
    crop_id: str
    count: int
    from_date: str
    to_date: str
    p5: float
    p10: float
    p25: float
    p50: float  # mediana
    p75: float
    p90: float
    p95: float
    mean: float
    min_price: float
    max_price: float
    current_price: float  # último precio disponible
    all_prices: List[float]  # para el histograma del frontend


async def compute_price_distribution(
    crop_id: str,
    from_year: int = 2015,
    current_override: Optional[float] = None,
) -> Optional[PriceDistribution]:
    """
    Obtiene la distribución de precios históricos para un cultivo dado.
    Usa el Pink Sheet del World Bank como fuente.
    """
    commodity_id = CROP_TO_COMMODITY.get(crop_id)
    if commodity_id is None:
        return None

    data = await get_commodity_history()
    if not data.get("series") or commodity_id not in data["series"]:
        return None

    series = data["series"][commodity_id]
    # Filtrar por año
    filtered = [
        dp for dp in series["data"]
        if int(dp["date"][:4]) >= from_year
    ]

    if len(filtered) < 6:
        return None

    prices = sorted([dp["price"] for dp in filtered])
    current = current_override if current_override is not None else filtered[-1]["price"]

    return PriceDistribution(
        commodity_id=commodity_id,
        crop_id=crop_id,
        count=len(prices),
        from_date=filtered[0]["date"],
        to_date=filtered[-1]["date"],
        p5=round(_percentile(prices, 5), 2),
        p10=round(_percentile(prices, 10), 2),
        p25=round(_percentile(prices, 25), 2),
        p50=round(_percentile(prices, 50), 2),
        p75=round(_percentile(prices, 75), 2),
        p90=round(_percentile(prices, 90), 2),
        p95=round(_percentile(prices, 95), 2),
        mean=round(sum(prices) / len(prices), 2),
        min_price=round(min(prices), 2),
        max_price=round(max(prices), 2),
        current_price=round(current, 2),
        all_prices=[round(p, 2) for p in prices],
    )


def generate_price_axis(dist: PriceDistribution, num_cols: int = 7) -> List[Dict[str, Any]]:
    """
    Genera el eje de precios usando percentiles históricos.
    Retorna num_cols puntos distribuidos entre P5 y P95, siempre incluyendo
    el precio actual (o mediana) como referencia central.
    """
    # Puntos de percentil fijos: P5, P10, P25, P50 (mediana), P75, P90, P95
    percentile_points = [
        {"pct_label": "P5",  "price": dist.p5,  "percentile": 5},
        {"pct_label": "P10", "price": dist.p10, "percentile": 10},
        {"pct_label": "P25", "price": dist.p25, "percentile": 25},
        {"pct_label": "P50", "price": dist.p50, "percentile": 50},
        {"pct_label": "P75", "price": dist.p75, "percentile": 75},
        {"pct_label": "P90", "price": dist.p90, "percentile": 90},
        {"pct_label": "P95", "price": dist.p95, "percentile": 95},
    ]

    # Inyectar el precio actual si no está ya en la lista
    # con una tolerancia pequeña para evitar duplicados visuales
    current_exists = any(abs(p["price"] - dist.current_price) < 0.5 for p in percentile_points)
    if not current_exists:
        percentile_points.append({
            "pct_label": "Actual/Pizarra",
            "price": dist.current_price,
            "percentile": "Act"
        })

    # Ordenar los puntos de menor a mayor precio para que el rango sea secuencial en la matriz
    percentile_points.sort(key=lambda x: x["price"])

    return percentile_points


def generate_yield_axis(crop_id: str, rinde_esperado: Optional[float] = None) -> List[Dict[str, Any]]:
    """
    Genera el eje de rendimientos para un cultivo.
    Incluye siempre el rinde esperado del productor si se proporciona.
    """
    yr = YIELD_RANGES.get(crop_id, {"min": 10, "max": 80, "step": 5, "medio": 35})
    rinde_base = rinde_esperado if rinde_esperado is not None else yr["medio"]

    # Generar puntos: desde min hasta max con step definido
    points = []
    rto = yr["min"]
    while rto <= yr["max"]:
        points.append(rto)
        rto += yr["step"]

    # Asegurarnos de incluir el rinde esperado
    if rinde_base not in points:
        points.append(rinde_base)
        points.sort()

    return [
        {
            "rto": p,
            "is_expected": p == rinde_base,
            "relative": round(p / rinde_base, 4) if rinde_base > 0 else 1.0,
        }
        for p in points
    ]


async def compute_sensitivity_matrix(
    crop_id: str,
    costos_totales: float,
    flete_usd_tn: float = 0,
    from_year: int = 2015,
    rinde_esperado: Optional[float] = None,
    current_price_override: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    """
    Calcula la matriz completa de Análisis de Sensibilidad.

    Parámetros:
    - crop_id: ID del cultivo (ej. "Soja", "Maíz", etc.)
    - costos_totales: Costos totales en USD/ha (directos + indirectos)
    - flete_usd_tn: Costo de flete en USD/tn
    - from_year: Año de inicio para el cálculo de percentiles
    - rinde_esperado: Rendimiento esperado del productor (qq/ha)
    - current_price_override: Override del precio actual pizarra (USD/tn)

    Retorna la matriz con:
    - mb_usd: Margen Bruto en USD/ha
    - mb_pct: Margen Bruto como % sobre costos
    """
    # 1. Obtener distribución de precios
    dist = await compute_price_distribution(
        crop_id, from_year, current_price_override
    )

    # Si no hay datos históricos (cultivo no soportado), generar con variaciones porcentuales
    if dist is None:
        if current_price_override is None:
            return None
        # Crear distribución sintética basada en variaciones porcentuales
        base_price = current_price_override
        dist = PriceDistribution(
            commodity_id="synthetic",
            crop_id=crop_id,
            count=0,
            from_date="N/A",
            to_date="N/A",
            p5=round(base_price * 0.70, 2),
            p10=round(base_price * 0.75, 2),
            p25=round(base_price * 0.85, 2),
            p50=round(base_price, 2),
            p75=round(base_price * 1.15, 2),
            p90=round(base_price * 1.25, 2),
            p95=round(base_price * 1.30, 2),
            mean=round(base_price, 2),
            min_price=round(base_price * 0.65, 2),
            max_price=round(base_price * 1.35, 2),
            current_price=round(base_price, 2),
            all_prices=[],
        )

    # 2. Generar ejes
    price_axis = generate_price_axis(dist)
    yield_axis = generate_yield_axis(crop_id, rinde_esperado)

    # 3. Parámetros de costo del cultivo
    ret_frac = RETENCIONES.get(crop_id, 0.12)
    com_frac = COMERCIALIZACION.get(crop_id, 0.02)
    secada = SECADA.get(crop_id, 0)

    # 4. Construir la matriz
    matrix = []
    for y_point in yield_axis:
        rto = y_point["rto"]
        row_values = []
        for p_point in price_axis:
            pizarra = p_point["price"]

            # Cálculo del precio neto (tranquera)
            precio_post_dex = pizarra * (1 - ret_frac)
            gastos_comerciales = precio_post_dex * com_frac
            precio_neto_tn = precio_post_dex - flete_usd_tn - gastos_comerciales - secada
            precio_neto_qq = precio_neto_tn / 10

            # Margen Bruto
            ingreso = rto * precio_neto_qq
            mb_usd = round(ingreso - costos_totales)
            mb_pct = round(((ingreso / costos_totales) - 1) * 100, 1) if costos_totales > 0 else 0

            row_values.append({
                "mb_usd": mb_usd,
                "mb_pct": mb_pct,
                "precio_pizarra": round(pizarra, 2),
                "precio_neto_qq": round(precio_neto_qq, 2),
            })

        matrix.append({
            "rto": rto,
            "is_expected": y_point["is_expected"],
            "relative": y_point["relative"],
            "values": row_values,
        })

    # 5. Encontrar la celda del escenario actual (precio actual × rinde esperado)
    current_cell = None
    rinde_base = rinde_esperado or YIELD_RANGES.get(crop_id, {}).get("medio", 35)
    for row in matrix:
        if row["is_expected"]:
            # Buscar la columna exacta o más cercana al precio actual
            min_diff = float('inf')
            for i, val in enumerate(row["values"]):
                diff = abs(val["precio_pizarra"] - dist.current_price)
                if diff < min_diff:
                    min_diff = diff
                    current_cell = {
                        "row_idx": matrix.index(row),
                        "col_idx": i,
                        "mb_usd": val["mb_usd"],
                        "mb_pct": val["mb_pct"],
                    }
            break

    return {
        "crop_id": crop_id,
        "costos_totales": round(costos_totales),
        "flete_usd_tn": round(flete_usd_tn, 2),
        "price_distribution": {
            "source": "World Bank Pink Sheet" if dist.commodity_id != "synthetic" else "Variación porcentual (sin datos históricos)",
            "is_historical": dist.commodity_id != "synthetic",
            "count": dist.count,
            "from_date": dist.from_date,
            "to_date": dist.to_date,
            "p5": dist.p5,
            "p10": dist.p10,
            "p25": dist.p25,
            "p50": dist.p50,
            "p75": dist.p75,
            "p90": dist.p90,
            "p95": dist.p95,
            "mean": dist.mean,
            "min": dist.min_price,
            "max": dist.max_price,
            "current": dist.current_price,
            "histogram": dist.all_prices,
        },
        "price_axis": price_axis,
        "yield_axis": [{"rto": y["rto"], "is_expected": y["is_expected"], "relative": y["relative"]} for y in yield_axis],
        "matrix": [
            {
                "rto": row["rto"],
                "is_expected": row["is_expected"],
                "relative": row["relative"],
                "values": row["values"],
            }
            for row in matrix
        ],
        "current_cell": current_cell,
    }
