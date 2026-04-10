"""
Modelos Pydantic para respuestas de mercado (SIO-Granos y ROFEX).
"""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


# ==== SIO-Granos Schemas ====

class SIOGranoRecord(BaseModel):
    """Registro individual de precio de SIO-Granos."""
    fecha: date
    precio: float = Field(..., ge=0, description="Precio en USD/tn")
    tipo_grano: str = Field(..., description="Tipo de grano")
    provincia: Optional[str] = Field(None, description="Provincia")
    mercado: Optional[str] = Field(None, description="Mercado o bolsa")
    unidad: str = Field(default="USD/tn")


class SIOGranoHistoricalResponse(BaseModel):
    """Respuesta de la API de SIO-Granos."""
    serie: str
    tipo_grano: str
    desde: date
    hasta: date
    cantidad_registros: int
    datos: list[SIOGranoRecord]
    fuente: str = "SIO-Granos (Ministerio de Agricultura)"
    actualizado: datetime


class SIOGranoError(BaseModel):
    """Modelo de error."""
    error: str
    detalle: Optional[str] = None
    codigo: int


# ==== ROFEX Schemas ====

class ROFEXTickerData(BaseModel):
    """Datos de un ticker específico."""
    ticker: str
    description: str
    last_price: Optional[float] = None
    last_date: Optional[str] = None
    close_price: Optional[float] = None
    close_date: Optional[str] = None
    bid_price: Optional[float] = None
    bid_size: Optional[int] = None
    offer_price: Optional[float] = None
    offer_size: Optional[int] = None
    volume: Optional[int] = None


class ROFEXMarketDataResponse(BaseModel):
    """Respuesta de market data de ROFEX."""
    timestamp: datetime
    tickers: dict[str, ROFEXTickerData]
    environment: str
    source: str = "MATba-ROFEX (pyRofex)"


# ==== Request Schemas ====

class HistoricalSyncRequest(BaseModel):
    """Request para sincronización histórica."""
    tipo_grano: str = Field(..., description="Tipo de grano: soja, maiz, trigo, girasol")
    desde: date = Field(..., description="Fecha de inicio")
    hasta: date = Field(..., description="Fecha de fin")
    insertar_bbdd: bool = Field(default=False, description="Insertar en base de datos")


class DailyUpdateRequest(BaseModel):
    """Request para actualización diaria."""
    tickers: Optional[list[str]] = Field(
        None,
        description="Lista de tickers. Default: [SOJ.ROS, MAI.ROS, TRI.ROS]"
    )
    insertar_bbdd: bool = Field(default=False, description="Insertar en base de datos")
