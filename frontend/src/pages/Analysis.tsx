import React, { useState, useEffect } from 'react';
import type { AppState } from '../App';
import { Map, Wind, Droplets, Thermometer, Loader2, Info, Calendar, Activity, TrendingUp, Zap, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import PhytosanitaryAdvisor from '../components/PhytosanitaryAdvisor';
import WeeklyForecast from '../components/WeeklyForecast';

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
                <p className="text-base mt-2 text-slate-500 font-medium">Evolución temporal de vigor y parámetros del lote seleccionado.</p>
            </div>

            {/* Selector de Lote */}
            <div className="agro-card p-6 bg-white/60">
                <label className="block text-xs font-bold uppercase tracking-wide mb-3 flex items-center gap-1.5 text-slate-500">
                    <Map size={14} /> Seleccioná un Lote
                </label>
                <select
                    value={activeLotId}
                    onChange={(e) => setSelectedLotId(e.target.value)}
                    className="w-full text-base rounded-xl px-4 py-3 outline-none transition font-bold bg-white border border-slate-200 text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 shadow-sm appearance-none"
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Superficie */}
                        <div className="agro-card p-8 flex flex-col items-center justify-center text-center">
                            <p className="text-xs font-bold uppercase tracking-widest mb-4 text-slate-400">Superficie del Lote</p>
                            <div className="text-6xl font-extrabold mb-2 text-emerald-500 tracking-tight">
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
                                    <Loader2 className="animate-spin mb-3 text-emerald-500" size={28} />
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
                                    <div className="flex flex-col items-center p-4 rounded-2xl bg-emerald-50 border border-emerald-100 shadow-sm">
                                        <Wind size={24} className="mb-2 text-emerald-500" />
                                        <span className="text-xl font-extrabold text-slate-800">{weatherData.wind_speed}</span>
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600/80 mt-1">{weatherData.wind_unit || 'km/h'}</span>
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

                    {/* Serie Temporal NDVI */}
                    <div className="agro-card p-8 flex flex-col">
                        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-6">
                            <div>
                                <h3 className="text-lg font-extrabold flex items-center gap-2 text-slate-800 tracking-tight">
                                    <Activity className="text-emerald-500" size={20} />
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
                                    className="btn-primary text-sm px-5 py-2.5 shadow-emerald-500/20"
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
                                <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm z-10">
                                    <Zap size={12} className="fill-emerald-500 text-emerald-500" /> Caché instantáneo
                                </div>
                            )}
                            {loadingTimeSeries ? (
                                <div className="flex flex-col items-center justify-center text-emerald-600">
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
                                    bg: 'bg-emerald-50', border: 'border-emerald-100', color: 'text-emerald-600'
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
                </>
            )}
        </div>
    );
}
