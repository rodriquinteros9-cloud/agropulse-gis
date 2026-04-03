/**
 * CommodityDashboard — Precios Históricos + Relación Insumo-Producto
 * 
 * Fuente: World Bank Commodity Markets "Pink Sheet" (CC-BY)
 * Muestra:
 *   1. Gráfico de precios históricos (Soja, Maíz, Trigo, Urea, DAP, TSP)
 *   2. Relaciones Insumo-Producto con semáforo de timing de compra
 */
import { useState, useEffect, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, Area, ComposedChart, ReferenceArea,
} from 'recharts';
import { TrendingUp, BarChart3, RefreshCw, AlertTriangle, Info } from 'lucide-react';

const API_BASE = 'http://localhost:8000/api';

// ── Colores por commodity ──
const COLORS: Record<string, string> = {
  soja: '#16a34a',
  maiz: '#eab308',
  trigo: '#f97316',
  urea: '#6366f1',
  dap: '#ec4899',
  tsp: '#06b6d4',
};

const LABELS: Record<string, string> = {
  soja: 'Soja',
  maiz: 'Maíz',
  trigo: 'Trigo',
  urea: 'Urea',
  dap: 'DAP',
  tsp: 'TSP',
};

// ── Colores de ratio ──
const RATIO_COLORS: Record<string, string> = {
  soja_urea: '#6366f1',
  maiz_urea: '#eab308',
  soja_dap: '#ec4899',
};

interface DataPoint { date: string; price: number; }
interface CommoditySeries {
  id: string; label: string; unit: string;
  data: DataPoint[]; count: number;
  last_date: string | null; last_price: number | null;
}
interface RatioDataPoint { date: string; ratio: number; grain_price: number; input_price: number; }
interface RatioStats { mean: number; p25: number; p75: number; min: number; max: number; count: number; }
interface RatioCurrent { date: string | null; ratio: number; signal: string; signal_label: string; pct_vs_avg: number; }
interface IPRatio {
  id: string; label: string; description: string; unit: string;
  data: RatioDataPoint[]; stats: RatioStats; current: RatioCurrent;
}

