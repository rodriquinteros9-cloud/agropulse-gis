"""
Servicio de SIO-Granos - API pública del Ministerio de Agricultura.
Obtiene precios históricos de granos desde datos.gob.ar.
"""
import logging
from datetime import date, datetime
from typing import Optional
import httpx

from schemas.market_schemas import (
    SIOGranoHistoricalResponse,
    SIOGranoRecord,
    SIOGranoError,
)

logger = logging.getLogger(__name__)


# API de Series de Tiempo del SIO-Granos (Datos Argentina)
SIO_GRANOS_API_BASE = "https://api.datos.gob.ar/v2/series"
SIO_GRANOS_TIMEOUT = 60.0

# IDs de series del SIO-Granos (datos.gob.ar)
# Estos son ejemplos - verificar IDs oficiales en datos.gob.ar/series
SIO_SERIES = {
    "soja": "100143-CPY-SOJA-DOL",
    "maiz": "100143-CPY-MAIZ-DOL",
    "trigo": "100143-CPY-TRIGO-DOL",
    "girasol": "100143-CPY-GIRASOL-DOL",
}

# Mapeo de cultivo a nombre legible
CROP_LABELS = {
    "soja": "Soja",
    "maiz": "Maíz",
    "trigo": "Trigo",
    "girasol": "Girasol",
}


class SIOGranosService:
    """Cliente para consumir API de SIO-Granos."""

    def __init__(self) -> None:
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Obtiene o crea el cliente HTTP."""
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(SIO_GRANOS_TIMEOUT),
                follow_redirects=True,
            )
        return self._client

    async def close(self) -> None:
        """Cierra el cliente HTTP."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_historical_prices(
        self,
        tipo_grano: str,
        desde: date,
        hasta: date,
    ) -> SIOGranoHistoricalResponse:
        """
        Obtiene precios históricos de un grano desde la API de SIO-Granos.

        Args:
            tipo_grano: Tipo de grano (soja, maiz, trigo, girasol)
            desde: Fecha de inicio
            hasta: Fecha de fin

        Returns:
            SIOGranoHistoricalResponse con los datos parseados
        """
        tipo_grano = tipo_grano.lower()
        if tipo_grano not in SIO_SERIES:
            raise ValueError(
                f"Grano '{tipo_grano}' no válido. Use: {list(SIO_SERIES.keys())}"
            )

        serie_id = SIO_SERIES[tipo_grano]

        params = {
            "start_date": desde.isoformat(),
            "end_date": hasta.isoformat(),
        }

        url = f"{SIO_GRANOS_API_BASE}/{serie_id}"

        logger.info(f"Consultando SIO-Granos: {url}?{params}")

        try:
            client = await self._get_client()
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Error HTTP de SIO-Granos: {e}")
            raise RuntimeError(f"Error consultando SIO-Granos: {e.response.status_code}")
        except httpx.RequestError as e:
            logger.error(f"Error de conexión a SIO-Granos: {e}")
            raise RuntimeError(f"Error de conexión: {e}")

        # Parsear respuesta
        parsed_data = self._parse_sio_response(data, tipo_grano, desde, hasta)

        return parsed_data

    def _parse_sio_response(
        self,
        data: dict,
        tipo_grano: str,
        desde: date,
        hasta: date,
    ) -> SIOGranoHistoricalResponse:
        """Parsea la respuesta de la API de SIO-Granos."""
        records: list[SIOGranoRecord] = []
        serie_info = data.get("data", data) if "data" in data else data

        for item in serie_info:
            if isinstance(item, dict):
                try:
                    fecha_str = item.get("indice_tiempo") or item.get("fecha")
                    if fecha_str:
                        fecha = datetime.fromisoformat(fecha_str.replace("Z", "+00:00")).date()
                    else:
                        continue

                    precio = item.get("valor")
                    if precio is None:
                        precio = item.get("precio")

                    if precio is not None and fecha:
                        records.append(
                            SIOGranoRecord(
                                fecha=fecha,
                                precio=float(precio),
                                tipo_grano=CROP_LABELS.get(tipo_grano, tipo_grano),
                            )
                        )
                except (ValueError, TypeError) as e:
                    logger.warning(f"Error parseando registro: {item} — {e}")
                    continue

        return SIOGranoHistoricalResponse(
            serie=SIO_SERIES.get(tipo_grano, tipo_grano),
            tipo_grano=CROP_LABELS.get(tipo_grano, tipo_grano),
            desde=desde,
            hasta=hasta,
            cantidad_registros=len(records),
            datos=records,
            actualizado=datetime.now(),
        )

    async def get_all_crops_historical(
        self,
        desde: date,
        hasta: date,
    ) -> dict[str, SIOGranoHistoricalResponse]:
        """Obtiene precios históricos para todos los granos."""
        results = {}
        for tipo_grano in SIO_SERIES.keys():
            try:
                result = await self.get_historical_prices(tipo_grano, desde, hasta)
                results[tipo_grano] = result
            except Exception as e:
                logger.error(f"Error obteniendo {tipo_grano}: {e}")
                results[tipo_grano] = None
        return results


_sio_service: Optional[SIOGranosService] = None


def get_sio_service() -> SIOGranosService:
    """Singleton del servicio de SIO-Granos."""
    global _sio_service
    if _sio_service is None:
        _sio_service = SIOGranosService()
    return _sio_service
