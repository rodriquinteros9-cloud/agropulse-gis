import React, { useState } from 'react';
import {
    Wind, Droplets, Thermometer, CloudRain, AlertTriangle, CheckCircle, XCircle,
    Info, FlaskConical, ChevronDown, ShieldCheck, ShieldAlert, ShieldX, Beaker
} from 'lucide-react';

// ─── Fórmula psicrométrica para Temperatura de Bulbo Húmedo ──────────────────
function wetBulbTemp(T: number, RH: number): number {
    return T * Math.atan(0.151977 * Math.pow(RH + 8.313659, 0.5))
        + Math.atan(T + RH)
        - Math.atan(RH - 1.676331)
        + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH)
        - 4.686035;
}

function calcDeltaT(T: number, RH: number): number {
    const Tw = wetBulbTemp(T, RH);
    return parseFloat((T - Tw).toFixed(1));
}

// ─── Tipos ────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warning' | 'danger';

interface Evaluation {
    status: Status;
    label: string;
    detail: string;
    shortName: string;
    icon: React.ReactNode;
}

interface OverallVerdict {
    status: Status;
    title: string;
    message: string;
    actions: string[];
}

// ─── Evaluaciones ────────────────────────────────────────────────────────────
function evaluateWind(speed: number): Evaluation {
    const icon = <Wind size={16} />;
    if (speed < 4) {
        return {
            status: 'danger', label: `${speed.toFixed(1)} km/h`, shortName: 'Viento', icon,
            detail: 'Calma chicha — Alto riesgo de inversión térmica. NO APLICAR.'
        };
    }
    if (speed <= 15) {
        return {
            status: 'ok', label: `${speed.toFixed(1)} km/h`, shortName: 'Viento', icon,
            detail: 'Viento óptimo para pulverización (5–15 km/h).'
        };
    }
    if (speed <= 18) {
        return {
            status: 'warning', label: `${speed.toFixed(1)} km/h`, shortName: 'Viento', icon,
            detail: 'Viento elevado. Aumenta el riesgo de deriva.'
        };
    }
    return {
        status: 'danger', label: `${speed.toFixed(1)} km/h`, shortName: 'Viento', icon,
        detail: `Viento excesivo (>${speed.toFixed(1)} km/h). Riesgo de deriva severo. NO APLICAR.`
    };
}

function evaluateDeltaT(dT: number): Evaluation {
    const icon = <Thermometer size={16} />;
    if (dT < 2) {
        return {
            status: 'warning', label: `ΔT = ${dT}`, shortName: 'ΔT Evaporación', icon,
            detail: 'Humedad muy alta. Gotas en suspensión. Riesgo de endoderiva.'
        };
    }
    if (dT <= 6) {
        return {
            status: 'ok', label: `ΔT = ${dT}`, shortName: 'ΔT Evaporación', icon,
            detail: 'Condiciones ideales. Se puede aplicar solo con agua.'
        };
    }
    if (dT <= 8) {
        return {
            status: 'warning', label: `ΔT = ${dT}`, shortName: 'ΔT Evaporación', icon,
            detail: 'Evaporación moderada. Se necesita coadyuvante.'
        };
    }
    if (dT <= 10) {
        return {
            status: 'warning', label: `ΔT = ${dT}`, shortName: 'ΔT Evaporación', icon,
            detail: 'Evaporación alta. Dosis máxima de aceite. Evaluar postergar.'
        };
    }
    return {
        status: 'danger', label: `ΔT = ${dT}`, shortName: 'ΔT Evaporación', icon,
        detail: 'Ambiente extremadamente seco. Gotas se evaporan antes de llegar al blanco. NO APLICAR.'
    };
}

