import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import type { AppState } from '../App';
import { FileUp, BarChart3, LineChart, Loader2, ArrowLeft, Layers, ClipboardList, ChevronRight } from 'lucide-react';
import { useState, useRef, useCallback } from 'react';

const SIDEBAR_COLLAPSED_W = 68;   // px – icon rail
const SIDEBAR_EXPANDED_W = 260;   // px – full sidebar

export default function DashboardLayout({ appState, setAppState }: { appState: AppState, setAppState: any }) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* Hover handlers with a small delay on leave to avoid flicker */
    const handleMouseEnter = useCallback(() => {
        if (collapseTimer.current) clearTimeout(collapseTimer.current);
        setExpanded(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        collapseTimer.current = setTimeout(() => setExpanded(false), 250);
    }, []);

    if (!appState.spatialData) {
        navigate("/");
        return null;
    }

    const handleSidebarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const resp = await fetch("http://127.0.0.1:8000/api/upload-lotes", { method: "POST", body: formData });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.detail);

            setAppState({
                spatialData: data.geojson,
                globalMetadata: data.metadata,
                moduleCache: {},
            });
        } catch (error) {
            alert("Error en la carga: " + error);
        } finally {
            setLoading(false);
        }
    };

    const area = appState.globalMetadata?.total_area_ha?.toFixed(0) || 0;
    const count = appState.globalMetadata?.feature_count || 0;

    return (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-background)' }}>

            {/* ── Sidebar ── */}
            <aside
                className="sidebar sidebar-collapsible flex flex-col shrink-0 shadow-lg"
                style={{ width: expanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >

                {/* Logo / Icon */}
                <div className="sidebar-logo-area border-b border-slate-200/60 flex items-center justify-center"
                     style={{ padding: expanded ? '2rem 1.25rem 1.5rem' : '2rem 0 1.5rem' }}>
                    {expanded ? (
                        <img src="/logo.png" alt="AgroPulse" className="h-16 object-contain drop-shadow-sm sidebar-fade-in" />
                    ) : (
                        <img src="/logo.png" alt="AgroPulse" className="h-8 w-8 object-contain drop-shadow-sm" style={{ borderRadius: 6 }} />
                    )}
                </div>

                {/* Expand indicator (collapsed only) */}
                {!expanded && (
                    <div className="flex justify-center py-2">
                        <ChevronRight size={14} className="text-slate-300 animate-pulse" />
                    </div>
                )}

                {/* Nav */}
                <nav className="flex-1 py-4 space-y-1" style={{ padding: expanded ? '1rem 1rem' : '1rem 0.5rem' }}>
                    {expanded && (
                        <p className="px-3 text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-4 sidebar-fade-in">
                            Módulos
                        </p>
                    )}

                    <NavLink
                        to="/dashboard/ranking"
                        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''} ${!expanded ? 'sidebar-nav-collapsed' : ''}`}
                        title="Ranking de Lotes"
                    >
                        <BarChart3 size={18} className="shrink-0" />
                        {expanded && <span className="sidebar-fade-in whitespace-nowrap">Ranking de Lotes</span>}
                    </NavLink>

                    <NavLink
                        to="/dashboard/analysis"
                        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''} ${!expanded ? 'sidebar-nav-collapsed' : ''}`}
                        title="Análisis Individual"
                    >
                        <LineChart size={18} className="shrink-0" />
                        {expanded && <span className="sidebar-fade-in whitespace-nowrap">Análisis Individual</span>}
                    </NavLink>

                    <NavLink
                        to="/dashboard/planning"
                        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''} ${!expanded ? 'sidebar-nav-collapsed' : ''}`}
                        title="Planificación"
                    >
                        <ClipboardList size={18} className="shrink-0" />
                        {expanded && <span className="sidebar-fade-in whitespace-nowrap">Planificación</span>}
                    </NavLink>
                </nav>

                {/* Footer: stats + upload */}
                <div className="pb-4 space-y-3" style={{ padding: expanded ? '0 1rem 1.5rem' : '0 0.5rem 1rem' }}>

                    {/* Lot stats */}
                    {expanded ? (
                        <div className="rounded-2xl p-4 border border-slate-200/60 sidebar-fade-in"
                             style={{ background: 'rgba(255,255,255,0.6)', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.01)' }}>
                            <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-3">
                                Datos Activos
                            </p>
                            <div className="flex items-center gap-2 mb-2">
                                <Layers size={14} className="text-emerald-500 shrink-0" />
                                <span className="text-sm text-slate-600">
                                    <span className="font-extrabold text-slate-900">{count}</span> lotes
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-3.5 h-3.5 rounded-sm shrink-0 bg-emerald-400 shadow-sm" />
                                <span className="text-sm text-slate-600">
                                    <span className="font-extrabold text-slate-900">{area}</span> ha
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-2" title={`${count} lotes · ${area} ha`}>
                            <Layers size={16} className="text-emerald-500" />
                        </div>
                    )}

                    {/* Upload new KML */}
                    {expanded ? (
                        <div className="relative rounded-xl border border-dashed border-slate-300 hover:border-emerald-500/60 transition-colors cursor-pointer group bg-slate-50/50 hover:bg-emerald-50/30 sidebar-fade-in">
                            <button className="flex items-center justify-center gap-2 w-full py-3 px-3 text-sm font-semibold text-slate-500 group-hover:text-emerald-600 transition-colors">
                                {loading ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
                                {loading ? "Procesando..." : "Subir nuevo KML"}
                            </button>
                            <input
                                type="file" accept=".kml,.geojson,.json"
                                onChange={handleSidebarUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={loading}
                            />
                        </div>
                    ) : (
                        <div className="relative flex justify-center" title="Subir nuevo KML">
                            <button className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-colors">
                                {loading ? <Loader2 className="animate-spin" size={16} /> : <FileUp size={16} />}
                            </button>
                            <input
                                type="file" accept=".kml,.geojson,.json"
                                onChange={handleSidebarUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={loading}
                            />
                        </div>
                    )}

                    {/* Back to portal */}
                    <button
                        onClick={() => navigate('/')}
                        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors"
                        title="Volver al Portal"
                    >
                        <ArrowLeft size={12} />
                        {expanded && <span className="sidebar-fade-in">Volver al Portal</span>}
                    </button>
                </div>
            </aside>

            {/* ── Main Content ── */}
            <main className="flex-1 min-w-0 overflow-y-auto">
                <div className="p-8 max-w-7xl mx-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
