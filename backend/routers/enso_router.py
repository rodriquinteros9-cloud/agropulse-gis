"""
Router ENSO: Endpoint para datos en tiempo real del gráfico ENSO.
"""

from fastapi import APIRouter, HTTPException
from services.enso_service import get_enso_chart_data

router = APIRouter(tags=["ENSO"])


@router.get("/enso/chart-data")
async def enso_chart_data():
    """Retorna datos combinados ONI + RONI + IRI Forecast para el chart."""
    try:
        data = await get_enso_chart_data()
        return data
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error obteniendo datos ENSO: {str(e)}"
        )
