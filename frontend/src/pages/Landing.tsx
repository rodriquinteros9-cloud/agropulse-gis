import { useNavigate } from 'react-router-dom';
import { ArrowRight, Activity, Map, PieChart, Droplets, Target, ShieldCheck } from 'lucide-react';
import BrandLogo from '../components/BrandLogo';

export default function Landing() {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen font-sans selection:bg-cyan-200" style={{ background: 'var(--color-background)', color: 'var(--color-text)' }}>
            {/* --- Navbar --- */}
            <nav className="fixed w-full z-50 bg-white/90 backdrop-blur-lg border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <BrandLogo className="h-9" />
                    <div className="hidden md:flex items-center gap-8 text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                        <a href="#features" className="hover:opacity-80 transition-opacity">Soluciones</a>
                        <a href="#demo" className="hover:opacity-80 transition-opacity">Tecnología</a>
                    </div>
                    <div>
                        <button 
                            onClick={() => navigate('/login')}
                            className="text-white px-5 py-2 rounded font-bold text-sm transition-all duration-200 shadow-sm hover:shadow-md flex items-center gap-2 group"
                            style={{ background: 'var(--color-primary)' }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-primary-light)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-primary)'}
                        >
                            Acceder a la App
                            <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            </nav>

            {/* --- Hero Section --- */}
            <section className="relative min-h-[85vh] flex flex-col justify-center overflow-hidden">
                {/* === BACKGROUND IMAGE FULL-BLEED === */}
                <img
                    src="/hero-fondo.jpg"
                    alt="Agronomos trabajando en el campo con tecnología"
                    className="absolute inset-0 w-full h-full object-cover object-center"
                    style={{ zIndex: 0 }}
                />

                {/* Overlay: gradiente izquierda oscuro para texto */}
                <div className="absolute inset-0" style={{
                    zIndex: 1,
                    background: 'linear-gradient(100deg, rgba(10, 34, 57, 0.88) 0%, rgba(10, 34, 57, 0.72) 45%, rgba(10, 34, 57, 0.25) 75%, transparent 100%)'
                }} />

                {/* Overlay: gradiente inferior para transición suave a la siguiente sección */}
                <div className="absolute bottom-0 left-0 right-0 h-40" style={{
                    zIndex: 2,
                    background: 'linear-gradient(to bottom, transparent, var(--color-background))'
                }} />

                {/* Content */}
                <div className="relative px-6 pt-32 pb-24 max-w-7xl mx-auto w-full" style={{ zIndex: 3 }}>
                    <div className="max-w-2xl">
                        {/* Badge */}
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-sm font-bold mb-8 uppercase tracking-wide" style={{ background: 'rgba(36, 192, 158, 0.15)', borderColor: 'rgba(36, 192, 158, 0.45)', color: '#24C09E' }}>
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#24C09E' }}></span>
                                <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#24C09E' }}></span>
                            </span>
                            Agricultura de Precisión Inteligente
                        </div>

                        {/* Heading */}
                        <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6 leading-[1.1] text-white drop-shadow-lg">
                            Transforma los datos<br/> de tus lotes en{' '}
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">
                                Rentabilidad Real
                            </span>
                        </h1>

                        {/* Subheading */}
                        <p className="text-base lg:text-lg mb-10 font-medium leading-relaxed" style={{ color: 'rgba(255,255,255,0.80)' }}>
                            AgroPulse centraliza índices productivos, clima, agua útil (SEPA) y rentabilidad 
                            en una única plataforma visual. Deja de adivinar, empieza a optimizar.
                        </p>

                        {/* CTA Buttons */}
                        <div className="flex flex-col sm:flex-row items-start gap-4">
                            <button 
                                onClick={() => navigate('/login')}
                                className="px-8 py-3.5 text-white rounded-lg font-bold text-base transition-all duration-200 shadow-lg hover:-translate-y-0.5 hover:shadow-xl"
                                style={{ background: 'var(--color-accent)', boxShadow: '0 4px 18px rgba(36, 192, 158, 0.4)' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-action)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-accent)'}
                            >
                                Comenzar Prueba Gratis
                            </button>
                            <a
                                href="#features"
                                className="px-8 py-3.5 rounded-lg font-bold text-base transition-all duration-200 border hover:-translate-y-0.5"
                                style={{ color: 'white', borderColor: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)' }}
                            >
                                Ver Soluciones →
                            </a>
                        </div>

                        {/* Social proof chips */}
                        <div className="flex flex-wrap gap-3 mt-10">
                            {['📡 Imágenes Sentinel-2', '💧 Datos SEPA locales', '📈 Precios BCR en vivo'].map(item => (
                                <span key={item} className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)', border: '1px solid rgba(255,255,255,0.2)' }}>
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Dashboard mockup preview — now BELOW the hero, as a floating card */}
                <div className="relative max-w-5xl mx-auto w-full px-6 pb-10" style={{ zIndex: 3, marginTop: '-2rem' }}>
                    <div className="relative rounded-2xl overflow-hidden border shadow-2xl" style={{ borderColor: 'var(--color-border)' }}>
                        {/* top bar */}
                        <div className="flex items-center gap-2 px-4 py-3 bg-slate-800">
                            <span className="w-3 h-3 rounded-full bg-red-400 opacity-80"></span>
                            <span className="w-3 h-3 rounded-full bg-yellow-400 opacity-80"></span>
                            <span className="w-3 h-3 rounded-full bg-green-400 opacity-80"></span>
                            <span className="ml-4 text-xs font-mono text-slate-400">agropulse.app — Panel de Control</span>
                        </div>
                        <div className="aspect-[16/8] relative flex items-center justify-center" style={{ background: 'var(--color-primary-dark)' }}>
                            <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: 'url("/hero-fondo.jpg")' }}></div>
                            
                            {/* Floating UI Elements */}
                            <div className="absolute left-8 bottom-8 p-5 rounded-xl border w-64 text-left" style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.12)' }}>
                                <div className="flex items-center gap-3 text-white mb-2">
                                    <Droplets size={18} style={{ color: '#A7E0EF' }} />
                                    <span className="font-bold text-sm">Agua Útil (SEPA)</span>
                                </div>
                                <div className="text-2xl font-black text-white">78% <span className="text-xs font-normal text-slate-300">Capacidad</span></div>
                                <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                    <div className="w-[78%] h-full rounded-full transition-all duration-1000" style={{ background: 'linear-gradient(90deg, #A7E0EF, #24C09E)' }}></div>
                                </div>
                            </div>

                            <div className="absolute right-8 top-8 p-5 rounded-xl border w-72 text-left" style={{ background: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.12)' }}>
                                <div className="flex items-center gap-3 text-white mb-2">
                                    <PieChart size={18} style={{ color: '#24C09E' }} />
                                    <span className="font-bold text-sm">Rinde de Indiferencia</span>
                                </div>
                                <div className="text-2xl font-black text-white">2.4 <span className="text-xs font-normal text-slate-300">tn/ha</span></div>
                                <div className="mt-3 flex gap-2">
                                    <span className="px-2 py-0.5 text-xs rounded border font-semibold" style={{ background: 'rgba(36,192,158,0.15)', color: '#24C09E', borderColor: 'rgba(36,192,158,0.3)' }}>Compra Insumos</span>
                                    <span className="px-2 py-0.5 text-xs rounded border font-semibold" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)' }}>Venta Granos</span>
                                </div>
                            </div>
                            
                            <div className="z-10 bg-white/95 backdrop-blur px-6 py-3 rounded-xl font-bold shadow-xl flex items-center gap-2.5 text-sm" style={{ color: 'var(--color-text)' }}>
                                <Activity style={{ color: '#00bcff' }} size={18} />
                                Monitoreo Satelital en Tiempo Real
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- Features Section --- */}
            <section id="features" className="py-20 bg-white relative">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="text-center max-w-3xl mx-auto mb-16">
                        <h2 className="text-3xl font-extrabold mb-4" style={{ color: 'var(--color-text)' }}>El ecosistema definitivo para el Productor Moderno</h2>
                        <p className="text-base font-medium" style={{ color: 'var(--color-text-secondary)' }}>Reemplazamos planillas y conjeturas con mapas interactivos de alta precisión y modelos económicos al instante.</p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        {/* Feature 1 */}
                        <div className="p-7 rounded-xl border transition-all hover:shadow-md" style={{ background: 'var(--color-background)', borderColor: 'var(--color-border)' }}>
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5" style={{ background: 'rgba(167, 224, 239, 0.2)' }}>
                                <Map size={24} style={{ color: '#3A8B9E' }} />
                            </div>
                            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--color-text)' }}>Zonificación Intralote</h3>
                            <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                                Identifica alta, media y baja productividad dentro de un mismo lote. Análisis profundo de Carbono Orgánico (COS) y pH para aplicar dosis variables con máxima eficiencia.
                            </p>
                        </div>
                        {/* Feature 2 */}
                        <div className="p-7 rounded-xl border transition-all hover:shadow-md" style={{ background: 'var(--color-background)', borderColor: 'var(--color-border)' }}>
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5" style={{ background: 'rgba(58, 139, 158, 0.1)' }}>
                                <Activity size={24} style={{ color: '#3A8B9E' }} />
                            </div>
                            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--color-text)' }}>Monitoreo de Agua SEPA</h3>
                            <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                                Integración local de datos pluviométricos (SPEI) e histórico de agua en el suelo. Prevén estrés hídrico con semanas de anticipación y ajusta tu siembra al clima.
                            </p>
                        </div>
                        {/* Feature 3 */}
                        <div className="p-7 rounded-xl border transition-all hover:shadow-md" style={{ background: 'var(--color-background)', borderColor: 'var(--color-border)' }}>
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-5" style={{ background: 'rgba(36, 192, 158, 0.1)' }}>
                                <Target size={24} style={{ color: '#24C09E' }} />
                            </div>
                            <h3 className="text-lg font-bold mb-3" style={{ color: 'var(--color-text)' }}>Márgenes y Mercado</h3>
                            <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                                Gráficos financieros integrados en tiempo real. Calcula al instante tu Rinde de Indiferencia utilizando ratios Insumo/Producto basados en la BCR.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* --- CTA Section --- */}
            <section className="py-20 relative overflow-hidden" style={{ background: 'var(--color-primary)' }}>
                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(0, 188, 255, 0.15) 0%, transparent 70%)' }}></div>
                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <ShieldCheck size={40} className="mx-auto mb-5" style={{ color: '#89d329' }} />
                    <h2 className="text-3xl md:text-4xl font-black text-white mb-5">Listos para escalar tus rendimientos</h2>
                    <p className="text-lg text-white/70 font-medium mb-8">
                        Carga el KML/GeoJSON de tu campo y descubre el potencial oculto de tus lotes en menos de 1 minuto. Sin tarjetas de crédito, sin compromisos. 
                    </p>
                    <button 
                        onClick={() => navigate('/login')}
                        className="px-8 py-4 text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        style={{ background: 'var(--color-action)' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-action-dark)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'var(--color-action)'}
                    >
                        Ingresar a la Plataforma Libre
                    </button>
                    <p className="text-white/40 text-sm mt-5 font-medium">Validado por asesores técnicos de primer nivel — Datos 100% privados.</p>
                </div>
            </section>
            
            {/* Footer */}
            <footer className="py-6 border-t" style={{ background: 'var(--color-primary-dark)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between">
                    <div className="text-white/50 font-bold text-sm mb-3 md:mb-0">
                        AgroPulse © 2026. Todos los derechos reservados.
                    </div>
                    <div className="flex gap-6 text-sm font-medium text-white/40">
                        <a href="#" className="hover:text-white/70 transition-colors">Términos del Servicio</a>
                        <a href="#" className="hover:text-white/70 transition-colors">Política de Privacidad</a>
                        <a href="#" className="hover:text-white/70 transition-colors">Contacto Ventas</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
