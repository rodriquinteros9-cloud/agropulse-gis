import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://127.0.0.1:8000/api';

export interface ENSOChartPoint {
    name: string;
    oni?: number | null;
    roni?: number | null;
    dyn?: number | null;
    dynMin?: number | null;
    dynMax?: number | null;
    stat?: number | null;
    statMin?: number | null;
    statMax?: number | null;
    type: 'observed' | 'forecast';
}

export interface ENSOMetadata {
    phase: string;
    currentONI: number | null;
    trend: string;
    intensity: string;
    lastUpdate: string;
    numDynamicModels: number;
    numStatisticalModels: number;
    dataSource: string;
}

export interface ENSOData {
    chartData: ENSOChartPoint[];
    metadata: ENSOMetadata;
}

// ── Datos de pronóstico IRI de referencia (IRI Marzo 2026, actualizar mensualmente) ──
const FALLBACK_FORECAST: ENSOChartPoint[] = [
    { name: 'JFM 26', dyn: -0.21, dynMin: -0.50, dynMax: 0.10, stat: -0.33, statMin: -0.55, statMax: -0.10, type: 'forecast' },
    { name: 'FMA 26', dyn: -0.02, dynMin: -0.40, dynMax: 0.40, stat: -0.26, statMin: -0.50, statMax: 0.05, type: 'forecast' },
    { name: 'MAM 26', dyn: 0.27, dynMin: -0.20, dynMax: 0.80, stat: -0.07, statMin: -0.40, statMax: 0.30, type: 'forecast' },
    { name: 'AMJ 26', dyn: 0.54, dynMin: -0.05, dynMax: 1.10, stat: 0.12, statMin: -0.25, statMax: 0.55, type: 'forecast' },
    { name: 'MJJ 26', dyn: 0.78, dynMin: 0.15, dynMax: 1.40, stat: 0.30, statMin: -0.10, statMax: 0.75, type: 'forecast' },
    { name: 'JJA 26', dyn: 0.80, dynMin: 0.10, dynMax: 1.50, stat: 0.43, statMin: -0.05, statMax: 0.90, type: 'forecast' },
    { name: 'JAS 26', dyn: 0.88, dynMin: 0.15, dynMax: 1.60, stat: 0.51, statMin: 0.00, statMax: 1.00, type: 'forecast' },
    { name: 'ASO 26', dyn: 0.91, dynMin: 0.10, dynMax: 1.65, stat: 0.57, statMin: 0.00, statMax: 1.10, type: 'forecast' },
    { name: 'SON 26', dyn: 0.78, dynMin: 0.05, dynMax: 1.55, stat: 0.65, statMin: 0.05, statMax: 1.20, type: 'forecast' },
    { name: 'OND 26', dyn: 0.83, dynMin: 0.10, dynMax: 1.60, stat: 0.72, statMin: 0.10, statMax: 1.30, type: 'forecast' },
];

// ── Datos de fallback completos en caso de falla total de API ──
const FALLBACK_DATA: ENSOData = {
    chartData: [
        { name: 'JJA 25', oni: -0.14, roni: -0.42, type: 'observed' },
        { name: 'JAS 25', oni: -0.28, roni: -0.63, type: 'observed' },
        { name: 'ASO 25', oni: -0.40, roni: -0.77, type: 'observed' },
        { name: 'SON 25', oni: -0.51, roni: -0.87, type: 'observed' },
        { name: 'OND 25', oni: -0.55, roni: -0.93, type: 'observed' },
        { name: 'NDJ 25', oni: -0.54, roni: -0.97, type: 'observed' },
        { name: 'DJF 26', oni: -0.39, roni: -0.90, dyn: -0.39, dynMin: -0.60, dynMax: -0.10, stat: -0.39, statMin: -0.55, statMax: -0.20, type: 'observed' },
        ...FALLBACK_FORECAST,
    ],
    metadata: {
        phase: "Hacia El Niño Moderado",
        currentONI: -0.39,
        trend: "Hacia El Niño",
        intensity: "Moderado",
        lastUpdate: new Date().toISOString().split('T')[0],
        numDynamicModels: 15,
        numStatisticalModels: 8,
        dataSource: "Datos de referencia IRI Marzo 2026 (sin conexión a API)",
    },
};

export function useENSOData() {
    const [data, setData] = useState<ENSOData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [usingFallback, setUsingFallback] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const resp = await fetch(`${API_BASE}/enso/chart-data`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const json = await resp.json();

            // Validar que hay datos útiles
            if (json.chartData && json.chartData.length > 0) {
                const hasForecasts = json.chartData.some((d: ENSOChartPoint) => d.type === 'forecast');

                if (hasForecasts) {
                    // Todo live: observados + pronóstico desde API
                    setData(json);
                } else {
                    // Observados LIVE + pronósticos de referencia IRI
                    // Determinar punto de solapamiento para conectar líneas
                    const observedNames = new Set(json.chartData.map((d: ENSOChartPoint) => d.name));
                    const lastObserved = json.chartData[json.chartData.length - 1];

                    // Agregar datos de pronóstico al último punto observado si coincide
                    const forecastToAdd = FALLBACK_FORECAST.filter(fp => !observedNames.has(fp.name));

                    // Conectar: inyectar dyn/stat en el último observado para continuidad
                    if (lastObserved && forecastToAdd.length > 0) {
                        if (lastObserved.dyn === undefined || lastObserved.dyn === null) {
                            lastObserved.dyn = lastObserved.oni;
                            lastObserved.stat = lastObserved.oni;
                            lastObserved.dynMin = lastObserved.oni != null ? lastObserved.oni - 0.15 : null;
                            lastObserved.dynMax = lastObserved.oni != null ? lastObserved.oni + 0.15 : null;
                            lastObserved.statMin = lastObserved.oni != null ? lastObserved.oni - 0.1 : null;
                            lastObserved.statMax = lastObserved.oni != null ? lastObserved.oni + 0.1 : null;
                        }
                    }

                    const mergedData: ENSOData = {
                        chartData: [...json.chartData, ...forecastToAdd],
                        metadata: {
                            ...json.metadata,
                            numDynamicModels: 15,
                            numStatisticalModels: 8,
                            phase: "Hacia El Niño Moderado",
                            trend: "Hacia El Niño",
                            intensity: "Moderado",
                            dataSource: `${json.metadata.dataSource} + Pronóstico IRI Mar-2026`,
                        },
                    };
                    setData(mergedData);
                }
                setUsingFallback(false);
            } else {
                throw new Error("No data returned");
            }
        } catch (err: any) {
            console.warn("ENSO API no disponible, usando datos de fallback:", err.message);
            setData(FALLBACK_DATA);
            setUsingFallback(true);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, loading, error, usingFallback, refetch: fetchData };
}
