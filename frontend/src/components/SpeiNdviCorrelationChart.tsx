import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

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

  // Custom tooltips
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 shadow-md rounded-lg text-sm min-w-[150px]">
          <p className="font-bold text-slate-700 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => {
             const v = Number(entry.value);
             let colorLabel = "text-slate-600";
             if (v <= -1) colorLabel = "text-red-600";
             else if (v >= 1) colorLabel = "text-blue-600";
             
             return (
               <p key={index} className={`flex justify-between gap-4 font-semibold ${colorLabel}`}>
                 <span>{entry.name}:</span>
                 <span>{v.toFixed(2)}</span>
               </p>
             );
          })}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-[350px] bg-white rounded-2xl border border-slate-100 p-5 shadow-inner mt-4">
      <h4 className="text-sm font-bold text-slate-700 mb-4 border-b border-slate-100 pb-2">Histórico de Estrés Hídrico (Últimos 5 Años)</h4>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
          <XAxis 
            dataKey="date_str" 
            tick={{ fill: '#64748B', fontSize: 10, fontWeight: 500 }} 
            tickMargin={10} 
            axisLine={{ stroke: '#E2E8F0' }} 
            tickLine={false} 
            minTickGap={30}
          />
          <YAxis 
            tick={{ fill: '#64748B', fontSize: 11, fontWeight: 500 }} 
            axisLine={false} 
            tickLine={false} 
            domain={[-3.5, 3.5]}
          />
          <Tooltip content={<CustomTooltip />} cursor={{fill: '#F1F5F9', opacity: 0.4}} />
          <Legend wrapperStyle={{ paddingTop: '10px', fontSize: 12, fontWeight: 600, color: '#475569' }} />
          
          <ReferenceLine y={-1.0} stroke="#EF4444" strokeDasharray="3 3" />
          <ReferenceLine y={1.0} stroke="#3B82F6" strokeDasharray="3 3" />
          <ReferenceLine y={0} stroke="#94A3B8" />

          <Bar dataKey="spei_3" name="SPEI (3 Meses)" radius={[2, 2, 2, 2]} barSize={12}>
            {
              historyData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.spei_3 < 0 ? '#EF4444' : '#3B82F6'} opacity={0.8} />
              ))
            }
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
