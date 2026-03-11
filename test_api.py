import requests
import json
import sys

# 1. Parse the KML first to get the spatial data 
print('Uploading KML...')
with open(r'c:\Users\rodri\Downloads\Lote Cultivo de Servicio (2).kml', 'rb') as f:
    resp = requests.post('http://127.0.0.1:8000/api/upload-lotes', files={'file': f})
    data = resp.json()

if 'geojson' not in data:
    print('Error: no geojson returned', data)
    sys.exit(1)

lotes = []
count = 1
for f in data['geojson']['features']:
    lotes.append({
        'id': str(count),
        'name': f['properties'].get('name', f['properties'].get('Name', f['properties'].get('Lote_Name', 'Lote Cultivo de Servicio'))),
        'coordinates': f['geometry']['coordinates'],
        'area_ha': 100,
        'center_lat': -32.55,
        'center_lon': -62.45
    })
    count += 1

print(f"Lotes found: {len(lotes)}")

# 2. Call the benchmark endpoint with Landsat
print('\nCalling Landsat Benchmark...')
payload = {
    'lotes': lotes,
    'fecha_inicio': '2024-01-01',
    'fecha_fin': '2024-03-01',
    'indice': 'NDVI',
    'satellite': 'Landsat'
}

resp_ts = requests.post('http://127.0.0.1:8000/api/timeseries/benchmark', json=payload)
print(f'Status Code: {resp_ts.status_code}')

if resp_ts.status_code == 200:
    ts_data = resp_ts.json()['data']
    print(f'Retrieved {len(ts_data)} daily records from Earth Engine Landsat!')
    print(ts_data[:3])
else:
    print(resp_ts.text)
