import os
import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from .config.settings import ALLOWED_ORIGINS, PORT
from .routers import garments_router, outfits_router, weather_router, auth_router

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
        "service": "Vastrakalp Python FastAPI Backend + React UI",
        "runtime": "Python 3.10+ & Vite",
        "features": [
            "Gemini Multimodal Computer Vision",
            "Open-Meteo Meteorological Aggregation",
            "HueSync Multi-Person Styling",
            "Deterministic Image & Outfit Fallback Engines"
        ]
    }


# Serve React Frontend static files if dist/ exists
dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist"))
if os.path.exists(dist_dir):
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str, request: Request):
        # Let API routes and documentation pass through
        if full_path.startswith("api/") or full_path in ["docs", "redoc", "openapi.json"]:
            return JSONResponse(status_code=404, content={"error": "Not found"})
        
        target_file = os.path.join(dist_dir, full_path)
        if full_path and os.path.exists(target_file) and os.path.isfile(target_file):
            return FileResponse(target_file)
        
        # Fallback to index.html for React Router SPA
        index_file = os.path.join(dist_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        
        return {"message": "Welcome to Vastrakalp AI Backend", "docs": "/docs", "health": "/api/health"}
else:
    @app.get("/")
    async def root():
        return {
            "message": "Welcome to Vastrakalp AI Backend",
            "docs": "/docs",
            "health": "/api/health"
        }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
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
        content={"error": f"Internal Server Error: {err_str}"}
    )


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=PORT, reload=True)
