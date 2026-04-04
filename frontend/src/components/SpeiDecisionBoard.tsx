import React, { useState } from 'react';

interface SpeiCurrent {
  spei_1: number;
  spei_3: number;
  spei_6: number;
  date: string;
  percentile_3: number;
  median_spei_3: number;
  analogues: number[];
  total_years: number;
  history_start: number;
}

export default function SpeiDecisionBoard({ speiCurrent }: { speiCurrent: SpeiCurrent }) {
  const [activeScale, setActiveScale] = useState<1 | 3 | 6>(3);

  if (!speiCurrent) return null;

  const currentVal = speiCurrent[`spei_${activeScale}`];

  // Colors & Text based on HTML CSS
  const getStatus = (v: number) => {
    if (v <= -1.5) return { text: "Sequía Extrema", color: "#C45A30", textCol: "#712B13", bg: "#FBECE7" };
    if (v <= -1.0) return { text: "Sequía Severa", color: "#EF9F27", textCol: "#633806", bg: "#FEF3E2" };
    if (v <= -0.5) return { text: "Sequía Moderada", color: "#FAC775", textCol: "#633806", bg: "#FFF9F0" };
    if (v <= 0.5) return { text: "Normal", color: "#C0DD97", textCol: "#27500A", bg: "#F4FBF0" };
    if (v <= 1.5) return { text: "Exceso Leve", color: "#5DCAA5", textCol: "#085041", bg: "#EAF7F3" };
    return { text: "Exceso Hídrico", color: "#2B8266", textCol: "#04382B", bg: "#E0F2EC" };
  };

  const status = getStatus(currentVal);
  const status3 = getStatus(speiCurrent.spei_3);

  const pct = speiCurrent.percentile_3;

  return (
    <div className="flex flex-col gap-6 font-sans">
      
      {/* CAPA 1 */}
      <div>
        <div className="text-[11px] font-medium tracking-wider uppercase text-slate-500 mb-3">Capa 1 — Diagnóstico Actual</div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 flex items-center gap-5">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div 
                className="flex items-center gap-2 rounded-full px-3 py-1.5" 
                style={{ backgroundColor: status.bg }}
              >
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: status.color }}></div>
                <span className="text-[13px] font-semibold" style={{ color: status.textCol }}>{status.text}</span>
              </div>
              <div className="flex gap-1.5">
                {[1, 3, 6].map((sc) => (
                  <button 
                    key={sc}
                    onClick={() => setActiveScale(sc as 1|3|6)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      activeScale === sc 
                        ? 'bg-slate-100 text-slate-900 border-slate-300 font-bold shadow-sm' 
                        : 'bg-transparent text-slate-500 border-slate-200 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    SPEI-{sc}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[15px] text-slate-800 leading-relaxed font-medium">
              El balance hídrico de los últimos <strong>{activeScale} meses</strong> presenta un escenario de <strong style={{color: status.textCol}}>{status.text.toLowerCase()}</strong>. 
              Estadísticamente se ubica en el <strong>percentil {speiCurrent.percentile_3}</strong> de la serie de datos ({speiCurrent.history_start}–2026), considerando siempre esta misma época del año.
            </p>
          </div>
        </div>
      </div>

      {/* CAPA 2 */}
      <div>
        <div className="text-[11px] font-medium tracking-wider uppercase text-slate-500 mb-3">Capa 2 — Contexto Histórico</div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">SPEI-3 actual</div>
            <div className="text-2xl font-extrabold" style={{ color: status3.color === '#C0DD97' ? '#27500A' : status3.color }}>
               {speiCurrent.spei_3 > 0 ? '+' : ''}{speiCurrent.spei_3.toFixed(2)}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-1">{status3.text}</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Percentil histórico</div>
            <div className="text-2xl font-extrabold" style={{ color: status3.color === '#C0DD97' ? '#27500A' : status3.color }}>
               {speiCurrent.percentile_3}°
            </div>
            <div className="text-xs font-medium text-slate-500 mt-1">De {speiCurrent.total_years} años analizados</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Años similares</div>
            <div className="text-2xl font-extrabold text-slate-800">
               {speiCurrent.analogues.length}
            </div>
            <div className="text-xs font-medium text-slate-500 mt-1">{speiCurrent.analogues.join(', ')}</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="text-sm font-bold text-slate-800 mb-1">¿Qué tan extremo es este período comparado con la historia?</div>
          <div className="text-xs font-medium text-slate-400 mb-5">Posición del año actual sobre la distribución acumulada de los últimos {speiCurrent.total_years} años.</div>

          <div className="relative h-7 rounded overflow-hidden mb-2 flex">
            <div className="h-full flex items-center justify-center text-[10px] font-bold text-[#712B13] bg-[#C45A30]" style={{ width: '10%' }}>Ext.</div>
            <div className="h-full flex items-center justify-center text-[10px] font-bold text-[#633806] bg-[#EF9F27]" style={{ width: '15%' }}>Sev.</div>
            <div className="h-full flex items-center justify-center text-[10px] font-bold text-[#633806] bg-[#FAC775]" style={{ width: '25%' }}>Mod.</div>
            <div className="h-full flex items-center justify-center text-[10px] font-bold text-[#27500A] bg-[#C0DD97]" style={{ width: '30%' }}>Normal</div>
            <div className="h-full flex items-center justify-center text-[10px] font-bold text-[#085041] bg-[#5DCAA5]" style={{ width: '20%' }}>Exceso</div>
            
            {/* Marker */}
            <div className="absolute top-0 bottom-0 pointer-events-none transition-all duration-700 ease-in-out" style={{ left: `${pct}%`, transform: 'translateX(-50%)' }}>
              <div className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[7px] border-l-transparent border-r-[7px] border-r-transparent border-t-[9px] border-t-slate-800"></div>
              <div className="h-full w-[2px] bg-slate-800 mx-auto"></div>
            </div>
          </div>

          <div className="flex justify-between text-[11px] font-semibold text-slate-400 mt-1 mb-4">
            <span>Más seco (p0)</span>
            <span>p25</span>
            <span>p50 (Mediana)</span>
            <span>p75</span>
            <span>Más húmedo (p100)</span>
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full border border-[#FAC775] bg-[#FEF3E2] text-[#633806]">
              {pct} de cada 100 años fueron más secos que este.
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 bg-slate-50">
              Análogo histórico: {speiCurrent.analogues[0] || 'N/A'}
            </span>
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 text-slate-600 bg-slate-50">
              Centro Histórico: {speiCurrent.median_spei_3 > 0 ? '+' : ''}{speiCurrent.median_spei_3.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