function evaluateHumidity(rh: number): Evaluation {
    const icon = <Droplets size={16} />;
    if (rh > 85) {
        return {
            status: 'warning', label: `${rh}%`, shortName: 'Humedad', icon,
            detail: 'Humedad muy alta. Posible exceso de rocío y escurrimiento.'
        };
    }
    if (rh >= 50) {
        return { status: 'ok', label: `${rh}%`, shortName: 'Humedad', icon, detail: 'Humedad relativa en rango óptimo.' };
    }
    return { status: 'warning', label: `${rh}%`, shortName: 'Humedad', icon, detail: 'Humedad baja. Verificar ΔT.' };
}

function evaluateTemperature(T: number): Evaluation {
    const icon = <Thermometer size={16} />;
    if (T > 30) {
        return { status: 'warning', label: `${T}°C`, shortName: 'Temperatura', icon, detail: 'Temperatura alta. Riesgo de evaporación.' };
    }
    if (T >= 15) {
        return { status: 'ok', label: `${T}°C`, shortName: 'Temperatura', icon, detail: 'Temperatura en rango óptimo (15–30°C).' };
    }
    if (T >= 10) {
        return { status: 'warning', label: `${T}°C`, shortName: 'Temperatura', icon, detail: 'Temperatura baja. Actividad biológica reducida.' };
    }
    return { status: 'danger', label: `${T}°C`, shortName: 'Temperatura', icon, detail: 'Temperatura muy baja. Condiciones marginales.' };
}

function evaluatePrecipitation(precip: number): Evaluation {
    const icon = <CloudRain size={16} />;
    if (precip > 0) {
        return { status: 'danger', label: `${precip} mm`, shortName: 'Lluvia', icon, detail: 'Lluvia activa. El producto será lavado. NO APLICAR.' };
    }
    return { status: 'ok', label: '0 mm', shortName: 'Lluvia', icon, detail: 'Sin lluvia actual.' };
}

function evaluateThermalInversion(windSpeed: number): Evaluation {
    const icon = <AlertTriangle size={16} />;
    if (windSpeed < 4) {
        return {
            status: 'danger', label: 'RIESGO ALTO', shortName: 'Inversión Térmica', icon,
            detail: 'Viento < 4 km/h indica probable inversión térmica. Gotas pueden viajar hasta 3.5 km.'
        };
    }
    return {
        status: 'ok', label: 'Sin riesgo', shortName: 'Inversión Térmica', icon,
        detail: 'Viento suficiente para descartar inversión térmica.'
    };
}

// ─── Veredicto global ────────────────────────────────────────────────────────
function getOverallVerdict(
    wind: Evaluation, dT: number, tempEval: Evaluation,
    humEval: Evaluation, precip: Evaluation
): OverallVerdict {
    const isDanger = [wind, tempEval, precip].some(e => e.status === 'danger') || dT > 10;

    if (isDanger) {
        const reasons: string[] = [];
        if (wind.status === 'danger') reasons.push('viento fuera de rango');
        if (dT > 10) reasons.push('ΔT > 10 (evaporación extrema)');
        if (precip.status === 'danger') reasons.push('lluvia activa');
        if (tempEval.status === 'danger') reasons.push('temperatura extrema');
        return {
            status: 'danger',
            title: 'NO APLICAR',
            message: `Hay condiciones críticas que impiden la aplicación segura.`,
            actions: reasons.map(r => `⛔ ${r.charAt(0).toUpperCase() + r.slice(1)}`),
        };
    }

    const isWarning = [wind, tempEval, humEval].some(e => e.status === 'warning') || (dT > 6 && dT <= 10);

    if (isWarning) {
        const actions: string[] = [];
        if (dT > 8 && dT <= 10) actions.push('Usar aceite anti-evaporante: 1 L/ha (dosis máxima)');
        else if (dT > 6 && dT <= 8) actions.push('Agregar aceite anti-evaporante: 0.5 L/ha');
        if (wind.status === 'warning') actions.push('Reducir velocidad de avance y usar pastillas antideriva');
        if (humEval.status === 'warning' && humEval.label.includes('%')) {
            const rh = parseInt(humEval.label);
            if (rh > 85) actions.push('Esperar que baje el rocío antes de salir');
            else actions.push('Complementar con coadyuvante humectante');
        }
        if (tempEval.status === 'warning') actions.push('Preferir horario temprano o tardío');
        if (actions.length === 0) actions.push('Extremar precauciones y monitorear durante la aplicación');

        return {
            status: 'warning',
            title: 'SE PUEDE APLICAR',
            message: 'Las condiciones son aceptables si seguís estas recomendaciones:',
            actions,
        };
    }

    return {
        status: 'ok',
        title: 'CONDICIONES ÓPTIMAS',
        message: 'Todos los parámetros están en rango ideal.',
        actions: ['Se puede aplicar solo con agua, sin coadyuvantes adicionales.'],
    };
}

