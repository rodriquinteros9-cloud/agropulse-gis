export interface ReferenceCropData {
  id: string; // ID interno usado por Planning
  name: string; // Nombre visible en la tabla
  pizarraFallback: number; // Precio pizarra de referencia USD/tn
  retencionPct: number; // Retención DEX en % (ej. 33 para soja)
  comercializacionPct: number; // Gastos de comercialización en % (comisiones, paritarias)
  secadaUsdTn: number; // Costo de secada/acondicionamiento USD/tn
  cosechaAlto: number; // Cosecha nivel alto insumos (USD/ha)
  cosechaBajo: number; // Cosecha nivel bajo insumos (USD/ha)
  laboresInsumosAlto: number; // Labores+Insumos nivel alto (USD/ha)
  laboresInsumosBajo: number; // Labores+Insumos nivel bajo (USD/ha)
  arriendoPctAnual: number; // Fracción del alquiler anual que absorbe este cultivo (0-1). Trigo(0.65)+Soja2da(0.35)=1.0
  rindeRefqq: string; // Rango de rinde esperado texto
  rindeMedioqq: number; // Rinde medio zonal qq/ha para cálculo de margen
}

export const CROP_REFERENCE_DATA: ReferenceCropData[] = [
  {
    id: 'Soja',
    name: 'Soja 1ª',
    pizarraFallback: 320.35,
    retencionPct: 33,
    comercializacionPct: 2.0,
    secadaUsdTn: 0,
    cosechaAlto: 105,
    cosechaBajo: 97,
    laboresInsumosAlto: 215,
    laboresInsumosBajo: 185,
    arriendoPctAnual: 1.0, // Ciclo completo verano → 100% del alquiler anual
    rindeRefqq: '32–42',
    rindeMedioqq: 37,
  },
  {
    id: 'Maíz',
    name: 'Maíz',
    pizarraFallback: 172.01,
    retencionPct: 12,
    comercializacionPct: 2.0,
    secadaUsdTn: 4,
    cosechaAlto: 140,
    cosechaBajo: 128,
    laboresInsumosAlto: 330,
    laboresInsumosBajo: 290,
    arriendoPctAnual: 1.0, // Ciclo completo verano → 100% del alquiler anual
    rindeRefqq: '70–105',
    rindeMedioqq: 88,
  },
  {
    id: 'Trigo',
    name: 'Trigo',
    pizarraFallback: 185.00,
    retencionPct: 12,
    comercializacionPct: 2.0,
    secadaUsdTn: 5,
    cosechaAlto: 80,
    cosechaBajo: 72,
    laboresInsumosAlto: 215,
    laboresInsumosBajo: 185,
    arriendoPctAnual: 0.65, // Invierno en doble cultivo → 65% del alquiler anual
    rindeRefqq: '35–50',
    rindeMedioqq: 42,
  },
  {
    id: 'Girasol',
    name: 'Girasol',
    pizarraFallback: 390.00,
    retencionPct: 7,
    comercializacionPct: 2.0,
    secadaUsdTn: 0,
    cosechaAlto: 85,
    cosechaBajo: 78,
    laboresInsumosAlto: 155,
    laboresInsumosBajo: 130,
    arriendoPctAnual: 1.0, // Ciclo completo verano → 100% del alquiler anual
    rindeRefqq: '17–25',
    rindeMedioqq: 21,
  },
  {
    id: 'Sorgo',
    name: 'Sorgo',
    pizarraFallback: 190.00,
    retencionPct: 12,
    comercializacionPct: 2.0,
    secadaUsdTn: 3,
    cosechaAlto: 88,
    cosechaBajo: 80,
    laboresInsumosAlto: 220,
    laboresInsumosBajo: 190,
    arriendoPctAnual: 1.0, // Ciclo completo verano → 100% del alquiler anual
    rindeRefqq: '50–70',
    rindeMedioqq: 60,
  },
  {
    id: 'Soja Segunda',
    name: 'Soja 2ª',
    pizarraFallback: 320.35,
    retencionPct: 33,
    comercializacionPct: 2.0,
    secadaUsdTn: 0,
    cosechaAlto: 100,
    cosechaBajo: 92,
    laboresInsumosAlto: 155,
    laboresInsumosBajo: 130,
    arriendoPctAnual: 0.35, // Verano post-fina en doble cultivo → 35% del alquiler anual
    rindeRefqq: '22–32',
    rindeMedioqq: 27,
  },
  {
    id: 'Cebada',
    name: 'Cebada',
    pizarraFallback: 195.00,
    retencionPct: 12,
    comercializacionPct: 2.0,
    secadaUsdTn: 4,
    cosechaAlto: 78,
    cosechaBajo: 70,
    laboresInsumosAlto: 210,
    laboresInsumosBajo: 180,
    arriendoPctAnual: 0.65, // Invierno en doble cultivo → 65% del alquiler anual
    rindeRefqq: '32–48',
    rindeMedioqq: 40,
  },
  {
    id: 'Maní',
    name: 'Maní',
    pizarraFallback: 540.00, // Precio confitería referencia (no cotiza en pizarra BCR, se usa precio de mercado FOB)
    retencionPct: 0, // Decreto 38/2025: 0% DEX para maní blancheado y subproductos
    comercializacionPct: 3.0, // Más alto que otros granos por proceso industrial intermedio (acopio + selección + clasificación)
    secadaUsdTn: 12, // Secado/acondicionamiento postcosecha (el maní necesita llegar a <9% humedad)
    cosechaAlto: 150, // Arrancado-inversado (~50) + Descapotado/trilla (~90) + confección hileras (~10) — servicio especializado
    cosechaBajo: 130, // Arrancado-inversado (~45) + Descapotado/trilla (~75) + confección hileras (~10)
    laboresInsumosAlto: 380, // Semilla cara (alto costo genético) + funguicidas intensivos + herbicidas + fertilización + labores mecánicas
    laboresInsumosBajo: 320, // Paquete tecnológico reducido pero el maní sigue siendo intensivo en insumos
    arriendoPctAnual: 1.0, // Ciclo completo verano → 100% del alquiler anual
    rindeRefqq: '25–40', // Rango de rinde en caja (maní con cáscara) 
    rindeMedioqq: 30, // Rinde medio zonal Córdoba (principal zona productora)
  },
];

export const TARIFA_FLETE_REFERENCIA = 0.094; // USD/tn*km
export const FECHA_TARIFA_FLETE = 'Q2-2025';

export interface Puerto {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
}

export const PUERTOS: Puerto[] = [
  { id: 'rosario', nombre: 'Rosario / Up River', lat: -32.95, lng: -60.67 },
  { id: 'bahia', nombre: 'Bahía Blanca', lat: -38.72, lng: -62.27 },
  { id: 'quequen', nombre: 'Quequén', lat: -38.57, lng: -58.71 },
  { id: 'bcnorte', nombre: 'Buenos Aires Norte', lat: -34.35, lng: -58.42 },
];