export default function CommodityDashboard() {
  // ── Estado ──
  const [series, setSeries] = useState<Record<string, CommoditySeries>>({});
  const [ratios, setRatios] = useState<IPRatio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fromYear, setFromYear] = useState(2015);
  const [activeTab, setActiveTab] = useState<'prices' | 'ratios'>('ratios');
  const [selectedCommodities, setSelectedCommodities] = useState<string[]>(['soja', 'maiz', 'trigo']);
  const [selectedRatio, setSelectedRatio] = useState('soja_urea');
  const [source, setSource] = useState('');

  // ── Fetch data ──
  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const [histResp, ratioResp] = await Promise.all([
        fetch(`${API_BASE}/prices/history?from_year=${fromYear}`),
        fetch(`${API_BASE}/prices/ratios?from_year=${fromYear}`),
      ]);

      if (histResp.ok) {
        const histData = await histResp.json();
        setSeries(histData.series || {});
        setSource(histData.source || '');
      }

      if (ratioResp.ok) {
        const ratioData = await ratioResp.json();
        setRatios(ratioData.ratios || []);
      }
    } catch (err: any) {
      setError(err.message || 'Error al obtener datos históricos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [fromYear]);

  // ── Datos para el gráfico de precios ──
  const priceChartData = useMemo(() => {
    if (!series || Object.keys(series).length === 0) return [];

    // Construir un array de { date, soja, maiz, trigo, urea, dap, tsp }
    const dateMap: Record<string, any> = {};
    for (const [key, commodity] of Object.entries(series)) {
      if (!selectedCommodities.includes(key)) continue;
      for (const dp of commodity.data) {
        if (!dateMap[dp.date]) dateMap[dp.date] = { date: dp.date };
        dateMap[dp.date][key] = dp.price;
      }
    }

    return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [series, selectedCommodities]);

  // ── Ratio activo ──
  const activeRatio = useMemo(() => ratios.find(r => r.id === selectedRatio), [ratios, selectedRatio]);

  // ── Toggle commodity ──
  const toggleCommodity = (id: string) => {
    setSelectedCommodities(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // ── Custom tooltip para precios ──
  const PriceTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-xl text-xs">
        <div className="font-bold text-slate-700 mb-2">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4 py-0.5">
            <span className="font-semibold" style={{ color: p.color }}>{LABELS[p.dataKey] || p.dataKey}</span>
            <span className="font-mono font-bold text-slate-800">${p.value?.toFixed(0)} /tn</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Custom tooltip para ratios ──
  const RatioTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const dp = payload[0]?.payload;
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-3 shadow-xl text-xs">
        <div className="font-bold text-slate-700 mb-2">{label}</div>
        <div className="flex justify-between gap-4 py-0.5">
          <span className="font-semibold text-indigo-600">Ratio</span>
          <span className="font-mono font-bold text-slate-800">{dp?.ratio?.toFixed(1)} qq/tn</span>
        </div>
        {dp?.grain_price && (
          <div className="flex justify-between gap-4 py-0.5 text-slate-500">
            <span>Grano</span>
            <span className="font-mono">${dp.grain_price}/tn</span>
          </div>
        )}
        {dp?.input_price && (
          <div className="flex justify-between gap-4 py-0.5 text-slate-500">
            <span>Insumo</span>
            <span className="font-mono">${dp.input_price}/tn</span>
          </div>
        )}
      </div>
    );
  };

  const hasData = Object.keys(series).length > 0 || ratios.length > 0;

  return (
    <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200/60 backdrop-blur-sm rounded-[2rem] shadow-xl shadow-slate-200/40 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-80 h-80 bg-indigo-100/20 rounded-full blur-[100px] pointer-events-none -ml-20 -mt-20" />

      {/* ── HEADER ── */}
      <div className="p-8 pb-5 border-b border-slate-100 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white shadow-sm rounded-2xl border border-slate-100">
              <TrendingUp className="w-7 h-7 text-indigo-600" strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="font-extrabold text-2xl tracking-tight text-slate-800">Precios Históricos & Relación Insumo-Producto</h3>
              <p className="text-sm font-medium text-slate-500 mt-0.5">
                Evolución de precios y momento óptimo de compra de insumos. Datos mensuales desde {fromYear}.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Horizonte temporal */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
              {[2015, 2018, 2020].map(year => (
                <button
                  key={year}
                  onClick={() => setFromYear(year)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${fromYear === year ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {year === 2015 ? '10 años' : year === 2018 ? '7 años' : '5 años'}
                </button>
              ))}
            </div>

            {/* Fuente */}
            <span className="text-[10px] uppercase font-bold px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full border border-indigo-100">
              World Bank
            </span>

            <button
              onClick={fetchData}
              disabled={loading}
              className="p-1.5 bg-white rounded-lg border border-slate-200 hover:border-slate-300 transition-colors shadow-sm disabled:opacity-50"
              title="Actualizar datos"
            >
              <RefreshCw size={14} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-sm font-medium text-amber-700">
            <AlertTriangle size={16} /> {error}
          </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div className="flex border-b border-slate-100 relative z-10">
        <button
          onClick={() => setActiveTab('ratios')}
          className={`flex-1 px-6 py-3.5 text-sm font-bold transition-all relative ${activeTab === 'ratios' ? 'text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className="flex items-center justify-center gap-2">
            <BarChart3 size={16} /> Relación Insumo-Producto
          </div>
          {activeTab === 'ratios' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
        <button
          onClick={() => setActiveTab('prices')}
          className={`flex-1 px-6 py-3.5 text-sm font-bold transition-all relative ${activeTab === 'prices' ? 'text-indigo-700' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <div className="flex items-center justify-center gap-2">
            <TrendingUp size={16} /> Historial de Precios
          </div>
          {activeTab === 'prices' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
      </div>

      {/* ── CONTENIDO ── */}
      <div className="p-8 relative z-10">
        {loading && !hasData ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw size={32} className="animate-spin mb-4" />
            <p className="text-sm font-semibold">Descargando datos del World Bank...</p>
            <p className="text-xs mt-1">Primera carga puede demorar ~15 segundos</p>
          </div>
        ) : !hasData ? (
          <div className="text-center py-20 text-slate-400">
            <AlertTriangle size={32} className="mx-auto mb-3" />
            <p className="text-sm font-semibold">No se pudieron obtener datos históricos</p>
          </div>
        ) : activeTab === 'ratios' ? (
          /* ═══ TAB: RELACIÓN INSUMO-PRODUCTO ═══ */
          <div className="space-y-6">
            {/* Selector de ratio */}
            <div className="flex flex-wrap gap-2">
              {ratios.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRatio(r.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${selectedRatio === r.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {activeRatio && (
              <>
                {/* Semáforo principal */}
                <div className={`rounded-xl p-5 border flex flex-col md:flex-row md:items-center gap-4 ${
                  activeRatio.current.signal === 'favorable' ? 'bg-emerald-50 border-emerald-200' :
                  activeRatio.current.signal === 'neutral' ? 'bg-amber-50 border-amber-200' :
                  'bg-rose-50 border-rose-200'
                }`}>
                  <div className="flex-1">
                    <div className="text-lg font-bold text-slate-800 mb-1">
                      {activeRatio.current.signal_label}
                    </div>
                    <div className="text-sm text-slate-600">
                      Hoy se necesitan <strong className="text-slate-800">{activeRatio.current.ratio.toFixed(1)} {activeRatio.unit}</strong>.
                      Promedio histórico: <strong>{activeRatio.stats.mean.toFixed(1)}</strong>.
                    </div>
                  </div>
                  <div className="flex gap-4 shrink-0">
                    <div className="text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Actual</div>
                      <div className="text-2xl font-black text-slate-800">{activeRatio.current.ratio.toFixed(1)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">Promedio</div>
                      <div className="text-2xl font-black text-slate-400">{activeRatio.stats.mean.toFixed(1)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] font-bold text-slate-400 uppercase">vs. Prom.</div>
                      <div className={`text-2xl font-black ${activeRatio.current.pct_vs_avg <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {activeRatio.current.pct_vs_avg > 0 ? '+' : ''}{activeRatio.current.pct_vs_avg.toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Gráfico de ratio */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <ResponsiveContainer width="100%" height={350}>
                    <ComposedChart data={activeRatio.data} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="ratioGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={RATIO_COLORS[activeRatio.id] || '#6366f1'} stopOpacity={0.15} />
                          <stop offset="95%" stopColor={RATIO_COLORS[activeRatio.id] || '#6366f1'} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={(v: string) => {
                          const [y, m] = v.split('-');
                          return m === '01' || m === '07' ? `${m}/${y.slice(2)}` : '';
                        }}
                        interval={0}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickFormatter={(v: number) => `${v.toFixed(0)}`}
                        label={{ value: activeRatio.unit, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }}
                      />
                      <Tooltip content={<RatioTooltip />} />

                      {/* Banda P25-P75 */}
                      <ReferenceArea
                        y1={activeRatio.stats.p25}
                        y2={activeRatio.stats.p75}
                        fill="#6366f1"
                        fillOpacity={0.06}
                        label={{ value: 'Rango P25-P75', position: 'insideTopRight', style: { fontSize: 9, fill: '#94a3b8' } }}
                      />

                      {/* Línea de promedio */}
                      <ReferenceLine
                        y={activeRatio.stats.mean}
                        stroke="#64748b"
                        strokeDasharray="8 4"
                        strokeWidth={1.5}
                        label={{ value: `Promedio: ${activeRatio.stats.mean.toFixed(1)}`, position: 'right', style: { fontSize: 10, fontWeight: 700, fill: '#64748b' } }}
                      />

                      {/* Área + Línea principal */}
                      <Area
                        type="monotone"
                        dataKey="ratio"
                        fill="url(#ratioGradient)"
                        stroke="none"
                      />
                      <Line
                        type="monotone"
                        dataKey="ratio"
                        stroke={RATIO_COLORS[activeRatio.id] || '#6366f1'}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5, fill: RATIO_COLORS[activeRatio.id] || '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Interpretación */}
                <div className="bg-indigo-50/60 rounded-xl p-4 border border-indigo-100 flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-indigo-700 leading-relaxed">
                    <strong>¿Cómo leer este gráfico?</strong> La línea muestra cuántos quintales de grano se necesitan para comprar 1 tonelada de insumo.
                    Cuando la línea está <strong>por debajo del promedio</strong> (línea punteada), el insumo está relativamente <strong className="text-emerald-700">barato</strong> — es buen momento para comprar.
                    Cuando está por encima, está relativamente <strong className="text-rose-600">caro</strong>.
                    La zona sombreada muestra el rango intercuartílico (P25-P75) de los últimos {new Date().getFullYear() - fromYear} años.
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          /* ═══ TAB: HISTORIAL DE PRECIOS ═══ */
          <div className="space-y-6">
            {/* Selector de commodities */}
            <div className="flex flex-wrap gap-2">
              {Object.keys(series).map(key => (
                <button
                  key={key}
                  onClick={() => toggleCommodity(key)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    selectedCommodities.includes(key)
                      ? 'text-white shadow-md'
                      : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
                  }`}
                  style={selectedCommodities.includes(key) ? { background: COLORS[key] } : {}}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: COLORS[key] }} />
                  {LABELS[key] || key}
                  {series[key]?.last_price && (
                    <span className="font-mono opacity-80">${series[key].last_price}/tn</span>
                  )}
                </button>
              ))}
            </div>

            {/* Gráfico de precios */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={priceChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(v: string) => {
                      const [y, m] = v.split('-');
                      return m === '01' ? y : '';
                    }}
                    interval={0}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#94a3b8' }}
                    tickFormatter={(v: number) => `$${v}`}
                    label={{ value: 'USD/tn', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }}
                  />
                  <Tooltip content={<PriceTooltip />} />
                  <Legend
                    formatter={(value: string) => <span className="text-xs font-semibold text-slate-600">{LABELS[value] || value}</span>}
                  />

                  {selectedCommodities.map(key => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={COLORS[key]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: COLORS[key], stroke: '#fff', strokeWidth: 2 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Cards de último precio */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {Object.entries(series).map(([key, commodity]) => (
                <div key={key} className="bg-white rounded-xl border border-slate-200 p-3 flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[key] }} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{commodity.label}</span>
                  </div>
                  <div className="text-lg font-black text-slate-800">${commodity.last_price?.toFixed(0)}</div>
                  <div className="text-[10px] text-slate-400 font-medium">{commodity.unit} · {commodity.last_date}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ── */}
      <div className="p-4 bg-slate-50/50 border-t border-slate-100 text-[11px] text-slate-400 font-medium flex flex-wrap gap-x-4 gap-y-1 relative z-10">
        <span><strong>Fuente:</strong> {source || 'World Bank Commodity Markets'}</span>
        <span><strong>Licencia:</strong> CC-BY (uso libre con atribución)</span>
        <span><strong>Actualización:</strong> Mensual (Pink Sheet)</span>
        <span><strong>Relación IP:</strong> Quintales de grano necesarios para comprar 1 tn de insumo.</span>
      </div>
    </div>
  );
}