// ─── Componente Principal ────────────────────────────────────────────────────
interface Props {
    weatherData: {
        temperature: number;
        humidity: number;
        wind_speed: number;
        dew_point?: number;
        precipitation?: number;
    };
}

export default function PhytosanitaryAdvisor({ weatherData }: Props) {
    const [showDetail, setShowDetail] = useState(false);

    const T = weatherData.temperature;
    const RH = weatherData.humidity;
    const wind = weatherData.wind_speed;
    const precip = weatherData.precipitation ?? 0;
    const dT = calcDeltaT(T, RH);

    const windEval = evaluateWind(wind);
    const dtEval = evaluateDeltaT(dT);
    const humEval = evaluateHumidity(RH);
    const tempEval = evaluateTemperature(T);
    const precipEval = evaluatePrecipitation(precip);
    const invEval = evaluateThermalInversion(wind);
    const allEvals = [windEval, dtEval, humEval, tempEval, precipEval, invEval];

    const verdict = getOverallVerdict(windEval, dT, tempEval, humEval, precipEval);

    const alertEvals = allEvals.filter(e => e.status !== 'ok');
    const okCount = allEvals.filter(e => e.status === 'ok').length;

    // ── Semáforo config ──
    const semaphoreConfig = {
        ok: {
            gradient: 'from-emerald-500 to-emerald-600',
            glow: '0 0 40px rgba(16, 185, 129, 0.3), 0 0 80px rgba(16, 185, 129, 0.1)',
            icon: <ShieldCheck size={48} className="text-white" strokeWidth={1.8} />,
            ring: 'ring-emerald-400/30',
            subtitleColor: 'text-emerald-100',
        },
        warning: {
            gradient: 'from-amber-500 to-orange-500',
            glow: '0 0 40px rgba(245, 158, 11, 0.3), 0 0 80px rgba(245, 158, 11, 0.1)',
            icon: <ShieldAlert size={48} className="text-white" strokeWidth={1.8} />,
            ring: 'ring-amber-400/30',
            subtitleColor: 'text-amber-100',
        },
        danger: {
            gradient: 'from-red-500 to-red-600',
            glow: '0 0 40px rgba(239, 68, 68, 0.3), 0 0 80px rgba(239, 68, 68, 0.1)',
            icon: <ShieldX size={48} className="text-white" strokeWidth={1.8} />,
            ring: 'ring-red-400/30',
            subtitleColor: 'text-red-100',
        },
    };
    const sc = semaphoreConfig[verdict.status];

    return (
        <div className="phyto-advisor rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            {/* ═══════════════════════════════════════════════════════════
                SECTION 1 — Big Semaphore Verdict
               ═══════════════════════════════════════════════════════════ */}
            <div
                className={`bg-gradient-to-r ${sc.gradient} px-8 py-8 relative overflow-hidden`}
                style={{ boxShadow: sc.glow }}
            >
                {/* Subtle pattern overlay */}
                <div className="absolute inset-0 opacity-[0.04]"
                     style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

                <div className="relative flex items-center gap-6">
                    {/* Icon */}
                    <div className={`shrink-0 p-4 rounded-2xl bg-white/15 ring-2 ${sc.ring} backdrop-blur-sm`}>
                        {sc.icon}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                            <FlaskConical size={16} className="text-white/70" />
                            <span className="text-white/70 text-xs font-bold uppercase tracking-widest">
                                Aptitud para Pulverización
                            </span>
                        </div>
                        <h2 className="text-3xl font-extrabold text-white tracking-tight">
                            {verdict.title}
                        </h2>
                        <p className={`text-sm mt-1 font-medium ${sc.subtitleColor}`}>
                            {verdict.message}
                        </p>
                    </div>

                    {/* Mini-semaphore dots */}
                    <div className="shrink-0 flex flex-col gap-2 items-center">
                        {['danger', 'warning', 'ok'].map((s) => (
                            <div
                                key={s}
                                className={`w-5 h-5 rounded-full border-2 transition-all duration-300 ${
                                    verdict.status === s
                                        ? 'border-white scale-125 shadow-lg ' + (
                                            s === 'ok' ? 'bg-emerald-300' :
                                            s === 'warning' ? 'bg-amber-300' : 'bg-red-300'
                                          )
                                        : 'border-white/20 bg-white/10'
                                }`}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════
                SECTION 2 — Action items (what to DO)
               ═══════════════════════════════════════════════════════════ */}
            <div className="bg-white px-8 py-6 border-b border-gray-100">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                    {verdict.status === 'ok' ? <CheckCircle size={12} className="text-emerald-500" /> :
                     verdict.status === 'warning' ? <Beaker size={12} className="text-amber-500" /> :
                     <XCircle size={12} className="text-red-500" />}
                    {verdict.status === 'danger' ? 'Motivos para no aplicar' : 'Qué hacer'}
                </p>
                <div className="space-y-2">
                    {verdict.actions.map((action, i) => (
                        <div
                            key={i}
                            className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
                                verdict.status === 'ok'
                                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                                    : verdict.status === 'warning'
                                    ? 'bg-amber-50 text-amber-800 border border-amber-100'
                                    : 'bg-red-50 text-red-800 border border-red-100'
                            }`}
                        >
                            <span className="text-base leading-none mt-0.5">
                                {verdict.status === 'ok' ? '✅' : verdict.status === 'warning' ? '👉' : '⛔'}
                            </span>
                            <span>{action}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════
                SECTION 3 — Alert summary (only troubled variables)
               ═══════════════════════════════════════════════════════════ */}
            <div className="bg-slate-50/50 px-8 py-5">
                {/* Green parameters summary */}
                {okCount > 0 && (
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                        <span className="text-sm font-semibold text-slate-500">
                            {okCount === allEvals.length
                                ? 'Todos los parámetros en rango óptimo'
                                : `${okCount} de ${allEvals.length} parámetros en rango óptimo`
                            }
                        </span>
                    </div>
                )}

                {/* Alert cards — only non-ok */}
                {alertEvals.length > 0 && (
                    <div className="space-y-2">
                        {alertEvals.map((ev, i) => {
                            const isD = ev.status === 'danger';
                            return (
                                <div
                                    key={i}
                                    className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
                                        isD ? 'bg-red-50/80 border-red-200' : 'bg-amber-50/80 border-amber-200'
                                    }`}
                                >
                                    <div className={`shrink-0 ${isD ? 'text-red-500' : 'text-amber-500'}`}>
                                        {ev.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-bold ${isD ? 'text-red-700' : 'text-amber-700'}`}>
                                                {ev.shortName}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                isD ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                                            }`}>
                                                {ev.label}
                                            </span>
                                        </div>
                                        <p className={`text-xs mt-0.5 ${isD ? 'text-red-600/80' : 'text-amber-600/80'}`}>
                                            {ev.detail}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════════
                SECTION 4 — Collapsible full detail (for the agronomist)
               ═══════════════════════════════════════════════════════════ */}
            <div className="border-t border-gray-100">
                <button
                    onClick={() => setShowDetail(!showDetail)}
                    className="w-full flex items-center justify-between px-8 py-4 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                >
                    <span className="flex items-center gap-2">
                        <Info size={14} />
                        Análisis técnico completo
                    </span>
                    <ChevronDown
                        size={16}
                        className={`transition-transform duration-300 ${showDetail ? 'rotate-180' : ''}`}
                    />
                </button>

                {showDetail && (
                    <div className="px-8 pb-6 space-y-5 animate-fade-in">
                        {/* Full parameter grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {allEvals.map((ev, i) => {
                                const c = ev.status === 'ok'
                                    ? { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', badge: 'bg-green-100 text-green-600' }
                                    : ev.status === 'warning'
                                    ? { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100 text-amber-600' }
                                    : { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', badge: 'bg-red-100 text-red-600' };
                                return (
                                    <div key={i} className={`rounded-xl border p-3 ${c.bg} ${c.border}`}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className={`text-xs font-bold ${c.text} flex items-center gap-1.5`}>
                                                {ev.icon} {ev.shortName}
                                            </span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.badge}`}>
                                                {ev.label}
                                            </span>
                                        </div>
                                        <p className={`text-[11px] leading-relaxed ${c.text} opacity-80`}>{ev.detail}</p>
                                    </div>
                                );
                            })}
                        </div>

                        {/* ΔT reference table */}
                        <div className="overflow-x-auto rounded-xl border border-gray-100">
                            <table className="w-full text-xs text-left">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="px-3 py-2 font-semibold text-gray-600">ΔT</th>
                                        <th className="px-3 py-2 font-semibold text-gray-600">Condición</th>
                                        <th className="px-3 py-2 font-semibold text-gray-600">Recomendación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    <tr className={dT < 2 ? 'bg-amber-100 font-semibold' : 'bg-amber-50'}>
                                        <td className="px-3 py-2 font-bold text-amber-700">&lt; 2</td>
                                        <td className="px-3 py-2 text-amber-700">Marginal</td>
                                        <td className="px-3 py-2 text-gray-700">Gotas en suspensión. Riesgo de deriva y escurrimiento.</td>
                                    </tr>
                                    <tr className={dT >= 2 && dT <= 6 ? 'bg-green-100 font-semibold' : 'bg-green-50'}>
                                        <td className="px-3 py-2 font-bold text-green-700">2 – 6</td>
                                        <td className="px-3 py-2 text-green-700">Óptima</td>
                                        <td className="px-3 py-2 text-gray-700">Aplicar con agua. Condiciones ideales.</td>
                                    </tr>
                                    <tr className={dT > 6 && dT <= 8 ? 'bg-amber-100 font-semibold' : 'bg-amber-50'}>
                                        <td className="px-3 py-2 font-bold text-amber-700">6 – 8</td>
                                        <td className="px-3 py-2 text-amber-700">Precaución</td>
                                        <td className="px-3 py-2 text-gray-700">Agregar aceite anti-evaporante: <strong>0.5 L/ha</strong>.</td>
                                    </tr>
                                    <tr className={dT > 8 && dT <= 10 ? 'bg-orange-100 font-semibold' : 'bg-orange-50'}>
                                        <td className="px-3 py-2 font-bold text-orange-700">8 – 10</td>
                                        <td className="px-3 py-2 text-orange-700">Marginal</td>
                                        <td className="px-3 py-2 text-gray-700">Dosis máxima de aceite: <strong>1 L/ha</strong>. Postergar si es posible.</td>
                                    </tr>
                                    <tr className={dT > 10 ? 'bg-red-100 font-semibold' : 'bg-red-50'}>
                                        <td className="px-3 py-2 font-bold text-red-700">&gt; 10</td>
                                        <td className="px-3 py-2 text-red-700">Prohibida</td>
                                        <td className="px-3 py-2 text-gray-700">Evaporación extrema. NO APLICAR.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
