"""
Servicio de pyRofex - Precios de mercado de granos (ROFEX/MATba).
Proporciona precios Spot y Futuros.
"""
import logging
from datetime import datetime
from typing import Optional
import asyncio

logger = logging.getLogger(__name__)


class RofexService:
    """Cliente para consumir datos de mercado de pyRofex."""

    # Tickers principales del MATba-ROFEX
    DEFAULT_TICKERS = {
        "SOJ.ROS": "Soja Rosario",
        "MAI.ROS": "Maíz Rosario",
        "TRI.ROS": "Trigo Rosario",
        "GIR.ROS": "Girasol Rosario",
    }

    def __init__(self) -> None:
        self._initialized = False
        self._rofex = None

    def _ensure_initialized(self) -> None:
        """Inicializa pyRofex si no está hecho."""
        if self._initialized and self._rofex:
            return

        from config.rofex_config import get_rofex_initialized
        from pyRofex import initialize

        try:
            get_rofex_initialized()
            self._rofex = initialize
            self._initialized = True
            logger.info("pyRofex inicializado correctamente")
        except Exception as e:
            logger.error(f"Error al inicializar pyRofex: {e}")
            raise RuntimeError(f"pyRofex no inicializado: {e}")

    def get_market_data(
        self,
        tickers: Optional[list[str]] = None,
        entries: Optional[list[str]] = None
    ) -> dict:
        """
        Obtiene market data para los tickers especificados.

        Args:
            tickers: Lista de tickers (ej: ["SOJ.ROS", "MAI.ROS"])
                     Si None, usa DEFAULT_TICKERS.
            entries: Lista de entries a solicitar.
                     Default: ["BI", "OF", "LA", "LV", "CL"] (Bid, Offer, Last, Volume, Close)

        Returns:
            Dict con los datos de mercado.
        """
        self._ensure_initialized()

        from pyRofex import get_market_data

        if tickers is None:
            tickers = list(self.DEFAULT_TICKERS.keys())

        if entries is None:
            entries = ["BI", "OF", "LA", "LV", "CL"]

        try:
            market_data = get_market_data(
                tickers=tickers,
                entries=entries
            )
            return self._parse_market_data(market_data)
        except Exception as e:
            logger.error(f"Error obteniendo market data: {e}")
            raise

    def _parse_market_data(self, raw_data: dict) -> dict:
        """Parsea la respuesta cruda de pyRofex a formato legible."""
        parsed = {
            "timestamp": datetime.now().isoformat(),
            "tickers": {}
        }

        for ticker, data in raw_data.get("marketData", {}).items():
            ticker_info = {
                "ticker": ticker,
                "description": self.DEFAULT_TICKERS.get(ticker, ticker),
            }

            if "LA" in data:
                last = data["LA"]
                ticker_info["last_price"] = last.get("price")
                ticker_info["last_date"] = last.get("date")

            if "CL" in data:
                close = data["CL"]
                ticker_info["close_price"] = close.get("price")
                ticker_info["close_date"] = close.get("date")

            if "BI" in data:
                bid = data["BI"]
                ticker_info["bid_price"] = bid.get("price")
                ticker_info["bid_size"] = bid.get("size")

            if "OF" in data:
                offer = data["OF"]
                ticker_info["offer_price"] = offer.get("price")
                ticker_info["offer_size"] = offer.get("size")

            if "LV" in data:
                ticker_info["volume"] = data["LV"].get("size")

            parsed["tickers"][ticker] = ticker_info

        return parsed

    async def get_market_data_async(
        self,
        tickers: Optional[list[str]] = None,
        entries: Optional[list[str]] = None
    ) -> dict:
        """
        Versión asíncrona de get_market_data.
        Ejecuta la operación bloqueante en threadpool.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None,
            self.get_market_data,
            tickers,
            entries
        )


_rofex_service: Optional[RofexService] = None


def get_rofex_service() -> RofexService:
    """Singleton del servicio de ROFEX."""
    global _rofex_service
    if _rofex_service is None:
        _rofex_service = RofexService()
    return _rofex_service
