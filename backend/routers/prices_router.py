"""
Router de precios de granos.
Expone precios scrapeados de la BCCBA + retenciones vigentes.
"""
from fastapi import APIRouter
from services.prices_service import scrape_bccba_prices

router = APIRouter()


@router.get("/prices/grains")
async def get_grain_prices():
    """
    Retorna precios de pizarra actualizados de los principales granos,
    junto con retenciones vigentes y tipo de cambio implícito.
    """
    data = await scrape_bccba_prices()
    return data
