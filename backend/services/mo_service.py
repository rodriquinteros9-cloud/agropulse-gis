import requests
import geopandas as gpd

def get_mo_idecor_for_lots(gdf_lotes: gpd.GeoDataFrame) -> dict:
    url = "https://idecor-ws.mapascordoba.gob.ar/geoserver/idecor/wms"
    results = {}
    
    if gdf_lotes is None or gdf_lotes.empty:
        return results
        
    try:
        # We need the centroids to query WMS point by point
        if gdf_lotes.crs is None or gdf_lotes.crs.to_epsg() != 4326:
            gdf_lotes = gdf_lotes.to_crs(epsg=4326)
            
        if 'Lote_Name' not in gdf_lotes.columns:
             gdf_lotes['Lote_Name'] = [f'Lote_{i+1}' for i in range(len(gdf_lotes))]
             
        for _, row in gdf_lotes.iterrows():
            lote_name = row['Lote_Name']
            centroid = row.geometry.centroid
            lon, lat = centroid.x, centroid.y
            buffer = 0.001
            minx, maxx = lon - buffer, lon + buffer
            miny, maxy = lat - buffer, lat + buffer
            
            params = {
                'SERVICE': 'WMS',
                'VERSION': '1.1.0',
                'REQUEST': 'GetFeatureInfo',
                'FORMAT': 'image/png',
                'TRANSPARENT': 'true',
                'QUERY_LAYERS': 'idecor:suelo_materia_organica',
                'LAYERS': 'idecor:suelo_materia_organica',
                'INFO_FORMAT': 'application/json',
                'X': '50',
                'Y': '50',
                'WIDTH': '101',
                'HEIGHT': '101',
                'BBOX': f"{minx},{miny},{maxx},{maxy}", 
                'SRS': 'EPSG:4326'
            }
            
            res = requests.get(url, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()
            mo_val = 0.0
            if data.get('features') and len(data['features']) > 0:
                props = data['features'][0]['properties']
                mo_val = props.get('RED_BAND') or props.get('GRAY_INDEX', 0.0)
            
            results[lote_name] = round(float(mo_val), 2)
            
        return results
    except Exception as e:
        print(f"Error fetching MO IDECOR batch: {e}")
        return results
