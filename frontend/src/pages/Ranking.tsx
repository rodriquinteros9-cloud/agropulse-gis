import { useEffect, useState, useRef } from 'react';
import type { AppState } from '../App';
import MapComponent from '../components/MapComponent';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
    LineChart, Line, Legend, Label
} from 'recharts';
import { Loader2, TrendingUp, DownloadCloud, Activity, Calendar, Play, Zap } from 'lucide-react';

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

export default function Ranking({ appState, setAppState }: { appState: AppState, setAppState: any }) {
    // Inicializar DIRECTO desde moduleCache al montar — si ya hay datos no se hace ningún fetch
    const cachedRanking = appState.moduleCache?.rankingData;
    const [rankingData, setRankingDataLocal] = useState<any[]>(cachedRanking || []);
    const [loadingRanking, setLoadingRanking] = useState(!cachedRanking);  // false si ya hay caché
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
    // Solo hace fetch si no hay datos ya en caché (primera vez o nuevo KML)
    const fetchStartRef = useRef<number>(0);
    const [fromCache, setFromCache] = useState<boolean | null>(cachedRanking ? true : null);

    useEffect(() => {
        // Si ya tenemos datos (del moduleCache), no hacer ninguna petición
        if (rankingData.length > 0) {
            setLoadingRanking(false);
            return;
        }
        if (!appState.spatialData) return;

        const fetchRanking = async () => {
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

        fetchRanking();
    }, []);  // [] = solo al montar — la clave es el moduleCache inicializado en useState

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

    // ── Agro IP color scale: deep emerald → bright mint ──────────
    const getBarColor = (entry: any) => {
        if (entry.ip_ponderado > 80) return '#059669';  // deep emerald
        if (entry.ip_ponderado > 60) return '#10B981';  // vibrant emerald
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
                    <button className="btn-ghost text-sm">
                        <DownloadCloud size={16} /> Exportar CSV
                    </button>
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
                            <span className="w-2.5 h-2.5 rounded-full inline-block bg-emerald-500 shadow-sm" />
                            Distribución Espacial
                        </h3>
                        <div className="flex-1 rounded-2xl overflow-hidden shadow-inner border border-slate-100 bg-slate-50">
                            <MapComponent geojsonData={appState.spatialData} centerLat={centerLat} centerLon={centerLon} />
                        </div>
                    </div>

                    {/* IP Bar Chart card */}
                    <div className="agro-card p-8 flex flex-col">
                        <h3 className="text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2 text-slate-500">
                            <TrendingUp size={16} className="text-emerald-500" />
                            Índice de Productividad por Lote
                            {fromCache === true && !loadingRanking && (
                                <span className="ml-auto flex items-center gap-1.5 text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm">
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
                                <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--color-muted)' }}>Sin datos para graficar</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

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
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition bg-white border border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
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
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition bg-white border border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wide mb-2 text-slate-500">Índice</label>
                        <select
                            value={indexSelected}
                            onChange={(e) => setIndexSelected(e.target.value)}
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition pr-10 bg-white border border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm appearance-none"
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
                            className="text-sm rounded-xl px-4 py-2.5 outline-none transition pr-10 bg-white border border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm appearance-none"
                            style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1em" }}
                        >
                            <option value="Sentinel-2">Sentinel-2 (10m - c/5 días)</option>
                            <option value="Landsat">Landsat 8/9 (30m - c/8 días)</option>
                        </select>
                    </div>

                    <button
                        onClick={handleAnalizarSeries}
                        disabled={loadingBenchmark}
                        className="btn-primary ml-auto shadow-emerald-500/30 shadow-lg text-base px-6 py-2.5 rounded-xl border-none font-bold"
                    >
                        {loadingBenchmark ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                        {loadingBenchmark ? "Procesando satélite…" : "Ejecutar Análisis"}
                    </button>
                </div>
            </div>

            {errorBenchmark && (
                <div className="text-sm p-4 rounded-xl border" style={{ background: '#FFF0F0', borderColor: '#FFCDD2', color: '#B71C1C' }}>
                    ⚠ {errorBenchmark}
                </div>
            )}

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
        </div>
    );
}
