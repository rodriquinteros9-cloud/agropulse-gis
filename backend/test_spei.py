import sys
sys.path.append("c:/Users/rodri/Documents/Gravity/streamlit_gis/backend")
from services.spei_service import calculate_spei_for_lot
import traceback

poly = {
    "type": "Polygon",
    "coordinates": [[[-64.5, -33.5], [-64.5, -33.6], [-64.4, -33.6], [-64.4, -33.5], [-64.5, -33.5]]]
}

try:
    print("Iniciando SPEI calculate...")
    res = calculate_spei_for_lot(poly, -33.55, -64.45)
    print("Exito:")
    print(res["current"])
except Exception as e:
    print("Fallo SPEI:")
    traceback.print_exc()
