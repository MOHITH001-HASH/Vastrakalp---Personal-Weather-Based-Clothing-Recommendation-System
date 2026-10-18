from fastapi import APIRouter, Query
from typing import Optional

from ..services.weather_service import fetch_weather_data

router = APIRouter(prefix="/weather", tags=["weather"])


@router.get("")
@router.get("/")
async def get_weather_endpoint(
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    city: Optional[str] = Query(None)
):
    """
    Fetches live weather metrics from Open-Meteo and generates thermal & fabric advice.
    """
    data = await fetch_weather_data(lat=lat, lon=lon, city_name=city or "")
    return data
