import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import type { AppState } from '../App';
import { FileUp, BarChart3, LineChart, Loader2, ArrowLeft, Layers } from 'lucide-react';
import { useState } from 'react';

export default function DashboardLayout({ appState, setAppState }: { appState: AppState, setAppState: any }) {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);

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
            <aside className="sidebar w-64 flex flex-col shrink-0 shadow-lg">

                {/* Logo */}
                <div className="px-5 pt-8 pb-6 border-b border-slate-200/60 flex justify-center">
                    <img src="/logo.png" alt="AgroPulse" className="h-16 object-contain drop-shadow-sm" />
                </div>

                {/* Nav */}
                <nav className="flex-1 px-4 py-6 space-y-2">
                    <p className="px-3 text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-4">
                        Módulos
                    </p>

                    <NavLink
                        to="/dashboard/ranking"
                        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                    >
                        <BarChart3 size={18} />
                        Ranking de Lotes
                    </NavLink>

                    <NavLink
                        to="/dashboard/analysis"
                        className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`}
                    >
                        <LineChart size={18} />
                        Análisis Individual
                    </NavLink>
                </nav>

                {/* Footer: stats + upload */}
                <div className="px-4 pb-6 space-y-4">
                    {/* Lot stats */}
                    <div className="rounded-2xl p-4 border border-slate-200/60 " style={{ background: 'rgba(255,255,255,0.6)', boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.01)' }}>
                        <p className="text-[11px] font-bold tracking-widest uppercase text-slate-400 mb-3">
                            Datos Activos
                        </p>
                        <div className="flex items-center gap-2 mb-2">
                            <Layers size={14} className="text-emerald-500 shrink-0" />
                            <span className="text-sm text-slate-600">
                                <span className="font-extrabold text-slate-900">{count}</span> lotes cargados
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3.5 h-3.5 rounded-sm shrink-0 bg-emerald-400 shadow-sm" />
                            <span className="text-sm text-slate-600">
                                <span className="font-extrabold text-slate-900">{area}</span> ha totales
                            </span>
                        </div>
                    </div>

                    {/* Upload new KML */}
                    <div className="relative rounded-xl border border-dashed border-slate-300 hover:border-emerald-500/60 transition-colors cursor-pointer group bg-slate-50/50 hover:bg-emerald-50/30">
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

                    {/* Back to portal */}
                    <button
                        onClick={() => navigate('/')}
                        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold text-slate-400 hover:text-slate-700 transition-colors"
                    >
                        <ArrowLeft size={12} /> Volver al Portal
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
