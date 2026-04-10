import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CloudRain, Loader2, RefreshCw, Calendar, Droplets, TrendingUp, BarChart3, Info, MapPin, ChevronDown } from 'lucide-react';

interface PrecipData {
    year: number;
    month: number;
    precipitation_mm: number;
}

interface BoxPlotStats {
    month: number;
    monthLabel: string;
    monthLabelFull: string;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    mean: number;
    count: number;
    iqr: number;
}

interface LoteOption {
    id: string;
    name: string;
    center_lat: number;
    center_lon: number;
}

interface PrecipitationBoxPlotProps {
    lotes: LoteOption[];
    spatialData: any;
}

const MONTH_LABELS_ANNUAL     = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_LABELS_ESTIVAL    = ['Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
const MONTH_FULL_ANNUAL       = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTH_FULL_ESTIVAL      = ['Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio'];
const MONTH_ORDER_ESTIVAL     = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];

function quantile(sorted: number[], q: number): number {
    if (sorted.length === 0) return 0;
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
}

function computeBoxPlotStats(data: PrecipData[], mode: 'annual' | 'estival'): BoxPlotStats[] {
    const monthOrder = mode === 'estival' ? MONTH_ORDER_ESTIVAL : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const labels     = mode === 'estival' ? MONTH_LABELS_ESTIVAL : MONTH_LABELS_ANNUAL;
    const fullLabels = mode === 'estival' ? MONTH_FULL_ESTIVAL : MONTH_FULL_ANNUAL;

    return monthOrder.map((m, idx) => {
        const vals = data
            .filter(d => d.month === m)
            .map(d => d.precipitation_mm)
            .sort((a, b) => a - b);

        if (vals.length === 0) {
            return {
                month: m, monthLabel: labels[idx], monthLabelFull: fullLabels[idx],
                min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0, count: 0, iqr: 0
            };
        }

        const q1 = quantile(vals, 0.25);
        const q3 = quantile(vals, 0.75);
        return {
            month: m,
            monthLabel: labels[idx],
            monthLabelFull: fullLabels[idx],
            min: vals[0],
            q1,
            median: quantile(vals, 0.5),
            q3,
            max: vals[vals.length - 1],
            mean: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
            count: vals.length,
            iqr: q3 - q1
        };
    });
}

