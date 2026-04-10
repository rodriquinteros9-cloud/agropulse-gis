"""
Configuración de pyRofex - Carga credenciales desde variables de entorno.
"""
import os
from typing import Optional
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class RofexConfig:
    """Configuración para pyRofex."""
    account: str
    password: str
    api_key: str
    environment: str  # "live" o "paper"


def get_rofex_config() -> RofexConfig:
    """
    Carga configuración de pyRofex desde variables de entorno.
    Lanza ValueError si faltan variables requeridas.
    """
    account = os.getenv("ROFEX_ACCOUNT")
    password = os.getenv("ROFEX_PASSWORD")
    api_key = os.getenv("ROFEX_API_KEY")
    environment = os.getenv("ROFEX_ENVIRONMENT", "paper")

    if not account or not password or not api_key:
        raise ValueError(
            "Faltan credenciales de ROFEX. Configure: "
            "ROFEX_ACCOUNT, ROFEX_PASSWORD, ROFEX_API_KEY"
        )

    return RofexConfig(
        account=account,
        password=password,
        api_key=api_key,
        environment=environment
    )


def get_rofex_initialized():
    """
    Inicializa pyRofex con credenciales desde .env.
    Retorna el móduloinitialized.
    """
    from pyRofex import initialize

    config = get_rofex_config()

    try:
        initialize(
            user=config.account,
            password=config.password,
            account=config.account,
            apiKey=config.api_key,
            environment=config.environment
        )
        logger.info(f"pyRofex inicializado en entorno: {config.environment}")
    except Exception as e:
        logger.error(f"Error inicializando pyRofex: {e}")
        raise

    return initialize
