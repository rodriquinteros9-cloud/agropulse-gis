import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { Calculator, AlertTriangle, RefreshCw, Info, MapPin, Settings2, Edit3, ChevronDown, ChevronUp, Save, Download, FolderOpen, Layers, Trash2, X } from 'lucide-react';
import { CROP_REFERENCE_DATA, PUERTOS, TARIFA_FLETE_REFERENCIA, FECHA_TARIFA_FLETE } from '../config/cropReferenceData';

const API_BASE = 'http://localhost:8000/api';

// Función Haversine para cálculo de distancia en línea recta (km)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// Estimador espacial de arrendamiento en qq/ha (Soja) por zonas agronómicas y provincias
function getArriendoEstimadoQqHa(lat: number, lon: number): { qq: number, zona: string } {
  if (!lat || !lon) return { qq: 15, zona: 'Zona Genérica (Sin coords)' };
  
  // 1. NEA / NOA 
  if (lat >= -29.5) return { qq: 8.0, zona: 'NEA / NOA' };

  // 2. ZONA NÚCLEO
  if (lat <= -32.5 && lat >= -34.5 && lon <= -59.5 && lon >= -63.5) return { qq: 17.0, zona: 'Zona Núcleo Premium' }; 

  // 3. BUENOS AIRES NORTE 
  if (lat <= -33.5 && lat >= -35.5 && lon >= -61.0) return { qq: 15.0, zona: 'Buenos Aires Norte' };

  // 4. ENTRE RÍOS 
  if (lat >= -34.5 && lon >= -60.5) return { qq: 9.0, zona: 'Entre Ríos' };

  // 5. CÓRDOBA SUR / LA PAMPA NORESTE 
  if (lat <= -33.0 && lat >= -35.0 && lon <= -63.5) return { qq: 13.5, zona: 'Córdoba Sur / LP Noreste' };

  // 6. CÓRDOBA CENTRO / NORTE 
  if (lat >= -33.0 && lon <= -62.0) return { qq: 10.5, zona: 'Córdoba Centro/Norte' };

  // 7. SANTA FE CENTRO / NORTE 
  if (lat >= -32.5 && lon >= -62.0 && lon <= -59.0) return { qq: 11.0, zona: 'Santa Fe Centro/Norte' };

  // 8. BUENOS AIRES OESTE / LA PAMPA ESTE 
  if (lat <= -34.5 && lat >= -37.0 && lon <= -61.0) return { qq: 13.0, zona: 'Buenos Aires Oeste / LP Este' };

  // 9. BUENOS AIRES SUDESTE / SUR 
  if (lat <= -37.0) return { qq: 11.0, zona: 'BA Sur / Sudeste' };

  // 10. BUENOS AIRES CENTRO 
  if (lat <= -35.5 && lat >= -37.0 && lon >= -61.0) return { qq: 12.0, zona: 'Buenos Aires Centro' };

  return { qq: 12.0, zona: 'Promedio Pampeano' };
}

// Interfaz para los precios devueltos por la API
interface PricesResponse {
  precios: Record<string, { precio_usd_tn?: number; fuente?: string }>;
  fecha: string;
  retenciones: Record<string, number>;
  fuente: string;
  cached?: boolean;
  error?: string;
}

interface Lote {
  id: string;
  name: string;
  center_lat: number;
  center_lon: number;
}

// === TIPOS PARA PERSISTENCIA Y ESCENARIOS ===
type CropOverride = {
  arriendo?: number;
  cosecha?: number;
  labranza?: number;
  herbicida?: number;
  fertilizantes?: number;
  insecticidas?: number;
  fungicidas?: number;
  curasemillas?: number;
  semillas?: number;
  seguros?: number;
  estructura?: number;
  impuestos?: number;
  amortizaciones?: number;
  laboresInsumosDirecto?: number;
};

interface SimulationScenario {
  id: string;
  name: string;
  timestamp: number;
  lotId: string;
  lotName: string;
  config: {
    conArriendo: boolean;
    altoInsumos: boolean;
    tarifaFlete: number;
    selectedPuerto: string;
  };
  overrides: Record<string, CropOverride>;
  priceOverrides: Record<string, number>;
}

const STORAGE_KEY_PREFIX = 'ri_sim_';
const SCENARIOS_KEY = 'ri_scenarios';

