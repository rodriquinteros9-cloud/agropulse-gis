"""
Router del Análisis de Sensibilidad Avanzado.
Expone endpoints para calcular matrices de sensibilidad Precio × Rendimiento
con variaciones de +/- 32% sobre el precio pizarra actual (BCR).
"""
from fastapi import APIRouter, Query
from typing import Optional
from services.sensitivity_service import compute_sensitivity_matrix, compute_price_distribution

router = APIRouter()


@router.get("/sensitivity/matrix")
async def get_sensitivity_matrix(
    crop_id: str = Query(..., description="ID del cultivo (Soja, Maíz, Trigo, etc.)"),
    costos_totales: float = Query(..., description="Costos totales en USD/ha"),
    flete_usd_tn: float = Query(default=0, description="Costo de flete en USD/tn"),
    from_year: int = Query(default=2015, ge=2000, le=2030, description="Año de inicio para percentiles históricos"),
    rinde_esperado: Optional[float] = Query(default=None, description="Rendimiento esperado (qq/ha)"),
    current_price: Optional[float] = Query(default=None, description="Precio pizarra actual (USD/tn) — override"),
):
    """
    Calcula la matriz de sensibilidad completa para un cultivo.
    
    Retorna:
    - Distribución de precios históricos (P5-P95)
    - Eje de precios (basado en percentiles)
    - Eje de rendimientos (rango amplio por cultivo)
    - Matriz de Margen Bruto (USD/ha y %)
    - Celda del escenario actual marcada
    """
    result = await compute_sensitivity_matrix(
        crop_id=crop_id,
        costos_totales=costos_totales,
        flete_usd_tn=flete_usd_tn,
        from_year=from_year,
        rinde_esperado=rinde_esperado,
        current_price_override=current_price,
    )

    if result is None:
        return {
            "error": f"No se pudo calcular la sensibilidad para '{crop_id}'. "
                     "Verifique que el cultivo tenga datos históricos disponibles o proporcione un precio actual.",
            "crop_id": crop_id,
        }

    return result


@router.get("/sensitivity/distribution")
async def get_price_distribution(
    crop_id: str = Query(..., description="ID del cultivo"),
    from_year: int = Query(default=2015, ge=2000, le=2030, description="Año de inicio"),
    current_price: Optional[float] = Query(default=None, description="Override del precio actual"),
):
    """
    Retorna la distribución de precios históricos para un cultivo.
    Útil para mostrar el histograma de frecuencias y los percentiles
    en el frontend sin calcular la matriz completa.
    """
    dist = await compute_price_distribution(crop_id, from_year, current_price)

    if dist is None:
        return {
            "error": f"No hay datos históricos para '{crop_id}' en el Pink Sheet.",
            "crop_id": crop_id,
        }

    return {
        "crop_id": crop_id,
        "commodity_id": dist.commodity_id,
        "count": dist.count,
        "from_date": dist.from_date,
        "to_date": dist.to_date,
        "percentiles": {
            "p5": dist.p5,
            "p10": dist.p10,
            "p25": dist.p25,
            "p50": dist.p50,
            "p75": dist.p75,
            "p90": dist.p90,
            "p95": dist.p95,
        },
        "stats": {
            "mean": dist.mean,
            "min": dist.min_price,
            "max": dist.max_price,
            "current": dist.current_price,
        },
        "histogram": dist.all_prices,
    }
