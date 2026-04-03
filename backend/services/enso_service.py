"""
Servicio ENSO: Obtiene datos en tiempo real de ONI, RONI (NOAA) y pronóstico IRI.
Cacheo en memoria de 24h para no saturar los servidores fuente.
"""

import httpx
import time
import re
import math
from datetime import datetime
from bs4 import BeautifulSoup
from typing import Optional

# ── Cache global ──
_cache: dict = {}
_CACHE_TTL = 86400  # 24 horas


def _get_cached(key: str):
    entry = _cache.get(key)
    if entry and (time.time() - entry["ts"]) < _CACHE_TTL:
        return entry["data"]
    return None


def _set_cached(key: str, data):
    _cache[key] = {"data": data, "ts": time.time()}


# ── Mapeo de mes a trimestres ──
TRIMESTER_LABELS = [
    "DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ",
    "JJA", "JAS", "ASO", "SON", "OND", "NDJ"
]


def _month_to_trimester_label(month: int, year: int) -> str:
    """Convierte mes (1-12) a etiqueta de trimestre centrado en ese mes.
    Ej: month=1 -> DJF, month=2 -> JFM, etc.
    """
    idx = month - 1  # 0-indexed
    label = TRIMESTER_LABELS[idx]
    # Para DJF, el año reportado es el del mes central (enero)
    yr_short = str(year)[2:]
    return f"{label} {yr_short}"


async def fetch_oni_data() -> list[dict]:
    """Descarga ONI desde NOAA PSL (texto plano)."""
    cached = _get_cached("oni")
    if cached:
        return cached

    url = "https://psl.noaa.gov/data/correlation/oni.data"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    lines = resp.text.strip().split("\n")

    # Primera línea tiene rango de años
    results = []
    for line in lines[1:]:
        parts = line.split()
        if len(parts) < 13:
            continue
        try:
            year = int(float(parts[0]))
        except ValueError:
            continue

        for month_idx in range(12):
            val = float(parts[month_idx + 1])
            if val < -90:  # -99.90 = missing
                continue
            results.append({
                "year": year,
                "month": month_idx + 1,
                "oni": round(val, 2),
                "trimester": _month_to_trimester_label(month_idx + 1, year),
            })

    _set_cached("oni", results)
    return results


async def fetch_roni_data() -> list[dict]:
    """Scrapes RONI desde la tabla HTML del CPC.
    La tabla tiene años como filas y 12 trimestres como columnas.
    """
    cached = _get_cached("roni")
    if cached:
        return cached

    url = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/"
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    tables = soup.find_all("table")

    results = []
    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 10:  # RONI table has ~85 rows
            continue

        for row in rows:
            # CPC uses mix of th and td in data rows
            cells = row.find_all(["th", "td"])
            if len(cells) < 2:
                continue

            first_text = cells[0].get_text(strip=True)
            # Year detection: debe ser un número de 4 dígitos
            try:
                year = int(first_text)
                if year < 1950 or year > 2100:
                    continue
            except (ValueError, IndexError):
                continue

            for month_idx in range(min(12, len(cells) - 1)):
                cell_text = cells[month_idx + 1].get_text(strip=True)
                try:
                    val = float(cell_text)
                    if val < -90:
                        continue
                    results.append({
                        "year": year,
                        "month": month_idx + 1,
                        "roni": round(val, 2),
                        "trimester": _month_to_trimester_label(month_idx + 1, year),
                    })
                except ValueError:
                    continue

    _set_cached("roni", results)
    return results


async def fetch_iri_forecast() -> dict:
    """Scrapes la página IRI ENSO para obtener los datos del plume.
    El gráfico interactivo usa Highcharts con datos embebidos en el HTML/JS.
    Retorna media de modelos dinámicos, estadísticos, y spread (min/max de cada grupo).
    Si el scraping falla (la IRI renderiza con JS), retorna datos vacíos.
    """
    cached = _get_cached("iri_forecast")
    if cached:
        return cached

    try:
        url = "https://iri.columbia.edu/our-expertise/climate/forecasts/enso/current/?enso_tab=enso-sst_table"

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        html = resp.text
        forecast_data = _parse_iri_plume_from_html(html)

        # Si encontró datos, cachear y retornar
        if forecast_data.get("seasons"):
            _set_cached("iri_forecast", forecast_data)
            return forecast_data
    except Exception as e:
        print(f"[ENSO] Warning: IRI fetch failed ({e}), using empty forecast")

    # Fallback: retornar estructura vacía
    empty = {"dynamic": [], "statistical": [], "seasons": []}
    _set_cached("iri_forecast", empty)
    return empty


