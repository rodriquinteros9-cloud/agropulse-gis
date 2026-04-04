import { useNavigate } from 'react-router-dom';
import { ArrowRight, Activity, Map, PieChart, Droplets, Target, ShieldCheck } from 'lucide-react';

export default function Landing() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-200">
            {/* --- Navbar --- */}
            <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-lg border-b border-slate-200/50">
                <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* We use an img if they have a real logo, or stylized text */}
                        <img src="/logo.png" alt="AgroPulse Logo" className="h-10 object-contain drop-shadow-sm" onError={(e) => e.currentTarget.style.display = 'none'} />
                        <span className="text-2xl font-black tracking-tighter text-slate-800">
                            Agro<span className="text-emerald-600">Pulse</span>
                        </span>
                    </div>
                    <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
                        <a href="#features" className="hover:text-emerald-600 transition-colors">Soluciones</a>
                        <a href="#demo" className="hover:text-emerald-600 transition-colors">Tecnología</a>
                    </div>
                    <div>
                        <button 
                            onClick={() => navigate('/app')}
                            className="bg-slate-900 hover:bg-emerald-600 text-white px-6 py-2.5 rounded-full font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-emerald-500/30 flex items-center gap-2 group"
                        >
                            Acceder a la App
                            <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </nav>

            {/* --- Hero Section --- */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden px-6">
                {/* Background glowing orbs */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-400/20 rounded-full blur-[120px] pointer-events-none -z-10" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-400/10 rounded-full blur-[100px] pointer-events-none -z-10" />

                <div className="max-w-5xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100/50 border border-emerald-200 text-emerald-700 text-sm font-bold mb-8 uppercase tracking-wide">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                        </span>
                        Agricultura de Precisión Inteligente
                    </div>
                    <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-slate-900 mb-8 leading-[1.1]">
                        Transforma los datos de tus lotes en <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-blue-600">Rentabilidad Absoluta</span>
                    </h1>
                    <p className="text-lg lg:text-xl text-slate-600 max-w-3xl mx-auto mb-10 font-medium leading-relaxed">
                        AgroPulse centraliza índices productivos, clima, agua útil (SEPA) y rentabilidad (Rinde de Indiferencia) en una única plataforma visual. Deja de adivinar, empieza a optimizar.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <button 
                            onClick={() => navigate('/app')}
                            className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-extrabold text-lg transition-all duration-300 shadow-xl shadow-emerald-600/20 hover:-translate-y-1"
                        >
                            Comenzar Prueba Gratis
                        </button>
                    </div>
                </div>

                {/* Dashboard mockup preview */}
                <div className="max-w-6xl mx-auto mt-20 relative z-10">
                    <div className="relative rounded-[2rem] bg-white/40 p-4 backdrop-blur-2xl border border-slate-200/60 shadow-2xl shadow-slate-200/50">
                        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-50/50 to-transparent rounded-[2rem] pointer-events-none" />
                        
                        <div className="bg-slate-900 rounded-[1.5rem] overflow-hidden aspect-[16/9] relative flex items-center justify-center shadow-inner">
                            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1592982537447-6f2b6a0b2fd6?q=80&w=2600&auto=format&fit=crop')] bg-cover bg-center opacity-40 mix-blend-overlay"></div>
                            
                            {/* Abstract Floating UI Elements to simulate the platform */}
                            <div className="absolute left-10 bottom-10 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 w-72 text-left">
                                <div className="flex items-center gap-3 text-white mb-2">
                                    <Droplets size={20} className="text-blue-400" />
                                    <span className="font-bold">Agua Útil (SEPA)</span>
                                </div>
                                <div className="text-3xl font-black text-white">78% <span className="text-sm font-normal text-slate-300">Capacidad</span></div>
                                <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
                                    <div className="w-[78%] h-full bg-blue-400"></div>
                                </div>
                            </div>

                            <div className="absolute right-10 top-10 bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 w-80 text-left">
                                <div className="flex items-center gap-3 text-white mb-2">
                                    <PieChart size={20} className="text-emerald-400" />
                                    <span className="font-bold">Rinde de Indiferencia</span>
                                </div>
                                <div className="text-3xl font-black text-white">2.4 <span className="text-sm font-normal text-slate-300">tn/ha</span></div>
                                <div className="mt-4 flex gap-2">
                                    <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded-md border border-emerald-500/30">Compra Insumos</span>
                                    <span className="px-2 py-1 bg-slate-500/20 text-slate-300 text-xs rounded-md border border-slate-500/30">Venta Granos</span>
                                </div>
                            </div>
                            
                            <div className="z-10 bg-white text-slate-900 px-8 py-4 rounded-full font-bold shadow-2xl flex items-center gap-3">
                                <Activity className="text-emerald-600" />
                                Monitoreo Satelital en Tiempo Real
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- Features Section --- */}
            <section id="features" className="py-24 bg-white relative">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-4xl font-extrabold text-slate-900 mb-6">El ecosistema definitivo para el Productor Moderno</h2>
                        <p className="text-lg text-slate-500 font-medium">Reemplazamos planillas y conjeturas con mapas interactivos de alta precisión y modelos económicos al instante.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors group">
                            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Map size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-4">Zonificación Intralote</h3>
                            <p className="text-slate-600 font-medium leading-relaxed">
                                Identifica alta, media y baja productividad dentro de un mismo lote. Análisis profundo de Carbono Orgánico (COS) y pH para aplicar dosis variables con máxima eficiencia.
                            </p>
                        </div>
                        {/* Feature 2 */}
                        <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition-colors group">
                            <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Activity size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-4">Monitoreo de Agua SEPA</h3>
                            <p className="text-slate-600 font-medium leading-relaxed">
                                Integración local de datos pluviométricos (SPEI) e histórico de agua en el suelo. Prevén estrés hídrico con semanas de anticipación y ajusta tu siembra al clima.
                            </p>
                        </div>
                        {/* Feature 3 */}
                        <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:border-amber-200 transition-colors group">
                            <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                <Target size={28} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-900 mb-4">Márgenes y Mercado</h3>
                            <p className="text-slate-600 font-medium leading-relaxed">
                                Gráficos financieros integrados en tiempo real. Calcula al instante tu Rinde de Indiferencia utilizando ratios Insumo/Producto basados en el World Bank.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- CTA Section --- */}
            <section className="py-24 bg-slate-900 relative overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-900/40 via-slate-900 to-slate-900 pointer-events-none"></div>
                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <ShieldCheck size={48} className="text-emerald-400 mx-auto mb-6" />
                    <h2 className="text-4xl md:text-5xl font-black text-white mb-6">Listos para escalar tus rendimientos</h2>
                    <p className="text-xl text-slate-300 font-medium mb-10">
                        Carga el KML/GeoJSON de tu campo y descubre el potencial oculto de tus lotes en menos de 1 minuto. Sin tarjetas de crédito, sin compromisos. 
                    </p>
                    <button 
                        onClick={() => navigate('/app')}
                        className="px-10 py-5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full font-extrabold text-xl transition-all shadow-xl shadow-emerald-500/25 hover:scale-105"
                    >
                        Ingresar a la Plataforma Libre
                    </button>
                    <p className="text-slate-500 text-sm mt-6 font-medium">Validado por asesores técnicos de primer nivel — Datos 100% privados.</p>
                </div>
            </section>
            
            {/* Footer */}
            <footer className="bg-slate-950 py-8 border-t border-slate-800">
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
                    <div className="text-slate-400 font-bold mb-4 md:mb-0">
                        AgroPulse © 2026. Todos los derechos reservados.
                    </div>
                    <div className="flex gap-6 text-sm font-medium text-slate-500">
                        <a href="#" className="hover:text-emerald-400 transition-colors">Términos del Servicio</a>
                        <a href="#" className="hover:text-emerald-400 transition-colors">Política de Privacidad</a>
                        <a href="#" className="hover:text-emerald-400 transition-colors">Contacto Ventas</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
