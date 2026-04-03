import React from 'react';
import { Droplets, Sprout, SunMedium, TrendingUp, Tractor, ShieldAlert, CircleDollarSign, Info } from 'lucide-react';

interface SpeiCurrent {
  spei_1: number;
  spei_3: number;
  spei_6: number;
  date: string;
}

export default function SpeiDecisionBoard({ speiCurrent }: { speiCurrent: SpeiCurrent }) {
  if (!speiCurrent) return null;

  const { spei_1, spei_3, spei_6 } = speiCurrent;

  // Helpers
  const getSpeiClass = (val: number) => {
    if (val <= -2) return "bg-red-50 text-red-700 border-red-200";
    if (val <= -1) return "bg-orange-50 text-orange-700 border-orange-200";
    if (val <= -0.5) return "bg-amber-50 text-amber-700 border-amber-200";
    if (val > 1.5) return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  const statusText = (val: number) => {
    if (val <= -2) return "Sequía Extrema";
    if (val <= -1) return "Sequía Moderada";
    if (val <= -0.5) return "Déficit Leve";
    if (val > 1.5) return "Exceso Hídrico";
    return "Normal / Óptimo";
  };

  // Decisions
  // Estrés Vegetativo (Secano)
  const estresAlert = (spei_1 <= -1 || spei_3 <= -1) 
    ? { title: "Estrés Vegetativo Alto", bg: "bg-red-500", text: "text-white", icon: SunMedium, msg: "Déficit hídrico detectado. Evaluar impacto en períodos críticos y ajustar fertilización tardía." }
    : { title: "Reservas Activas Óptimas", bg: "bg-slate-100", text: "text-slate-600", icon: Droplets, msg: "Humedad superficial adecuada para sostener el crecimiento vegetativo actual." };

  // Siembra
  const siembraAlert = (spei_6 >= -0.5 && spei_3 >= -0.5)
    ? { title: "Perfil Recargado", bg: "bg-emerald-500", text: "text-white", icon: Sprout, msg: "Condiciones óptimas de humedad profunda para siembra o implantación." }
    : { title: "Perfil Deficiente", bg: "bg-orange-500", text: "text-white", icon: Sprout, msg: "Poca reserva de agua. Aumenta riesgo en la germinación." };

  // Tránsito / Excesos
  const pisoAlert = (spei_1 > 1.0)
    ? { title: "Alerta Excesos / Piso", bg: "bg-blue-500", text: "text-white", icon: Tractor, msg: "Alta retención de humedad. Posible déficit de oxígeno radicular y problemas de piso para maquinaria." }
    : { title: "Tránsito y Piso Firme", bg: "bg-slate-100", text: "text-slate-600", icon: Tractor, msg: "La macroporosidad permite una recesión normal y suelo firme para ingresos." };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4 mb-4">
          <div className={`p-4 rounded-xl border shadow-sm flex flex-col items-center justify-center text-center ${getSpeiClass(spei_1)}`}>
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-80 mb-1">Capa Superficial (1 Mes)</span>
              <span className="text-lg md:text-xl font-extrabold leading-tight">{statusText(spei_1)}</span>
              <span className="text-[11px] font-semibold mt-1 opacity-75">Índice Clima: {spei_1.toFixed(2)}</span>
          </div>
          <div className={`p-4 rounded-xl border shadow-sm flex flex-col items-center justify-center text-center ${getSpeiClass(spei_3)}`}>
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-80 mb-1">Raíz Activa (3 Meses)</span>
              <span className="text-lg md:text-xl font-extrabold leading-tight">{statusText(spei_3)}</span>
              <span className="text-[11px] font-semibold mt-1 opacity-75">Índice Clima: {spei_3.toFixed(2)}</span>
          </div>
          <div className={`p-4 rounded-xl border shadow-sm flex flex-col items-center justify-center text-center ${getSpeiClass(spei_6)}`}>
              <span className="text-[10px] font-bold uppercase tracking-wide opacity-80 mb-1">Recarga Perfil (6 Meses)</span>
              <span className="text-lg md:text-xl font-extrabold leading-tight">{statusText(spei_6)}</span>
              <span className="text-[11px] font-semibold mt-1 opacity-75">Índice Clima: {spei_6.toFixed(2)}</span>
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={`p-5 rounded-2xl flex flex-col ${estresAlert.bg} ${estresAlert.text} transition-all`}>
              <div className="flex items-center gap-2 mb-3">
                  <estresAlert.icon size={20} />
                  <h4 className="font-bold text-sm tracking-wide uppercase">{estresAlert.title}</h4>
              </div>
              <p className="text-sm font-medium opacity-90">{estresAlert.msg}</p>
          </div>
          <div className={`p-5 rounded-2xl flex flex-col ${siembraAlert.bg} ${siembraAlert.text} transition-all`}>
              <div className="flex items-center gap-2 mb-3">
                  <siembraAlert.icon size={20} />
                  <h4 className="font-bold text-sm tracking-wide uppercase">{siembraAlert.title}</h4>
              </div>
              <p className="text-sm font-medium opacity-90">{siembraAlert.msg}</p>
          </div>
          <div className={`p-5 rounded-2xl flex flex-col ${pisoAlert.bg} ${pisoAlert.text} transition-all`}>
              <div className="flex items-center gap-2 mb-3">
                  <pisoAlert.icon size={20} />
                  <h4 className="font-bold text-sm tracking-wide uppercase">{pisoAlert.title}</h4>
              </div>
              <p className="text-sm font-medium opacity-90">{pisoAlert.msg}</p>
          </div>
      </div>
      
      {/* Alerta temprana de sequía: SPEI-1 muy por debajo de SPEI-3 (secamiento rápido) */}
      {spei_1 < spei_3 - 0.5 && spei_1 < 0 && (
          <div className="mt-2 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-3">
              <SunMedium className="text-orange-500 mt-0.5" size={20} />
              <div>
                  <h4 className="font-bold text-sm text-orange-800">Alerta Temprana de Sequía</h4>
                  <p className="text-sm text-orange-700 font-medium mt-1">
                      El balance superficial (1 Mes) está cayendo más rápido que las reservas profundas (3 Meses). 
                      Vas a notar pérdida de turgencia visible en el cultivo en los próximos 10-15 días si no llueve.
                  </p>
              </div>
          </div>
      )}
    </div>
  );
}