def _parse_iri_plume_from_html(html: str) -> dict:
    """Intenta extraer datos del plume desde el HTML de IRI.
    Si no puede encontrar datos estructurados, usa la tabla de texto disponible.
    """
    soup = BeautifulSoup(html, "html.parser")

    # Buscar la tabla SST del plume
    # La tabla IRI tiene modelos como filas y trimestres como columnas
    tables = soup.find_all("table")

    models_data = {
        "dynamic": [],
        "statistical": [],
        "seasons": [],
    }

    for table in tables:
        rows = table.find_all("tr")
        if len(rows) < 3:
            continue

        # Buscar header con trimestres (e.g., "JFM 2026", "FMA 2026", etc.)
        header = rows[0]
        header_cells = header.find_all(["th", "td"])
        header_texts = [c.get_text(strip=True) for c in header_cells]

        # Detectar si es la tabla del plume: headers contienen trimestres
        season_pattern = re.compile(r'[A-Z]{3}\s*\d{4}')
        seasons_found = [h for h in header_texts if season_pattern.match(h)]

        if len(seasons_found) >= 3:
            models_data["seasons"] = seasons_found

            # Cada fila posterior es un modelo
            for row in rows[1:]:
                cells = row.find_all(["th", "td"])
                if len(cells) < 2:
                    continue
                model_name_cell = cells[0].get_text(strip=True).lower()
                values = []
                for c in cells[1:len(seasons_found) + 1]:
                    try:
                        values.append(float(c.get_text(strip=True)))
                    except ValueError:
                        values.append(None)

                if len(values) < 2:
                    continue

                # Clasificar modelo como dinámico o estadístico
                stat_keywords = ["markov", "cca", "lim", "clipr", "cnn", "analog",
                                 "regression", "statistical", "ca ", "constructed"]
                is_stat = any(kw in model_name_cell for kw in stat_keywords)

                entry = {"name": cells[0].get_text(strip=True), "values": values}
                if is_stat:
                    models_data["statistical"].append(entry)
                else:
                    models_data["dynamic"].append(entry)

    return models_data


def _compute_model_stats(models: list[dict], num_seasons: int) -> dict:
    """Calcula media, min, max para un grupo de modelos por cada temporada."""
    means = []
    mins = []
    maxs = []

    for i in range(num_seasons):
        vals = []
        for m in models:
            if i < len(m["values"]) and m["values"][i] is not None:
                vals.append(m["values"][i])

        if vals:
            means.append(round(sum(vals) / len(vals), 3))
            mins.append(round(min(vals), 3))
            maxs.append(round(max(vals), 3))
        else:
            means.append(None)
            mins.append(None)
            maxs.append(None)

    return {"mean": means, "min": mins, "max": maxs}


