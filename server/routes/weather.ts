import { Router } from 'express';

const router = Router();

function interpretWeatherCode(code: number): { condition: string; icon: string; category: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'stormy' } {
  if (code === 0) return { condition: 'Clear Sky', icon: 'Sun', category: 'sunny' };
  if (code === 1) return { condition: 'Mainly Clear', icon: 'SunMedium', category: 'sunny' };
  if (code === 2) return { condition: 'Partly Cloudy', icon: 'CloudSun', category: 'cloudy' };
  if (code === 3) return { condition: 'Overcast', icon: 'Cloud', category: 'cloudy' };
  if (code === 45 || code === 48) return { condition: 'Foggy', icon: 'CloudFog', category: 'cloudy' };
  if (code >= 51 && code <= 57) return { condition: 'Drizzle', icon: 'CloudDrizzle', category: 'rainy' };
  if (code >= 61 && code <= 67) return { condition: 'Rain', icon: 'CloudRain', category: 'rainy' };
  if (code >= 71 && code <= 77) return { condition: 'Snow', icon: 'CloudSnow', category: 'snowy' };
  if (code >= 80 && code <= 82) return { condition: 'Rain Showers', icon: 'CloudRain', category: 'rainy' };
  if (code >= 85 && code <= 86) return { condition: 'Snow Showers', icon: 'CloudSnow', category: 'snowy' };
  if (code >= 95) return { condition: 'Thunderstorm', icon: 'CloudLightning', category: 'stormy' };
  return { condition: 'Clear', icon: 'Sun', category: 'sunny' };
}

function generateStyleAdvice(tempC: number, feelsLikeC: number, humidity: number, rainProb: number, condition: string): {
  headline: string;
  recommendedThermalWeight: number; // 1 to 5
  recommendedCategories: string[];
  fabricAdvice: string;
  colorPaletteAdvice: string;
  layeringAdvice: string;
} {
  let recommendedThermalWeight = 2;
  let headline = 'Ideal weather for versatile everyday wear.';
  let fabricAdvice = 'Soft cottons, breathable twills, and comfortable blends.';
  let colorPaletteAdvice = 'Balanced neutrals, navy, earth tones, or soft pastels.';
  let layeringAdvice = 'Single layer top with optional light overshirt.';
  const recommendedCategories = ['top', 'bottom', 'footwear'];

  if (feelsLikeC >= 30 || tempC >= 29) {
    recommendedThermalWeight = 1;
    headline = 'Warm & sunlit conditions. Prioritize ultra-breathable, airy garments.';
    fabricAdvice = 'Linen, airy cotton, seersucker, or moisture-wicking weaves.';
    colorPaletteAdvice = 'Light reflectives like white, beige, light blue, or sage green.';
    layeringAdvice = 'Light single layer; open collar and breathable fits.';
    recommendedCategories.push('accessory');
  } else if (tempC >= 22) {
    recommendedThermalWeight = 2;
    headline = 'Pleasant & temperate. Great for smart-casual combinations.';
    fabricAdvice = 'Fine cotton, poplin, lightweight denim, or modal.';
    colorPaletteAdvice = 'Rich earth tones, olive, terracotta, crisp whites, or soft shades.';
    layeringAdvice = 'Single layer or a relaxed lightweight overshirt if moving indoors.';
  } else if (tempC >= 14) {
    recommendedThermalWeight = 3;
    headline = 'Crisp & cool. Perfect for stylish light layering.';
    fabricAdvice = 'Medium-weight knit, flannel, denim, or light fleece.';
    colorPaletteAdvice = 'Navy, charcoal, burgundy, camel, and deep greens.';
    layeringAdvice = 'Layer a cardigan, chore jacket, or blazer over your top.';
    recommendedCategories.push('outerwear');
  } else {
    recommendedThermalWeight = 4;
    headline = 'Cold temperatures. Insulating layers and cozy outerwear recommended.';
    fabricAdvice = 'Wool, cashmere, heavy knitwear, and windproof outer shells.';
    colorPaletteAdvice = 'Deep charcoal, black, forest green, warm caramel, or rich navy.';
    layeringAdvice = 'Base thermal + sweater + protective coat or insulated jacket.';
    recommendedCategories.push('outerwear');
  }

  if (rainProb >= 40) {
    recommendedCategories.push('outerwear');
    layeringAdvice += ' Carry a weather-resistant shell or umbrella; opt for water-friendly footwear.';
  }

  return {
    headline,
    recommendedThermalWeight,
    recommendedCategories,
    fabricAdvice,
    colorPaletteAdvice,
    layeringAdvice
  };
}

