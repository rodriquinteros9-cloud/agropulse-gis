from fastapi import FastAPI
from contextlib import asynccontextmanager
import os
from fastapi.middleware.cors import CORSMiddleware
from routers import analysis_router, upload_router, prices_router, enso_router, commodity_router, satellite, sensitivity_router
from routers.market_router import router as market_router
from tasks.scheduler_tasks import start_scheduler, stop_scheduler
from services.sio_granos_service import get_sio_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    start_scheduler(app)
    yield
    # Shutdown
    stop_scheduler()
    sio = get_sio_service()
    await sio.close()


app = FastAPI(
    title="AgroPulse Backend API",
    description="API REST de alto rendimiento para procesamiento satelital agrícola",
    version="2.0.0"
)

# Configurar CORS (Permite que React desde otro puerto haga peticiones)
# Leer orígenes permitidos desde variable de entorno, por defecto cadena vacía si no existe
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Incluir routers
app.include_router(upload_router.router, prefix="/api")
app.include_router(analysis_router.router, prefix="/api")
app.include_router(prices_router.router, prefix="/api")
app.include_router(enso_router.router, prefix="/api")
app.include_router(commodity_router.router, prefix="/api")
app.include_router(satellite.router, prefix="/api")
app.include_router(sensitivity_router.router, prefix="/api")
app.include_router(market_router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "AgroPulse Backend Operation Normal"}
