import { useEffect, useState, useRef } from 'react';
import type { AppState } from '../App';
import MapComponent from '../components/MapComponent';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
    LineChart, Line, Legend, Label, AreaChart, Area
} from 'recharts';
import { Loader2, TrendingUp, DownloadCloud, Activity, Calendar, Play, Zap } from 'lucide-react';

export default function Ranking({ appState, setAppState }: { appState: AppState, setAppState: any }) {
    // Inicializar DIRECTO desde moduleCache al montar — si ya hay datos no se hace ningún fetch
    const cachedRanking = appState.moduleCache?.rankingData;
    const [rankingData, setRankingDataLocal] = useState<any[]>(cachedRanking || []);
    const [loadingRanking, setLoadingRanking] = useState(false);

    const [errorRanking, setErrorRanking] = useState('');

    // Helper: guardar en el caché global y en el estado local al mismo tiempo
    const setRankingData = (data: any[]) => {
        setRankingDataLocal(data);
        setAppState((prev: AppState) => ({
            ...prev,
            moduleCache: { ...prev.moduleCache, rankingData: data }
        }));
    };

    // --- ESTADOS PARA SERIE TEMPORAL / BENCHMARKING ---
    const today = new Date();
    const past = new Date();
    past.setFullYear(today.getFullYear() - 3);

    const [startDate, setStartDate] = useState(past.toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
    const [indexSelected, setIndexSelected] = useState('NDVI');
    const [satelliteSource, setSatelliteSource] = useState('Sentinel-2');

    // Clave de caché para el benchmark: cambia solo cuando el usuario cambia fechas, índice o satélite
    const benchmarkCacheKey = `${startDate}|${endDate}|${indexSelected}|${satelliteSource}`;
    const cachedBenchmark = appState.moduleCache?.benchmarkData?.[benchmarkCacheKey];

    // Inicializar desde caché si existe — instantáneo al volver al módulo
    const [benchmarkData, setBenchmarkDataLocal] = useState<any[]>(cachedBenchmark || []);
    const [loadingBenchmark, setLoadingBenchmark] = useState(false);
    const [errorBenchmark, setErrorBenchmark] = useState("");

    // Write-through: actualiza estado local Y el caché global
    const setBenchmarkData = (data: any[]) => {
        setBenchmarkDataLocal(data);
        setAppState((prev: AppState) => ({
            ...prev,
            moduleCache: {
                ...prev.moduleCache,
                benchmarkData: { ...(prev.moduleCache?.benchmarkData || {}), [benchmarkCacheKey]: data }
            }
        }));
    };

    // Cuando el usuario cambia fechas o índice, vaciamos local para mostrar el estado inicial
    useEffect(() => {
        const cached = appState.moduleCache?.benchmarkData?.[benchmarkCacheKey];
        setBenchmarkDataLocal(cached || []);
        setErrorBenchmark("");
    }, [benchmarkCacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- EFECTO INICIAL (RANKING IP) ---
    const fetchStartRef = useRef<number>(0);
    const [fromCache, setFromCache] = useState<boolean | null>(cachedRanking ? true : null);

    const handleAnalizarRanking = async () => {
        if (!appState.spatialData) return;
        setLoadingRanking(true);
        setErrorRanking("");
        fetchStartRef.current = performance.now();

        const lotes = appState.spatialData.features.map((f: any, i: number) => ({
            id: f.properties.temp_id || `lote_${i}`,
            name: f.properties.Lote_Name || `Lote ${i + 1}`,
            coordinates: f.geometry.coordinates,
            area_ha: f.properties.Area_ha || 0,
            center_lat: f.properties.centroide_lat || 0,
            center_lon: f.properties.centroide_lon || 0
        }));

        try {
            const resp = await fetch("http://127.0.0.1:8000/api/ranking", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lotes)
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail);

            if (data.status === 'success') {
                setRankingData(data.ranking);
                const elapsed = performance.now() - fetchStartRef.current;
                setFromCache(elapsed < 800);
            } else {
                setErrorRanking(data.msg);
            }
        } catch (err: any) {
            setErrorRanking(err.message);
        } finally {
            setLoadingRanking(false);
        }
    };

    // --- ESTADOS PARA ADVANCED RANKING (SOC & AU) ---
    const cachedAdvancedRanking = appState.moduleCache?.advancedRankingData;
    const [advancedRankingData, setAdvancedRankingDataLocal] = useState<any[]>(cachedAdvancedRanking || []);
    const cachedAdvancedMeta = appState.moduleCache?.advancedRankingMeta;
    const [advancedRankingMeta, setAdvancedRankingMetaLocal] = useState<any>(cachedAdvancedMeta || null);
    const [loadingAdvanced, setLoadingAdvanced] = useState(false);
    const [errorAdvanced, setErrorAdvanced] = useState('');
    const [selectedSoilVar, setSelectedSoilVar] = useState<'soc' | 'ph'>('soc');

    const setAdvancedRankingData = (data: any[]) => {
        setAdvancedRankingDataLocal(data);
        setAppState((prev: AppState) => ({
            ...prev,
            moduleCache: { ...prev.moduleCache, advancedRankingData: data }
        }));
    };

    const setAdvancedRankingMeta = (meta: any) => {
        setAdvancedRankingMetaLocal(meta);
        setAppState((prev: AppState) => ({
            ...prev,
            moduleCache: { ...prev.moduleCache, advancedRankingMeta: meta }
        }));
    };

    const handleAnalizarAvanzado = async () => {
        if (!appState.spatialData) return;
        setLoadingAdvanced(true);
        setErrorAdvanced("");

        const lotes = appState.spatialData.features.map((f: any, i: number) => ({
            id: f.properties.temp_id || `lote_${i}`,
            name: f.properties.Lote_Name || `Lote ${i + 1}`,
            coordinates: f.geometry.coordinates,
            area_ha: f.properties.Area_ha || 0,
            center_lat: f.properties.centroide_lat || 0,
            center_lon: f.properties.centroide_lon || 0
        }));

        try {
            const resp = await fetch("http://127.0.0.1:8000/api/ranking/advanced", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lotes)
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail);

            if (data.status === 'success') {
                setAdvancedRankingData(data.data);
                if (data.au_meta) setAdvancedRankingMeta(data.au_meta);
            } else {
                setErrorAdvanced(data.msg);
            }
        } catch (err: any) {
            setErrorAdvanced(err.message);
        } finally {
            setLoadingAdvanced(false);
        }
    };

    // --- FETCH (BENCHMARKING SENTINEL-2) ---
    const handleAnalizarSeries = async () => {
        if (!appState.spatialData) return;

        setLoadingBenchmark(true);
        setErrorBenchmark("");

        const lotes = appState.spatialData.features.map((f: any, i: number) => ({
            id: f.properties.temp_id || `lote_${i}`,
            name: f.properties.Lote_Name || `Lote ${i + 1}`,
            coordinates: f.geometry.coordinates,
            area_ha: f.properties.Area_ha || 0,
            center_lat: f.properties.centroide_lat || 0,
            center_lon: f.properties.centroide_lon || 0
        }));

        try {
            const resp = await fetch("http://127.0.0.1:8000/api/timeseries/benchmark", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lotes,
                    fecha_inicio: startDate,
                    fecha_fin: endDate,
                    indice: indexSelected,
                    satellite: satelliteSource
                })
            });

            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail);

            setBenchmarkData(data.data);  // escribe en local + moduleCache
        } catch (err: any) {
            setErrorBenchmark(err.message);
        } finally {
            setLoadingBenchmark(false);
        }
    };

    // ── Agro IP color scale: deep cyan → bright mint ──────────
    const getBarColor = (entry: any) => {
        if (entry.ip_ponderado > 80) return '#059669';  // deep cyan
        if (entry.ip_ponderado > 60) return '#10B981';  // vibrant cyan
        if (entry.ip_ponderado > 40) return '#34D399';  // gentle mint
        return '#A7F3D0';                               // pale mint
    };

    // Agro benchmark palette — bright premium tones
    const AGRO_COLORS = [
        '#10B981', '#3B82F6', '#F59E0B', '#F43F5E', '#8B5CF6',
        '#06B6D4', '#EAB308', '#EC4899', '#14B8A6', '#6366F1'
    ];

    const centerLat = appState.globalMetadata?.center_lat || -31.4;
    const centerLon = appState.globalMetadata?.center_lon || -64.1;

    // Formateador de fechas para XAxis ("Mmm YYYY")
    const formatXAxisDate = (tickItem: any) => {
        try {
            if (!tickItem) return "";
            const dateStr = typeof tickItem === 'string' ? tickItem : String(tickItem);
            const date = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
            if (isNaN(date.getTime())) return String(tickItem);
            return date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
        } catch (e) { return String(tickItem); }
    };

    // Formateador custom para el Tooltip
    const formatTooltipDate = (label: any) => {
        try {
            if (!label) return "";
            const dateStr = typeof label === 'string' ? label : String(label);
            const date = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
            if (isNaN(date.getTime())) return String(label);
            return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
        } catch (e) { return String(label); }
    };

    // Keys del linechart excluyendo metadata (Promedio_Global y Fecha)
    const benchmarkKeys = benchmarkData.length > 0
        ? Object.keys(benchmarkData[0]).filter(k => k !== 'Fecha' && k !== 'Promedio_Global' && k !== 'index')
        : [];

    return (
        <div className="flex flex-col gap-10 min-h-full pb-8">

            {/* ══════════ MÓDULO 1: RANKING IP ══════════ */}
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Análisis Macro de Productividad</h1>
                        <p className="text-base mt-2 text-slate-500 font-medium">Ranking de Índice Productivo Ponderado (IP) mediante suelos IDECOR.</p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={handleAnalizarRanking}
                            disabled={loadingRanking}
                            className="btn-primary shadow-cyan-500/30 shadow-lg text-sm px-5 py-2 rounded-xl border-none font-bold"
                        >
                            {loadingRanking ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                            {loadingRanking ? " Calculando…" : " Calcular Ranking IP"}
                        </button>
                        <button className="btn-ghost text-sm">
                            <DownloadCloud size={16} /> Exportar CSV
                        </button>
                    </div>
                </div>

                {errorRanking && (
                    <div className="text-sm p-4 rounded-xl border" style={{ background: '#FFF8E6', borderColor: '#F0C96A', color: '#7A5A00' }}>
                        ⚠ {errorRanking}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[500px]">
                    {/* Map card */}
                    <div className="agro-card p-4 flex flex-col">
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-slate-500">
                            <span className="w-2.5 h-2.5 rounded-full inline-block bg-cyan-500 shadow-sm" />
                            Distribución Espacial
                        </h3>
                        <div className="flex-1 rounded-2xl overflow-hidden shadow-inner border border-slate-100 bg-slate-50">
                            <MapComponent geojsonData={appState.spatialData} centerLat={centerLat} centerLon={centerLon} />
                        </div>
                    </div>

                    {/* IP Bar Chart card */}
                    <div className="agro-card p-8 flex flex-col">
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-slate-500">
                            <TrendingUp size={16} className="text-cyan-500" />
                            Índice de Productividad por Lote
                            {fromCache === true && !loadingRanking && (
                                <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-cyan-50 text-cyan-600 border border-cyan-200 shadow-sm">
                                    <Zap size={10} /> instantáneo
                                </span>
                            )}
                        </h3>
                        <p className="text-sm mb-6 font-medium text-slate-400">Puntaje 0–100 basado en tipo de suelo</p>

                        <div className="flex-1 relative min-h-[300px]">
                            {loadingRanking ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center z-10" style={{ background: 'rgba(255,255,255,0.9)' }}>
                                    <Loader2 className="animate-spin mb-3" size={28} style={{ color: 'var(--color-primary)' }} />
                                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>Cruzando con Carta de Suelos IDECOR…</p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>Solo la primera vez tarda. Las siguientes serán instantáneas.</p>
                                </div>
                            ) : rankingData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={rankingData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }} layout="vertical">
                                        <CartesianGrid strokeDasharray="0" horizontal={false} vertical={true} stroke="var(--color-border)" />
                                        <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis dataKey="name" type="category" width={105} tick={{ fill: 'var(--color-text)', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} />
                                        <RechartsTooltip
                                            cursor={{ fill: 'rgba(45,106,79,0.05)' }}
                                            contentStyle={{ borderRadius: '10px', border: '1px solid var(--color-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.07)', fontSize: 13 }}
                                            formatter={(val: any) => [`${Number(val).toFixed(1)} pts`, 'IP Ponderado']}
                                        />
                                        <Bar dataKey="ip_ponderado" radius={[0, 6, 6, 0]} barSize={26}>
                                            {rankingData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={getBarColor(entry)} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center gap-2">
                                    <Activity size={40} style={{ color: 'var(--color-border)' }} />
                                    <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Presiona <strong>Calcular Ranking IP</strong> para cruzar con suelo.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ══════════ ADVANCED RANKING (SOC & pH) — OpenLandMap-soildb ══════════ */}
            <div className="flex flex-col gap-6 mt-4">
                <div className="agro-card p-6 flex flex-col border border-cyan-100 bg-gradient-to-br from-white to-cyan-50/20">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
                                <Activity size={20} className="text-cyan-500" />
                                Análisis de Suelo
                            </h3>
                            <div className="text-sm text-slate-500 font-medium mt-1 space-y-0.5">
                                <p><strong>COS / pH (0–30 cm):</strong> Evolución 2000–2022 · <a href="https://github.com/openlandmap/soildb" target="_blank" rel="noreferrer" className="text-cyan-600 hover:text-cyan-700 underline underline-offset-2">OpenLandMap-soildb</a> (30m)</p>
                                <p><strong>MO:</strong> IDECOR Córdoba · <strong>Agua Útil (2m):</strong> SEPA INTA / Satélite</p>
                            </div>
                        </div>
                        <button
                            onClick={handleAnalizarAvanzado}
                            disabled={loadingAdvanced}
                            className="btn-primary shadow-cyan-500/30 shadow-lg text-sm px-5 py-2 rounded-xl border-none font-bold"
                        >
                            {loadingAdvanced ? <Loader2 className="animate-spin" size={16} /> : <Zap size={16} />}
                            {loadingAdvanced ? " Calculando…" : " Calcular Análisis Satelital"}
                        </button>
                    </div>

                    {errorAdvanced && (
                        <div className="text-sm p-4 rounded-xl border mb-4" style={{ background: '#FFF8E6', borderColor: '#F0C96A', color: '#7A5A00' }}>
                            ⚠ {errorAdvanced}
                        </div>
                    )}

                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm min-w-[900px]">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-xs tracking-wider">
                                    <th className="py-3 px-4 font-bold">Lote</th>
                                    <th className="py-3 px-4 font-bold">
                                        <div className="flex items-center gap-2">
                                            <span>Evolución (soildb)</span>
                                            <div className="flex bg-slate-200/50 rounded-lg p-0.5 ml-2 border border-slate-200">
                                                <button onClick={() => setSelectedSoilVar('soc')} className={`px-2 py-0.5 text-[10px] rounded-md transition-all ${selectedSoilVar === 'soc' ? 'bg-white shadow-sm text-cyan-700 font-bold' : 'text-slate-500 hover:text-slate-700'}`}>COS</button>
                                                <button onClick={() => setSelectedSoilVar('ph')} className={`px-2 py-0.5 text-[10px] rounded-md transition-all ${selectedSoilVar === 'ph' ? 'bg-white shadow-sm text-purple-700 font-bold' : 'text-slate-500 hover:text-slate-700'}`}>pH</button>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="py-3 px-4 font-bold">MO Actual</th>
                                    <th className="py-3 px-4 font-bold text-right text-cyan-800">Agua Útil (2m)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {advancedRankingData.length > 0 ? (
                                    advancedRankingData.map((item, idx) => {
                                        // Build sparkline data with labels from soildb
                                        const isPh = selectedSoilVar === 'ph';

                                        const evolutionLabels = isPh
                                            ? (item.ph_evolution_labels?.length > 0 ? item.ph_evolution_labels : ['Año 1', 'Año 2', 'Año 3', 'Año 4', 'Año 5'])
                                            : (item.soc_evolution_labels?.length > 0 ? item.soc_evolution_labels : ['Año 1', 'Año 2', 'Año 3', 'Año 4', 'Año 5']);

                                        const evolutionValues = isPh ? (item.ph_evolution || []) : (item.soc_evolution || []);
                                        const sparkData = evolutionValues.map((val: number, i: number) => ({ name: evolutionLabels[i] || `T${i}`, val }));
                                        const latestVal = evolutionValues.length > 0 ? Number(evolutionValues[evolutionValues.length - 1]) : null;

                                        const brandColor = isPh ? '#9333ea' : '#10B981'; // Purple for pH, Emerald for SOC
                                        const fillGradient = isPh ? `url(#colorPh_${idx})` : `url(#colorSoc_${idx})`;
                                        const unit = isPh ? (item.ph_unit || 'pH') : (item.soc_unit || 'kg/m³');
                                        const title = isPh ? 'pH del Suelo' : 'COS (0–30 cm)';
                                        const shortTitle = isPh ? 'pH Actual' : 'COS Actual';

                                        return (
                                            <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                                                <td className="py-4 px-4 font-bold text-slate-700">{item.name}</td>
                                                {/* Evolution sparkline (Dynamic SOC/pH) */}
                                                <td className="py-4 px-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-12 w-40">
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <AreaChart data={sparkData}>
                                                                    <YAxis domain={['auto', 'auto']} hide />
                                                                    <RechartsTooltip
                                                                        contentStyle={{ fontSize: 11, borderRadius: 8, padding: '4px 8px' }}
                                                                        formatter={(val: any) => [`${Number(val).toFixed(2)} ${unit}`, title]}
                                                                    />
                                                                    <defs>
                                                                        <linearGradient id={`colorSoc_${idx}`} x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                                                                            <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                                                        </linearGradient>
                                                                        <linearGradient id={`colorPh_${idx}`} x1="0" y1="0" x2="0" y2="1">
                                                                            <stop offset="5%" stopColor="#9333ea" stopOpacity={0.4} />
                                                                            <stop offset="95%" stopColor="#9333ea" stopOpacity={0} />
                                                                        </linearGradient>
                                                                    </defs>
                                                                    <Area type="monotone" dataKey="val" stroke={brandColor} strokeWidth={3} fillOpacity={1} fill={fillGradient} isAnimationActive={false} />
                                                                </AreaChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                        <div className="flex flex-col flex-1 pl-3 border-l-2 border-slate-100">
                                                            <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase mb-0.5">{shortTitle}</span>
                                                            <span className="text-xl font-black text-slate-700 leading-none tracking-tight">
                                                                {latestVal !== null ? latestVal.toFixed(1) : '-'}
                                                            </span>
                                                            <span className="text-[10px] text-slate-400 mt-0.5">{unit}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* MO */}
                                                <td className="py-4 px-4 text-slate-700">
                                                    <span className="text-lg font-black">{item.mo_actual || '-'}</span> <span className="text-xs text-slate-400 font-bold">%</span>
                                                </td>
                                                {/* Agua Útil SEPA */}
                                                <td className="py-4 px-4 text-right">
                                                    <div className="flex flex-col items-end">
                                                        <div>
                                                            <span className="text-base font-black text-cyan-700">{item.au_mm !== undefined && item.au_mm !== null ? Number(item.au_mm).toFixed(0) : '-'}</span> 
                                                            <span className="text-xs text-slate-400 font-bold ml-1">mm</span>
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-tight">
                                                            {item.au_fallback ? 'Satélite (Alterno)' : 'SEPA INTA'}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-10 text-center text-slate-400 font-medium">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Activity size={32} className="opacity-30" />
                                                <span>Aún no hay análisis avanzado calculado. Presioná el botón superior para generarlo.</span>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div >

            <hr className="agro-divider" />

            {/* ══════════ MÓDULO 2: BENCHMARKING ══════════ */}
            <div className="flex flex-col gap-6">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Serie Temporal y Benchmarking</h1>
                    <p className="text-base mt-2 text-slate-500 font-medium">Evolución del Vigor satelital entre lotes — Sentinel-2 / Earth Engine.</p>
                </div>

                {/* Control panel */}
                <div className="agro-card p-6 flex flex-wrap gap-5 items-end bg-white/60">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5 text-slate-500">
                            <Calendar size={14} /> Desde
                        </label>
                        <input
                            type="date" value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition bg-white border border-slate-200 text-slate-800 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5 text-slate-500">
                            <Calendar size={14} /> Hasta
                        </label>
                        <input
                            type="date" value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            max={today.toISOString().split('T')[0]}
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition bg-white border border-slate-200 text-slate-800 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Índice</label>
                        <select
                            value={indexSelected}
                            onChange={(e) => setIndexSelected(e.target.value)}
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition pr-10 bg-white border border-slate-200 text-slate-800 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-sm appearance-none"
                            style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1em" }}
                        >
                            <option value="NDVI">NDVI</option>
                            <option value="EVI">EVI</option>
                            <option value="GNDVI">GNDVI</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Satélite</label>
                        <select
                            value={satelliteSource}
                            onChange={(e) => setSatelliteSource(e.target.value)}
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition pr-10 bg-white border border-slate-200 text-slate-800 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-sm appearance-none"
                            style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1em" }}
                        >
                            <option value="Sentinel-2">Sentinel-2 (10m - c/5 días)</option>
                            <option value="Landsat">Landsat 8/9 (30m - c/8 días)</option>
                        </select>
                    </div>

                    <button
                        onClick={handleAnalizarSeries}
                        disabled={loadingBenchmark}
                        className="btn-primary ml-auto shadow-cyan-500/30 shadow-lg text-base px-6 py-2.5 rounded-xl border-none font-bold"
                    >
                        {loadingBenchmark ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                        {loadingBenchmark ? "Procesando satélite…" : "Ejecutar Análisis"}
                    </button>
                </div>
            </div>

            {
                errorBenchmark && (
                    <div className="text-sm p-4 rounded-xl border" style={{ background: '#FFF0F0', borderColor: '#FFCDD2', color: '#B71C1C' }}>
                        ⚠ {errorBenchmark}
                    </div>
                )
            }

            {/* Chart */}
            <div className="agro-card p-6 flex flex-col min-h-[450px]">
                {loadingBenchmark ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="animate-spin" size={36} style={{ color: 'var(--color-primary)' }} />
                        <p className="font-semibold" style={{ color: 'var(--color-text)' }}>Consultando Google Earth Engine…</p>
                        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Puede tomar algunos segundos según la cantidad de lotes y rango temporal.</p>
                    </div>
                ) : benchmarkData.length > 0 ? (
                    <div className="w-full h-[400px] mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={benchmarkData} margin={{ top: 16, right: 24, left: 4, bottom: 24 }}>
                                <CartesianGrid strokeDasharray="0" vertical={false} stroke="var(--color-border)" />

                                <XAxis
                                    dataKey="Fecha"
                                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                                    tickFormatter={formatXAxisDate}
                                    minTickGap={48}
                                    tickMargin={10}
                                    axisLine={{ stroke: 'var(--color-border)' }}
                                    tickLine={false}
                                />

                                <YAxis
                                    domain={['auto', 'auto']}
                                    tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
                                    tickMargin={8}
                                    axisLine={false}
                                    tickLine={false}
                                >
                                    <Label
                                        value={indexSelected}
                                        angle={-90}
                                        position="insideLeft"
                                        style={{ textAnchor: 'middle', fill: 'var(--color-text-secondary)', fontWeight: 600, fontSize: 12 }}
                                        offset={-2}
                                    />
                                </YAxis>

                                <RechartsTooltip
                                    labelFormatter={formatTooltipDate}
                                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(8px)', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: 13 }}
                                    itemStyle={{ fontWeight: 600 }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px', fontSize: 13, fontWeight: 500, color: 'var(--color-text-secondary)' }} />

                                {/* Promedio global — thick dark line */}
                                <Line
                                    type="monotone" dataKey="Promedio_Global"
                                    stroke="#0F172A" strokeWidth={4}
                                    dot={false}
                                    activeDot={{ r: 6, fill: '#0F172A', stroke: 'white', strokeWidth: 3 }}
                                    name="Promedio Global"
                                />

                                {/* Individual lots — thin, semi-transparent */}
                                {benchmarkKeys.map((key, index) => (
                                    <Line
                                        key={key} type="monotone" dataKey={key}
                                        stroke={AGRO_COLORS[index % AGRO_COLORS.length]}
                                        strokeWidth={1.5} strokeOpacity={0.65}
                                        dot={false}
                                        activeDot={{ r: 4, strokeWidth: 0 }}
                                        connectNulls={true}
                                    />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2">
                        <Activity size={40} style={{ color: 'var(--color-border)' }} />
                        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>Configurá las fechas y presioná <strong>Ejecutar Análisis</strong>.</p>
                    </div>
                )}
            </div>
        </div >
    );
}
