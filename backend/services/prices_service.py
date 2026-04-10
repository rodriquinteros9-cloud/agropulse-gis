"""
Servicio de scraping de precios de granos desde la BCR (Bolsa de Comercio de Rosario).
Obtiene precios de pizarra usando Playwright para renderizar JS.
"""
import re
import time
import logging
import asyncio
from typing import Dict, Any
import urllib.request
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ── Cache simple en memoria (4 horas) ──
_price_cache: Dict[str, Any] = {}
_cache_timestamp: float = 0
CACHE_TTL_SECONDS = 4 * 3600  # 4 horas

# ── Retenciones vigentes ──
RETENCIONES = {
    "Soja": 0.24,
    "Soja Segunda": 0.24,
    "Maíz": 0.085,
    "Trigo": 0.075,
    "Girasol": 0.045,
    "Sorgo": 0.085,
    "Cebada": 0.075,
    "Maní": 0.0,
    "Cultivo de Servicio": 0.0,
}

# Precios estáticos de refererencia actualizados (Fallback - Opción B)
FALLBACK_PRICES = {
    "Soja": {"precio_usd_tn": 320.35, "fuente": "Referencia (Fallback)"},
    "Soja Segunda": {"precio_usd_tn": 320.35, "fuente": "Referencia (Fallback)"},
    "Maíz": {"precio_usd_tn": 172.01, "fuente": "Referencia (Fallback)"},
    "Trigo": {"precio_usd_tn": 185.00, "fuente": "Referencia (Fallback)"},
    "Girasol": {"precio_usd_tn": 390.00, "fuente": "Referencia (Fallback)"},
    "Sorgo": {"precio_usd_tn": 190.00, "fuente": "Referencia (Fallback)"},
    "Cebada": {"precio_usd_tn": 195.00, "fuente": "Referencia (Fallback)"},
    "Maní": {"precio_usd_tn": 650.00, "fuente": "Referencia (Fallback)"},
}

BCR_URL = "https://www.bcr.com.ar/es"

GRAIN_HTML_MAP = {
    "Soja": "soja",
    "Maíz": "maiz",
    "Trigo": "trigo",
    "Girasol": "girasol"
}

def sync_scrape() -> Dict[str, float]:
    req = urllib.request.Request(BCR_URL, headers={'User-Agent': 'Mozilla/5.0'})
    html = urllib.request.urlopen(req, timeout=15).read().decode('utf-8')
    soup = BeautifulSoup(html, 'html.parser')
    
    extracted = {}
    for cropKey, id_suffix in GRAIN_HTML_MAP.items():
        container = soup.find(id=f'data-cotizador-{id_suffix}')
        if container:
            text = container.get_text(separator=' ').replace('\\n', ' ')
            # Buscar ej: US$ 318,0 o U$S 185,0
            match = re.search(r'(?:US\$|U\$S)\s*(\d+[,.]\d+)', text)
            if match:
                val = float(match.group(1).replace(',', '.'))
                extracted[cropKey] = val
    return extracted

async def scrape_bccba_prices() -> Dict[str, Any]:
    """
    Scrapea precios del dashboard de BCR (bcr.com.ar/es).
    """
    global _price_cache, _cache_timestamp

    if _price_cache and (time.time() - _cache_timestamp) < CACHE_TTL_SECONDS:
         return _price_cache

    precios_extraidos = {}
    scrape_error = None
    fecha_pizarra = time.strftime("%d/%m/%Y")

    try:
        found_prices = await asyncio.to_thread(sync_scrape)
        for c, v in found_prices.items():
            precios_extraidos[c] = {"precio_usd_tn": v, "fuente": "BCR Rosario (Oficial)"}
    except Exception as e:
        logger.error(f"Error scraping BCR con BS4: {e}")
        scrape_error = str(e)

    # Combinamos lo extraído con el fallback
    precios_finales = {}
    for cropKey in FALLBACK_PRICES.keys():
        if cropKey in precios_extraidos:
            precios_finales[cropKey] = precios_extraidos[cropKey]
        else:
            if cropKey == "Soja Segunda" and "Soja" in precios_extraidos:
                precios_finales[cropKey] = precios_extraidos["Soja"]
            else:
                precios_finales[cropKey] = FALLBACK_PRICES[cropKey]

    result = {
        "precios": precios_finales,
        "fecha": fecha_pizarra,
        "tipo_cambio_implicito": None,
        "retenciones": RETENCIONES,
        "fuente": "BCR Rosario" if not scrape_error else "Valores de Referencia Fallback",
        "cached": False,
        "error": scrape_error
    }

    if not scrape_error and len(precios_extraidos) > 0:
        _price_cache = result
        _cache_timestamp = time.time()

    return result