export default function PrecipitationBoxPlot({ lotes, spatialData }: PrecipitationBoxPlotProps) {
    const [selectedLoteId, setSelectedLoteId] = useState<string>('');
    const [mode, setMode] = useState<'annual' | 'estival'>('estival');
    const [rawData, setRawData] = useState<PrecipData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loteName, setLoteName] = useState<string>('');
    const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    // Track which lote was fetched to avoid re-fetching
    const [fetchedLoteId, setFetchedLoteId] = useState<string>('');

    const API_BASE = 'http://localhost:8000/api';

    // Auto-select first lote when lotes change
    useEffect(() => {
        if (lotes.length > 0 && !selectedLoteId) {
            setSelectedLoteId(lotes[0].id);
        }
    }, [lotes]);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectedLote = useMemo(() => lotes.find(l => l.id === selectedLoteId) || null, [lotes, selectedLoteId]);

    // Find lote feature from spatialData
    const loteFeature = useMemo(() => {
        if (!selectedLote || !spatialData?.features) return null;
        return spatialData.features.find((f: any) =>
            (f.properties?.temp_id ?? '') === selectedLote.id ||
            (f.properties?.Lote_Name ?? '') === selectedLote.name
        );
    }, [selectedLote, spatialData]);

    const fetchData = useCallback(async () => {
        if (!loteFeature || !selectedLote) return;

        setLoading(true);
        setError(null);

        try {
            const coords = loteFeature.geometry.coordinates;
            const center_lat = loteFeature.properties?.centroide_lat ?? selectedLote.center_lat;
            const center_lon = loteFeature.properties?.centroide_lon ?? selectedLote.center_lon;

            const response = await fetch(`${API_BASE}/precipitation/imerg`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([{
                    id: selectedLote.id,
                    name: selectedLote.name,
                    coordinates: coords,
                    area_ha: loteFeature.properties?.Area_ha ?? 0,
                    center_lat,
                    center_lon
                }])
            });

            if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);

            const result = await response.json();
            if (result.status === 'success' && result.data) {
                setRawData(result.data);
                setLoteName(result.lote_name || selectedLote.name);
                setFetchedLoteId(selectedLote.id);
            } else {
                setError('No se obtuvieron datos de precipitación.');
            }
        } catch (err: any) {
            setError(err.message || 'Error de conexión');
        } finally {
            setLoading(false);
        }
    }, [loteFeature, selectedLote]);

    // Auto-fetch when lote changes
    useEffect(() => {
        if (loteFeature && selectedLote && fetchedLoteId !== selectedLote.id && !loading) {
            fetchData();
        }
    }, [loteFeature, selectedLote, fetchedLoteId]);

    const stats    = useMemo(() => computeBoxPlotStats(rawData, mode), [rawData, mode]);

    const yearRange = useMemo(() => {
        if (rawData.length === 0) return '';
        const years = rawData.map(d => d.year);
        return `${Math.min(...years)} – ${Math.max(...years)}`;
    }, [rawData]);

    const annualTotal = useMemo(() => {
        if (stats.length === 0) return 0;
        return Math.round(stats.reduce((acc, s) => acc + s.median, 0));
    }, [stats]);

    const maxVal = useMemo(() => {
        if (stats.length === 0) return 250;
        return Math.ceil(Math.max(...stats.map(s => s.max)) / 50) * 50 + 50;
    }, [stats]);

    // ────────────────── SVG DIMENSIONS (bigger!) ──────────────────
    const svgWidth     = 960;
    const svgHeight    = 520;
    const marginLeft   = 72;
    const marginRight  = 30;
    const marginTop    = 30;
    const marginBottom = 60;
    const plotWidth    = svgWidth - marginLeft - marginRight;
    const plotHeight   = svgHeight - marginTop - marginBottom;

    const boxWidth = Math.min(52, plotWidth / 13);
    const xStep    = plotWidth / 12;

    const scaleY = (v: number) => marginTop + plotHeight - (v / maxVal) * plotHeight;
    const scaleX = (idx: number) => marginLeft + xStep * idx + xStep / 2;

    // Y axis ticks
    const yTicks = useMemo(() => {
        const ticks: number[] = [];
        const step = maxVal <= 250 ? 25 : maxVal <= 500 ? 50 : 100;
        for (let v = 0; v <= maxVal; v += step) ticks.push(v);
        return ticks;
    }, [maxVal]);

    // ────────────────────────────────────────────────────────────────
    // No lotes loaded
    if (lotes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 text-center py-10">
                <CloudRain className="w-14 h-14 mb-5 opacity-25" strokeWidth={1.5} />
                <p className="text-base font-semibold text-slate-500 leading-relaxed px-8">
                    Subí tu archivo KML con los lotes para visualizar el régimen de precipitaciones históricas.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-7">
            {/* ═══ HEADER ROW ═══ */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                {/* Title */}
                <div className="flex items-center gap-4">
                    <div className="p-3.5 bg-white/70 shadow-md rounded-2xl border border-white">
                        <CloudRain className="w-8 h-8 text-sky-600" strokeWidth={2.5} />
                    </div>
                    <div>
                        <h3 className="font-extrabold text-2xl tracking-tight text-slate-800">
                            Precipitaciones Históricas IMERG
                        </h3>
                        <p className="text-sm font-semibold text-slate-500 mt-1 tracking-wide">
                            Box-plot mensual · NASA GPM · {loteName || selectedLote?.name || ''}
                        </p>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* ── Lote Selector ── */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            onClick={() => setDropdownOpen(v => !v)}
                            className="flex items-center gap-2.5 px-5 py-2.5 bg-white border border-slate-200 rounded-2xl shadow-sm text-sm font-bold text-slate-700 hover:border-sky-300 hover:shadow-md transition-all min-w-[200px]"
                        >
                            <MapPin size={15} className="text-sky-500 shrink-0" />
                            <span className="truncate flex-1 text-left">{selectedLote?.name || 'Seleccionar lote'}</span>
                            <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${dropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {dropdownOpen && (
                            <div className="absolute left-0 top-full mt-2 w-full min-w-[260px] bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/60 z-50 py-2 max-h-64 overflow-y-auto">
                                {lotes.map(l => (
                                    <button
                                        key={l.id}
                                        onClick={() => {
                                            setSelectedLoteId(l.id);
                                            setDropdownOpen(false);
                                        }}
                                        className={`w-full text-left px-5 py-3 text-sm font-semibold transition-colors flex items-center gap-3
                                            ${l.id === selectedLoteId
                                                ? 'bg-sky-50 text-sky-700'
                                                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                            }`}
                                    >
                                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${l.id === selectedLoteId ? 'bg-sky-500' : 'bg-slate-300'}`} />
                                        <span className="truncate">{l.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Mode Toggle ── */}
                    <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                        <button
                            onClick={() => setMode('estival')}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                                mode === 'estival'
                                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Calendar size={14} />
                                Estival (Jul–Jun)
                            </span>
                        </button>
                        <button
                            onClick={() => setMode('annual')}
                            className={`px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                                mode === 'annual'
                                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/30'
                                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            <span className="flex items-center gap-1.5">
                                <Calendar size={14} />
                                Anual (Ene–Dic)
                            </span>
                        </button>
                    </div>

                    {/* ── Refresh ── */}
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="p-3 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-sky-600 hover:border-sky-300 transition-all shadow-sm disabled:opacity-50"
                        title="Recargar datos"
                    >
                        <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ═══ SUMMARY CARDS ═══ */}
            {rawData.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2.5">
                            <Droplets size={15} className="text-sky-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pp Anual Mediana</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800">{annualTotal} <span className="text-sm font-semibold text-slate-400">mm</span></p>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2.5">
                            <TrendingUp size={15} className="text-cyan-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Mes Más Lluvioso</span>
                        </div>
                        {(() => {
                            const wettest = stats.reduce((a, b) => a.median > b.median ? a : b, stats[0]);
                            return <p className="text-2xl font-black text-slate-800">{wettest?.monthLabel} <span className="text-sm font-semibold text-slate-400">{Math.round(wettest?.median || 0)} mm</span></p>;
                        })()}
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2.5">
                            <BarChart3 size={15} className="text-amber-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Registro</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800">{yearRange}</p>
                    </div>
                    <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2.5">
                            <Info size={15} className="text-indigo-500" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Años de Dato</span>
                        </div>
                        <p className="text-2xl font-black text-slate-800">{stats[0]?.count || 0} <span className="text-sm font-semibold text-slate-400">años</span></p>
                    </div>
                </div>
            )}

            {/* ═══ CHART AREA ═══ */}
            <div className="bg-white backdrop-blur-md rounded-3xl p-8 shadow-md border border-slate-100">
                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[520px] text-sky-600">
                        <Loader2 className="w-12 h-12 animate-spin mb-5" />
                        <p className="text-base font-bold text-slate-600">Consultando NASA GPM IMERG...</p>
                        <p className="text-sm text-slate-400 mt-2">Esto puede tardar 20-40 segundos para {selectedLote?.name}</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center min-h-[520px] text-red-500">
                        <p className="text-base font-bold mb-2">Error obteniendo datos</p>
                        <p className="text-sm text-slate-500">{error}</p>
                        <button onClick={fetchData} className="mt-5 px-5 py-2.5 bg-sky-500 text-white rounded-xl text-sm font-bold hover:bg-sky-600 transition-colors">
                            Reintentar
                        </button>
                    </div>
                ) : rawData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-[520px] text-slate-400">
                        <CloudRain className="w-12 h-12 mb-4 opacity-30" />
                        <p className="text-base font-semibold">Seleccioná un lote para cargar precipitaciones</p>
                    </div>
                ) : (
                    <div className="relative">
                        <h4 className="text-[13px] font-extrabold uppercase tracking-[0.15em] text-slate-400 mb-6 text-center">
                            Precipitación Mensual (mm) — {mode === 'estival' ? 'Año Estival Jul → Jun' : 'Año Calendario Ene → Dic'}
                            <span className="text-slate-300 font-bold ml-3">|</span>
                            <span className="text-sky-500 ml-3">{loteName}</span>
                        </h4>

                        <svg
                            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                            className="w-full h-auto"
                            style={{ minHeight: '400px', maxHeight: '600px' }}
                        >
                            {/* ─── Grid lines ─── */}
                            {yTicks.map(v => (
                                <g key={v}>
                                    <line
                                        x1={marginLeft}
                                        x2={svgWidth - marginRight}
                                        y1={scaleY(v)}
                                        y2={scaleY(v)}
                                        stroke={v === 0 ? '#94a3b8' : '#e2e8f0'}
                                        strokeDasharray={v === 0 ? '' : '6 4'}
                                        strokeWidth={v === 0 ? 1.8 : 1}
                                        opacity={v === 0 ? 1 : 0.7}
                                    />
                                    <text
                                        x={marginLeft - 12}
                                        y={scaleY(v)}
                                        textAnchor="end"
                                        dominantBaseline="middle"
                                        fontSize={13}
                                        fontWeight={600}
                                        fill="#64748b"
                                    >
                                        {v}
                                    </text>
                                </g>
                            ))}

                            {/* ─── Y axis label ─── */}
                            <text
                                x={20}
                                y={marginTop + plotHeight / 2}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={14}
                                fontWeight={700}
                                fill="#64748b"
                                transform={`rotate(-90, 20, ${marginTop + plotHeight / 2})`}
                            >
                                Precipitación (mm)
                            </text>

                            {/* ─── Axis lines ─── */}
                            <line x1={marginLeft} x2={marginLeft} y1={marginTop} y2={marginTop + plotHeight} stroke="#cbd5e1" strokeWidth={1.5} />
                            <line x1={marginLeft} x2={svgWidth - marginRight} y1={marginTop + plotHeight} y2={marginTop + plotHeight} stroke="#cbd5e1" strokeWidth={1.5} />

                            {/* ─── Box plots ─── */}
                            {stats.map((s, idx) => {
                                const cx = scaleX(idx);
                                const isHovered = hoveredMonth === idx;
                                const halfBox = boxWidth / 2;

                                // Season color system
                                const isWarm = [10, 11, 12, 1, 2, 3].includes(s.month);
                                const boxFill = isHovered
                                    ? (isWarm ? 'rgba(14,165,233,0.38)' : 'rgba(100,116,139,0.32)')
                                    : (isWarm ? 'rgba(56,189,248,0.22)' : 'rgba(148,163,184,0.18)');
                                const strokeColor = isHovered
                                    ? (isWarm ? '#0284c7' : '#475569')
                                    : (isWarm ? '#0ea5e9' : '#64748b');
                                const medianColor = isWarm ? '#0c4a6e' : '#1e293b';

                                if (s.count === 0) return null;

                                return (
                                    <g
                                        key={s.month}
                                        onMouseEnter={() => setHoveredMonth(idx)}
                                        onMouseLeave={() => setHoveredMonth(null)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {/* Hover highlight column */}
                                        <rect
                                            x={cx - xStep / 2}
                                            y={marginTop}
                                            width={xStep}
                                            height={plotHeight}
                                            fill={isHovered ? 'rgba(241,245,249,0.8)' : 'transparent'}
                                            rx={6}
                                        />

                                        {/* ── Whisker: min → Q1 ── */}
                                        <line
                                            x1={cx} y1={scaleY(s.min)}
                                            x2={cx} y2={scaleY(s.q1)}
                                            stroke={strokeColor}
                                            strokeWidth={isHovered ? 2.5 : 2}
                                            strokeDasharray="4 3"
                                        />
                                        {/* Min cap */}
                                        <line
                                            x1={cx - halfBox * 0.55} y1={scaleY(s.min)}
                                            x2={cx + halfBox * 0.55} y2={scaleY(s.min)}
                                            stroke={strokeColor}
                                            strokeWidth={isHovered ? 3 : 2}
                                            strokeLinecap="round"
                                        />

                                        {/* ── Whisker: Q3 → max ── */}
                                        <line
                                            x1={cx} y1={scaleY(s.q3)}
                                            x2={cx} y2={scaleY(s.max)}
                                            stroke={strokeColor}
                                            strokeWidth={isHovered ? 2.5 : 2}
                                            strokeDasharray="4 3"
                                        />
                                        {/* Max cap */}
                                        <line
                                            x1={cx - halfBox * 0.55} y1={scaleY(s.max)}
                                            x2={cx + halfBox * 0.55} y2={scaleY(s.max)}
                                            stroke={strokeColor}
                                            strokeWidth={isHovered ? 3 : 2}
                                            strokeLinecap="round"
                                        />

                                        {/* ── Box: Q1 → Q3 ── */}
                                        <rect
                                            x={cx - halfBox}
                                            y={scaleY(s.q3)}
                                            width={boxWidth}
                                            height={Math.max(2, scaleY(s.q1) - scaleY(s.q3))}
                                            fill={boxFill}
                                            stroke={strokeColor}
                                            strokeWidth={isHovered ? 3 : 2}
                                            rx={5}
                                            ry={5}
                                        />

                                        {/* ── Median line ── */}
                                        <line
                                            x1={cx - halfBox + 2} y1={scaleY(s.median)}
                                            x2={cx + halfBox - 2} y2={scaleY(s.median)}
                                            stroke={medianColor}
                                            strokeWidth={isHovered ? 4 : 3}
                                            strokeLinecap="round"
                                        />

                                        {/* ── Mean dot (diamond shape) ── */}
                                        <circle
                                            cx={cx}
                                            cy={scaleY(s.mean)}
                                            r={isHovered ? 5.5 : 4.5}
                                            fill="white"
                                            stroke={isWarm ? '#f97316' : '#f59e0b'}
                                            strokeWidth={2.5}
                                        />

                                        {/* ── Month label ── */}
                                        <text
                                            x={cx}
                                            y={svgHeight - marginBottom + 24}
                                            textAnchor="middle"
                                            fontSize={14}
                                            fontWeight={isHovered ? 800 : 700}
                                            fill={isHovered ? '#0284c7' : '#475569'}
                                        >
                                            {s.monthLabel}
                                        </text>

                                        {/* ── Hover tooltip ── */}
                                        {isHovered && (() => {
                                            const ttw = 165;
                                            const tth = 115;
                                            // Clamp X so tooltip doesn't overflow
                                            let ttx = cx - ttw / 2;
                                            if (ttx < 5) ttx = 5;
                                            if (ttx + ttw > svgWidth - 5) ttx = svgWidth - ttw - 5;
                                            const tty = Math.max(5, scaleY(s.max) - tth - 12);

                                            return (
                                                <g>
                                                    <rect
                                                        x={ttx} y={tty}
                                                        width={ttw} height={tth}
                                                        rx={12}
                                                        fill="white"
                                                        stroke="#cbd5e1"
                                                        strokeWidth={1.2}
                                                        filter="url(#boxplotShadow)"
                                                    />
                                                    <text x={ttx + ttw / 2} y={tty + 20} textAnchor="middle" fontSize={13} fontWeight={900} fill="#0f172a" style={{ letterSpacing: '0.04em' }}>
                                                        {s.monthLabelFull} · {s.count} años
                                                    </text>
                                                    <line x1={ttx + 12} x2={ttx + ttw - 12} y1={tty + 29} y2={tty + 29} stroke="#e2e8f0" strokeWidth={1} />
                                                    <text x={ttx + 14} y={tty + 46} fontSize={12} fontWeight={600} fill="#64748b">
                                                        Máx:  {Math.round(s.max)} mm
                                                    </text>
                                                    <text x={ttx + 14} y={tty + 62} fontSize={12} fontWeight={600} fill="#64748b">
                                                        Q3:   {Math.round(s.q3)} mm
                                                    </text>
                                                    <text x={ttx + 14} y={tty + 79} fontSize={13} fontWeight={900} fill="#0369a1">
                                                        Med:  {Math.round(s.median)} mm
                                                    </text>
                                                    <text x={ttx + 14} y={tty + 95} fontSize={12} fontWeight={600} fill="#64748b">
                                                        Q1: {Math.round(s.q1)}  ·  Mín: {Math.round(s.min)} mm
                                                    </text>
                                                    <text x={ttx + 14} y={tty + 111} fontSize={12} fontWeight={700} fill="#ea580c">
                                                        Media: {s.mean} mm
                                                    </text>
                                                </g>
                                            );
                                        })()}
                                    </g>
                                );
                            })}

                            {/* Drop shadow filter */}
                            <defs>
                                <filter id="boxplotShadow" x="-15%" y="-15%" width="130%" height="140%">
                                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000" floodOpacity="0.10" />
                                </filter>
                            </defs>
                        </svg>

                        {/* ── Legend ── */}
                        <div className="flex flex-wrap items-center justify-center gap-8 mt-6 text-[13px] font-bold text-slate-500">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-4 rounded bg-sky-400/25 border-2 border-sky-500" />
                                <span>Meses Cálidos (Oct–Mar)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-7 h-4 rounded bg-slate-400/20 border-2 border-slate-500" />
                                <span>Meses Fríos (Abr–Sep)</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-6 h-[4px] bg-sky-900 rounded-full" />
                                <span>Mediana</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-3.5 h-3.5 rounded-full border-[2.5px] border-orange-500 bg-white" />
                                <span>Media</span>
                            </div>
                            <div className="flex items-center gap-2.5">
                                <div className="w-5 border-t-2 border-dashed border-sky-500" />
                                <span>Bigotes (Mín–Máx)</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ═══ SOURCE INFO ═══ */}
            <div className="bg-sky-50/60 border border-sky-100 rounded-2xl p-5 flex items-start gap-3">
                <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                <p className="text-[12px] font-medium text-sky-800 leading-relaxed">
                    <strong>Fuente:</strong> NASA GPM IMERG V07 Monthly (Integrated Multi-satellitE Retrievals for GPM).
                    Resolución espacial ~10 km. Los datos de precipitación se calculan como la media zonal del polígono del lote
                    para cada mes desde 2001 hasta el presente. La <strong>caja</strong> representa Q1–Q3 (percentiles 25–75),
                    la <strong>línea gruesa</strong> central es la mediana, y los <strong>bigotes</strong> muestran min–max del registro histórico.
                    Este gráfico es un insumo clave para la toma de decisiones de siembra y manejo hídrico.
                </p>
            </div>
        </div>
    );
}
