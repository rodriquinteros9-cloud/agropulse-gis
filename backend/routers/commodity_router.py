"""
Router de precios históricos de commodities y relaciones Insumo-Producto.
Fuente: World Bank Commodity Markets (Pink Sheet).
"""
from fastapi import APIRouter, Query
from services.commodity_history_service import get_commodity_history, compute_ip_ratios

router = APIRouter()


@router.get("/prices/history")
async def get_price_history(
    from_year: int = Query(default=2015, ge=1960, le=2030, description="Año de inicio"),
):
    """
    Retorna series históricas mensuales de precios de commodities:
    Soja, Maíz, Trigo, Urea, DAP, TSP.
    Fuente: World Bank Pink Sheet (CC-BY).
    """
    data = await get_commodity_history()

    # Filtrar por año si se proporcionó
    if from_year and data.get("series"):
        filtered_series = {}
        for key, commodity in data["series"].items():
            filtered_data = [
                dp for dp in commodity["data"]
                if int(dp["date"][:4]) >= from_year
            ]
            filtered_series[key] = {
                **commodity,
                "data": filtered_data,
                "count": len(filtered_data),
            }
        data = {**data, "series": filtered_series}

    return data


@router.get("/prices/ratios")
async def get_ip_ratios(
    from_year: int = Query(default=2015, ge=1960, le=2030, description="Año de inicio"),
):
    """
    Retorna las Relaciones Insumo-Producto calculadas:
    - Soja/Urea, Maíz/Urea, Soja/DAP
    
    Incluye promedio histórico, percentiles P25-P75, y semáforo
    de momento de compra (favorable / neutral / desfavorable).
    """
    data = await get_commodity_history()

    if not data.get("series"):
        return {
            "ratios": [],
            "error": data.get("error", "No hay datos disponibles"),
            "source": data.get("source"),
        }

    ratios = compute_ip_ratios(data["series"])

    # Filtrar por año y RECALCULAR stats + current + señal
    if from_year:
        for ratio in ratios:
            ratio["data"] = [
                dp for dp in ratio["data"]
                if int(dp["date"][:4]) >= from_year
            ]
            if ratio["data"]:
                all_ratios = [dp["ratio"] for dp in ratio["data"]]
                sorted_r = sorted(all_ratios)
                new_mean = sum(all_ratios) / len(all_ratios)
                new_p25 = sorted_r[int(len(sorted_r) * 0.25)]
                new_p75 = sorted_r[int(len(sorted_r) * 0.75)]

                ratio["stats"] = {
                    "mean": round(new_mean, 2),
                    "p25": round(new_p25, 2),
                    "p75": round(new_p75, 2),
                    "min": round(min(all_ratios), 2),
                    "max": round(max(all_ratios), 2),
                    "count": len(all_ratios),
                }

                # Recalcular current al último dato del rango filtrado
                last_dp = ratio["data"][-1]
                current_ratio = last_dp["ratio"]
                pct_vs_avg = ((current_ratio - new_mean) / new_mean) * 100 if new_mean > 0 else 0

                if pct_vs_avg <= -10:
                    signal = "favorable"
                    signal_label = f"\U0001f7e2 {abs(pct_vs_avg):.0f}% por debajo del promedio \u2014 Momento favorable para comprar"
                elif pct_vs_avg <= 10:
                    signal = "neutral"
                    signal_label = f"\U0001f7e1 Dentro del rango normal (\u00b110% del promedio hist\u00f3rico)"
                else:
                    signal = "desfavorable"
                    signal_label = f"\U0001f534 {pct_vs_avg:.0f}% por encima del promedio \u2014 Ratio desfavorable"

                ratio["current"] = {
                    "date": last_dp["date"],
                    "ratio": current_ratio,
                    "grain_price": last_dp["grain_price"],
                    "input_price": last_dp["input_price"],
                    "signal": signal,
                    "signal_label": signal_label,
                    "pct_vs_avg": round(pct_vs_avg, 1),
                }

    return {
        "ratios": ratios,
        "source": data.get("source"),
        "source_url": data.get("source_url"),
        "license": data.get("license"),
        "cached": data.get("cached", False),
    }