export default function BreakEvenCalculator({ lotes = [] }: { lotes?: Lote[] }) {
  // Estado de API
  const [prices, setPrices] = useState<PricesResponse | null>(null);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceError, setPriceError] = useState('');

  // Controles de Usuario
  const [activeLotId, setActiveLotId] = useState<string>('');
  const [selectedPuerto, setSelectedPuerto] = useState('rosario');
  const [conArriendo, setConArriendo] = useState(true);
  const [altoInsumos, setAltoInsumos] = useState(true);
  const [tarifaFlete, setTarifaFlete] = useState(TARIFA_FLETE_REFERENCIA);

  // User Overrides (simulador interactivo de costos por cultivo)
  const [expandedCropId, setExpandedCropId] = useState<string | null>(null);
  const [userOverrides, setUserOverrides] = useState<Record<string, CropOverride>>({});

  // Multi-escenario: override de precios pizarra por cultivo
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});

  // Sistema de escenarios guardados
  const [savedScenarios, setSavedScenarios] = useState<SimulationScenario[]>([]);
  const [scenarioName, setScenarioName] = useState('');
  const [showScenarioPanel, setShowScenarioPanel] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  
  const handleOverrideChange = (cropId: string, field: string, val: number | undefined) => {
    setUserOverrides(prev => {
      const cropOverrides = { ...(prev[cropId] || {}) };
      if (val === undefined || isNaN(val)) {
        delete (cropOverrides as any)[field];
      } else {
        (cropOverrides as any)[field] = val;
      }
      return { ...prev, [cropId]: cropOverrides };
    });
  };

  const handlePriceOverride = (cropId: string, val: number | undefined) => {
    setPriceOverrides(prev => {
      const copy = { ...prev };
      if (val === undefined || isNaN(val)) { delete copy[cropId]; } else { copy[cropId] = val; }
      return copy;
    });
  };

  const clearOverride = (cropId: string) => {
    setUserOverrides(prev => { const c = { ...prev }; delete c[cropId]; return c; });
    setPriceOverrides(prev => { const c = { ...prev }; delete c[cropId]; return c; });
  };

  // === PERSISTENCIA: Auto-guardar overrides en localStorage por lote ===
  const isLoadingRef = useRef(false); // Bloquea autoSave durante carga de lote

  const autoSaveToStorage = useCallback(() => {
    if (!activeLotId || isLoadingRef.current) return; // NO guardar durante carga
    const data = { overrides: userOverrides, priceOverrides, config: { conArriendo, altoInsumos, tarifaFlete, selectedPuerto } };
    const hasData = Object.keys(userOverrides).length > 0 || Object.keys(priceOverrides).length > 0;
    if (hasData) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${activeLotId}`, JSON.stringify(data));
    } else {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${activeLotId}`);
    }
  }, [activeLotId, userOverrides, priceOverrides, conArriendo, altoInsumos, tarifaFlete, selectedPuerto]);

  useEffect(() => { autoSaveToStorage(); }, [autoSaveToStorage]);

  const loadFromStorage = useCallback((lotId: string) => {
    isLoadingRef.current = true; // Bloquear autoSave
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${lotId}`);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setUserOverrides(data.overrides || {});
        setPriceOverrides(data.priceOverrides || {});
        if (data.config) {
          setConArriendo(data.config.conArriendo ?? true);
          setAltoInsumos(data.config.altoInsumos ?? true);
          setTarifaFlete(data.config.tarifaFlete ?? TARIFA_FLETE_REFERENCIA);
          setSelectedPuerto(data.config.selectedPuerto ?? 'rosario');
        }
        setSavedIndicator('Simulación anterior restaurada');
        setTimeout(() => setSavedIndicator(null), 3000);
      } catch { setUserOverrides({}); setPriceOverrides({}); }
    } else {
      setUserOverrides({});
      setPriceOverrides({});
    }
    // Desbloquear autoSave después del próximo render
    requestAnimationFrame(() => { isLoadingRef.current = false; });
  }, []);

  // === GESTIÓN DE ESCENARIOS ===
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SCENARIOS_KEY);
      if (raw) setSavedScenarios(JSON.parse(raw));
    } catch { /* */ }
  }, []);

  const saveScenario = () => {
    const name = scenarioName.trim() || `Escenario ${new Date().toLocaleDateString('es-AR')}`;
    const activeLot = lotes.find(l => l.id === activeLotId) || { id: 'fallback', name: 'Zona Núcleo' };
    const scenario: SimulationScenario = {
      id: `sc_${Date.now()}`,
      name,
      timestamp: Date.now(),
      lotId: activeLotId,
      lotName: activeLot.name,
      config: { conArriendo, altoInsumos, tarifaFlete, selectedPuerto },
      overrides: userOverrides,
      priceOverrides,
    };
    const updated = [...savedScenarios, scenario];
    setSavedScenarios(updated);
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(updated));
    setScenarioName('');
    setSavedIndicator(`"${name}" guardado`);
    setTimeout(() => setSavedIndicator(null), 3000);
  };

  const loadScenario = (sc: SimulationScenario) => {
    isLoadingRef.current = true; // Bloquear durante carga de escenario
    setUserOverrides(sc.overrides);
    setPriceOverrides(sc.priceOverrides);
    setConArriendo(sc.config.conArriendo);
    setAltoInsumos(sc.config.altoInsumos);
    setTarifaFlete(sc.config.tarifaFlete);
    setSelectedPuerto(sc.config.selectedPuerto);
    setShowScenarioPanel(false);
    setSavedIndicator(`"${sc.name}" cargado`);
    setTimeout(() => setSavedIndicator(null), 3000);
    requestAnimationFrame(() => { isLoadingRef.current = false; });
  };

  const deleteScenario = (scId: string) => {
    const updated = savedScenarios.filter(s => s.id !== scId);
    setSavedScenarios(updated);
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(updated));
  };

  // === EXPORTAR PDF ===
  const exportPDF = () => {
    window.print();
  };

  // Inicialización o cambio de lote activo
  useEffect(() => {
    if (lotes.length > 0 && !activeLotId) {
      setActiveLotId(lotes[0].id);
    }
  }, [lotes, activeLotId]);

  // Cargar simulación al cambiar de lote
  useEffect(() => {
    if (activeLotId) loadFromStorage(activeLotId);
  }, [activeLotId, loadFromStorage]);

  // Lote actual con fallback a zona núcleo pampeana
  const activeLot = useMemo(() => {
    return lotes.find(l => l.id === activeLotId) || { id: 'fallback', name: 'Zona Núcleo (Referencia)', center_lat: -33.5, center_lon: -62.5 };
  }, [activeLotId, lotes]);

  // Lógica de preselección de puerto automático al cambiar lote
  useEffect(() => {
    const { center_lat, center_lon } = activeLot;
    if (center_lat > -36.0) {
      setSelectedPuerto('rosario');
    } else if (center_lat <= -36.0 && center_lon < -61.0) {
      setSelectedPuerto('bahia');
    } else {
      setSelectedPuerto('quequen');
    }
  }, [activeLot.id]);

  // Fetch de precios desde backend
  const fetchPrices = async () => {
    setLoadingPrices(true);
    setPriceError('');
    try {
      const resp = await fetch(`${API_BASE}/prices/grains`);
      if (!resp.ok) throw new Error('Error de conexión con la API de precios');
      const data: PricesResponse = await resp.json();
      setPrices(data);
    } catch (err: any) {
      setPriceError(err.message || 'Error al obtener precios vigentes');
    } finally {
      setLoadingPrices(false);
    }
  };

  useEffect(() => { fetchPrices(); }, []);

  // Puerto actual seleccionado
  const puertoCoords = useMemo(() => PUERTOS.find(p => p.id === selectedPuerto) || PUERTOS[0], [selectedPuerto]);

  // Distancia del polígono activo al puerto (Ruta real)
  const [distanciaKm, setDistanciaKm] = useState<number>(0);
  const [calculandoRuta, setCalculandoRuta] = useState(false);

  useEffect(() => {
    let active = true;
    const calcularRutaReal = async () => {
      setCalculandoRuta(true);
      const linealFallback = haversine(activeLot.center_lat, activeLot.center_lon, puertoCoords.lat, puertoCoords.lng);
      try {
        // Usamos OSRM (Open Source Routing Machine) pública para la distancia en auto (camión)
        const url = `https://router.project-osrm.org/route/v1/driving/${activeLot.center_lon},${activeLot.center_lat};${puertoCoords.lng},${puertoCoords.lat}?overview=false`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Error OSRM');
        const data = await resp.json();
        
        if (active) {
          if (data.routes && data.routes.length > 0) {
            setDistanciaKm(data.routes[0].distance / 1000); // meters to km
          } else {
            setDistanciaKm(linealFallback);
          }
        }
      } catch (e) {
        if (active) setDistanciaKm(linealFallback);
      } finally {
        if (active) setCalculandoRuta(false);
      }
    };

    calcularRutaReal();
    return () => { active = false; };
  }, [activeLot.center_lat, activeLot.center_lon, puertoCoords.lat, puertoCoords.lng]);

  // Flete total en base a distancia y tarifa
  const fleteUSD = distanciaKm * tarifaFlete;

  // Renderizado del Semáforo
  const renderSemaforo = (margenPct: number) => {
    if (margenPct >= 12) {
      return (
        <span className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold whitespace-nowrap shadow-sm">
          🟢 +{margenPct.toFixed(1)}% sobre RI
        </span>
      );
    } else if (margenPct >= 0) {
      return (
        <span className="px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-xs font-bold whitespace-nowrap shadow-sm">
          🟠 Ajustado {margenPct.toFixed(1)}%
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold whitespace-nowrap shadow-sm">
          🔴 {margenPct.toFixed(1)}% bajo RI
        </span>
      );
    }
  };

  // ── Colores de curvas MB (todos los cultivos) ──
  const MB_COLORS: Record<string, string> = {
    'Soja': '#16a34a',
    'Maíz': '#dc2626',
    'Trigo': '#3b82f6',
    'Girasol': '#eab308',
    'Sorgo': '#f97316',
    'Soja Segunda': '#22c55e',
    'Cebada': '#8b5cf6',
    'Maní': '#ec4899',
  };

  // Filtro de cultivos visibles en el gráfico
  const [selectedMBCrops, setSelectedMBCrops] = useState<string[]>(['Soja', 'Maíz', 'Girasol']);

  const toggleMBCrop = (cropId: string) => {
    setSelectedMBCrops(prev =>
      prev.includes(cropId)
        ? prev.filter(c => c !== cropId)
        : [...prev, cropId]
    );
  };

  // Estado para el Análisis de Sensibilidad
  const [sensitivityCropId, setSensitivityCropId] = useState<string>('Soja');

  // ── Datos del gráfico Margen Bruto vs Rendimiento (todos los cultivos) ──
  const mbChartData = useMemo(() => {
    // Precio soja referencia para arriendo
    const precioSojaMatch = prices?.precios?.['soja'] || prices?.precios?.['Soja'];
    const precioPizarraSojaTn = precioSojaMatch?.precio_usd_tn || CROP_REFERENCE_DATA.find(c => c.id === 'Soja')?.pizarraFallback || 320;

    // Calcular precio neto y costos para TODOS los cultivos
    const cropCalcs = CROP_REFERENCE_DATA.map(crop => {
      const priceMatch = prices?.precios?.[crop.id] || prices?.precios?.[crop.name];
      const basePrecio = priceMatch?.precio_usd_tn || crop.pizarraFallback;
      const precioPizTn = priceOverrides[crop.id] !== undefined ? priceOverrides[crop.id] : basePrecio;

      const retFrac = crop.retencionPct / 100;
      const comFrac = crop.comercializacionPct / 100;
      const precioPostDex = precioPizTn * (1 - retFrac);
      const gastosComerciales = precioPostDex * comFrac;
      const precioNetoTn = precioPostDex - fleteUSD - gastosComerciales - crop.secadaUsdTn;
      const precioNetoQq = precioNetoTn / 10;

      const override = userOverrides[crop.id] || {};
      const defaultLabores = altoInsumos ? crop.laboresInsumosAlto : crop.laboresInsumosBajo;
      const defaultCosecha = altoInsumos ? crop.cosechaAlto : crop.cosechaBajo;

      const hasDesglose = ['labranza', 'herbicida', 'fertilizantes', 'insecticidas', 'fungicidas', 'curasemillas', 'semillas'].some(k => override[k as keyof typeof override] !== undefined);
      let costosLabores = defaultLabores;
      if (hasDesglose) {
        costosLabores = (override.labranza || 0) + (override.herbicida || 0) + (override.fertilizantes || 0) + (override.insecticidas || 0) + (override.fungicidas || 0) + (override.curasemillas || 0) + (override.semillas || 0);
      } else if (override.laboresInsumosDirecto !== undefined) {
        costosLabores = override.laboresInsumosDirecto;
      }

      const costosCosecha = override.cosecha !== undefined ? override.cosecha : defaultCosecha;
      const { qq: arriendoZonalQq } = getArriendoEstimadoQqHa(activeLot.center_lat, activeLot.center_lon);
      const defaultArriendoQq = conArriendo ? (arriendoZonalQq * crop.arriendoPctAnual) : 0;
      const arriendoQq = override.arriendo !== undefined ? override.arriendo : defaultArriendoQq;
      const arriendoAplicaUsd = arriendoQq * (precioPizarraSojaTn / 10);

      const segurosUsd = override.seguros || 0;
      const estructuraUsd = override.estructura || 0;
      const impuestosUsd = override.impuestos || 0;
      const amortizacionesUsd = override.amortizaciones || 0;

      const costosDirectos = costosLabores + costosCosecha + segurosUsd;
      const costosIndirectos = arriendoAplicaUsd + estructuraUsd + impuestosUsd + amortizacionesUsd;
      const costosTotalesUsdHa = costosDirectos + costosIndirectos;

      const riQq = precioNetoQq > 0 ? costosTotalesUsdHa / precioNetoQq : 0;

      return { id: crop.id, name: crop.name, precioNetoQq, costosTotalesUsdHa, riQq, rindeMedio: crop.rindeMedioqq };
    });

    // Rango del eje X: de 0 al mayor rinde medio × 1.6 (solo cultivos visibles)
    const visibleCalcs = cropCalcs.filter(c => selectedMBCrops.includes(c.id));
    const maxX = visibleCalcs.length > 0 ? Math.max(...visibleCalcs.map(c => c.rindeMedio * 1.6)) : 50;
    const steps = Math.ceil(maxX);
    const data: Record<string, number | string>[] = [];

    for (let rto = 0; rto <= steps; rto += 1) {
      const point: Record<string, number | string> = { rto };
      cropCalcs.forEach(cc => {
        point[cc.id] = Math.round(rto * cc.precioNetoQq - cc.costosTotalesUsdHa);
      });
      data.push(point);
    }

    return { data, cropCalcs };
  }, [prices, priceOverrides, userOverrides, altoInsumos, conArriendo, fleteUSD, activeLot.center_lat, activeLot.center_lon, selectedMBCrops]);

  // ── Datos del Análisis de Sensibilidad (Precio × Rendimiento) ──
  const sensitivityData = useMemo(() => {
    const crop = CROP_REFERENCE_DATA.find(c => c.id === sensitivityCropId);
    if (!crop) return null;

    // Precio soja referencia para arriendo
    const precioSojaMatch = prices?.precios?.['soja'] || prices?.precios?.['Soja'];
    const precioPizarraSojaTn = precioSojaMatch?.precio_usd_tn || CROP_REFERENCE_DATA.find(c => c.id === 'Soja')?.pizarraFallback || 320;

    // Precio pizarra del cultivo seleccionado
    const priceMatch = prices?.precios?.[crop.id] || prices?.precios?.[crop.name];
    const basePrecio = priceMatch?.precio_usd_tn || crop.pizarraFallback;
    const precioPizTn = priceOverrides[crop.id] !== undefined ? priceOverrides[crop.id] : basePrecio;

    // Costos del cultivo (misma fórmula que la tabla RI)
    const override = userOverrides[crop.id] || {};
    const defaultLabores = altoInsumos ? crop.laboresInsumosAlto : crop.laboresInsumosBajo;
    const defaultCosecha = altoInsumos ? crop.cosechaAlto : crop.cosechaBajo;

    const hasDesglose = ['labranza', 'herbicida', 'fertilizantes', 'insecticidas', 'fungicidas', 'curasemillas', 'semillas'].some(k => override[k as keyof typeof override] !== undefined);
    let costosLabores = defaultLabores;
    if (hasDesglose) {
      costosLabores = (override.labranza || 0) + (override.herbicida || 0) + (override.fertilizantes || 0) + (override.insecticidas || 0) + (override.fungicidas || 0) + (override.curasemillas || 0) + (override.semillas || 0);
    } else if (override.laboresInsumosDirecto !== undefined) {
      costosLabores = override.laboresInsumosDirecto;
    }

    const costosCosecha = override.cosecha !== undefined ? override.cosecha : defaultCosecha;
    const { qq: arriendoZonalQq } = getArriendoEstimadoQqHa(activeLot.center_lat, activeLot.center_lon);
    const defaultArriendoQq = conArriendo ? (arriendoZonalQq * crop.arriendoPctAnual) : 0;
    const arriendoQq = override.arriendo !== undefined ? override.arriendo : defaultArriendoQq;
    const arriendoAplicaUsd = arriendoQq * (precioPizarraSojaTn / 10);

    const segurosUsd = override.seguros || 0;
    const estructuraUsd = override.estructura || 0;
    const impuestosUsd = override.impuestos || 0;
    const amortizacionesUsd = override.amortizaciones || 0;

    const costosDirectos = costosLabores + costosCosecha + segurosUsd;
    const costosIndirectos = arriendoAplicaUsd + estructuraUsd + impuestosUsd + amortizacionesUsd;
    const costosTotales = costosDirectos + costosIndirectos;

    // Variaciones de precio pizarra: -30% a +30% en pasos de 10%
    const priceVariations = [-30, -20, -10, 0, 10, 20, 30];
    const priceColumns = priceVariations.map(pct => ({
      pct,
      pizarra: Math.round(precioPizTn * (1 + pct / 100)),
    }));

    // Variaciones de rendimiento: 7 filas centradas en el rinde medio
    const rindeMedio = crop.rindeMedioqq;
    const step = Math.max(Math.round(rindeMedio * 0.15), 2); // ~15% steps
    const yieldRows: number[] = [];
    for (let i = -3; i <= 3; i++) {
      const rto = Math.max(0, rindeMedio + i * step);
      yieldRows.push(rto);
    }

    // Generar la matriz
    const matrix = yieldRows.map(rto => {
      const row = priceColumns.map(col => {
        // Recalcular precio neto con el precio de pizarra variado
        const retFrac = crop.retencionPct / 100;
        const comFrac = crop.comercializacionPct / 100;
        const precioPostDex = col.pizarra * (1 - retFrac);
        const gastosComerciales = precioPostDex * comFrac;
        const precioNetoTn = precioPostDex - fleteUSD - gastosComerciales - crop.secadaUsdTn;
        const precioNetoQq = precioNetoTn / 10;

        const mb = Math.round(rto * precioNetoQq - costosTotales);
        return mb;
      });
      return { rto, values: row };
    });

    return {
      cropName: crop.name,
      cropId: crop.id,
      precioPizarra: Math.round(precioPizTn),
      rindeMedio,
      costosTotales: Math.round(costosTotales),
      priceColumns,
      yieldRows,
      matrix,
    };
  }, [sensitivityCropId, prices, priceOverrides, userOverrides, altoInsumos, conArriendo, fleteUSD, activeLot.center_lat, activeLot.center_lon]);

  return (
    <div ref={printRef} className="bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 backdrop-blur-sm rounded-[2rem] shadow-xl shadow-slate-200/40 relative overflow-hidden flex flex-col print:shadow-none print:border-0 print:rounded-none">
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-100/20 rounded-full blur-[100px] pointer-events-none -mr-20 -mt-20 print:hidden" />

      {/* === HEADER Y FUENTES === */}
      <div className="p-8 pb-5 border-b border-slate-100 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white shadow-sm rounded-2xl border border-slate-100 print:shadow-none">
              <Calculator className="w-7 h-7 text-blue-600" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="font-extrabold text-2xl tracking-tight text-slate-800">Rinde de Indiferencia</h3>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                Rendimiento mínimo de equilibrio. Precios y Fletes calculados dinámicamente.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 text-right">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                Precios: BCR {prices?.fecha ? `(${prices.fecha})` : ''}
              </span>
              <button
                onClick={fetchPrices}
                disabled={loadingPrices}
                className="p-1.5 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors shadow-sm disabled:opacity-50 print:hidden"
                title="Actualizar precios"
              >
                <RefreshCw size={14} className={`text-slate-500 ${loadingPrices ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="text-[10px] font-semibold text-slate-400 flex flex-col sm:flex-row gap-x-3 gap-y-1">
              <span>
                Cosecha:{' '}
                <a href="https://agrocontratistas.com.ar/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                  FACMA / Agrocontratistas
                </a>
              </span>
              <span className="hidden sm:inline">•</span>
              <span>
                Labores:{' '}
                <a href="https://www.facma.com.ar/" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                  FACMA (Referencia 2025/26)
                </a>
              </span>
              <span className="hidden sm:inline">•</span>
              <span>Flete base: BCR {FECHA_TARIFA_FLETE}</span>
            </div>
          </div>
        </div>

        {priceError && (
          <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-sm font-medium text-amber-700">
            <AlertTriangle size={16} /> {priceError}. Se están mostrando los últimos valores de pizarra accesibles.
          </div>
        )}
      </div>

      {/* === BARRA DE ESCENARIOS Y EXPORTAR === */}
      <div className="px-8 py-3 bg-gradient-to-r from-slate-50/80 to-white border-b border-slate-100 flex flex-wrap items-center gap-3 relative z-10 print:hidden">
        {/* Guardar Escenario */}
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Layers size={14} className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Nombre del escenario..."
            className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-400 min-w-0"
          />
          <button
            onClick={saveScenario}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm shrink-0"
          >
            <Save size={13} /> Guardar
          </button>
        </div>

        {/* Cargar Escenarios */}
        <button
          onClick={() => setShowScenarioPanel(!showScenarioPanel)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-colors shadow-sm shrink-0 ${showScenarioPanel ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'}`}
        >
          <FolderOpen size={13} /> Mis Escenarios ({savedScenarios.length})
        </button>

        {/* Exportar PDF */}
        <button
          onClick={exportPDF}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm shrink-0"
        >
          <Download size={13} /> Exportar PDF
        </button>

        {/* Indicador de guardado */}
        {savedIndicator && (
          <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 animate-pulse">
            ✓ {savedIndicator}
          </span>
        )}
      </div>

      {/* === PANEL DE ESCENARIOS GUARDADOS === */}
      {showScenarioPanel && (
        <div className="px-8 py-4 bg-blue-50/50 border-b border-blue-100 relative z-10 print:hidden">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide">Escenarios Guardados</h4>
            <button onClick={() => setShowScenarioPanel(false)} className="p-1 hover:bg-blue-100 rounded transition-colors">
              <X size={14} className="text-blue-600" />
            </button>
          </div>
          {savedScenarios.length === 0 ? (
            <p className="text-xs text-slate-500 italic">No hay escenarios guardados aún. Configurá tus costos y precios, y hacé clic en "Guardar".</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {savedScenarios.map(sc => (
                <div key={sc.id} className="bg-white rounded-lg p-3 border border-slate-200 flex items-center justify-between gap-2 shadow-sm hover:shadow transition-shadow">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate">{sc.name}</div>
                    <div className="text-[10px] text-slate-400 font-medium">
                      {sc.lotName} · {new Date(sc.timestamp).toLocaleDateString('es-AR')} {new Date(sc.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {sc.config.altoInsumos ? 'Alto' : 'Bajo'} insumos · {sc.config.conArriendo ? 'Con' : 'Sin'} arriendo
                      {Object.keys(sc.priceOverrides).length > 0 && <span className="text-blue-500"> · {Object.keys(sc.priceOverrides).length} precios simulados</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => loadScenario(sc)}
                      className="px-2 py-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                    >
                      CARGAR
                    </button>
                    <button
                      onClick={() => deleteScenario(sc.id)}
                      className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 1: TABLA DE RINDE DE INDIFERENCIA + CONTROLES          */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <div className="px-6 md:px-8 pt-5 pb-2 border-t border-slate-100 relative z-10 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-black shadow-sm">1</div>
          <div>
            <h4 className="text-base font-extrabold text-slate-800">Tabla de Rinde de Indiferencia</h4>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Rendimiento mínimo de equilibrio por cultivo. Hacé clic en un cultivo para personalizar sus costos.</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-slate-100 flex-1 relative z-10">
        {/* === PANEL IZQUIERDO: CONTROLES === */}
        <div className="w-full xl:w-[320px] shrink-0 p-8 flex flex-col gap-8 bg-slate-50/50 print:hidden">

          {/* Selector de Lote */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <MapPin size={12} /> Seleccionar Lote Activo
            </label>
            <select
              value={activeLotId}
              onChange={(e) => setActiveLotId(e.target.value)}
              className="w-full bg-white border border-slate-200 text-sm font-semibold text-slate-700 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 shadow-sm transition-all"
            >
              {lotes.length === 0 && <option value="">Sin lotes cargados (Usando Zona Núcleo)</option>}
              {lotes.map(lote => (
                <option key={lote.id} value={lote.id}>{lote.name}</option>
              ))}
            </select>
            {activeLot.id === 'fallback' && (
              <p className="text-[11px] text-slate-400 font-medium">
                Mostrando valores para zona núcleo pampeana. Seleccioná un lote mapeado para calcular flete exacto.
              </p>
            )}
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-2" />

          {/* Selector de Puerto */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <MapPin size={12} /> Puerto Destino Flete
            </label>
            <div className="flex flex-col gap-1.5">
              {PUERTOS.map(puerto => (
                <button
                  key={puerto.id}
                  onClick={() => setSelectedPuerto(puerto.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all ${selectedPuerto === puerto.id
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                >
                  {puerto.nombre} {selectedPuerto === puerto.id && (
                    <span className="opacity-90 ml-1">
                      (A {calculandoRuta ? '...' : Math.round(distanciaKm)} km por ruta)
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="bg-indigo-50/60 rounded-xl p-3 border border-indigo-100 flex items-start gap-2 mt-2">
              <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-indigo-700 font-medium leading-relaxed">
                El flete se calcula dinámicamente como la distancia por ruta (OSRM) al puerto seleccionado multiplicada por la tarifa base.
              </p>
            </div>
          </div>

          <div className="h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent my-2" />

          {/* Toggles y Config */}
          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <Settings2 size={12} /> Configuración de Escenario
            </label>

            {/* Toggle Arriendo */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-600">Considerar Arriendo</span>
              <button
                onClick={() => setConArriendo(!conArriendo)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${conArriendo ? 'bg-blue-600' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${conArriendo ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Toggle Insumos */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-600">Nivel de Insumos</span>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setAltoInsumos(true)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${altoInsumos ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  ALTO
                </button>
                <button
                  onClick={() => setAltoInsumos(false)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${!altoInsumos ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  BAJO
                </button>
              </div>
            </div>

            {/* Tarifa Flete Editable */}
            <div className="flex flex-col mt-4 gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">Tarifa Flete</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-bold text-slate-400">USD/tn·km</span>
                  <input
                    type="number"
                    value={tarifaFlete}
                    onChange={(e) => setTarifaFlete(parseFloat(e.target.value) || 0)}
                    step={0.001}
                    className="w-20 text-right px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all font-mono"
                  />
                </div>
              </div>
              
              {/* === Resumen Calculo Flete Total === */}
              <div className="flex justify-between items-center bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-100 mt-1">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Total Flete</span>
                  <span className="text-[11px] font-semibold text-slate-600">
                    {calculandoRuta ? 'Calculando ruta...' : `${distanciaKm.toFixed(1)} km a ${puertoCoords.nombre}`}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-indigo-700">${fleteUSD.toFixed(2)}</span>
                  <span className="text-[10px] font-bold text-indigo-400 ml-1">USD/tn</span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* === PANEL DERECHO: TABLA === */}
        <div className="flex-1 p-0 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[750px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <th className="px-5 py-4">Cultivo</th>
                <th className="px-3 py-4 text-center">Pizarra<br/><span className="font-medium normal-case tracking-normal">(USD/tn)</span></th>
                <th className="px-3 py-4 text-center">Neto Tranquera<br/><span className="font-medium normal-case tracking-normal">(USD/tn)</span></th>
                <th className="px-3 py-4 text-right">Costos Totales<br/><span className="font-medium normal-case tracking-normal">(USD/ha)</span></th>
                <th className="px-3 py-4 text-center">RI<br/><span className="font-medium normal-case tracking-normal">(qq/ha)</span></th>
                <th className="px-5 py-4">Situación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {CROP_REFERENCE_DATA.map((crop) => {
                // === PRECIO SOJA REFERENCIA (para convertir qq de arriendo a USD) ===
                const precioSojaMatch = prices?.precios?.['soja'] || prices?.precios?.['Soja'];
                const precioPizarraSojaTn = precioSojaMatch?.precio_usd_tn || CROP_REFERENCE_DATA.find(c => c.id === 'Soja')?.pizarraFallback || 320;
                
                // === PRECIO PIZARRA DEL CULTIVO ===
                const priceMatch = prices?.precios?.[crop.id] || prices?.precios?.[crop.name];
                const basePrecioPizarraTn = priceMatch?.precio_usd_tn || crop.pizarraFallback;
                const isPriceOverridden = priceOverrides[crop.id] !== undefined;
                const precioPizarraTn = isPriceOverridden ? priceOverrides[crop.id] : basePrecioPizarraTn;

                // === PRECIO NETO EN TRANQUERA ===
                // Fórmula: Pizarra × (1 - DEX%) - Flete - Comercialización - Secada
                // DEX (Derechos de Exportación) se restan porque el FAS teórico de la BCR
                // es el precio máximo teórico; el productor cobra menos por las retenciones.
                const retFrac = crop.retencionPct / 100;
                const comFrac = crop.comercializacionPct / 100;
                const precioPostDex = precioPizarraTn * (1 - retFrac);
                const gastosComerciales = precioPostDex * comFrac;
                const precioNetoTn = precioPostDex - fleteUSD - gastosComerciales - crop.secadaUsdTn;
                const precioNetoQq = precioNetoTn / 10;

                // === COSTOS DE PRODUCCIÓN ===
                const defaultLabores = altoInsumos ? crop.laboresInsumosAlto : crop.laboresInsumosBajo;
                const defaultCosecha = altoInsumos ? crop.cosechaAlto : crop.cosechaBajo;
                
                // Arriendo zonal: qq/ha de soja × fracción anual del cultivo
                const { qq: arriendoZonalQq, zona: arriendoZonaNombre } = getArriendoEstimadoQqHa(activeLot.center_lat, activeLot.center_lon);
                const defaultArriendoQq = conArriendo ? (arriendoZonalQq * crop.arriendoPctAnual) : 0;
                
                const override = userOverrides[crop.id] || {};
                
                // Desglose individual de insumos (si el usuario cargó al menos un ítem)
                const hasDesglose = ['labranza', 'herbicida', 'fertilizantes', 'insecticidas', 'fungicidas', 'curasemillas', 'semillas'].some(k => override[k as keyof typeof override] !== undefined);
                
                let costosLabores = defaultLabores;
                if (hasDesglose) {
                   costosLabores = 
                     (override.labranza || 0) + 
                     (override.herbicida || 0) + 
                     (override.fertilizantes || 0) + 
                     (override.insecticidas || 0) + 
                     (override.fungicidas || 0) + 
                     (override.curasemillas || 0) + 
                     (override.semillas || 0);
                } else if (override.laboresInsumosDirecto !== undefined) {
                   costosLabores = override.laboresInsumosDirecto;
                }

                const costosCosecha = override.cosecha !== undefined ? override.cosecha : defaultCosecha;
                
                // Arriendo en qq de soja → convertido a USD
                const arriendoQq = override.arriendo !== undefined ? override.arriendo : defaultArriendoQq;
                const arriendoAplicaUsd = arriendoQq * (precioPizarraSojaTn / 10);
                
                // Costos indirectos adicionales
                const segurosUsd = override.seguros || 0;
                const estructuraUsd = override.estructura || 0;
                const impuestosUsd = override.impuestos || 0;
                const amortizacionesUsd = override.amortizaciones || 0;

                const isOverridden = Object.keys(override).length > 0 || isPriceOverridden;
                
                // === COSTO TOTAL USD/ha ===
                const costosDirectos = costosLabores + costosCosecha + segurosUsd;
                const costosIndirectos = arriendoAplicaUsd + estructuraUsd + impuestosUsd + amortizacionesUsd;
                const costosTotalesUsdHa = costosDirectos + costosIndirectos;

                // === RINDE DE INDIFERENCIA ===
                // RI = Costos Totales / Precio Neto por Quintal
                let riQq = 0;
                if (precioNetoQq > 0) {
                  riQq = costosTotalesUsdHa / precioNetoQq;
                }

                // Margen % respecto al rinde medio esperado
                let margenPct = 0;
                if (riQq > 0) {
                  margenPct = ((crop.rindeMedioqq - riQq) / riQq) * 100;
                }

                return (
                  <Fragment key={crop.id}>
                  <tr 
                    className={`transition-colors group cursor-pointer ${expandedCropId === crop.id ? 'bg-blue-50/50' : 'hover:bg-blue-50/30'}`}
                    onClick={() => setExpandedCropId(expandedCropId === crop.id ? null : crop.id)}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <div className="font-black text-slate-800 text-sm whitespace-nowrap">{crop.name}</div>
                        {expandedCropId === crop.id ? <ChevronUp size={14} className="text-blue-500" /> : <ChevronDown size={14} className="text-slate-400 group-hover:text-blue-500" />}
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold tracking-wide">Rto. Medio: {crop.rindeMedioqq} qq · DEX: {crop.retencionPct}%</div>
                    </td>
                    <td className="px-3 py-4 text-center" onClick={e => e.stopPropagation()}>
                       <div className="relative inline-block w-20 group/price">
                         <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold ${isPriceOverridden ? 'text-amber-500' : 'text-slate-400'}`}>$</span>
                         <input 
                           type="number"
                           className={`w-full pl-5 pr-1 py-1 text-xs font-bold font-mono text-right rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${isPriceOverridden ? 'bg-amber-100/50 text-amber-700 border-amber-300 shadow-inner' : 'bg-transparent text-slate-700 border-transparent hover:border-slate-200 hover:bg-slate-50'}`}
                           value={isPriceOverridden ? priceOverrides[crop.id] : basePrecioPizarraTn}
                           onChange={e => handlePriceOverride(crop.id, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                           placeholder={basePrecioPizarraTn.toString()}
                           title="Editar precio estimado para simular escenario"
                         />
                       </div>
                    </td>
                    <td className="px-3 py-4 text-center">
                      {precioNetoQq > 0 ? (
                        <div className="font-bold text-emerald-700 font-mono">${precioNetoTn.toFixed(0)}</div>
                      ) : (
                        <div className="font-bold text-rose-500 font-mono text-xs">Negativo</div>
                      )}
                    </td>
                    <td className="px-3 py-4 text-right">
                      <div className={`font-bold font-mono inline-flex items-center gap-1.5 ${isOverridden ? 'text-blue-600' : 'text-slate-700'}`}>
                        ${costosTotalesUsdHa.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {isOverridden && <Edit3 size={11} className="text-blue-500" />}
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        Dir: ${costosDirectos.toLocaleString(undefined, {maximumFractionDigits: 0})} · Ind: ${costosIndirectos.toLocaleString(undefined, {maximumFractionDigits: 0})}
                      </div>
                    </td>
                    <td className="px-3 py-4 text-center">
                      {precioNetoQq > 0 ? (
                        <div className="inline-flex items-baseline gap-1">
                          <span className="text-lg font-black text-slate-800">{riQq.toFixed(1)}</span>
                          <span className="text-[10px] font-bold text-slate-400">qq</span>
                        </div>
                      ) : (
                        <span className="text-rose-500 text-xs font-bold">N/A</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {precioNetoQq > 0 ? renderSemaforo(margenPct) : <span className="text-slate-300 font-bold">—</span>}
                    </td>
                  </tr>
                  
                  {expandedCropId === crop.id && (
                    <tr className="bg-blue-50/20 border-b border-blue-100/50 shadow-inner print:hidden">
                      <td colSpan={6} className="px-5 py-4">
                        <div className="bg-white rounded-xl p-5 shadow-sm border border-blue-100 flex flex-col gap-5 w-full">
                           {/* HEADER DEL PANEL */}
                           <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                               <div className="text-xs font-bold text-blue-800 uppercase tracking-wide flex items-center gap-1.5 shrink-0">
                                   <Settings2 size={14}/> Simulador de Costos — {crop.name}
                               </div>
                               <div className="flex items-center gap-3">
                                   {isOverridden && (
                                     <button
                                       onClick={(e) => { e.stopPropagation(); clearOverride(crop.id); }}
                                       className="px-2.5 py-1 text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 hover:text-rose-700 rounded transition-colors"
                                     >
                                       REINICIAR VALORES
                                     </button>
                                   )}
                               </div>
                           </div>

                           {/* BANNER EXPLICATIVO */}
                           <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-lg px-4 py-3 flex items-start gap-2.5">
                             <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                             <div className="text-[11px] text-amber-800 leading-relaxed">
                               <strong>Valores precargados por la plataforma</strong> en base a referencias de campaña (FACMA / Agrocontratistas 25/26).
                               El Rinde de Indiferencia de la tabla ya está calculado con estos datos.
                               <span className="text-amber-600 font-bold"> Podés modificar cualquier campo para ajustarlo a tu situación real</span> — los cambios se reflejan instantáneamente.
                             </div>
                           </div>

                           {/* RESUMEN DE COMERCIALIZACIÓN (transparencia del Precio Neto) */}
                           <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-50 rounded-lg p-3 border border-slate-100">
                             <div className="flex flex-col">
                               <span className="text-[9px] font-bold text-slate-400 uppercase">Pizarra {isPriceOverridden && <span className="text-amber-500">(Simulado)</span>}</span>
                               <span className={`text-sm font-black ${isPriceOverridden ? 'text-amber-600' : 'text-slate-700'}`}>${precioPizarraTn.toFixed(0)}/tn</span>
                             </div>
                             <div className="flex flex-col">
                               <span className="text-[9px] font-bold text-rose-400 uppercase">− DEX ({crop.retencionPct}%)</span>
                               <span className="text-sm font-bold text-rose-600">−${(precioPizarraTn * retFrac).toFixed(0)}</span>
                             </div>
                             <div className="flex flex-col">
                               <span className="text-[9px] font-bold text-rose-400 uppercase">− Flete</span>
                               <span className="text-sm font-bold text-rose-600">−${fleteUSD.toFixed(1)}</span>
                             </div>
                             <div className="flex flex-col">
                               <span className="text-[9px] font-bold text-rose-400 uppercase">− Comerc. ({crop.comercializacionPct}%) + Secada</span>
                               <span className="text-sm font-bold text-rose-600">−${(gastosComerciales + crop.secadaUsdTn).toFixed(1)}</span>
                             </div>
                             <div className="flex flex-col border-l-2 border-emerald-300 pl-3">
                               <span className="text-[9px] font-bold text-emerald-600 uppercase">= Neto Tranquera</span>
                               <span className="text-sm font-black text-emerald-700">${precioNetoTn.toFixed(0)}/tn</span>
                             </div>
                           </div>
                           
                           {/* Warning Desglose */}
                           {hasDesglose && (
                              <div className="text-[10px] text-blue-600 bg-blue-50 p-2 rounded-lg font-medium">
                                ℹ️ Al cargar ítems de insumos/labranza, se reemplaza el valor estimado de referencia.
                              </div>
                           )}

                           <div className="flex flex-col gap-6">
                               {/* SECCIÓN COSTOS DIRECTOS */}
                               <div>
                                   <div className="flex justify-between items-end mb-3 border-b border-slate-200 pb-1">
                                       <h4 className="font-bold text-xs uppercase tracking-wide text-slate-700">Costos Directos <span className="text-[9px] font-normal lowercase tracking-normal text-slate-400">(Insumos, Labores, Cosecha, Seguro)</span></h4>
                                       <span className="text-[11px] font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                           Subtotal: ${costosDirectos.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD/ha
                                       </span>
                                   </div>
                                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                      {[
                                        { key: 'semillas', label: 'Semillas', defaultHint: null },
                                        { key: 'curasemillas', label: 'Curasemillas', defaultHint: null },
                                        { key: 'fertilizantes', label: 'Fertilizantes', defaultHint: null },
                                        { key: 'herbicida', label: 'Herbicidas', defaultHint: null },
                                        { key: 'insecticidas', label: 'Insecticidas', defaultHint: null },
                                        { key: 'fungicidas', label: 'Fungicidas', defaultHint: null },
                                        { key: 'seguros', label: 'Seguro (Granizo)', defaultHint: 0 },
                                        { key: 'labranza', label: 'Labores / Aplic.', defaultHint: null },
                                        { key: 'cosecha', label: 'Cosecha', defaultHint: defaultCosecha },
                                      ].map(f => {
                                        const val = (override as any)[f.key];
                                        const isSet = val !== undefined;
                                        // Si no hay default individual, mostrar que está incluido en el paquete C+I
                                        const placeholderText = f.defaultHint !== null ? `${f.defaultHint} (ref.)` : `incl. en C+I ($${defaultLabores})`;
                                        return (
                                          <div key={f.key} className="flex flex-col gap-1.5">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">{f.label}</span>
                                            <div className="relative">
                                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                                              <input type="number"
                                                value={isSet ? val : ''}
                                                placeholder={placeholderText}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => handleOverrideChange(crop.id, f.key, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                                className={`w-full pl-6 pr-2 py-1.5 text-xs font-bold bg-slate-50 border rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${isSet ? 'text-blue-700 border-blue-300 bg-blue-50/50 shadow-sm' : 'text-slate-600 border-slate-200'}`}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                   </div>
                                   <div className="mt-2 text-[10px] text-slate-400 italic">
                                     Ref. C+I (nivel {altoInsumos ? 'alto' : 'bajo'}): <strong className="text-slate-600">${defaultLabores} labores/insumos + ${defaultCosecha} cosecha = ${defaultLabores + defaultCosecha} USD/ha</strong>
                                   </div>
                               </div>

                               {/* SECCIÓN COSTOS INDIRECTOS */}
                               <div>
                                   <div className="flex justify-between items-end mb-3 border-b border-slate-200 pb-1">
                                       <h4 className="font-bold text-xs uppercase tracking-wide text-slate-700 flex items-center gap-2">
                                           Costos Indirectos
                                           <span className="text-[9px] font-normal lowercase tracking-normal text-slate-400">
                                              (Fijos y Estructurales)
                                           </span>
                                       </h4>
                                       <span className="text-[11px] font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                                           Subtotal: ${costosIndirectos.toLocaleString(undefined, { maximumFractionDigits: 0 })} USD/ha
                                       </span>
                                   </div>
                                   <div className="text-[10px] text-slate-400 font-semibold italic mb-2">
                                        Zona detectada: <span className="text-blue-600 font-bold">{arriendoZonaNombre}</span> · Alquiler base: {arriendoZonalQq} qq/ha Soja · Proporción {crop.name}: {(crop.arriendoPctAnual * 100).toFixed(0)}%
                                   </div>
                                   <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                      {[
                                        { key: 'arriendo', label: `Alquiler (${(crop.arriendoPctAnual * 100).toFixed(0)}% anual)`, defaultHint: defaultArriendoQq.toFixed(1), unit: 'qq' },
                                        { key: 'estructura', label: 'Estructura / Admin', defaultHint: '0' },
                                        { key: 'impuestos', label: 'Tasas / Impuestos', defaultHint: '0' },
                                        { key: 'amortizaciones', label: 'Amortización Eq.', defaultHint: '0' },
                                      ].map(f => {
                                        const val = (override as any)[f.key];
                                        const isSet = val !== undefined;
                                        const placeholderText = `${f.defaultHint} (ref.)`;
                                        return (
                                          <div key={f.key} className="flex flex-col gap-1.5">
                                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider leading-none">{f.label}</span>
                                            <div className="relative">
                                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">{f.unit || '$'}</span>
                                              <input type="number"
                                                value={isSet ? val : ''}
                                                placeholder={placeholderText}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => handleOverrideChange(crop.id, f.key, e.target.value === '' ? undefined : parseFloat(e.target.value))}
                                                className={`w-full ${f.unit ? 'pl-9' : 'pl-6'} pr-2 py-1.5 text-xs font-bold bg-slate-50 border rounded text-right focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${isSet ? 'text-blue-700 border-blue-300 bg-blue-50/50 shadow-sm' : 'text-slate-600 border-slate-200'}`}
                                              />
                                            </div>
                                          </div>
                                        );
                                      })}
                                   </div>
                               </div>
                           </div>

                           {/* RESUMEN FINAL DEL PANEL */}
                           <div className="flex items-center justify-between bg-gradient-to-r from-slate-50 to-blue-50 p-3 rounded-lg border border-slate-200 mt-1">
                             <div className="text-xs font-bold text-slate-600">
                               Costo Total = <span className="text-slate-800">${costosDirectos.toLocaleString(undefined, {maximumFractionDigits: 0})}</span> <span className="text-slate-400">(Dir.)</span> + <span className="text-slate-800">${costosIndirectos.toLocaleString(undefined, {maximumFractionDigits: 0})}</span> <span className="text-slate-400">(Ind.)</span>
                             </div>
                             <div className="text-sm font-black text-blue-700">
                               = ${costosTotalesUsdHa.toLocaleString(undefined, {maximumFractionDigits: 0})} USD/ha
                             </div>
                           </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>

          {/* Table Footer - inline under table */}
          <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-400 font-medium flex flex-wrap gap-x-4 gap-y-1">
            <span><strong>Neto Tranquera:</strong> Pizarra − DEX − Flete − Comerc. − Secada.</span>
            <span><strong>RI:</strong> Costo Total ÷ Precio Neto por Quintal.</span>
            <span><strong>Dir.:</strong> Insumos + Labores + Cosecha + Seguro.</span>
            <span><strong>Ind.:</strong> Alquiler + Estructura + Impuestos + Amortización.</span>
            <span>Semáforo calculado vs. Rinde Medio esperado de la zona.</span>
          </div>

        </div>{/* cierre panel derecho */}
      </div>{/* cierre flex row controles + tabla */}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 2: GRÁFICO MARGEN BRUTO vs RENDIMIENTO                 */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <div className="border-t border-slate-200/60 relative z-10">
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-black shadow-sm">2</div>
              <div>
                <h4 className="text-base font-extrabold text-slate-800">Margen Bruto vs Rendimiento</h4>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">Curvas de rentabilidad por cultivo. El cruce con la línea $0 marca el <strong>Rinde de Indiferencia</strong>. Seleccioná los cultivos a comparar.</p>
              </div>
            </div>

            {/* Toggle buttons para filtrar cultivos */}
            <div className="flex flex-wrap gap-2">
              {mbChartData.cropCalcs.map(cc => {
                const isActive = selectedMBCrops.includes(cc.id);
                return (
                  <button
                    key={cc.id}
                    onClick={() => toggleMBCrop(cc.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 border ${
                      isActive
                        ? 'text-white shadow-sm'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                    style={isActive ? { background: MB_COLORS[cc.id] || '#666', borderColor: MB_COLORS[cc.id] || '#666' } : {}}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: isActive ? '#fff' : (MB_COLORS[cc.id] || '#666') }} />
                    {cc.name}
                    <span className={`text-[10px] ${isActive ? 'opacity-80' : 'text-slate-300'}`}>RI: {cc.riQq.toFixed(1)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4 pt-6">
            <ResponsiveContainer width="100%" height={380}>
              <LineChart data={mbChartData.data} margin={{ top: 5, right: 30, left: 20, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="rto"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  label={{ value: 'Rendimiento (qq/ha)', position: 'insideBottom', offset: -15, style: { fontSize: 11, fill: '#64748b', fontWeight: 600 } }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  width={65}
                  tickFormatter={(v: number) => `$${v.toLocaleString()}`}
                  label={{ value: 'MB (USD/ha)', angle: -90, position: 'insideLeft', offset: 5, style: { fontSize: 11, fill: '#64748b', fontWeight: 600 } }}
                />
                <ReferenceLine y={0} stroke="#334155" strokeWidth={1.5} strokeDasharray="6 3" label={{ value: 'Equilibrio ($0)', position: 'insideTopRight', style: { fontSize: 10, fill: '#334155', fontWeight: 700 } }} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-xl text-xs">
                        <div className="font-bold text-slate-700 mb-1.5 pb-1.5 border-b border-slate-100">Rendimiento: {label} qq/ha</div>
                        {payload.map((p: any) => {
                          const val = p.value as number;
                          return (
                            <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                                <span className="font-semibold text-slate-600">{p.name}</span>
                              </div>
                              <span className={`font-bold tabular-nums ${val >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {val >= 0 ? '+' : ''}${val.toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }}
                />

                {/* Solo renderizar las líneas de cultivos seleccionados */}
                {mbChartData.cropCalcs
                  .filter(cc => selectedMBCrops.includes(cc.id))
                  .map(cc => (
                  <Line
                    key={cc.id}
                    type="monotone"
                    dataKey={cc.id}
                    name={cc.name}
                    stroke={MB_COLORS[cc.id] || '#666'}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: MB_COLORS[cc.id] || '#666', stroke: '#fff', strokeWidth: 2 }}
                  />
                ))}

                {/* Líneas verticales punteadas del RI para cultivos seleccionados */}
                {mbChartData.cropCalcs
                  .filter(cc => selectedMBCrops.includes(cc.id))
                  .map(cc => (
                  <ReferenceLine
                    key={`ri-${cc.id}`}
                    x={Math.round(cc.riQq)}
                    stroke={MB_COLORS[cc.id] || '#666'}
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    strokeOpacity={0.4}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 3: ANÁLISIS DE SENSIBILIDAD                            */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {sensitivityData && (
      <div className="border-t border-slate-200/60 relative z-10">
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-4 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-xs font-black shadow-sm">3</div>
              <div>
                <h4 className="text-base font-extrabold text-slate-800">Análisis de Sensibilidad</h4>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Margen Bruto (USD/ha) ante variaciones de <strong>Precio Pizarra</strong> y <strong>Rendimiento</strong>. Seleccioná el cultivo a analizar.
                </p>
              </div>
            </div>

            {/* Toggle buttons para seleccionar cultivo */}
            <div className="flex flex-wrap gap-2">
              {CROP_REFERENCE_DATA.map(crop => {
                const isActive = sensitivityCropId === crop.id;
                return (
                  <button
                    key={crop.id}
                    onClick={() => setSensitivityCropId(crop.id)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center gap-2 border ${
                      isActive
                        ? 'text-white shadow-sm'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                    style={isActive ? { background: MB_COLORS[crop.id] || '#666', borderColor: MB_COLORS[crop.id] || '#666' } : {}}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: isActive ? '#fff' : (MB_COLORS[crop.id] || '#666') }} />
                    {crop.name}
                  </button>
                );
              })}
            </div>

            {/* Contexto del cultivo seleccionado */}
            <div className="flex flex-wrap gap-3 text-[10px]">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold">
                Pizarra: ${sensitivityData.precioPizarra}/tn
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold">
                Rinde Medio: {sensitivityData.rindeMedio} qq/ha
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-bold">
                Costos: ${sensitivityData.costosTotales}/ha
              </span>
            </div>
          </div>

          {/* Matriz Heatmap */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="px-3 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left bg-slate-50 border-b border-r border-slate-200">
                    Rto \ Precio
                  </th>
                  {sensitivityData.priceColumns.map(col => (
                    <th
                      key={col.pct}
                      className={`px-3 py-2.5 text-center border-b border-r border-slate-200 font-bold ${
                        col.pct === 0
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-slate-50 text-slate-500'
                      }`}
                    >
                      <div className="text-[11px]">${col.pizarra}</div>
                      <div className={`text-[9px] font-semibold ${col.pct === 0 ? 'text-blue-500' : col.pct > 0 ? 'text-emerald-500' : 'text-rose-400'}`}>
                        {col.pct === 0 ? 'Actual' : `${col.pct > 0 ? '+' : ''}${col.pct}%`}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivityData.matrix.map((row, rowIdx) => {
                  const isMedian = row.rto === sensitivityData.rindeMedio;
                  return (
                    <tr key={rowIdx}>
                      <td className={`px-3 py-2.5 border-b border-r border-slate-200 font-bold whitespace-nowrap ${
                        isMedian ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-500'
                      }`}>
                        <div className="text-[11px]">{row.rto} qq/ha</div>
                        {isMedian && <div className="text-[9px] text-blue-500 font-semibold">Medio</div>}
                      </td>
                      {row.values.map((mb, colIdx) => {
                        const maxAbs = Math.max(...sensitivityData.matrix.flatMap(r => r.values.map(Math.abs)), 1);
                        const intensity = Math.min(Math.abs(mb) / maxAbs, 1);
                        const alpha = 0.08 + intensity * 0.55;
                        const isCenter = sensitivityData.priceColumns[colIdx].pct === 0 && isMedian;

                        let bgColor: string;
                        if (mb > 0) {
                          bgColor = `rgba(22, 163, 74, ${alpha})`;
                        } else if (mb < 0) {
                          bgColor = `rgba(220, 38, 38, ${alpha})`;
                        } else {
                          bgColor = 'rgba(148, 163, 184, 0.1)';
                        }

                        return (
                          <td
                            key={colIdx}
                            className={`px-2 py-2.5 text-center border-b border-r border-slate-200 font-bold tabular-nums ${
                              isCenter ? 'ring-2 ring-blue-400 ring-inset' : ''
                            }`}
                            style={{ background: bgColor }}
                          >
                            <span className={`text-[11px] ${mb >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
                              {mb >= 0 ? '+' : ''}{mb.toLocaleString()}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Leyenda */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-4 gap-3">
            <div className="flex items-center gap-4 text-[10px] text-slate-400 font-medium">
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-3 rounded" style={{ background: 'rgba(220, 38, 38, 0.4)' }} />
                <span>Margen Negativo</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-3 rounded bg-slate-100 border border-slate-200" />
                <span>Equilibrio</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-3 rounded" style={{ background: 'rgba(22, 163, 74, 0.4)' }} />
                <span>Margen Positivo</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1.5">
              <span className="w-3 h-3 rounded ring-2 ring-blue-400 ring-inset bg-white" />
              <span>Escenario actual (Precio × Rinde Medio)</span>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* FOOTER GENERAL                                                  */}
      {/* ════════════════════════════════════════════════════════════════ */}
      <div className="p-5 bg-gradient-to-r from-slate-50 to-slate-100/50 border-t border-slate-200/60 text-[10px] text-slate-400 font-medium">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span><strong className="text-slate-500">Fuente de Precios:</strong> BCR Pizarra Rosario · {prices?.fecha || '—'}</span>
          <span><strong className="text-slate-500">Flete:</strong> {distanciaKm.toFixed(0)} km a {puertoCoords.nombre} · ${fleteUSD.toFixed(2)} USD/tn</span>
          <span><strong className="text-slate-500">Escenario:</strong> {altoInsumos ? 'Alto' : 'Bajo'} insumos · {conArriendo ? 'Con' : 'Sin'} arriendo</span>
          <span><strong className="text-slate-500">Lote:</strong> {activeLot.name}</span>
        </div>
      </div>

      {/* Print-only Report Footer */}
      <div className="hidden print:block print-footer p-4 border-t border-slate-200 text-[10px] text-slate-500 font-medium">
        <div className="flex justify-between items-end">
          <div>
            <div className="font-bold text-slate-700 text-xs mb-1">Reporte de Rinde de Indiferencia</div>
            <div>Lote: <strong className="text-slate-700">{activeLot.name}</strong></div>
            <div>Puerto: <strong className="text-slate-700">{puertoCoords.nombre}</strong> · Flete: {distanciaKm.toFixed(0)} km · ${fleteUSD.toFixed(2)} USD/tn</div>
            <div>Configuración: {altoInsumos ? 'Alto' : 'Bajo'} insumos · {conArriendo ? 'Con' : 'Sin'} arriendo</div>
          </div>
          <div className="text-right">
            <div>Generado: {new Date().toLocaleDateString('es-AR')} {new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div>Precios: BCR {prices?.fecha || '—'}</div>
            <div className="mt-1 font-bold text-slate-400">Gravity — Dashboard Agropecuario</div>
          </div>
        </div>
      </div>
    </div>
  );
}

