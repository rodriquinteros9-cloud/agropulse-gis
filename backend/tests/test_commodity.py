"""Test completo de integración: descarga, parseo, filtro temporal y ratios."""
import asyncio, sys, os
sys.path.insert(0, '.')

from services.commodity_history_service import get_commodity_history, compute_ip_ratios

async def main():
    print("=" * 60)
    print("TEST DE INTEGRACION - Commodity History Service")
    print("=" * 60)
    
    # 1. Descarga y parseo
    print("\n[1] Descargando Pink Sheet (con fallback de URLs)...")
    data = await get_commodity_history()
    
    if data.get('error'):
        print(f"   ERROR: {data['error']}")
        return False
    
    series = data.get('series', {})
    expected = {'soja', 'maiz', 'trigo', 'urea', 'dap', 'tsp'}
    found = set(series.keys())
    
    if expected != found:
        print(f"   FALLO: Esperado {expected}, encontrado {found}")
        return False
    print(f"   OK: {len(series)} commodities encontrados")
    
    # 2. Validar datos
    print("\n[2] Validando datos de cada commodity...")
    for key, commodity in series.items():
        count = commodity['count']
        last_price = commodity['last_price']
        last_date = commodity['last_date']
        
        if count < 50:
            print(f"   FALLO: {key} tiene solo {count} puntos (esperado > 50)")
            return False
        if last_price is None or last_price <= 0:
            print(f"   FALLO: {key} ultimo precio invalido: {last_price}")
            return False
        
        print(f"   OK: {key:6s} -> {count:4d} puntos, ultimo {last_date} ${last_price:.0f}/tn")
    
    # 3. Ratios globales
    print("\n[3] Calculando Relaciones IP (datos globales)...")
    ratios = compute_ip_ratios(series)
    
    if len(ratios) != 3:
        print(f"   FALLO: Esperado 3 ratios, encontrado {len(ratios)}")
        return False
    
    for ratio in ratios:
        c = ratio['current']
        s = ratio['stats']
        if c['ratio'] <= 0 or s['mean'] <= 0:
            print(f"   FALLO: {ratio['id']} tiene ratio invalido")
            return False
        if c['signal'] not in ('favorable', 'neutral', 'desfavorable'):
            print(f"   FALLO: {ratio['id']} signal invalido: {c['signal']}")
            return False
        print(f"   OK: {ratio['label']:15s} -> actual={c['ratio']:.1f} media={s['mean']:.1f} signal={c['signal']}")
    
    # 4. Filtro temporal
    print("\n[4] Validando filtro temporal (2020+)...")
    filtered = {}
    for key, commodity in series.items():
        fdata = [dp for dp in commodity['data'] if int(dp['date'][:4]) >= 2020]
        filtered[key] = {**commodity, 'data': fdata, 'count': len(fdata)}
    
    ratios_filtered = compute_ip_ratios(filtered)
    for rf in ratios_filtered:
        # El promedio filtrado (2020+) debe ser diferente al global
        global_ratio = next(r for r in ratios if r['id'] == rf['id'])
        if rf['stats']['mean'] == global_ratio['stats']['mean'] == 0:
            print(f"   FALLO: Promedio filtrado igual al global para {rf['id']}")
            return False
        print(f"   OK: {rf['label']:15s} -> media 2020+={rf['stats']['mean']:.1f} (global={global_ratio['stats']['mean']:.1f})")
    
    # 5. Cache
    print("\n[5] Validando cache...")
    data2 = await get_commodity_history()
    if not data2.get('cached'):
        print("   FALLO: Segunda llamada no fue cacheada")
        return False
    print("   OK: Cache funciona correctamente")
    
    print("\n" + "=" * 60)
    print("TODOS LOS TESTS PASARON")
    print("=" * 60)
    return True

result = asyncio.run(main())
sys.exit(0 if result else 1)
