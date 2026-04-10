import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import type { AppState } from '../App';
import { FileUp, BarChart3, LineChart, Loader2, ArrowLeft, Layers, ClipboardList, Activity, Leaf } from 'lucide-react';
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
            <aside className="sidebar w-[72px] flex flex-col shrink-0 items-center">

                {/* App Icon */}
                <div className="w-full flex justify-center py-5 border-b border-[var(--color-border)]">
                    <div className="w-10 h-10 rounded-xl relative overflow-hidden flex items-center justify-center shadow-sm border border-[#24C09E]/20" style={{ background: 'var(--color-primary)' }}>
                        {/* Concentric ripples (approximating icon) */}
                        <div className="absolute w-[180%] h-[180%] rounded-full border-[1.5px] border-[#A7E0EF]/20" />
                        <div className="absolute w-[120%] h-[120%] rounded-full border-[1.5px] border-[#24C09E]/30" />
                        <div className="absolute w-[70%] h-[70%] rounded-full border-[1.5px] border-[#3A8B9E]/50" />
                        
                        {/* Pulse and Leaf */}
                        <div className="relative z-10 flex flex-col items-center justify-center translate-y-0.5">
                            <Activity size={22} className="text-[#A7E0EF] absolute -translate-y-1" strokeWidth={2.5} />
                            <Leaf size={14} className="text-[#24C09E] fill-[#24C09E] mt-3" />
                        </div>
                    </div>
                </div>

                {/* Nav items */}
                <nav className="flex-1 w-full flex flex-col items-center pt-4 gap-1 px-1">
                    <NavLink
                        to="/dashboard/ranking"
                        className={({ isActive }) => `sidebar-nav-item w-full ${isActive ? 'active' : ''}`}
                    >
                        <BarChart3 size={20} strokeWidth={2} />
                        <span>Ranking</span>
                    </NavLink>

                    <NavLink
                        to="/dashboard/analysis"
                        className={({ isActive }) => `sidebar-nav-item w-full ${isActive ? 'active' : ''}`}
                    >
                        <LineChart size={20} />
                        <span>Análisis</span>
                    </NavLink>

                    <NavLink
                        to="/dashboard/planning"
                        className={({ isActive }) => `sidebar-nav-item w-full ${isActive ? 'active' : ''}`}
                    >
                        <ClipboardList size={20} />
                        <span>Planificar</span>
                    </NavLink>
                </nav>

                {/* Footer: Upload + stats compact */}
                <div className="w-full flex flex-col items-center gap-3 px-2 pb-4 border-t border-[var(--color-border)] pt-4">
                    {/* Lot count badge */}
                    <div className="flex flex-col items-center gap-0.5">
                        <div className="flex items-center justify-center w-8 h-8 rounded-full" style={{ background: 'rgba(0, 188, 255, 0.1)' }}>
                            <Layers size={14} style={{ color: 'var(--color-accent)' }} />
                        </div>
                        <span className="text-[10px] font-bold" style={{ color: 'var(--color-text)' }}>{count}</span>
                        <span className="text-[9px] font-medium" style={{ color: 'var(--color-muted)' }}>{area} ha</span>
                    </div>

                    {/* Upload button */}
                    <div className="relative w-10 h-10 rounded-lg border border-dashed flex items-center justify-center cursor-pointer transition-colors"
                         style={{ borderColor: 'var(--color-border)' }}
                         onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.background = 'rgba(0,188,255,0.04)'; }}
                         onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'transparent'; }}
                         title="Subir nuevo KML"
                    >
                        {loading ? <Loader2 className="animate-spin" size={16} style={{ color: 'var(--color-accent)' }} /> : <FileUp size={16} style={{ color: 'var(--color-muted)' }} />}
                        <input
                            type="file" accept=".kml,.geojson,.json"
                            onChange={handleSidebarUpload}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            disabled={loading}
                        />
                    </div>

                    {/* Back */}
                    <button
                        onClick={() => navigate('/')}
                        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                        style={{ color: 'var(--color-muted)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        title="Volver al Portal"
                    >
                        <ArrowLeft size={16} />
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
