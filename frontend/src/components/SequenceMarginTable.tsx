import { useMemo, useState } from 'react';
import { Layers, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface CropCalc {
  id: string;
  name: string;
  precioNetoQq: number;
  costosTotalesUsdHa: number;
  riQq: number;
  rindeMedio: number;
}

interface SequenceMarginTableProps {
  cropCalcs: CropCalc[];
}

export default function SequenceMarginTable({ cropCalcs }: SequenceMarginTableProps) {
  const [costoBarbechoMaiz, setCostoBarbechoMaiz] = useState<number>(150);
  const [costoBarbechoSoja, setCostoBarbechoSoja] = useState<number>(80);

  const [yieldOverrides, setYieldOverrides] = useState<Record<string, number>>({});
  const [isYieldsExpanded, setIsYieldsExpanded] = useState<boolean>(false);

  const margins = useMemo(() => {
    const calcMB = (id: string) => {
      const crop = cropCalcs.find((c) => c.id === id);
      if (!crop) return 0;
      const rinde = yieldOverrides[id] !== undefined ? yieldOverrides[id] : crop.rindeMedio;
      return rinde * crop.precioNetoQq - crop.costosTotalesUsdHa;
    };

    const mbMaiz = calcMB('Maíz');
    const mbSoja1 = calcMB('Soja');
    const mbSoja2 = calcMB('Soja Segunda');
    const mbTrigo = calcMB('Trigo');

    const seqBarbechoMaiz = mbMaiz - costoBarbechoMaiz;
    const seqBarbechoSoja = mbSoja1 - costoBarbechoSoja;
    const avgBarbecho = (seqBarbechoMaiz + seqBarbechoSoja) / 2;

    const seqTrigoMaiz = mbTrigo + mbMaiz; // Idealmente sería Maíz de Segunda, pero usamos Maíz
    const seqTrigoSoja = mbTrigo + mbSoja2;
    const avgTrigo = (seqTrigoMaiz + seqTrigoSoja) / 2;

    return {
      mbTrigo,
      mbSoja1,
      mbSoja2,
      mbMaiz,
      seqBarbechoMaiz,
      seqBarbechoSoja,
      avgBarbecho,
      seqTrigoMaiz,
      seqTrigoSoja,
      avgTrigo,
    };
  }, [cropCalcs, costoBarbechoMaiz, costoBarbechoSoja, yieldOverrides]);

  const cellClass = (val: number) => {
    if (val >= 100) return 'text-cyan-700 bg-cyan-50';
    if (val >= 0) return 'text-cyan-600 bg-cyan-50/50';
    if (val > -100) return 'text-amber-600 bg-amber-50';
    return 'text-rose-700 bg-rose-50';
  };

  const formatUsd = (val: number) => {
    return `${val >= 0 ? '+' : ''}$${Math.round(val)}`;
  };

  const renderYieldInput = (cropId: string, label: string) => {
    const crop = cropCalcs.find(c => c.id === cropId);
    if (!crop) return null;
    const isOverride = yieldOverrides[cropId] !== undefined;

    return (
      <div className="flex justify-between items-center bg-white p-1.5 rounded-lg border border-slate-200">
        <span className="text-[10px] font-bold text-slate-600 pl-1">{label}</span>
        <div className="relative w-16">
          <input
            type="number"
            value={isOverride ? yieldOverrides[cropId] : ''}
            placeholder={crop.rindeMedio.toString()}
            onChange={(e) => {
              const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
              setYieldOverrides(prev => {
                const next = { ...prev };
                if (val === undefined) delete next[cropId];
                else next[cropId] = val;
                return next;
              });
            }}
            className={`w-full text-right px-1.5 py-1 text-xs font-bold rounded focus:outline-none focus:ring-1 transition-colors ${
              isOverride ? 'bg-amber-100/50 text-amber-700 border-amber-300 ring-amber-400' : 'bg-slate-50 text-slate-700 border-transparent hover:bg-slate-100 ring-indigo-500'
            }`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 relative z-10 border-t border-slate-200/60 break-inside-avoid">
      <div className="flex flex-col gap-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white text-xs font-black shadow-sm">4</div>
            <div>
              <h4 className="text-base font-extrabold text-slate-800">Margen Esperado en Secuencias</h4>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Comparación de rentabilidad (USD/ha) entre hacer cultivo único con barbecho vs. doble cultivo.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-6">
          {/* Panel Izquierdo: Configuración */}
          <div className="w-full xl:w-64 shrink-0 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-5">
            {/* Sección Costos de Barbecho */}
            <div className="flex flex-col gap-3">
              <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2 mb-1">
                <Layers size={14} className="text-indigo-500" />
                Costos del Barbecho
              </h5>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Para Maíz (USD/ha)
                </label>
                <input
                  type="number"
                  value={costoBarbechoMaiz}
                  onChange={(e) => setCostoBarbechoMaiz(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Para Soja (USD/ha)
                </label>
                <input
                  type="number"
                  value={costoBarbechoSoja}
                  onChange={(e) => setCostoBarbechoSoja(Number(e.target.value))}
                  className="w-full bg-white border border-slate-200 text-xs font-bold text-slate-700 rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="h-px bg-slate-200/60 w-full" />

            {/* Sección Rindes Esperados (Colapsable) */}
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setIsYieldsExpanded(!isYieldsExpanded)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1 hover:text-indigo-600 transition-colors focus:outline-none"
              >
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-amber-500" />
                  Rindes Esperados (qq/ha)
                </div>
                {isYieldsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              
              {isYieldsExpanded && (
                <div className="flex flex-col gap-2 transition-all duration-200 ease-out">
                  {renderYieldInput('Trigo', 'Trigo')}
                  {renderYieldInput('Maíz', 'Maíz')}
                  {renderYieldInput('Soja', 'Soja 1ra')}
                  {renderYieldInput('Soja Segunda', 'Soja 2da')}
                </div>
              )}
            </div>

          </div>

          {/* Panel Derecho: Matriz */}
          <div className="flex-1 overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-5 py-3 border-b border-r border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/4">
                    Cultivo
                  </th>
                  <th className="px-5 py-3 border-b border-r border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider text-center w-1/4">
                    Maíz
                  </th>
                  <th className="px-5 py-3 border-b border-r border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider text-center w-1/4">
                    Soja
                  </th>
                  <th className="px-5 py-3 border-b border-slate-200 text-xs font-black text-indigo-700 uppercase tracking-wider text-center w-1/4 bg-indigo-50/50">
                    Promedio
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-5 py-4 border-b border-r border-slate-200 text-sm font-bold text-slate-600 bg-slate-50/50 flex flex-col gap-0.5">
                    <span>Barbecho</span>
                    <span className="text-[10px] font-medium text-slate-400 normal-case">Sin ingresos</span>
                  </td>
                  <td className={`px-5 py-4 border-b border-r border-slate-200 text-center font-bold text-[15px] ${cellClass(margins.seqBarbechoMaiz)}`}>
                    {formatUsd(margins.seqBarbechoMaiz)}
                  </td>
                  <td className={`px-5 py-4 border-b border-r border-slate-200 text-center font-bold text-[15px] ${cellClass(margins.seqBarbechoSoja)}`}>
                    {formatUsd(margins.seqBarbechoSoja)}
                  </td>
                  <td className={`px-5 py-4 border-b border-slate-200 text-center font-black text-[15px] ${cellClass(margins.avgBarbecho)} ring-1 ring-inset ring-slate-100`}>
                    {formatUsd(margins.avgBarbecho)}
                  </td>
                </tr>
                <tr>
                  <td className="px-5 py-4 border-r border-slate-200 text-sm font-bold text-slate-600 bg-slate-50/50 flex flex-col gap-0.5">
                    <span>Trigo</span>
                    <span className="text-[10px] font-medium text-slate-400 normal-case w-max">Secuencia doble</span>
                  </td>
                  <td className={`px-5 py-4 border-r border-slate-200 text-center font-bold text-[15px] ${cellClass(margins.seqTrigoMaiz)}`}>
                    {formatUsd(margins.seqTrigoMaiz)}
                  </td>
                  <td className={`px-5 py-4 border-r border-slate-200 text-center font-bold text-[15px] ${cellClass(margins.seqTrigoSoja)}`}>
                    {formatUsd(margins.seqTrigoSoja)}
                  </td>
                  <td className={`px-5 py-4 text-center font-black text-[15px] ${cellClass(margins.avgTrigo)} ring-1 ring-inset ring-slate-100`}>
                    {formatUsd(margins.avgTrigo)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
