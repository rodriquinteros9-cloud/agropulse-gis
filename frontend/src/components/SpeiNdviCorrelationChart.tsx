import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface SpeiHistoryItem {
  year: number;
  month: number;
  spei_1: number;
  spei_3: number;
  spei_6: number;
  date_str: string;
}

export default function SpeiNdviCorrelationChart({ historyData }: { historyData: SpeiHistoryItem[] }) {
  if (!historyData || historyData.length === 0) return null;

  const getSpeiColor = (v: number) => {
    if (v <= -1.5) return '#C45A30'; // extrema
    if (v <= -1.0) return '#EF9F27'; // severa
    if (v <= -0.5) return '#FAC775'; // moderada
    if (v <= 0.5)  return '#C0DD97'; // normal
    return '#5DCAA5';                // exceso
  };

  const getCategory = (v: number) => {
    if (v <= -1.5) return 'Sequía extrema';
    if (v <= -1.0) return 'Sequía severa';
    if (v <= -0.5) return 'Sequía moderada';
    if (v <= 0.5)  return 'Normal';
    return 'Exceso hídrico';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const v = Number(payload[0].value);
      return (
        <div className="bg-slate-900 border border-slate-700 p-3 shadow-xl rounded-lg text-sm min-w-[150px]">
          <p className="font-semibold text-slate-300 mb-1">{label}</p>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getSpeiColor(v) }}></div>
            <p className="font-bold text-white">
              SPEI-3: {v.toFixed(2)}
            </p>
          </div>
          <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">{getCategory(v)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="font-sans">
      <div className="text-[11px] font-medium tracking-wider uppercase text-slate-500 mb-3 mt-2">Capa 3 — Evolución de los últimos 5 años</div>
      
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-6 gap-4">
          <div>
            <h4 className="text-sm font-bold text-slate-800 mb-1">Trayectoria hídrica del lote</h4>
            <div className="text-xs font-medium text-slate-400">SPEI-3 mensual (60 meses)</div>
          </div>
          
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#C45A30]"></div>Extrema/Severa</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#FAC775]"></div>Moderada</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#C0DD97]"></div>Normal</div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-[#5DCAA5]"></div>Exceso</div>
          </div>
        </div>

        <div className="w-full h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={historyData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.06)" />
              <XAxis 
                dataKey="date_str" 
                tick={{ fill: 'rgba(0,0,0,0.4)', fontSize: 10, fontWeight: 500 }} 
                tickMargin={10} 
                axisLine={{ stroke: 'rgba(0,0,0,0.1)' }} 
                tickLine={false} 
                minTickGap={30}
              />
              <YAxis 
                tick={{ fill: 'rgba(0,0,0,0.4)', fontSize: 10, fontWeight: 500 }} 
                axisLine={false} 
                tickLine={false} 
                domain={[-3.5, 3.5]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{fill: 'rgba(0,0,0,0.03)'}} />
              
              <ReferenceLine y={0} stroke="rgba(0,0,0,0.2)" strokeDasharray="4 4" />

              <Bar dataKey="spei_3" radius={[3, 3, 3, 3]} barSize={12}>
                {
                  historyData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getSpeiColor(entry.spei_3)} />
                  ))
                }
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