async def get_enso_chart_data() -> dict:
    """API principal: combina ONI, RONI e IRI en formato listo para el gráfico."""
    now = datetime.utcnow()
    current_year = now.year
    current_month = now.month

    # Obtener datos en paralelo
    import asyncio
    oni_task = fetch_oni_data()
    roni_task = fetch_roni_data()
    iri_task = fetch_iri_forecast()

    oni_raw, roni_raw, iri_raw = await asyncio.gather(
        oni_task, roni_task, iri_task
    )

    # ── Construir datos observados (últimos ~10 trimestres antes del actual) ──
    # Filtrar ONI: últimos meses disponibles
    recent_oni = [r for r in oni_raw if (r["year"] == current_year) or
                  (r["year"] == current_year - 1 and r["month"] >= 6)]
    recent_oni.sort(key=lambda x: (x["year"], x["month"]))

    # Filtrar RONI
    recent_roni = [r for r in roni_raw if (r["year"] == current_year) or
                   (r["year"] == current_year - 1 and r["month"] >= 6)]
    recent_roni.sort(key=lambda x: (x["year"], x["month"]))

    # Crear lookup por trimester label
    oni_lookup = {r["trimester"]: r["oni"] for r in recent_oni}
    roni_lookup = {r["trimester"]: r["roni"] for r in recent_roni}

    # Determinar qué trimestres mostrar (observados)
    # Desde ~6 meses antes hasta el último mes disponible
    observed_trimesters = []
    for r in recent_oni:
        tri = r["trimester"]
        if tri not in [t["name"] for t in observed_trimesters]:
            observed_trimesters.append({
                "name": tri,
                "oni": oni_lookup.get(tri),
                "roni": roni_lookup.get(tri),
                "type": "observed",
            })

    # ── Construir datos de pronóstico IRI ──
    forecast_points = []
    seasons = iri_raw.get("seasons", [])
    num_seasons = len(seasons)

    if num_seasons > 0 and (iri_raw.get("dynamic") or iri_raw.get("statistical")):
        dyn_stats = _compute_model_stats(iri_raw.get("dynamic", []), num_seasons)
        stat_stats = _compute_model_stats(iri_raw.get("statistical", []), num_seasons)

        for i, season in enumerate(seasons):
            # Convertir "JFM 2026" -> "JFM 26"
            parts = season.strip().split()
            if len(parts) == 2:
                label = f"{parts[0]} {parts[1][2:]}"
            else:
                label = season

            forecast_points.append({
                "name": label,
                "dyn": dyn_stats["mean"][i],
                "dynMin": dyn_stats["min"][i],
                "dynMax": dyn_stats["max"][i],
                "stat": stat_stats["mean"][i],
                "statMin": stat_stats["min"][i],
                "statMax": stat_stats["max"][i],
                "type": "forecast",
            })

    # ── Punto de solapamiento: conectar observados con pronóstico ──
    # El primer trimestre del pronóstico a veces coincide con el último observado
    overlap_keys = set()
    if forecast_points and observed_trimesters:
        for fp in forecast_points:
            for ot in observed_trimesters:
                if fp["name"] == ot["name"]:
                    # Merge: agregar datos de pronóstico al punto observado
                    ot["dyn"] = fp["dyn"]
                    ot["dynMin"] = fp.get("dynMin")
                    ot["dynMax"] = fp.get("dynMax")
                    ot["stat"] = fp["stat"]
                    ot["statMin"] = fp.get("statMin")
                    ot["statMax"] = fp.get("statMax")
                    overlap_keys.add(fp["name"])

    # Filtrar forecast_points que ya fueron mergeados
    forecast_only = [fp for fp in forecast_points if fp["name"] not in overlap_keys]

    # ── Combinar: observados + pronóstico ──
    chart_data = observed_trimesters + forecast_only

    # ── Determinar fase actual ──
    last_oni = None
    for d in reversed(observed_trimesters):
        if d.get("oni") is not None:
            last_oni = d["oni"]
            break

    if last_oni is not None:
        if last_oni >= 0.5:
            phase = "El Niño"
        elif last_oni <= -0.5:
            phase = "La Niña"
        else:
            phase = "Neutral"
    else:
        phase = "Indeterminado"

    # Determinar tendencia mirando pronósticos
    trend = "Estable"
    if forecast_only:
        future_means = [fp.get("dyn") for fp in forecast_only if fp.get("dyn") is not None]
        if future_means and len(future_means) >= 3:
            mid_val = future_means[len(future_means) // 2]
            if mid_val is not None:
                if mid_val > 0.5:
                    trend = "Hacia El Niño"
                elif mid_val < -0.5:
                    trend = "Hacia La Niña"
                elif last_oni and abs(mid_val - last_oni) > 0.3:
                    trend = f"Transición {'positiva' if mid_val > last_oni else 'negativa'}"

    # Intensidad del pronóstico
    max_future = max([abs(fp.get("dyn", 0) or 0) for fp in forecast_only], default=0)
    if max_future >= 1.5:
        intensity = "Fuerte"
    elif max_future >= 1.0:
        intensity = "Moderado"
    elif max_future >= 0.5:
        intensity = "Débil"
    else:
        intensity = "Neutral"

    phase_label = f"{trend} {intensity}" if trend != "Estable" else phase

    # Metadata
    metadata = {
        "phase": phase_label,
        "currentONI": last_oni,
        "trend": trend,
        "intensity": intensity,
        "lastUpdate": now.strftime("%Y-%m-%d"),
        "numDynamicModels": len(iri_raw.get("dynamic", [])),
        "numStatisticalModels": len(iri_raw.get("statistical", [])),
        "dataSource": "NOAA PSL (ONI), NOAA CPC (RONI), IRI Columbia (Forecast)",
    }

    return {
        "chartData": chart_data,
        "metadata": metadata,
    }
