import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, Activity, BarChart3, Loader2, CheckCircle2, FileBox, X, ClipboardList } from 'lucide-react';

export default function Portal({ setAppState }: { setAppState: any }) {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [isUploaded, setIsUploaded] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [fileName, setFileName] = useState("");
    const [metadata, setMetadata] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    const processFile = async (file: File) => {
        if (!file) return;
        setLoading(true);
        setErrorMsg("");
        setFileName(file.name);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const resp = await fetch("http://127.0.0.1:8000/api/upload-lotes", {
                method: "POST",
                body: formData,
            });

            const data = await resp.json();

            if (!resp.ok) throw new Error(data.detail || "Error subiendo archivo");

            // Resetear el caché del módulo cuando se sube un archivo nuevo
            setAppState({ spatialData: data.geojson, globalMetadata: data.metadata, moduleCache: {} });
            setMetadata(data.metadata);
            setIsUploaded(true);
        } catch (error: any) {
            setErrorMsg(error.message);
            setFileName("");
        } finally {
            setLoading(false);
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    const handleReset = () => {
        setIsUploaded(false);
        setFileName("");
        setMetadata(null);
        setErrorMsg("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden" style={{ background: 'var(--color-background)' }}>

            {/* Logo / Brand */}
            <div className="text-center mb-8 relative z-10">
                <img
                    src="/logo.png"
                    alt="AgroPulse — Plataforma Satelital de Monitoreo de Cultivos"
                    className="h-28 mx-auto object-contain mb-4"
                />
                <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--color-text)' }}>
                    Agro<span style={{ color: '#00bcff' }}>Pulse</span>
                </h1>
            </div>

            {/* ── FASE 1: Uploader ─────────────────────────────────────────── */}
            {!isUploaded ? (
                <div className="relative z-10 w-full max-w-lg">
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => !loading && fileInputRef.current?.click()}
                        className={`
                            group cursor-pointer rounded-xl border p-10 flex flex-col items-center text-center transition-all duration-200 shadow-sm
                            ${isDragOver
                                ? 'scale-[1.01] shadow-md'
                                : 'bg-white hover:shadow-md'
                            }
                        `}
                        style={{ 
                            borderColor: isDragOver ? 'var(--color-accent)' : 'var(--color-border)',
                            background: isDragOver ? 'rgba(0, 188, 255, 0.03)' : 'white'
                        }}
                    >
                        <div className={`w-18 h-18 rounded-xl flex items-center justify-center mb-5 transition-all duration-200`}
                             style={{ 
                                 background: isDragOver ? 'var(--color-accent)' : 'rgba(0, 188, 255, 0.06)',
                                 width: '4.5rem', height: '4.5rem'
                             }}>
                            {loading
                                ? <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
                                : <UploadCloud size={32} style={{ color: isDragOver ? 'white' : 'var(--color-accent)' }} />
                            }
                        </div>

                        {loading ? (
                            <>
                                <p className="font-bold text-xl mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>Procesando lotes...</p>
                                <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>Validando geometrías y calculando métricas espaciales</p>
                            </>
                        ) : (
                            <>
                                <p className="font-bold text-xl mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>
                                    {isDragOver ? 'Soltar archivo aquí' : 'Cargar archivo de lotes'}
                                </p>
                                <p className="text-sm mb-5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                    Arrastrá o hacé clic para seleccionar
                                </p>
                                <span className="inline-flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded border uppercase tracking-wide" style={{ color: 'var(--color-muted)', background: 'var(--color-background)', borderColor: 'var(--color-border)' }}>
                                    <FileBox size={14} /> .KML · .GeoJSON · .JSON
                                </span>
                            </>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".kml,.geojson,.json"
                            onChange={handleFileInput}
                            className="hidden"
                        />
                    </div>

                    {errorMsg && (
                        <div className="mt-4 flex items-start gap-3 border text-sm font-medium p-3 rounded-lg" style={{ background: 'rgba(194, 0, 0, 0.04)', borderColor: 'rgba(194, 0, 0, 0.2)', color: 'var(--color-danger)' }}>
                            <X size={16} className="shrink-0 mt-0.5" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <p className="text-center text-sm mt-6 font-medium" style={{ color: 'var(--color-muted)' }}>
                        Los datos son procesados localmente. Nada se almacena en la nube.
                    </p>
                </div>

            ) : (
                /* ── FASE 2: Módulos revelados ───────────────────────────────── */
                <div className="relative z-10 w-full max-w-4xl">

                    {/* Confirmación de carga */}
                    <div className="flex items-center justify-between bg-white border rounded-xl px-5 py-3 mb-8 shadow-sm" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-full" style={{ background: 'rgba(137, 211, 41, 0.1)' }}>
                                <CheckCircle2 size={20} style={{ color: 'var(--color-action)' }} />
                            </div>
                            <div>
                                <p className="font-bold text-sm" style={{ color: 'var(--color-text)' }}>{fileName}</p>
                                <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                    {metadata?.feature_count} lote{metadata?.feature_count !== 1 ? 's' : ''} cargado{metadata?.feature_count !== 1 ? 's' : ''} — {metadata?.total_area_ha?.toFixed(1)} ha totales
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleReset}
                            title="Cargar otro archivo"
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: 'var(--color-muted)' }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text)'; e.currentTarget.style.background = 'var(--color-background)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-muted)'; e.currentTarget.style.background = 'transparent'; }}
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Título */}
                    <p className="text-center text-base mb-6 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                        ¿Qué módulo deseas explorar?
                    </p>

                    {/* Cards de módulos */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        {/* Ranking */}
                        <button
                            onClick={() => navigate("/dashboard/ranking")}
                            className="group bg-white border rounded-xl p-7 flex flex-col items-center text-center gap-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 shadow-sm"
                            style={{ borderColor: 'var(--color-border)' }}
                        >
                            <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'rgba(0, 188, 255, 0.06)' }}>
                                <BarChart3 size={28} style={{ color: '#00bcff' }} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>Ranking de Lotes</h3>
                                <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                    Comparativa de índices productivos y suelos en todos tus lotes simultáneamente.
                                </p>
                            </div>
                            <span className="text-xs font-bold mt-auto uppercase tracking-wider" style={{ color: '#00bcff' }}>
                                Índice Productivo · Benchmark NDVI →
                            </span>
                        </button>

                        {/* Análisis Individual */}
                        <button
                            onClick={() => navigate("/dashboard/analysis")}
                            className="group bg-white border rounded-xl p-7 flex flex-col items-center text-center gap-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 shadow-sm"
                            style={{ borderColor: 'var(--color-border)' }}
                        >
                            <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'rgba(0, 188, 255, 0.06)' }}>
                                <Activity size={28} style={{ color: '#00bcff' }} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>Análisis Individual</h3>
                                <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                    Monitoreo profundo de vigor NDVI, clima, y aptitud para pulverización por lote.
                                </p>
                            </div>
                            <span className="text-xs font-bold mt-auto uppercase tracking-wider" style={{ color: '#00bcff' }}>
                                NDVI · ΔT · Fitosanitarios →
                            </span>
                        </button>

                        {/* Planificacion */}
                        <button
                            onClick={() => navigate("/dashboard/planning")}
                            className="group bg-white border rounded-xl p-7 flex flex-col items-center text-center gap-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 shadow-sm"
                            style={{ borderColor: 'var(--color-border)' }}
                        >
                            <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-colors" style={{ background: 'rgba(137, 211, 41, 0.06)' }}>
                                <ClipboardList size={28} style={{ color: '#89d329' }} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg mb-1 tracking-tight" style={{ color: 'var(--color-text)' }}>Planificación</h3>
                                <p className="text-sm leading-relaxed font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                    Asignación de cultivos interactiva por lote en base a su índice productivo (IP).
                                </p>
                            </div>
                            <span className="text-xs font-bold mt-auto uppercase tracking-wider" style={{ color: '#89d329' }}>
                                Gestión de Campaña →
                            </span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
