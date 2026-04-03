"""
Servicio de scraping de precios de granos desde la BCR (Bolsa de Comercio de Rosario).
Obtiene precios de pizarra usando Playwright para renderizar JS.
"""
import re
import time
import logging
from typing import Dict, Any
from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

# ── Cache simple en memoria (4 horas) ──
_price_cache: Dict[str, Any] = {}
_cache_timestamp: float = 0
CACHE_TTL_SECONDS = 4 * 3600  # 4 horas

# ── Retenciones vigentes ──
RETENCIONES = {
    "Soja": 0.33,
    "Soja Segunda": 0.33,
    "Maíz": 0.12,
    "Trigo": 0.12,
    "Girasol": 0.07,
    "Sorgo": 0.12,
    "Cebada": 0.12,
    "Maní": 0.07,
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

BCR_URL = "https://www.cac.bcr.com.ar/es/precios-de-pizarra"

# Nombres de cultivos normalizados vs términos de bùsqueda probables en la BCR
GRAIN_MAP = {
    "Soja": ["soja"],
    "Maíz": ["maíz", "maiz"],
    "Trigo": ["trigo"],
    "Girasol": ["girasol"],
    "Sorgo": ["sorgo"],
}

def parse_price_line(line: str) -> float | None:
    # Busca un patron de numero con o sin decimales: 320,5 o 320,50 o 300000
    match = re.search(r'([\d]{2,}(?:\.\d{3})*(?:,\d+)?)', line.replace('$', '').replace('U$S', '').strip())
    if not match:
        return None
        
    num_str = match.group(1).replace('.', '').replace(',', '.')
    try:
        val = float(num_str)
        return val
    except ValueError:
        return None


async def scrape_bccba_prices() -> Dict[str, Any]:
    """
    Scrapea precios de BCR Rosario vía Playwright.
    Retorna los precios usando la estructura que esperaba el Frontend, 
    o el fallback de Opción B si falla.
    """
    global _price_cache, _cache_timestamp

    if _price_cache and (time.time() - _cache_timestamp) < CACHE_TTL_SECONDS:
         return _price_cache

    precios_extraidos = {}
    scrape_error = None
    fecha_pizarra = time.strftime("%d/%m/%Y")

    try:
        async with async_playwright() as p:
            # Lanzamos chromium headless
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Navegar a la página y esperar que la red se estabilice para cargar los valores React/Angular/Vue
            await page.goto(BCR_URL, wait_until="networkidle", timeout=20000)
            
            text_content = await page.evaluate("document.body.innerText")
            lines = [l.strip().lower() for l in text_content.split('\n') if l.strip()]
            
            # Buscar coincidencia simple de filas
            for i, line in enumerate(lines):
                # Extraer precios si encontramos la palabra clave
                for crop_standard, keywords in GRAIN_MAP.items():
                    if any(line.startswith(kw) for kw in keywords) and crop_standard not in precios_extraidos:
                        # Si la línea misma tiene el numero: "soja 320,0" (USD es típicamente < 1000, o ARS > 1000)
                        val = parse_price_line(line)
                        if val is None and i + 1 < len(lines):
                            # A veces el precio esta en la siguiente celda
                            val = parse_price_line(lines[i+1])
                            
                        if val:
                            if val > 1000:
                                # Es probable ARS, el componente se va a encargar o podemos dividir por TC
                                # Pero vamos a guardar el valor para no sobrecalentar logica
                                pass 
                            else:
                                precios_extraidos[crop_standard] = {
                                    "precio_usd_tn": val,
                                    "fuente": "BCR Rosario Oficial"
                                }
            
            await browser.close()
            
    except Exception as e:
        logger.error(f"Error scraping BCR con Playwright: {e}")
        scrape_error = str(e)

    # Combinamos lo extraído con el fallback
    precios_finales = {}
    for cropKey in FALLBACK_PRICES.keys():
        if cropKey in precios_extraidos:
            precios_finales[cropKey] = precios_extraidos[cropKey]
        else:
            # Soja Segunda puede copiar Soja
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

    if not scrape_error: # Solo cachear si no hubo error
        _price_cache = result
        _cache_timestamp = time.time()

    return result
