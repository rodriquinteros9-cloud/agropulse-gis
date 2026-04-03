import type { AppState } from '../App';
import { useState, useMemo } from 'react';
import { Circle, CheckCircle2, AlertTriangle, Droplets, CloudRain, LineChart as ChartIcon, ShieldCheck, Sprout, BarChart3, Settings2, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart, Legend, ReferenceArea, Area } from 'recharts';
import PrecipitationBoxPlot from '../components/PrecipitationBoxPlot';
import BreakEvenCalculator from '../components/BreakEvenCalculator';
import CommodityDashboard from '../components/CommodityDashboard';
import { useENSOData } from '../hooks/useENSOData';




// ── Catálogo de cultivos disponibles ──
const ALL_CROPS = [
    { key: 'Trigo' },
    { key: 'Cultivo de Servicio' },
    { key: 'Soja' },
    { key: 'Soja Segunda' },
    { key: 'Maíz' },
    { key: 'Girasol' },
    { key: 'Sorgo' },
    { key: 'Maní' },
] as const;

const DEFAULT_SELECTED_CROPS = ['Trigo', 'Maíz', 'Soja', 'Soja Segunda'];

export default function Planning({ appState }: { appState: AppState, setAppState: any }) {
    const [selectedCropKeys, setSelectedCropKeys] = useState<string[]>(DEFAULT_SELECTED_CROPS);
    const [cropSelectorOpen, setCropSelectorOpen] = useState(false);

    // Active crops derived from selection order
    const crops = useMemo(() => selectedCropKeys, [selectedCropKeys]);

    // ── ENSO Data (live API + fallback) ──
    const { data: ensoApiData, loading: ensoLoading, usingFallback, refetch: refetchEnso } = useENSOData();

    const ensoData = useMemo(() => {
        if (!ensoApiData) return { phase: 'Cargando...', currentONI: null, trend: '', intensity: '', lastUpdate: '', numDynamicModels: 0, numStatisticalModels: 0, dataSource: '' };
        return ensoApiData.metadata;
    }, [ensoApiData]);

    const climateValidationData = useMemo(() => {
        if (!ensoApiData) return [];
        return ensoApiData.chartData;
    }, [ensoApiData]);

    const lotes = useMemo(() => {
        if (!appState.spatialData?.features) return [];
        return appState.spatialData.features.map((f: any, i: number) => {
            const ip = f.properties?.ip_ponderado ?? Math.floor(Math.random() * (90 - 45 + 1)) + 45;
            const au = f.properties?.au_mm ?? Math.floor(Math.random() * (160 - 40 + 1)) + 40;
            return {
                id: f.properties?.temp_id ?? String(i),
                name: f.properties?.Lote_Name || `Lote ${i + 1}`,
                ip,
                au,
                center_lat: f.properties?.centroide_lat ?? -33.0,
                center_lon: f.properties?.centroide_lon ?? -60.0
            };
        });
    }, [appState.spatialData]);

    const [decisions, setDecisions] = useState<Record<string, Record<string, boolean>>>({});
    const [activeInteraction, setActiveInteraction] = useState<{ lot: any, crop: string } | null>(null);

    const toggleCropSelection = (cropKey: string) => {
        setSelectedCropKeys(prev => {
            if (prev.includes(cropKey)) {
                if (prev.length <= 1) return prev;
                return prev.filter(k => k !== cropKey);
            }
            return [...prev, cropKey];
        });
    };


    const toggleDecision = (lot: any, crop: string) => {
        const currentlySelected = decisions[lot.id]?.[crop] || false;

        setDecisions(prev => ({
            ...prev,
            [lot.id]: {
                ...(prev[lot.id] || {}),
                [crop]: !currentlySelected
            }
        }));

        if (!currentlySelected) {
            setActiveInteraction({ lot, crop });
        } else {
            if (activeInteraction?.lot?.id === lot.id && activeInteraction?.crop === crop) {
                setActiveInteraction(null);
            }
        }
    };


    return (
        <div className="space-y-10 animate-fade-in pb-12 flex flex-col">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 print:hidden">
                <div>
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Planificación DSS</h1>
                    <p className="text-slate-500 mt-2 text-sm max-w-xl">
                        Simulación interactiva de siembra. El sistema evalúa riesgo y biomasa cruzando la capacidad de tu suelo con proyecciones climáticas (IRI).
                    </p>
                </div>
            </div>

            {/* === FILA 1: RENDIMIENTO DE INDIFERENCIA === */}
            <BreakEvenCalculator lotes={lotes} />

            {/* === FILA 2: PRECIOS HISTÓRICOS & RELACIÓN INSUMO-PRODUCTO === */}
            <div className="print:hidden">
              <CommodityDashboard />
            </div>

            {/* === FILA 2: INTELIGENCIA CLIMÁTICA FULL-WIDTH === */}
            <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200/60 backdrop-blur-sm rounded-[2rem] p-8 xl:p-10 shadow-xl shadow-slate-200/40 relative overflow-hidden print:hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-100/40 rounded-full blur-[100px] pointer-events-none -mr-20 -mt-20" />
                <div className="absolute bottom-0 left-0 w-80 h-80 bg-orange-50/50 rounded-full blur-[100px] pointer-events-none -ml-20 -mb-20" />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-slate-200/60 relative z-10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white shadow-md shadow-slate-100 rounded-2xl border border-slate-100">
                            <ChartIcon className="w-7 h-7 text-indigo-600" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-2xl tracking-tight text-slate-800">Perspectiva Agroclimática ENSO</h3>
                            <p className="text-sm font-semibold text-slate-500 mt-1 tracking-wide">
                                Evolución observada y pronóstico SST Niño 3.4 — Datos en tiempo real
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Live/Fallback Status Badge */}
                        <div className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest border shadow-sm ${usingFallback
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            }`}>
                            {usingFallback ? <WifiOff size={11} /> : <Wifi size={11} />}
                            {usingFallback ? 'Fallback' : 'Live'}
                        </div>
                        {/* Refresh Button */}
                        <button
                            onClick={refetchEnso}
                            disabled={ensoLoading}
                            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all shadow-sm disabled:opacity-50"
                            title="Actualizar datos ENSO"
                        >
                            <RefreshCw size={15} className={ensoLoading ? 'animate-spin' : ''} />
                        </button>
                        {/* Phase Badge */}
                        <div className="bg-orange-50/80 border border-orange-200 px-5 py-3 rounded-2xl flex items-center gap-3 shadow-inner">
                            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                            <span className="text-sm font-bold text-orange-900 uppercase tracking-widest">{ensoData.phase}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-10 relative z-10">
                    {/* Panel Superior: Gráfico Full Width */}
                    <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-slate-100 shadow-lg shadow-slate-200/40">
                        <div className="flex items-center justify-between gap-2 mb-4">
                            <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400 flex items-center gap-1.5">
                                <BarChart3 size={13} /> ONI / RONI + Pronóstico IRI (ENSO 3.4 SST Anomaly)
                            </span>
                            <div className="flex items-center gap-3">
                                {ensoData.lastUpdate && (
                                    <span className="text-[10px] font-semibold text-slate-400">
                                        Actualizado: {ensoData.lastUpdate}
                                    </span>
                                )}
                                {(ensoData.numDynamicModels > 0 || ensoData.numStatisticalModels > 0) && (
                                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                                        {ensoData.numDynamicModels} DYN · {ensoData.numStatisticalModels} STAT
                                    </span>
                                )}
                            </div>
                        </div>

                        {ensoLoading && climateValidationData.length === 0 ? (
                            <div className="flex items-center justify-center h-[450px]">
                                <div className="flex flex-col items-center gap-3">
                                    <RefreshCw size={28} className="animate-spin text-indigo-400" />
                                    <span className="text-sm font-semibold text-slate-400">Cargando datos ENSO...</span>
                                </div>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={450}>
                                <ComposedChart data={climateValidationData} margin={{ top: 20, right: 30, left: 10, bottom: 50 }}>
                                    <defs>
                                        <linearGradient id="dynBandGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
                                            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                                        </linearGradient>
                                        <linearGradient id="statBandGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
                                            <stop offset="100%" stopColor="#22c55e" stopOpacity={0.04} />
                                        </linearGradient>
                                    </defs>

                                    <CartesianGrid strokeDasharray="4 4" stroke="#e2e8f0" strokeOpacity={0.6} vertical={false} />

                                    {/* Colored Background Zones */}
                                    <ReferenceArea y1={0.5} y2={2.0} fill="#fef2f2" fillOpacity={0.7} />
                                    <ReferenceArea y1={-0.5} y2={0.5} fill="#f8fafc" fillOpacity={0.7} />
                                    <ReferenceArea y1={-2.0} y2={-0.5} fill="#eff6ff" fillOpacity={0.7} />

                                    <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} angle={-35} textAnchor="end" tickLine={false} axisLine={{ stroke: '#cbd5e1', strokeWidth: 2 }} dy={10} />
                                    <YAxis tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} tickLine={false} axisLine={false} domain={[-1.5, 2.0]} tickCount={8} dx={-10} />

                                    <Tooltip
                                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 20px 40px rgba(0,0,0,0.1)', fontSize: '13px', fontWeight: 600, backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)' }}
                                        itemStyle={{ padding: '4px 0' }}
                                        formatter={(value: number, name: string) => {
                                            if (value === null || value === undefined) return ['-', name];
                                            const nameMap: Record<string, string> = {
                                                'oni': 'ONI (Observado)',
                                                'roni': 'RONI (Observado)',
                                                'dyn': 'Dinámico μ (IRI)',
                                                'stat': 'Estadístico μ (IRI)',
                                                'dynMax': 'Dinámico Max',
                                                'dynMin': 'Dinámico Min',
                                                'statMax': 'Estadístico Max',
                                                'statMin': 'Estadístico Min',
                                            };
                                            return [`${value.toFixed(2)} °C`, nameMap[name] || name];
                                        }}
                                    />
                                    <Legend
                                        wrapperStyle={{ fontSize: '11px', fontWeight: 800, paddingTop: '30px' }}
                                        iconType="circle"
                                        payload={[
                                            { value: 'ONI (Observado)', type: 'circle', color: '#1e40af' },
                                            { value: 'RONI (Observado)', type: 'circle', color: '#0d9488' },
                                            { value: 'Dinámico μ ± rango', type: 'circle', color: '#ef4444' },
                                            { value: 'Estadístico μ ± rango', type: 'circle', color: '#22c55e' },
                                        ]}
                                    />

                                    {/* Threshold Lines */}
                                    <ReferenceLine y={0.5} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={2} opacity={0.9} />
                                    <ReferenceLine y={-0.5} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={2} opacity={0.9} />
                                    <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1} opacity={0.5} />

                                    {/* ── Uncertainty Bands (shaded areas behind lines) ── */}
                                    {/* Dynamic Model Spread */}
                                    <Area type="monotone" dataKey="dynMax" stroke="none" fill="url(#dynBandGrad)" fillOpacity={1} connectNulls legendType="none" name="dynMax" />
                                    <Area type="monotone" dataKey="dynMin" stroke="none" fill="white" fillOpacity={0.85} connectNulls legendType="none" name="dynMin" />

                                    {/* Statistical Model Spread */}
                                    <Area type="monotone" dataKey="statMax" stroke="none" fill="url(#statBandGrad)" fillOpacity={1} connectNulls legendType="none" name="statMax" />
                                    <Area type="monotone" dataKey="statMin" stroke="none" fill="white" fillOpacity={0.85} connectNulls legendType="none" name="statMin" />

                                    {/* ── Mean Lines (on top of bands) ── */}
                                    <Line type="monotone" dataKey="oni" name="ONI" stroke="#1e40af" strokeWidth={4} dot={{ r: 6, fill: '#1e40af', strokeWidth: 3, stroke: 'white' }} activeDot={{ r: 8, strokeWidth: 0 }} connectNulls />
                                    <Line type="monotone" dataKey="roni" name="RONI" stroke="#0d9488" strokeWidth={4} dot={{ r: 5, fill: '#0d9488', strokeWidth: 2, stroke: 'white' }} connectNulls />
                                    <Line type="monotone" dataKey="dyn" name="dyn" stroke="#ef4444" strokeWidth={4} dot={{ r: 5, fill: '#ef4444', stroke: 'white', strokeWidth: 2 }} activeDot={{ r: 7 }} connectNulls />
                                    <Line type="monotone" dataKey="stat" name="stat" stroke="#22c55e" strokeWidth={4} dot={{ r: 5, fill: '#22c55e', stroke: 'white', strokeWidth: 2 }} connectNulls />
                                </ComposedChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Panel Inferior: Insights Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-100 shadow-md flex flex-col gap-3">
                            <div className="p-2.5 bg-emerald-50 rounded-xl self-start border border-emerald-100">
                                <ShieldCheck className="w-6 h-6 text-emerald-600" strokeWidth={2} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-800 tracking-wide mb-1.5">Consenso de Modelos</h4>
                                <p className="text-[13px] font-medium text-slate-500 leading-relaxed">
                                    {ensoData.numDynamicModels > 0
                                        ? `${ensoData.numDynamicModels} modelos dinámicos y ${ensoData.numStatisticalModels} estadísticos. Las bandas sombreadas muestran la variabilidad entre modelos de cada tipo.`
                                        : 'Modelos dinámicos y estadísticos muestran alto consenso para el trimestre crucial (OND).'
                                    }
                                </p>
                            </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-100 shadow-md flex flex-col gap-3">
                            <div className="p-2.5 bg-blue-50 rounded-xl self-start border border-blue-100">
                                <Sprout className="w-6 h-6 text-blue-600" strokeWidth={2} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-800 tracking-wide mb-1.5">Ventana de Oportunidad</h4>
                                <p className="text-[13px] font-medium text-slate-500 leading-relaxed">
                                    Período de siembra clave con alta probabilidad de lluvias por ENSO. El trimestre <strong>Oct-Nov-Dic</strong> tiene la mayor señal para cultivos de verano.
                                </p>
                            </div>
                        </div>
                        <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-5 border border-slate-100 shadow-md flex flex-col gap-3">
                            <div className="p-2.5 bg-amber-50 rounded-xl self-start border border-amber-100">
                                <AlertTriangle className="w-6 h-6 text-amber-600" strokeWidth={2} />
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-slate-800 tracking-wide mb-1.5">Fuente de Datos</h4>
                                <p className="text-[13px] font-medium text-slate-500 leading-relaxed">
                                    {ensoData.dataSource || 'NOAA PSL (ONI), NOAA CPC (RONI), IRI Columbia (Forecast). Datos actualizados mensualmente.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* === FILA 3: BOX-PLOT PRECIPITACIONES IMERG === */}
            <div className="bg-gradient-to-br from-sky-50/80 to-blue-50/60 border border-sky-200/60 backdrop-blur-sm rounded-[2rem] p-8 xl:p-10 shadow-xl shadow-sky-500/5 relative overflow-hidden print:hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-sky-200/30 rounded-full blur-[100px] pointer-events-none -mr-20 -mt-20" />
                <div className="absolute bottom-0 left-0 w-60 h-60 bg-blue-100/40 rounded-full blur-[80px] pointer-events-none -ml-20 -mb-20" />
                <div className="relative z-10">
                    <PrecipitationBoxPlot
                        lotes={lotes.map((l: any) => ({
                            id: l.id,
                            name: l.name,
                            center_lat: l.center_lat,
                            center_lon: l.center_lon,
                        }))}
                        spatialData={appState.spatialData}
                    />
                </div>
            </div>

            {/* === FILA 4: MATRIZ DE ASIGNACIÓN === */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/60 shadow-xl shadow-slate-200/30 rounded-[2rem] overflow-hidden print:hidden">
                <div className="px-6 py-5 flex flex-wrap justify-between items-center gap-4 bg-gradient-to-r from-slate-50 to-white border-b border-slate-200/60">
                    <div className="flex items-center gap-3">
                        <h2 className="text-sm font-bold tracking-widest uppercase text-slate-500">
                            Matriz de Asignación 26-27
                        </h2>
                        <button
                            onClick={() => setCropSelectorOpen(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-200 border shadow-sm ${cropSelectorOpen
                                    ? 'bg-indigo-500 text-white border-indigo-500 shadow-indigo-500/30'
                                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                                }`}
                            title="Configurar cultivos"
                        >
                            <Settings2 size={13} />
                            Cultivos ({crops.length})
                        </button>
                    </div>
                    <span className="text-xs font-bold px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full flex items-center gap-1.5 border border-blue-100 shadow-sm">
                        <CloudRain size={14} /> Contexto ENSO: {ensoData.phase}
                    </span>
                </div>

                {/* ── Crop Selector Panel ── */}
                {cropSelectorOpen && (
                    <div className="px-6 py-4 bg-gradient-to-r from-indigo-50/50 to-slate-50/50 border-b border-slate-200/60">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                            Seleccioná los cultivos a planificar
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {ALL_CROPS.map(crop => {
                                const isActive = selectedCropKeys.includes(crop.key);
                                return (
                                    <button
                                        key={crop.key}
                                        onClick={() => toggleCropSelection(crop.key)}
                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200 border
                                            ${isActive
                                                ? 'bg-white text-slate-800 border-slate-300 shadow-md scale-[1.02]'
                                                : 'bg-slate-100/60 text-slate-400 border-transparent hover:bg-white hover:text-slate-600 hover:border-slate-200 hover:shadow-sm'
                                            }`}
                                    >
                                        <span>{crop.key}</span>
                                        {isActive && (
                                            <CheckCircle2 size={14} className="text-emerald-500 ml-0.5" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="border-b border-slate-200/50 bg-slate-50/40 text-xs uppercase tracking-widest text-slate-400">
                                <th className="px-6 py-5 font-semibold w-1/5">Lote (Perfil)</th>
                                {crops.map(crop => {
                                    return (
                                        <th key={crop} className="px-4 py-5 font-semibold text-center">
                                            {crop}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/80 text-sm">
                            {lotes.map((lote: any) => (
                                <tr key={lote.id} className="hover:bg-slate-50/60 hover:shadow-sm transition-all group">
                                    <td className="px-6 py-4 font-semibold text-slate-700 flex flex-col gap-1.5">
                                        <span className="text-[15px]">{lote.name}</span>
                                        <div className="flex gap-2 text-[10px] text-slate-500 font-bold tracking-widest uppercase">
                                            <span title="Índice Productivo" className="px-2 py-0.5 rounded-md bg-white border border-slate-200 shadow-sm">
                                                IP {lote.ip}
                                            </span>
                                            <span title="Agua Útil Perfil" className="px-2 py-0.5 rounded-md bg-white border border-slate-200 flex items-center gap-1 shadow-sm">
                                                <Droplets size={10} className="text-blue-500" /> {lote.au} mm
                                            </span>
                                        </div>
                                    </td>
                                    {crops.map(crop => {
                                        const isSelected = decisions[lote.id]?.[crop] || false;
                                        return (
                                            <td key={crop} className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => toggleDecision(lote, crop)}
                                                    className={`inline-flex items-center justify-center p-2.5 rounded-full transition-all duration-300 ${isSelected ? 'text-white bg-emerald-500 scale-[1.15] shadow-lg shadow-emerald-500/40' : 'text-slate-300 bg-slate-50 border border-slate-200/60 hover:text-slate-500 hover:bg-white hover:border-slate-300 hover:scale-110'}`}
                                                >
                                                    {isSelected ? (
                                                        <CheckCircle2 className="w-[1.125rem] h-[1.125rem]" strokeWidth={3} />
                                                    ) : (
                                                        <Circle className="w-[1.125rem] h-[1.125rem]" strokeWidth={2.5} />
                                                    )}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {lotes.length === 0 && (
                                <tr>
                                    <td colSpan={crops.length + 1} className="px-6 py-10 text-center text-slate-400 italic font-medium">
                                        Falta de información espacial. Sube el KML para arrancar.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
}

