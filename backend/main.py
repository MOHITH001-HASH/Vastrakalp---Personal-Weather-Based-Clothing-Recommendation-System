import logging
import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config.settings import ALLOWED_ORIGINS, PORT
from .routers import garments_router, outfits_router, weather_router, auth_router

logger = logging.getLogger("vastrakalp.api")

app = FastAPI(
    title="Vastrakalp API",
    description="Python Backend for Vastrakalp — AI Wardrobe Digitization, Meteorological Styling & HueSync™ Coordination",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(garments_router, prefix="/api/v1")
app.include_router(outfits_router, prefix="/api/v1")
app.include_router(weather_router, prefix="/api/v1")


@app.get("/api/health")
async def health_check():
    """
    Health check endpoint for monitoring and uptime.
    """
    return {
        "status": "healthy",
        "service": "Vastrakalp Python FastAPI API",
        "runtime": "Python 3.12+",
        "features": [
            "Gemini Multimodal Computer Vision",
            "Open-Meteo Meteorological Aggregation",
            "HueSync Multi-Person Styling",
            "Deterministic Image & Outfit Fallback Engines"
        ]
    }


@app.get("/")
async def root():
    return {
        "message": "Vastrakalp API",
        "docs": "/docs",
        "health": "/api/health"
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled API error on %s", request.url.path)
    err_str = str(exc)
    if "429" in err_str or "quota" in err_str.lower() or "tpm" in err_str.lower():
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "error": "Gemini API rate limit reached. Fallback engine activated.",
                "code": "RATE_LIMIT_EXCEEDED",
                "retryAfterSeconds": 30,
                "isRateLimit": True
            }
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "Internal Server Error", "code": "INTERNAL_SERVER_ERROR"}
    )


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=PORT, reload=True)
