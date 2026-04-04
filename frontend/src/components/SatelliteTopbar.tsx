import React from 'react';
import { Cloud } from 'lucide-react';
import type { IndiceSatelital } from '../types/satellite';

interface SatelliteTopbarProps {
  lotName: string;
  lotArea: number;
  cropType?: string;
  location?: string;
  selectedIdx: IndiceSatelital;
  onChangeIdx: (idx: IndiceSatelital) => void;
  cloudFilterPct: number;
}

const SatelliteTopbar: React.FC<SatelliteTopbarProps> = ({
  lotName,
  lotArea,
  cropType = 'Cultivo',
  location = 'Ubicación local',
  selectedIdx,
  onChangeIdx,
  cloudFilterPct
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between p-3 bg-white border-b border-slate-200 gap-3 rounded-t-xl">
      <div className="flex items-center gap-3">
        <div className="w-2.5 h-2.5 rounded-full bg-[#639922] shrink-0" />
        <div>
          <div className="text-sm font-semibold text-slate-800">{lotName}</div>
          <div className="text-xs text-slate-500">
            {cropType} · {lotArea.toFixed(2)} ha · {location}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <select
          value={selectedIdx}
          onChange={(e) => onChangeIdx(e.target.value as IndiceSatelital)}
          className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none shadow-sm cursor-pointer"
        >
          <option value="NDVI">NDVI — vigor vegetativo</option>
          <option value="NDVI_C">NDVI contrastado</option>
          <option value="EVI">EVI — índice mejorado</option>
          <option value="NDRE">NDRE — clorofila</option>
        </select>
        
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Cloud size={14} className="text-slate-400" />
          &lt; {cloudFilterPct}% nubes
        </div>
      </div>
    </div>
  );
};

export default SatelliteTopbar;
