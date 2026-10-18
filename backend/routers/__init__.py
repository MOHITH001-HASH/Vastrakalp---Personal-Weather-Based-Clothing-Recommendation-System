from .garments import router as garments_router
from .outfits import router as outfits_router
from .weather import router as weather_router
from .auth import router as auth_router

__all__ = [
    "garments_router",
    "outfits_router",
    "weather_router",
    "auth_router"
]
