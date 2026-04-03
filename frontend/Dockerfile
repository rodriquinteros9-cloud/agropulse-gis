# Imagen base de Node
FROM node:20-alpine

# Directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer el puerto
EXPOSE 5173

# Correr en modo desarrollo (o build para producción, adaptarlo si es el caso)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
