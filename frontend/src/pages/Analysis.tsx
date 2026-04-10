import React, { useState, useEffect } from 'react';
import type { AppState } from '../App';
import { Map, Wind, Droplets, Thermometer, Loader2, Info, Calendar, Activity, TrendingUp, Zap, RefreshCw, Layers } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import PhytosanitaryAdvisor from '../components/PhytosanitaryAdvisor';
import WeeklyForecast from '../components/WeeklyForecast';
import SpeiDecisionBoard from '../components/SpeiDecisionBoard';
import SpeiNdviCorrelationChart from '../components/SpeiNdviCorrelationChart';



export default function Analysis({ appState, setAppState }: { appState: AppState, setAppState: any }) {
    const features = appState.spatialData?.features || [];

    const lotes = React.useMemo(() => {
        return features.map((f: any, i: number) => ({
            id: f.properties.temp_id || `lote_${i}`,
            name: f.properties.Lote_Name || `Lote ${i + 1}`,
            area_ha: f.properties.Area_ha || 0,
            center_lat: f.properties.centroide_lat || 0,
            center_lon: f.properties.centroide_lon || 0,
            coordinates: f.geometry.coordinates
        }));
    }, [features]);

    const [selectedLotId, setSelectedLotId] = useState<string>("");

    // Loading / error — always local (reset naturally on lot change)
    const [loadingWeather, setLoadingWeather] = useState(false);
    const [weatherError, setWeatherError] = useState("");
    const [loadingTimeSeries, setLoadingTimeSeries] = useState(false);
    const [timeSeriesError, setTimeSeriesError] = useState("");
    const [fromCache, setFromCache] = useState<boolean | null>(null);

    // Heatmap intralote state

    const [loadingHeatmap, setLoadingHeatmap] = useState(false);
    const [heatmapError, setHeatmapError] = useState("");
    const [heatmapData, setHeatmapData] = useState<any>(null);

    // SPEI state
    const [loadingSpei, setLoadingSpei] = useState(false);
    const [speiError, setSpeiError] = useState("");
    const [speiData, setSpeiDataLocal] = useState<any>(null);

    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [satelliteSource, setSatelliteSource] = useState<string>("Sentinel-2");

    // Derived values — computed every render (no stale closure risk)
    const activeLotId = selectedLotId || (lotes.length > 0 ? lotes[0].id : "");
    const selectedLot = lotes.find((l: any) => l.id === activeLotId);
    const tsCacheKey = `${activeLotId}|${startDate}|${endDate}|${satelliteSource}`;

    // ── Simple local state for data ──────────────────────────────────────────
    const [weatherData, setWeatherDataLocal] = useState<any>(null);
    const [timeSeriesData, setTimeSeriesDataLocal] = useState<any[]>([]);

    // ── Write-through helpers: update local + global cache atomically ─────────
    const setWeatherData = (data: any) => {
        setWeatherDataLocal(data);
        setAppState((prev: AppState) => ({
            ...prev,
            moduleCache: {
                ...prev.moduleCache,
                weatherData: { ...(prev.moduleCache?.weatherData || {}), [activeLotId]: data }
            }
        }));
    };

    const setTimeSeriesData = (data: any[]) => {
        setTimeSeriesDataLocal(data);
        setAppState((prev: AppState) => ({
            ...prev,
            moduleCache: {
                ...prev.moduleCache,
                analysisTimeSeries: { ...(prev.moduleCache?.analysisTimeSeries || {}), [tsCacheKey]: data }
            }
        }));
    };

    const setSpeiData = (data: any) => {
        setSpeiDataLocal(data);
        setAppState((prev: AppState) => ({
            ...prev,
            moduleCache: {
                ...prev.moduleCache,
                speiData: { ...(prev.moduleCache?.speiData || {}), [activeLotId]: data }
            }
        }));
    };

    // ── Sync weather: restore from cache or fetch fresh ──────────────────────
    useEffect(() => {
        if (!activeLotId) return;

        const cached = appState.moduleCache?.weatherData?.[activeLotId];
        if (cached) {
            setWeatherDataLocal(cached);
            return;
        }

        setWeatherDataLocal(null);
        if (!selectedLot) return;

        const fetchWeather = async () => {
            setLoadingWeather(true);
            setWeatherError("");
            try {
                const resp = await fetch(
                    `http://127.0.0.1:8000/api/weather?lat=${selectedLot.center_lat}&lon=${selectedLot.center_lon}`
                );
                if (!resp.ok) throw new Error("Error al obtener clima");
                const data = await resp.json();
                setWeatherData(data);
            } catch (err: any) {
                setWeatherError(err.message);
            } finally {
                setLoadingWeather(false);
            }
        };
        fetchWeather();
    }, [activeLotId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Sync SPEI cache
    useEffect(() => {
        if (!activeLotId) return;
        const cached = appState.moduleCache?.speiData?.[activeLotId];
        if (cached) {
            setSpeiDataLocal(cached);
        } else {
            setSpeiDataLocal(null);
        }
    }, [activeLotId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Sync timeseries: restore from cache when lot/dates change ─────────────
    useEffect(() => {
        const cached = appState.moduleCache?.analysisTimeSeries?.[tsCacheKey];
        if (cached && cached.length > 0) {
            setTimeSeriesDataLocal(cached);
            setFromCache(true);
        } else {
            setTimeSeriesDataLocal([]);
            setFromCache(null);
        }
    }, [tsCacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Fetch Time Series — forceRefresh bypasses the backend cache ───────────
    const fetchTimeSeries = async (forceRefresh = false) => {
        if (!selectedLot) return;
        setLoadingTimeSeries(true);
        setTimeSeriesError("");
        setTimeSeriesDataLocal([]);
        setFromCache(null);

        const t0 = performance.now();
        try {
            const payload = {
                lotes: [{
                    id: selectedLot.id,
                    name: selectedLot.name,
                    coordinates: selectedLot.coordinates,
                    area_ha: selectedLot.area_ha,
                    center_lat: selectedLot.center_lat,
                    center_lon: selectedLot.center_lon
                }],
                fecha_inicio: startDate,
                fecha_fin: endDate,
                indice: "NDVI",
                satellite: satelliteSource,
                force_refresh: forceRefresh
            };

            const resp = await fetch(`http://127.0.0.1:8000/api/timeseries/individual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!resp.ok) throw new Error("Error al calcular serie temporal");
            const result = await resp.json();
            if (result.status === 'success') {
                setTimeSeriesData(result.data); // writes to moduleCache too
                const elapsed = performance.now() - t0;
                setFromCache(elapsed < 500);
            } else {
                throw new Error(result.message || "Error desconocido");
            }
        } catch (err: any) {
            setTimeSeriesError(err.message);
        } finally {
            setLoadingTimeSeries(false);
        }
    };

    // Custom tooltip for recharts
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-white p-3 border border-gray-200 shadow-md rounded-lg text-sm">
                    <p className="font-bold text-gray-700 mb-2">{label}</p>
                    {payload.map((entry: any, index: number) => (
                        <p key={index} style={{ color: entry.color }} className="flex justify-between gap-4">
                            <span>{entry.name}:</span>
                            <span className="font-semibold">{entry.value.toFixed(2)}</span>
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-col gap-6 h-full overflow-y-auto pb-8">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Análisis Individual</h1>
                <p className="text-base mt-2 text-slate-500 font-medium">Información procesada por capas de decisión agronómica.</p>
            </div>

            {/* Selector de Lote */}
            <div className="agro-card p-6 bg-white/60">
                <label className="block text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-1.5 text-slate-500">
                    <Map size={14} /> Seleccioná un Lote
                </label>
                <select
                    value={activeLotId}
                    onChange={(e) => setSelectedLotId(e.target.value)}
                    className="w-full text-base rounded-xl px-4 py-3 outline-none transition font-bold bg-white border border-slate-200 text-slate-800 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 shadow-sm appearance-none"
                    style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1.2em" }}
                >
                    {lotes.map((lote: any) => (
                        <option key={lote.id} value={lote.id}>{lote.name}</option>
                    ))}
                </select>
                {lotes.length === 0 && (
                    <p className="text-xs mt-3 flex items-center gap-1.5 font-semibold text-amber-600">
                        <Info size={14} /> No hay lotes cargados. Subí un KML en el inicio.
                    </p>
                )}
            </div>

            {selectedLot && (
                <>

                    {/* ========================================================= */}
                    {/* 1. OPERACIONES Y CLIMA (CORTO PLAZO)                      */}
                    {/* ========================================================= */}
                    <div className="pt-2 border-t border-slate-200/50 mt-2">
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight mb-2 flex items-center gap-2">
                            <span className="bg-slate-200 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center text-sm">1</span>
                            Operaciones y Clima <span className="text-slate-400 font-medium text-base ml-1">(Corto Plazo)</span>
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Superficie */}
                        <div className="agro-card p-8 flex flex-col items-center justify-center text-center">
                            <p className="text-xs font-bold uppercase tracking-widest mb-4 text-slate-400">Superficie del Lote</p>
                            <div className="text-6xl font-extrabold mb-2 text-cyan-500 tracking-tight">
                                {selectedLot.area_ha.toFixed(2)}
                                <span className="text-2xl font-bold ml-1.5 text-slate-400">ha</span>
                            </div>
                            <p className="text-sm mt-1 font-medium text-slate-500">Área total del polígono</p>
                        </div>

                        {/* Clima */}
                        <div className="agro-card p-8 flex flex-col justify-center">
                            <p className="text-xs font-bold uppercase tracking-widest mb-5 text-slate-400">Condiciones Climáticas Actuales</p>

                            {loadingWeather ? (
                                <div className="flex flex-col items-center justify-center py-4">
                                    <Loader2 className="animate-spin mb-3 text-cyan-500" size={28} />
                                    <span className="text-sm font-medium text-slate-500">Cargando clima…</span>
                                </div>
                            ) : weatherError ? (
                                <div className="text-sm p-4 rounded-xl font-medium bg-red-50 text-red-600 border border-red-100">{weatherError}</div>
                            ) : weatherData ? (
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="flex flex-col items-center p-4 rounded-2xl bg-amber-50 border border-amber-100 shadow-sm">
                                        <Thermometer size={24} className="mb-2 text-amber-500" />
                                        <span className="text-xl font-extrabold text-slate-800">{weatherData.temperature}°C</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600/80 mt-1">Temp</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 rounded-2xl bg-blue-50 border border-blue-100 shadow-sm">
                                        <Droplets size={24} className="mb-2 text-blue-500" />
                                        <span className="text-xl font-extrabold text-slate-800">{weatherData.humidity}%</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600/80 mt-1">Humedad</span>
                                    </div>
                                    <div className="flex flex-col items-center p-4 rounded-2xl bg-cyan-50 border border-cyan-100 shadow-sm">
                                        <Wind size={24} className="mb-2 text-cyan-500" />
                                        <span className="text-xl font-extrabold text-slate-800">{weatherData.wind_speed}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600/80 mt-1">{weatherData.wind_unit || 'km/h'}</span>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Panel de aptitud ACTUAL para fitosanitarios */}
                    {weatherData && (
                        <PhytosanitaryAdvisor weatherData={weatherData} />
                    )}

                    {/* Pronóstico 7 días con ventanas de aplicación */}
                    {weatherData?.forecast && weatherData.forecast.length > 0 && (
                        <WeeklyForecast forecast={weatherData.forecast} />
                    )}


                    {/* ========================================================= */}
                    {/* 2. ESTADO HÍDRICO Y ESTRÉS (MEDIANO PLAZO)                */}
                    {/* ========================================================= */}
                    <div className="pt-8 border-t border-slate-200/50 mt-4">
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight mb-2 flex items-center gap-2">
                            <span className="bg-slate-200 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center text-sm">2</span>
                            Estado Hídrico y Estrés <span className="text-slate-400 font-medium text-base ml-1">(Mediano Plazo)</span>
                        </h2>
                    </div>
                    {/* ══════════ ÍNDICE SPEI (SEQUÍA Y RIEGO) ══════════ */}
                    <div className="agro-card p-8 flex flex-col mt-6">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-6">
                            <div>
                                <h3 className="text-lg font-extrabold flex items-center gap-2 text-slate-800 tracking-tight">
                                    <Droplets className="text-blue-500" size={20} />
                                    Análisis Hídrico y Sequía (SPEI)
                                </h3>
                                <p className="text-sm mt-1 font-medium text-slate-500">
                                    Índice Estandarizado precipitación-evapotranspiración (20+ años base).<br />
                                    Precipitación vía NASA IMERG. Temperatura vía NASA POWER.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                                <button
                                    onClick={async () => {
                                        if (!selectedLot) return;
                                        setLoadingSpei(true);
                                        setSpeiError("");
                                        setSpeiDataLocal(null);
                                        try {
                                            const payload = {
                                                lote: {
                                                    id: selectedLot.id,
                                                    name: selectedLot.name,
                                                    coordinates: selectedLot.coordinates,
                                                    area_ha: selectedLot.area_ha,
                                                    center_lat: selectedLot.center_lat,
                                                    center_lon: selectedLot.center_lon
                                                }
                                            };
                                            const resp = await fetch('http://127.0.0.1:8000/api/analysis/spei', {
                                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify(payload)
                                            });

                                            if (!resp.ok) {
                                                const errText = await resp.text();
                                                let backendMsg = "Error obteniendo histórico para SPEI";
                                                try {
                                                    const errJson = JSON.parse(errText);
                                                    if (errJson.detail) backendMsg = errJson.detail;
                                                } catch (e) { }
                                                throw new Error(backendMsg);
                                            }
                                            const result = await resp.json();
                                            if (result.status === 'success') {
                                                setSpeiData(result.data);
                                            } else {
                                                throw new Error("Error calculando SPEI");
                                            }
                                        } catch (err: any) {
                                            setSpeiError(err.message);
                                        } finally {
                                            setLoadingSpei(false);
                                        }
                                    }}
                                    disabled={loadingSpei || !selectedLot}
                                    className="btn-primary text-sm px-5 py-2.5 shadow-blue-500/20 !bg-blue-600 hover:!bg-blue-700 !border-blue-600"
                                >
                                    {loadingSpei ? <Loader2 size={16} className="animate-spin" /> : <Droplets size={16} />}
                                    Analizar SPEI
                                </button>
                            </div>
                        </div>

                        {speiError && (
                            <div className="text-sm p-4 rounded-xl border mb-4" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B' }}>
                                ⚠ {speiError}
                            </div>
                        )}

                        <div className="w-full flex flex-col justify-center bg-white rounded-2xl p-2 relative">
                            {loadingSpei ? (
                                <div className="flex flex-col items-center justify-center text-blue-600 py-16 border border-slate-100 rounded-2xl shadow-inner bg-slate-50">
                                    <Loader2 size={48} className="animate-spin mb-5" />
                                    <span className="font-bold text-lg text-slate-800">Analizando 20 años de historia climática...</span>
                                    <span className="text-sm text-slate-500 mt-2 font-medium">NASA POWER e IMERG están procesando los datos astronómicos.</span>
                                </div>
                            ) : speiData ? (
                                <div className="flex flex-col gap-6 w-full">
                                    {/* Decision Board */}
                                    <SpeiDecisionBoard speiCurrent={speiData.current} />

                                    {/* History Chart */}
                                    {speiData.history_5y && (
                                        <SpeiNdviCorrelationChart historyData={speiData.history_5y} />
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-slate-400 py-16 opacity-60 border border-slate-100 rounded-2xl shadow-inner bg-slate-50">
                                    <Droplets size={48} className="mb-4" />
                                    <span className="text-base font-medium">Presioná Analizar SPEI para extraer la historia hídrica del lote</span>
                                    <span className="text-sm mt-1">Este proceso puede tomar entre 5 y 15 segundos.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ========================================================= */}
                    {/* 3. RESPUESTA VEGETATIVA (ESTADO ACTUAL)                   */}
                    {/* ========================================================= */}
                    <div className="pt-8 border-t border-slate-200/50 mt-4">
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight mb-2 flex items-center gap-2">
                            <span className="bg-slate-200 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center text-sm">3</span>
                            Evolución de Cultivo <span className="text-slate-400 font-medium text-base ml-1">(Respuesta Acumulada)</span>
                        </h2>
                    </div>
                    {/* Serie Temporal NDVI */}
                    <div className="agro-card p-8 flex flex-col">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-6">
                            <div>
                                <h3 className="text-lg font-extrabold flex items-center gap-2 text-slate-800 tracking-tight">
                                    <Activity className="text-cyan-500" size={20} />
                                    Evolución de Vigor (NDVI) y Uniformidad (CV%)
                                </h3>
                                <p className="text-sm mt-1 font-medium text-slate-500">Biomasa satelital — Sentinel-2 / Earth Engine.</p>
                            </div>

                            {/* Controles de Fecha y Satélite */}
                            <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                                <div className="flex items-center gap-2 rounded-xl px-4 py-2 bg-white border border-slate-200 shadow-sm">
                                    <Calendar size={14} className="text-slate-400" />
                                    <input
                                        type="date" value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
                                    />
                                    <span className="text-slate-300 font-bold mx-1">–</span>
                                    <input
                                        type="date" value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="bg-transparent text-sm font-semibold text-slate-700 outline-none"
                                    />
                                </div>
                                <select
                                    value={satelliteSource}
                                    onChange={(e) => setSatelliteSource(e.target.value)}
                                    className="text-sm font-semibold text-slate-700 rounded-xl px-4 py-2.5 outline-none transition pr-10 bg-white border border-slate-200 shadow-sm appearance-none"
                                    style={{ backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 1rem center", backgroundSize: "1em" }}
                                >
                                    <option value="Sentinel-2">Sentinel-2 (10m - c/5 días)</option>
                                    <option value="Landsat">Landsat 8/9 (30m - c/8 días)</option>
                                </select>
                                <button
                                    onClick={() => fetchTimeSeries(false)}
                                    disabled={loadingTimeSeries}
                                    className="btn-primary text-sm px-5 py-2.5 shadow-cyan-500/20"
                                >
                                    {loadingTimeSeries ? <Loader2 size={16} className="animate-spin" /> : <TrendingUp size={16} />}
                                    Analizar
                                </button>
                                {timeSeriesData.length > 0 && !loadingTimeSeries && (
                                    <button
                                        onClick={() => fetchTimeSeries(true)}
                                        title="Forzar recalculo"
                                        className="btn-ghost text-sm px-3 py-2.5 hover:bg-slate-100"
                                    >
                                        <RefreshCw size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="w-full h-[450px] flex items-center justify-center bg-white rounded-2xl border border-slate-100 p-5 relative shadow-inner">
                            {fromCache === true && !loadingTimeSeries && (
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-cyan-50 text-cyan-700 border border-cyan-200 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm z-10">
                                    <Zap size={12} className="fill-cyan-500 text-cyan-500" /> Caché instantáneo
                                </div>
                            )}
                            {loadingTimeSeries ? (
                                <div className="flex flex-col items-center justify-center text-cyan-600">
                                    <Loader2 size={48} className="animate-spin mb-5" />
                                    <span className="font-bold text-lg text-slate-800">Calculando en Google Earth Engine...</span>
                                    <span className="text-sm text-slate-500 mt-2 font-medium">Solo la primera vez tarda. Las siguientes serán instantáneas.</span>
                                </div>
                            ) : timeSeriesError ? (
                                <div className="text-center max-w-sm">
                                    <Info className="mx-auto mb-3 text-red-500" size={32} />
                                    <p className="font-bold text-base text-red-600">Error al procesar</p>
                                    <p className="text-sm mt-1 text-slate-600 font-medium">{timeSeriesError}</p>
                                </div>
                            ) : timeSeriesData && timeSeriesData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={timeSeriesData} margin={{ top: 16, right: 12, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="0" vertical={false} stroke="#E2E8F0" />
                                        <XAxis
                                            dataKey="Fecha"
                                            tickFormatter={(val) => {
                                                const d = new Date(val);
                                                return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
                                            }}
                                            tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }}
                                            tickMargin={12}
                                            axisLine={{ stroke: '#E2E8F0' }}
                                            tickLine={false}
                                        />
                                        <YAxis yAxisId="left" tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} domain={[0, 1]} />
                                        <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748B', fontSize: 12, fontWeight: 500 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<CustomTooltip />} />
                                        <Legend wrapperStyle={{ paddingTop: '24px', fontSize: 13, fontWeight: 600, color: '#475569' }} />
                                        <Line
                                            yAxisId="left" name="Vigor (NDVI)" type="monotone" dataKey="NDVI_Mean"
                                            stroke="#10B981" strokeWidth={4}
                                            dot={{ r: 3, fill: '#10B981', strokeWidth: 0 }}
                                            activeDot={{ r: 6, stroke: 'white', strokeWidth: 2 }}
                                        />
                                        <Line
                                            yAxisId="right" name="Heterogeneidad (CV %)" type="monotone" dataKey="CV_%"
                                            stroke="#3B82F6" strokeWidth={2.5}
                                            strokeDasharray="6 4"
                                            dot={{ r: 2.5, fill: '#3B82F6', strokeWidth: 0 }}
                                            activeDot={{ r: 5, stroke: 'white', strokeWidth: 2 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <Info className="opacity-30 text-slate-400" size={36} />
                                    <p className="text-base font-medium text-slate-500">Presioná <strong>Analizar</strong> para calcular la evolución de vigor.</p>
                                </div>
                            )}
                        </div>

                        {/* Summary Cards */}
                        {timeSeriesData && timeSeriesData.length > 0 && !loadingTimeSeries && (
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
                                {[{
                                    label: 'NDVI Reciente', value: timeSeriesData[timeSeriesData.length - 1]?.NDVI_Mean?.toFixed(2) || 'N/A',
                                    bg: 'bg-cyan-50', border: 'border-cyan-100', color: 'text-cyan-600'
                                }, {
                                    label: 'CV% Reciente', value: `${timeSeriesData[timeSeriesData.length - 1]?.['CV_%']?.toFixed(1) || 'N/A'}%`,
                                    sub: 'Mayor % = lote desparejo',
                                    bg: 'bg-blue-50', border: 'border-blue-100', color: 'text-blue-600'
                                }, {
                                    label: 'NDVI Máximo', value: Math.max(...timeSeriesData.map((d: any) => d.NDVI_Mean || 0)).toFixed(2),
                                    bg: 'bg-slate-50', border: 'border-slate-200', color: 'text-slate-800'
                                }, {
                                    label: 'Imágenes válidas', value: timeSeriesData.length,
                                    sub: 'Sin nubes',
                                    bg: 'bg-slate-50', border: 'border-slate-200', color: 'text-slate-800'
                                }].map((s, i) => (
                                    <div key={i} className={`rounded-2xl p-5 flex flex-col justify-center border ${s.bg} ${s.border} shadow-sm`}>
                                        <span className="text-xs font-bold uppercase tracking-wide mb-1.5 text-slate-400">{s.label}</span>
                                        <span className={`text-3xl font-extrabold tracking-tight ${s.color}`}>{s.value}</span>
                                        {s.sub && <span className="text-[11px] font-medium mt-1 text-slate-400">{s.sub}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ========================================================= */}
                    {/* 4. ESTRUCTURA DE SUELOS (LARGO PLAZO)                     */}
                    {/* ========================================================= */}
                    <div className="pt-8 border-t border-slate-200/50 mt-4">
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight mb-2 flex items-center gap-2">
                            <span className="bg-slate-200 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center text-sm">4</span>
                            Estructura de Suelos <span className="text-slate-400 font-medium text-base ml-1">(Largo Plazo)</span>
                        </h2>
                    </div>
                    {/* ══════════ VARIABILIDAD INTRALOTE (HEATMAP) ══════════ */}
                    <div className="agro-card p-8 flex flex-col">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-6">
                            <div>
                                <h3 className="text-lg font-extrabold flex items-center gap-2 text-slate-800 tracking-tight">
                                    <Layers className="text-cyan-500" size={20} />
                                    Zonificación Intralote Simultánea (COS y pH)
                                </h3>
                                <p className="text-sm mt-1 font-medium text-slate-500">
                                    Análisis a 30m de resolución (0–30 cm) vía{' '}
                                    <a href="https://github.com/openlandmap/soildb" target="_blank" rel="noreferrer" className="text-cyan-600 underline underline-offset-2">OpenLandMap-soildb</a>.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                                <button
                                    onClick={async () => {
                                        if (!selectedLot) return;
                                        setLoadingHeatmap(true);
                                        setHeatmapError("");
                                        setHeatmapData(null);
                                        try {
                                            const basePayload = {
                                                lote: {
                                                    id: selectedLot.id,
                                                    name: selectedLot.name,
                                                    coordinates: selectedLot.coordinates,
                                                    area_ha: selectedLot.area_ha,
                                                    center_lat: selectedLot.center_lat,
                                                    center_lon: selectedLot.center_lon
                                                },
                                                depth: "0..30cm",
                                                map_type: "zonification"
                                            };

                                            // Fetch both variables simultaneously
                                            const [respSocd, respPh] = await Promise.all([
                                                fetch('http://127.0.0.1:8000/api/analysis/intralot-heatmap', {
                                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ ...basePayload, variable: 'socd' })
                                                }),
                                                fetch('http://127.0.0.1:8000/api/analysis/intralot-heatmap', {
                                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ ...basePayload, variable: 'ph' })
                                                })
                                            ]);

                                            if (!respSocd.ok || !respPh.ok) throw new Error(`Ocurrió un error al consultar a Earth Engine`);

                                            const resultSocd = await respSocd.json();
                                            const resultPh = await respPh.json();

                                            if (resultSocd.status === 'success' && resultPh.status === 'success') {
                                                setHeatmapData({ socd: resultSocd.heatmap, ph: resultPh.heatmap });
                                            } else {
                                                throw new Error('Error al generar los mapas');
                                            }
                                        } catch (err: any) {
                                            setHeatmapError(err.message);
                                        } finally {
                                            setLoadingHeatmap(false);
                                        }
                                    }}
                                    disabled={loadingHeatmap || !selectedLot}
                                    className="btn-primary text-sm px-5 py-2.5 shadow-cyan-500/20"
                                >
                                    {loadingHeatmap ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
                                    Ejecutar Análisis
                                </button>
                            </div>
                        </div>

                        {heatmapError && (
                            <div className="text-sm p-4 rounded-xl border mb-4" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#991B1B' }}>
                                ⚠ {heatmapError}
                            </div>
                        )}

                        {/* Display Area for Two Maps */}
                        <div className="w-full flex justify-center bg-white rounded-2xl border border-slate-100 p-5 relative shadow-inner min-h-[400px]">
                            {loadingHeatmap ? (
                                <div className="flex flex-col items-center justify-center text-cyan-600 py-16">
                                    <Loader2 size={48} className="animate-spin mb-5" />
                                    <span className="font-bold text-lg text-slate-800">Generando zonificación en Earth Engine...</span>
                                    <span className="text-sm text-slate-500 mt-2 font-medium">Interpolando Carbono y pH simultáneamente.</span>
                                </div>
                            ) : heatmapData && heatmapData.socd && heatmapData.ph ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 w-full">
                                    {/* MAPA SOCD */}
                                    <div className="flex flex-col gap-4">
                                        <div className="w-full flex justify-center items-center relative border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-gradient-to-b from-slate-50 to-white p-4">
                                            <img
                                                src={`data:image/png;base64,${heatmapData.socd.image_base64}`}
                                                alt={`Mapa SOCD`}
                                                className="w-full h-auto object-contain max-h-[550px]"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="rounded-xl p-4 flex flex-col justify-center border bg-cyan-50 border-cyan-100 shadow-sm">
                                                <span className="text-[10px] font-bold uppercase tracking-wide mb-1 text-cyan-500 text-center">Media</span>
                                                <span className="text-xl font-extrabold text-cyan-700 text-center">{heatmapData.socd.stats?.mean ?? '-'}</span>
                                            </div>
                                            <div className="rounded-xl p-4 flex flex-col justify-center border bg-slate-50 border-slate-200 shadow-sm">
                                                <span className="text-[10px] font-bold uppercase tracking-wide mb-1 text-slate-500 text-center">Mín - Máx</span>
                                                <span className="text-lg font-bold text-slate-700 text-center">{heatmapData.socd.stats?.min ?? '-'} / {heatmapData.socd.stats?.max ?? '-'}</span>
                                            </div>
                                            <div className="rounded-xl p-4 flex flex-col justify-center border bg-amber-50 border-amber-100 shadow-sm">
                                                <span className="text-[10px] font-bold uppercase tracking-wide mb-1 text-amber-500 text-center">CV %</span>
                                                <span className="text-xl font-bold text-amber-700 text-center">{heatmapData.socd.stats?.cv ?? '-'}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* MAPA PH */}
                                    <div className="flex flex-col gap-4">
                                        <div className="w-full flex justify-center items-center relative border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-gradient-to-b from-slate-50 to-white p-4">
                                            <img
                                                src={`data:image/png;base64,${heatmapData.ph.image_base64}`}
                                                alt={`Mapa pH`}
                                                className="w-full h-auto object-contain max-h-[550px]"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="rounded-xl p-4 flex flex-col justify-center border bg-blue-50 border-blue-100 shadow-sm">
                                                <span className="text-[10px] font-bold uppercase tracking-wide mb-1 text-blue-500 text-center">Media</span>
                                                <span className="text-xl font-extrabold text-blue-700 text-center">{heatmapData.ph.stats?.mean ?? '-'}</span>
                                            </div>
                                            <div className="rounded-xl p-4 flex flex-col justify-center border bg-slate-50 border-slate-200 shadow-sm">
                                                <span className="text-[10px] font-bold uppercase tracking-wide mb-1 text-slate-500 text-center">Mín - Máx</span>
                                                <span className="text-lg font-bold text-slate-700 text-center">{heatmapData.ph.stats?.min ?? '-'} / {heatmapData.ph.stats?.max ?? '-'}</span>
                                            </div>
                                            <div className="rounded-xl p-4 flex flex-col justify-center border bg-purple-50 border-purple-100 shadow-sm">
                                                <span className="text-[10px] font-bold uppercase tracking-wide mb-1 text-purple-500 text-center">CV %</span>
                                                <span className="text-xl font-bold text-purple-700 text-center">{heatmapData.ph.stats?.cv ?? '-'}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center text-slate-400 py-16 opacity-50">
                                    <Map size={48} className="mb-4" />
                                    <span className="text-base font-medium">Hacé clic en Ejecutar Análisis para visualizar las zonas</span>
                                    <span className="text-sm mt-1">El panel renderizará simultáneamente la zonificación de Carbono Orgánico y pH.</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ========================================================= */}
                    {/* 5. IMÁGENES SATELITALES (RESOLUCIÓN INTRALOTE)            */}
                    {/* END OF ANALYSIS SECTIONS */}
                </>
            )}
        </div>
    );
}
