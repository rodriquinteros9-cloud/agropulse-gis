# 🌍 AgroPulse - Plataforma GIS Satelital 🚜

Una plataforma GIS interactiva de alto rendimiento construida con **React 19, Vite y FastAPI**, diseñada para el monitoreo avanzado de lotes agrícolas utilizando datos satelitales en tiempo real.

## ✨ Características Principales

- 📊 **Análisis Individual por Lote**:
  - **Vigor Vegetativo**: Curvas temporales de NDVI mediante Google Earth Engine (Sentinel-2 y Landsat).
  - **Índice SPEI**: Análisis hídrico histórico (20+ años) para detección de sequía y excesos.
  - **Zonificación Intralote**: Mapas de Carbono Orgánico (COS) y pH a 30m de resolución (OpenLandMap).
- 🌡️ **Agrometeorología**:
  - Clima actual y pronóstico de 7 días.
  - **Asesor Fitosanitario**: Semáforo de aptitud para aplicaciones según delta T, viento y humedad.
- 📂 **Gestión de Lotes**: Soporte nativo para archivos KML y GeoJSON con procesamiento espacial automático.
- 🎨 **Interfaz Premium**: Diseño moderno, responsivo y optimizado con Tailwind CSS y Leaflet.

## 🚀 Inicio Rápido

### ⚙️ Requisitos Previos
- Node.js (v18+)
- Python 3.9+
- Una cuenta de Google Earth Engine (con proyecto habilitado).

### 🛠️ Instalación y Ejecución

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/rodriquinteros9-cloud/agropulse-gis.git
   cd agropulse-gis
   ```

2. **Configuración del Backend (FastAPI):**
   ```bash
   cd backend
   # Crear archivo .env basado en .env.example y configurar EE_PROJECT
   pip install -r requirements.txt
   uvicorn main:app --reload
   ```

3. **Configuración del Frontend (React):**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

## 📂 Estructura del Proyecto

- `backend/`: API construida con FastAPI, integración con Google Earth Engine, procesamiento de datos climáticos y modelos agronómicos.
- `frontend/`: Aplicación SPA con React, visualización de mapas con Leaflet y gráficos dinámicos con Recharts.

---
Desarrollado con ❤️ para la precisión y eficiencia en el agro.
