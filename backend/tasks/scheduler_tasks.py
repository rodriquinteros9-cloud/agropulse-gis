"""
Tareas programadas con APScheduler para actualización diaria de precios ROFEX.
Se ejecuta todos los días hábiles a las 18:00 hs.
"""
import logging
from datetime import datetime, time
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from services.rofex_service import get_rofex_service

logger = logging.getLogger(__name__)

# Scheduler global
scheduler: AsyncIOScheduler = None


def is_business_day() -> bool:
    """Verifica si hoy es día hábil (lunes a viernes)."""
    today = datetime.now().weekday()
    return today < 5  # 0=Lunes, 4=Viernes


async def daily_rofex_update() -> dict:
    """
    Tarea diaria: obtiene precios de cierre de ROFEX y los guarda.
    Se ejecuta automáticamente a las 18:00 hs en días hábiles.
    """
    logger.info("Iniciando actualización diaria de precios ROFEX...")

    try:
        service = get_rofex_service()
        market_data = service.get_market_data()

        # Aquí puedes agregar la lógica de guardado a BD
        # Por ejemplo: guardar en tu tabla de precios históricos
        logger.info(f"Datos obtenidos: {market_data}")

        result = {
            "status": "success",
            "timestamp": datetime.now().isoformat(),
            "tickers_count": len(market_data.get("tickers", {})),
            "data": market_data,
        }

        logger.info(f"Actualización ROFEX completada: {result['tickers_count']} tickers")
        return result

    except Exception as e:
        logger.error(f"Error en actualización diaria ROFEX: {e}")
        return {
            "status": "error",
            "timestamp": datetime.now().isoformat(),
            "error": str(e),
        }


def start_scheduler(app=None) -> AsyncIOScheduler:
    """
    Inicia el scheduler de APScheduler.
    Debe llamarse al iniciar la aplicación FastAPI.
    """
    global scheduler

    if scheduler is not None:
        logger.warning("Scheduler ya está inicializado")
        return scheduler

    scheduler = AsyncIOScheduler()

    # Programar tarea diaria a las 18:00 hs en días hábiles
    scheduler.add_job(
        daily_rofex_update,
        trigger=CronTrigger(
            hour=18,
            minute=0,
            day_of_week="mon-fri",  # Lunes a viernes
        ),
        id="daily_rofex_update",
        name="Actualización diaria precios ROFEX",
        replace_existing=True,
    )

    scheduler.start()
    logger.info("Scheduler APScheduler iniciado. Tarea: daily_rofex_update (L-V 18:00)")

    return scheduler


def stop_scheduler() -> None:
    """Detiene el scheduler."""
    global scheduler
    if scheduler:
        scheduler.shutdown()
        scheduler = None
        logger.info("Scheduler detenido")


def get_scheduler() -> AsyncIOScheduler:
    """Obtiene la instancia del scheduler."""
    return scheduler
