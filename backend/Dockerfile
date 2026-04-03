# Usar una imagen oficial de Python ligera
FROM python:3.11-slim

# Establecer directorio de trabajo
WORKDIR /app

# Instalar dependencias del sistema necesarias para librerías espaciales
RUN apt-get update && apt-get install -y \
    gdal-bin \
    libgdal-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Configurar variables de entorno de gdal
ENV CPLUS_INCLUDE_PATH=/usr/include/gdal
ENV C_INCLUDE_PATH=/usr/include/gdal

# Copiar requirements e instalar dependencias de python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install httpx pytest uvicorn[standard]
RUN playwright install chromium --with-deps

# Copiar código fuente
COPY . .

# Exponer el puerto
EXPOSE 8000

# Comando para correr la API
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
