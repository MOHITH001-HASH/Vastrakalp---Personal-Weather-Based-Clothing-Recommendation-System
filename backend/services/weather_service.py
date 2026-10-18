import urllib.parse
from typing import Dict, Any, List
import httpx

def interpret_weather_code(code: int) -> Dict[str, str]:
    if code == 0:
        return {"condition": "Clear Sky", "icon": "Sun", "category": "sunny"}
    if code == 1:
        return {"condition": "Mainly Clear", "icon": "SunMedium", "category": "sunny"}
    if code == 2:
        return {"condition": "Partly Cloudy", "icon": "CloudSun", "category": "cloudy"}
    if code == 3:
        return {"condition": "Overcast", "icon": "Cloud", "category": "cloudy"}
    if code in (45, 48):
        return {"condition": "Foggy", "icon": "CloudFog", "category": "cloudy"}
    if 51 <= code <= 57:
        return {"condition": "Drizzle", "icon": "CloudDrizzle", "category": "rainy"}
    if 61 <= code <= 67:
        return {"condition": "Rain", "icon": "CloudRain", "category": "rainy"}
    if 71 <= code <= 77:
        return {"condition": "Snow", "icon": "CloudSnow", "category": "snowy"}
    if 80 <= code <= 82:
        return {"condition": "Rain Showers", "icon": "CloudRain", "category": "rainy"}
    if 85 <= code <= 86:
        return {"condition": "Snow Showers", "icon": "CloudSnow", "category": "snowy"}
    if code >= 95:
        return {"condition": "Thunderstorm", "icon": "CloudLightning", "category": "stormy"}
    return {"condition": "Clear", "icon": "Sun", "category": "sunny"}


def generate_style_advice(
    temp_c: float,
    feels_like_c: float,
    humidity: float,
    rain_prob: float,
    condition: str
) -> Dict[str, Any]:
    recommended_categories = ["top", "bottom", "footwear"]
    
    if feels_like_c >= 30 or temp_c >= 29:
        thermal = 1
        headline = "Warm & sunlit conditions. Prioritize ultra-breathable, airy garments."
        fabric = "Linen, airy cotton, seersucker, or moisture-wicking weaves."
        palette = "Light reflectives like white, beige, light blue, or sage green."
        layering = "Light single layer; open collar and breathable fits."
        recommended_categories.append("accessory")
    elif temp_c >= 22:
        thermal = 2
        headline = "Pleasant & temperate. Great for smart-casual combinations."
        fabric = "Fine cotton, poplin, lightweight denim, or modal."
        palette = "Rich earth tones, olive, terracotta, crisp whites, or soft shades."
        layering = "Single layer or a relaxed lightweight overshirt if moving indoors."
    elif temp_c >= 14:
        thermal = 3
        headline = "Crisp & cool. Perfect for stylish light layering."
        fabric = "Medium-weight knit, flannel, denim, or light fleece."
        palette = "Navy, charcoal, burgundy, camel, and deep greens."
        layering = "Layer a cardigan, chore jacket, or blazer over your top."
        recommended_categories.append("outerwear")
    else:
        thermal = 4
        headline = "Cold temperatures. Insulating layers and cozy outerwear recommended."
        fabric = "Wool, cashmere, heavy knitwear, and windproof outer shells."
        palette = "Deep charcoal, black, forest green, warm caramel, or rich navy."
        layering = "Base thermal + sweater + protective coat or insulated jacket."
        recommended_categories.append("outerwear")

    if rain_prob >= 40:
        if "outerwear" not in recommended_categories:
            recommended_categories.append("outerwear")
        layering += " Carry a weather-resistant shell or umbrella; opt for water-friendly footwear."

    return {
        "headline": headline,
        "recommendedThermalWeight": thermal,
        "recommendedCategories": recommended_categories,
        "fabricAdvice": fabric,
        "colorPaletteAdvice": palette,
        "layeringAdvice": layering
    }


async def fetch_weather_data(lat: float, lon: float, city_name: str = "") -> Dict[str, Any]:
    """
    Fetches real-time weather and 7-day forecast from Open-Meteo.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        # Geocode city if lat/lon not provided
        if city_name and (lat is None or lon is None):
            try:
                geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(city_name)}&count=1&language=en&format=json"
                geo_res = await client.get(geo_url)
                if geo_res.status_code == 200:
                    geo_json = geo_res.json()
                    results = geo_json.get("results", [])
                    if results:
                        lat = results[0]["latitude"]
                        lon = results[0]["longitude"]
                        city_name = results[0]["name"]
            except Exception:
                pass

        if lat is None or lon is None:
            lat = 28.6139  # Default coordinates (New Delhi)
            lon = 77.2090
            city_name = "New Delhi, India"

        weather_url = (
            f"https://api.open-meteo.com/v1/forecast?"
            f"latitude={lat}&longitude={lon}&"
            f"current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&"
            f"daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&"
            f"timezone=auto"
        )

        res = await client.get(weather_url)
        data = res.json()

        current = data.get("current", {})
        temp = current.get("temperature_2m", 25.0)
        apparent_temp = current.get("apparent_temperature", temp + 2.0)
        humidity = current.get("relative_humidity_2m", 60)
        weather_code = current.get("weather_code", 0)
        precip = current.get("precipitation", 0)

        daily = data.get("daily", {})
        precip_prob_list = daily.get("precipitation_probability_max", [])
        rain_prob = precip_prob_list[0] if precip_prob_list else (50 if precip > 0 else 5)

        weather_meta = interpret_weather_code(weather_code)
        advice = generate_style_advice(temp, apparent_temp, humidity, rain_prob, weather_meta["condition"])

        return {
            "location": {
                "city": city_name or "Local Area",
                "latitude": lat,
                "longitude": lon,
                "timezone": data.get("timezone", "UTC")
            },
            "current": {
                "temperature": round(temp, 1),
                "apparentTemperature": round(apparent_temp, 1),
                "humidity": humidity,
                "precipitation": precip,
                "precipitationProbability": rain_prob,
                "windSpeed": current.get("wind_speed_10m", 0),
                "weatherCode": weather_code,
                "condition": weather_meta["condition"],
                "icon": weather_meta["icon"],
                "category": weather_meta["category"]
            },
            "advice": advice,
            "dailyForecast": [
                {
                    "date": d,
                    "maxTemp": daily.get("temperature_2m_max", [temp])[i] if i < len(daily.get("temperature_2m_max", [])) else temp,
                    "minTemp": daily.get("temperature_2m_min", [temp - 5])[i] if i < len(daily.get("temperature_2m_min", [])) else temp - 5,
                    "rainChance": daily.get("precipitation_probability_max", [10])[i] if i < len(daily.get("precipitation_probability_max", [])) else 10,
                    "weatherCode": daily.get("weather_code", [0])[i] if i < len(daily.get("weather_code", [])) else 0
                }
                for i, d in enumerate(daily.get("time", [])[:7])
            ]
        }
