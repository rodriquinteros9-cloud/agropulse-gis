import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, Activity, BarChart3, Loader2, CheckCircle2, FileBox, X } from 'lucide-react';

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
        <div className="min-h-screen bg-[#F0FDF4] flex flex-col items-center justify-center p-6 relative overflow-hidden">

            {/* Decorative background blobs */}
            <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-300/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-blue-300/10 rounded-full blur-3xl pointer-events-none" />

            {/* Logo / Brand */}
            <div className="text-center mb-10 relative z-10">
                <img
                    src="/logo.png"
                    alt="AgroPulse — Plataforma Satelital de Monitoreo de Cultivos"
                    className="h-40 mx-auto object-contain drop-shadow-xl"
                />
            </div>

            {/* ── FASE 1: Uploader ─────────────────────────────────────────── */}
            {!isUploaded ? (
                <div className="relative z-10 w-full max-w-xl">
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => !loading && fileInputRef.current?.click()}
                        className={`
                            group cursor-pointer rounded-[24px] border border-slate-200/80 p-12 flex flex-col items-center text-center transition-all duration-300 shadow-xl
                            ${isDragOver
                                ? 'border-emerald-500 bg-emerald-50/80 scale-[1.02] shadow-emerald-500/20'
                                : 'bg-white/70 backdrop-blur-xl hover:border-emerald-400 hover:bg-white/90 hover:shadow-2xl hover:-translate-y-1'
                            }
                        `}
                    >
                        <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-6 transition-all duration-300 shadow-sm ${isDragOver ? 'bg-emerald-500 scale-110 shadow-emerald-500/30' : 'bg-emerald-50 group-hover:bg-emerald-100/80'}`}>
                            {loading
                                ? <Loader2 size={40} className="text-emerald-500 animate-spin" />
                                : <UploadCloud size={40} className={`transition-colors ${isDragOver ? 'text-white' : 'text-emerald-600 group-hover:text-emerald-700'}`} />
                            }
                        </div>

                        {loading ? (
                            <>
                                <p className="text-slate-800 font-extrabold text-2xl mb-1 tracking-tight">Procesando lotes...</p>
                                <p className="text-slate-500 text-sm font-medium">Validando geometrías y calculando métricas espaciales</p>
                            </>
                        ) : (
                            <>
                                <p className="text-slate-800 font-extrabold text-2xl mb-2 tracking-tight">
                                    {isDragOver ? 'Soltar archivo aquí' : 'Cargar archivo de lotes'}
                                </p>
                                <p className="text-slate-500 text-base mb-6 font-medium">
                                    Arrastrá o hacé clic para seleccionar
                                </p>
                                <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-100 px-4 py-2 rounded-full border border-slate-200 uppercase tracking-wide">
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
                        <div className="mt-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-600 text-sm font-medium p-4 rounded-2xl shadow-sm">
                            <X size={18} className="shrink-0 mt-0.5" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <p className="text-center text-slate-400 text-sm mt-8 font-medium">
                        Los datos son procesados localmente. Nada se almacena en la nube.
                    </p>
                </div>

            ) : (
                /* ── FASE 2: Módulos revelados ───────────────────────────────── */
                <div className="relative z-10 w-full max-w-4xl animate-in fade-in slide-in-from-bottom-6 duration-700">

                    {/* Confirmación de carga */}
                    <div className="flex items-center justify-between bg-white/80 backdrop-blur-md border border-emerald-100 shadow-sm rounded-2xl px-6 py-4 mb-10">
                        <div className="flex items-center gap-4">
                            <div className="bg-emerald-100 p-2 rounded-full">
                                <CheckCircle2 size={24} className="text-emerald-600 shrink-0" />
                            </div>
                            <div>
                                <p className="text-slate-800 font-bold text-base">{fileName}</p>
                                <p className="text-slate-500 text-sm font-medium">
                                    {metadata?.feature_count} lote{metadata?.feature_count !== 1 ? 's' : ''} cargado{metadata?.feature_count !== 1 ? 's' : ''} — {metadata?.total_area_ha?.toFixed(1)} ha totales
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={handleReset}
                            title="Cargar otro archivo"
                            className="bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors p-2 rounded-full"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Título */}
                    <p className="text-center text-slate-500 text-lg mb-8 font-semibold tracking-tight">
                        ¿Qué módulo deseas explorar?
                    </p>

                    {/* Cards de módulos */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Ranking */}
                        <button
                            onClick={() => navigate("/dashboard/ranking")}
                            className="group relative bg-white/70 backdrop-blur-xl border border-slate-200 hover:border-emerald-400 rounded-3xl p-10 flex flex-col items-center text-center gap-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-2 shadow-lg"
                        >
                            <div className="w-20 h-20 rounded-3xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors shadow-sm">
                                <BarChart3 size={36} className="text-blue-600" />
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-extrabold text-2xl mb-2 tracking-tight">Ranking de Lotes</h3>
                                <p className="text-slate-600 text-base leading-relaxed font-medium">
                                    Comparativa de índices productivos y suelos en todos tus lotes simultáneamente.
                                </p>
                            </div>
                            <span className="text-sm text-blue-600 font-bold mt-auto uppercase tracking-wider">
                                Índice Productivo · Benchmark NDVI →
                            </span>
                        </button>

                        {/* Análisis Individual */}
                        <button
                            onClick={() => navigate("/dashboard/analysis")}
                            className="group relative bg-white/70 backdrop-blur-xl border border-slate-200 hover:border-emerald-400 rounded-3xl p-10 flex flex-col items-center text-center gap-5 transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-emerald-500/10 hover:-translate-y-2 shadow-lg"
                        >
                            <div className="w-20 h-20 rounded-3xl bg-emerald-50 group-hover:bg-emerald-100 flex items-center justify-center transition-colors shadow-sm">
                                <Activity size={36} className="text-emerald-600" />
                            </div>
                            <div>
                                <h3 className="text-slate-900 font-extrabold text-2xl mb-2 tracking-tight">Análisis Individual</h3>
                                <p className="text-slate-600 text-base leading-relaxed font-medium">
                                    Monitoreo profundo de vigor NDVI, clima, y aptitud para pulverización por lote.
                                </p>
                            </div>
                            <span className="text-sm text-emerald-600 font-bold mt-auto uppercase tracking-wider">
                                NDVI · ΔT · Fitosanitarios →
                            </span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
