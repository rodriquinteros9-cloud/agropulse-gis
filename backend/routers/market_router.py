"""
Router de mercado - Endpoints para precios de granos (SIO-Granos y ROFEX).
"""
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Query, HTTPException, status
from fastapi.responses import JSONResponse

from schemas.market_schemas import (
    SIOGranoHistoricalResponse,
    ROFEXMarketDataResponse,
    ROFEXTickerData,
    HistoricalSyncRequest,
)
from services.sio_granos_service import get_sio_service
from services.rofex_service import get_rofex_service, RofexService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/market", tags=["market"])


# ==== Endpoints SIO-Granos ====

@router.get(
    "/sync-historical",
    response_model=SIOGranoHistoricalResponse,
    summary="Sincronizar precios históricos desde SIO-Granos",
    description="Obtiene precios históricos de granos desde la API pública del Ministerio de Agricultura (SIO-Granos)."
)
async def sync_historical_prices(
    tipo_grano: str = Query(
        ...,
        description="Tipo de grano: soja, maiz, trigo, girasol",
        pattern="^(soja|maiz|trigo|girasol)$"
    ),
    desde: date = Query(..., description="Fecha de inicio (YYYY-MM-DD)"),
    hasta: date = Query(..., description="Fecha de fin (YYYY-MM-DD)"),
    insertar_bbdd: bool = Query(False, description="Insertar en base de datos"),
):
    """
    Sincroniza precios históricos desde SIO-Granos.
    Los datos se pueden obtener para insertar manualmente en la BD.
    """
    if desde > hasta:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha 'desde' debe ser anterior a 'hasta'"
        )

    try:
        service = get_sio_service()
        result = await service.get_historical_prices(tipo_grano, desde, hasta)

        if insertar_bbdd:
            logger.info(f"Insertar en BD habilitado (pendiente de implementación)")

        return result

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error consultando SIO-Granos: {str(e)}"
        )


@router.get(
    "/sync-historical/all",
    summary="Sincronizar todos los granos",
    description="Obtiene precios históricos para todos los granos disponibles."
)
async def sync_all_crops(
    desde: date = Query(..., description="Fecha de inicio"),
    hasta: date = Query(..., description="Fecha de fin"),
):
    """Sincroniza precios históricos para todos los granos."""
    if desde > hasta:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La fecha 'desde' debe ser anterior a 'hasta'"
        )

    try:
        service = get_sio_service()
        results = await service.get_all_crops_historical(desde, hasta)

        return {
            "resultados": {
                k: v.model_dump() if v else None
                for k, v in results.items()
            },
            "desde": desde.isoformat(),
            "hasta": hasta.isoformat(),
        }
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )


# ==== Endpoints ROFEX ====

@router.get(
    "/prices/rofex",
    response_model=ROFEXMarketDataResponse,
    summary="Obtener precios actuales de ROFEX",
    description="Obtiene precios de mercado (Spot y Futuros) desde pyRofex para los tickers del MATba-ROFEX."
)
async def get_rofex_prices(
    tickers: Optional[str] = Query(
        None,
        description="Tickers separados por coma (ej: SOJ.ROS,MAI.ROS). Default: SOJ.ROS,MAI.ROS,TRI.ROS"
    ),
    insertar_bbdd: bool = Query(False, description="Insertar en base de datos"),
):
    """
    Obtiene precios actuales del mercado ROFEX.
    """
    ticker_list = None
    if tickers:
        ticker_list = [t.strip() for t in tickers.split(",")]

    try:
        service = get_rofex_service()
        raw_data = service.get_market_data(tickers=ticker_list)

        if insertar_bbdd:
            logger.info(f"Insertar en BD habilitado (pendiente de implementación)")

        return ROFEXMarketDataResponse(
            timestamp=raw_data["timestamp"],
            tickers={
                k: ROFEXTickerData(**v)
                for k, v in raw_data.get("tickers", {}).items()
            },
            environment="live" if tickers else "paper",
        )

    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Error conectando a ROFEX: {str(e)}"
        )


@router.get("/health/rofex")
async def check_rofex_health():
    """Verifica el estado de la conexión a ROFEX."""
    try:
        service = get_rofex_service()
        service._ensure_initialized()
        return {"status": "ok", "message": "pyRofex conectado"}
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "error", "message": str(e)}
        )