// GET /api/v1/weather
router.get('/', async (req, res) => {
  try {
    let lat = parseFloat(req.query.lat as string);
    let lon = parseFloat(req.query.lon as string);
    let cityName = (req.query.city as string) || '';

    // If city is specified but not coordinates, resolve city coordinates
    if (cityName && (isNaN(lat) || isNaN(lon))) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`
        );
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          if (geoData.results && geoData.results.length > 0) {
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            cityName = `${geoData.results[0].name}${geoData.results[0].admin1 ? ', ' + geoData.results[0].admin1 : ''}${geoData.results[0].country ? ', ' + geoData.results[0].country : ''}`;
          }
        }
      } catch (e) {
        console.warn('Geocoding lookup error:', e);
      }
    }

    // Default fallback coordinates (e.g. San Francisco or New York) if none provided
    if (isNaN(lat) || isNaN(lon)) {
      lat = 37.7749;
      lon = -122.4194;
      if (!cityName) cityName = 'San Francisco, CA';
    }

    // Fetch live weather data from Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`;

    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      throw new Error(`Open-Meteo weather service error: ${weatherRes.statusText}`);
    }

    const data = await weatherRes.json();
    const current = data.current || {};
    const daily = data.daily || {};

    const tempC = Math.round(current.temperature_2m ?? 22);
    const apparentTempC = Math.round(current.apparent_temperature ?? tempC);
    const humidity = Math.round(current.relative_humidity_2m ?? 60);
    const windSpeed = Math.round(current.wind_speed_10m ?? 10);
    const weatherCode = current.weather_code ?? 0;
    const rainChance = daily.precipitation_probability_max?.[0] ?? Math.round((current.precipitation ?? 0) > 0 ? 80 : 15);

    const highTempC = daily.temperature_2m_max?.[0] ? Math.round(daily.temperature_2m_max[0]) : tempC + 4;
    const lowTempC = daily.temperature_2m_min?.[0] ? Math.round(daily.temperature_2m_min[0]) : tempC - 4;

    const weatherInfo = interpretWeatherCode(weatherCode);
    const styleAdvice = generateStyleAdvice(tempC, apparentTempC, humidity, rainChance, weatherInfo.condition);

    res.json({
      location: {
        cityName: cityName || `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`,
        latitude: lat,
        longitude: lon,
        timezone: data.timezone || 'auto'
      },
      current: {
        temperature_c: tempC,
        temperature_f: Math.round((tempC * 9) / 5 + 32),
        apparent_temp_c: apparentTempC,
        apparent_temp_f: Math.round((apparentTempC * 9) / 5 + 32),
        humidity_pct: humidity,
        wind_speed_kmh: windSpeed,
        rain_chance_pct: rainChance,
        weather_code: weatherCode,
        condition: weatherInfo.condition,
        icon: weatherInfo.icon,
        category: weatherInfo.category,
        temp_high_c: highTempC,
        temp_low_c: lowTempC
      },
      styleAdvice
    });
  } catch (error: any) {
    console.error('Weather fetch error:', error);
    // Graceful fallback response
    const fallbackTemp = 24;
    res.json({
      location: {
        cityName: 'Local Area',
        latitude: 37.77,
        longitude: -122.42,
        timezone: 'UTC'
      },
      current: {
        temperature_c: fallbackTemp,
        temperature_f: 75,
        apparent_temp_c: 25,
        apparent_temp_f: 77,
        humidity_pct: 65,
        wind_speed_kmh: 12,
        rain_chance_pct: 20,
        weather_code: 1,
        condition: 'Mainly Clear',
        icon: 'Sun',
        category: 'sunny',
        temp_high_c: 27,
        temp_low_c: 19
      },
      styleAdvice: generateStyleAdvice(fallbackTemp, 25, 65, 20, 'Mainly Clear'),
      isFallback: true
    });
  }
});

// GET /api/v1/weather/search?q=London
router.get('/search', async (req, res) => {
  try {
    const query = (req.query.q as string) || '';
    if (!query || query.trim().length < 2) {
      return res.json({ results: [] });
    }

    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`
    );

    if (!geoRes.ok) {
      return res.json({ results: [] });
    }

    const data = await geoRes.json();
    const results = (data.results || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      admin1: item.admin1 || '',
      country: item.country || '',
      displayName: `${item.name}${item.admin1 ? ', ' + item.admin1 : ''}, ${item.country || ''}`,
      latitude: item.latitude,
      longitude: item.longitude
    }));

    res.json({ results });
  } catch (err) {
    console.error('City search error:', err);
    res.json({ results: [] });
  }
});

export default router;
