import { auth } from '../lib/firebase';

export class ApiError extends Error {
  status?: number;
  code?: string;
  retryAfterSeconds?: number;
  isWarmup?: boolean;
  isRateLimit?: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: string;
      retryAfterSeconds?: number;
      isWarmup?: boolean;
      isRateLimit?: boolean;
    } = {}
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.isWarmup = options.isWarmup;
    this.isRateLimit = options.isRateLimit;
  }
}

const getAuthToken = async () => {
  const user = auth.currentUser;
  if (!user) return null;
  return await user.getIdToken();
};

export const apiClient = async (
  endpoint: string,
  options: RequestInit = {},
  warmupRetries = 4
): Promise<any> => {
  const isPublic = endpoint.startsWith('/weather');
  const token = isPublic ? null : await getAuthToken();
  const headers = new Headers(options.headers || {});
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Set JSON content-type if not FormData and not already set
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const url = `${apiBase}/api/v1${endpoint}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    // If the caller aborted, propagate that without auto-retry
    if (netErr?.name === 'AbortError') {
      throw new ApiError('Request timed out or was cancelled. Please try again.', {
        status: 408,
        code: 'TIMEOUT',
        retryAfterSeconds: 5
      });
    }

    if (warmupRetries > 0) {
      const delay = (5 - warmupRetries) * 1500;
      console.warn(`[API] Server connection momentarily unavailable (${netErr?.message || 'pending'}), retrying in ${delay}ms... (${warmupRetries} attempts left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(endpoint, options, warmupRetries - 1);
    }
    console.warn(`[API Client Connection Issue] endpoint: ${endpoint}, error:`, netErr?.message || netErr);
    throw new ApiError(
      netErr?.message ? `Network request failed (${netErr.message}). The backend server may be warming up or restarting.` : 'Server did not respond or connection was interrupted. The backend server may be warming up or restarting.',
      {
        status: 0,
        code: 'NETWORK_ERROR',
        isWarmup: true,
        retryAfterSeconds: 3
      }
    );
  }

  const rawText = await response.text();
  const isHtml = rawText.trim().startsWith('<!') || rawText.trim().startsWith('<html');

  // Check if Nginx returned the warmup.html page with status 200/502/503/504
  if (isHtml) {
    if (warmupRetries > 0) {
      const delay = (5 - warmupRetries) * 1500;
      console.warn(`[API] Server returned warmup page. Auto-retrying in ${delay}ms... (${warmupRetries} attempts left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return apiClient(endpoint, options, warmupRetries - 1);
    }
    throw new ApiError(
      'The backend server is warming up or temporarily restarting. Please retry in a few seconds.',
      {
        status: 503,
        code: 'SERVER_WARMUP',
        isWarmup: true,
        retryAfterSeconds: 5
      }
    );
  }

  // Parse JSON response
  let data: any = null;
  try {
    data = JSON.parse(rawText);
  } catch (parseErr) {
    throw new ApiError(`Invalid server response: ${rawText.substring(0, 80)}`, {
      status: response.status,
      code: 'INVALID_JSON'
    });
  }

  if (!response.ok) {
    const isRateLimit =
      response.status === 429 ||
      data?.code === 'RATE_LIMIT_EXCEEDED' ||
      data?.isRateLimit ||
      (data?.error && /tokens per minute|quota|rate limit|tpm/i.test(data.error));

    if (isRateLimit) {
      throw new ApiError(
        data?.error || 'Tokens Per Minute (TPM) or rate quota reached on Gemini API. Please wait for cooldown.',
        {
          status: 429,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfterSeconds: data?.retryAfterSeconds || 60,
          isRateLimit: true
        }
      );
    }

    if (response.status === 413) {
      throw new ApiError('Image file is too large. Please select a smaller image (under 10MB).', {
        status: 413,
        code: 'FILE_TOO_LARGE'
      });
    }

    if (response.status === 503 || data?.code === 'HIGH_DEMAND') {
      throw new ApiError(
        data?.error || 'Gemini model is currently experiencing high demand. Please try again shortly.',
        {
          status: 503,
          code: 'HIGH_DEMAND',
          retryAfterSeconds: data?.retryAfterSeconds || 15
        }
      );
    }

    throw new ApiError(data?.error || `Server Error (${response.status})`, {
      status: response.status,
      code: data?.code || 'SERVER_ERROR'
    });
  }

  return data;
};

export const api = {
  syncUser: () => apiClient('/auth/sync', { method: 'POST' }),
  analyzeGarment: (formData: FormData) => apiClient('/garments/analyze', { method: 'POST', body: formData }),
  createGarment: (data: any) => apiClient('/garments', { method: 'POST', body: JSON.stringify(data) }),
  deleteGarment: (id: string) => apiClient(`/garments/${id}`, { method: 'DELETE' }),
  getGarments: () => apiClient('/garments', { method: 'GET' }),
  suggestOutfit: (prompt: string, weather?: any, garments?: any[]) =>
    apiClient('/outfits/suggest', { method: 'POST', body: JSON.stringify({ prompt, weather, garments }) }),
  suggestFamilyOutfit: (event_prompt: string, weather: any, family_closets: any[]) =>
    apiClient('/outfits/suggest', { method: 'POST', body: JSON.stringify({ event_prompt, weather, family_closets }) }),
  getWeather: async (params?: { lat?: number; lon?: number; city?: string }) => {
    try {
      const query = new URLSearchParams();
      if (params?.lat !== undefined) query.set('lat', params.lat.toString());
      if (params?.lon !== undefined) query.set('lon', params.lon.toString());
      if (params?.city) query.set('city', params.city);
      const queryString = query.toString();
      return await apiClient(`/weather${queryString ? `?${queryString}` : ''}`, { method: 'GET' });
    } catch (err) {
      console.warn('[API Weather Fallback] Backend weather call failed, using direct Open-Meteo client fallback:', err);
      let lat = params?.lat;
      let lon = params?.lon;
      let cityName = params?.city || 'New Delhi, India';

      if (params?.city && (lat === undefined || lon === undefined)) {
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(params.city)}&count=1&language=en&format=json`);
          const geoData = await geoRes.json();
          if (geoData?.results?.[0]) {
            lat = geoData.results[0].latitude;
            lon = geoData.results[0].longitude;
            cityName = geoData.results[0].name;
          }
        } catch {
          // ignore
        }
      }

      if (lat === undefined || lon === undefined) {
        lat = 28.6139;
        lon = 77.2090;
        cityName = 'New Delhi, India';
      }

      const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto`);
      const wData = await weatherRes.json();

      const current = wData.current || {};
      const temp = current.temperature_2m || 25.0;
      const apparent = current.apparent_temperature || temp + 2.0;
      const humidity = current.relative_humidity_2m || 60;
      const precip = current.precipitation || 0;
      const wCode = current.weather_code || 0;

      return {
        location: {
          city: cityName,
          latitude: lat,
          longitude: lon,
          timezone: wData.timezone || 'UTC'
        },
        current: {
          temperature: Math.round(temp * 10) / 10,
          apparentTemperature: Math.round(apparent * 10) / 10,
          humidity: humidity,
          precipitation: precip,
          precipitationProbability: precip > 0 ? 50 : 10,
          windSpeed: current.wind_speed_10m || 0,
          weatherCode: wCode,
          condition: wCode === 0 ? 'Clear Sky' : wCode <= 3 ? 'Partly Cloudy' : 'Mild & Pleasant',
          icon: wCode === 0 ? 'Sun' : 'CloudSun',
          category: wCode === 0 ? 'sunny' : 'cloudy'
        },
        daily: {
          time: wData.daily?.time || [],
          weatherCode: wData.daily?.weather_code || [],
          temperatureMax: wData.daily?.temperature_2m_max || [],
          temperatureMin: wData.daily?.temperature_2m_min || [],
          precipitationProbabilityMax: wData.daily?.precipitation_probability_max || []
        },
        advice: {
          headline: temp >= 29 ? 'Warm & sunlit conditions. Prioritize ultra-breathable, airy garments.' : 'Pleasant & temperate weather conditions.',
          recommendedThermalWeight: temp >= 29 ? 1 : temp >= 22 ? 2 : 3,
          recommendedCategories: ['top', 'bottom', 'footwear'],
          fabricAdvice: 'Linen, airy cotton, or fine weaves.',
          colorPaletteAdvice: 'Light reflectives or rich earth tones.',
          layeringAdvice: 'Single layer or lightweight overshirt.'
        }
      };
    }
  },
  searchCities: async (q: string) => {
    try {
      return await apiClient(`/weather/search?q=${encodeURIComponent(q)}`, { method: 'GET' });
    } catch {
      try {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`);
        const data = await res.json();
        return {
          results: (data.results || []).map((r: any) => ({
            name: r.name,
            country: r.country || '',
            admin1: r.admin1 || '',
            latitude: r.latitude,
            longitude: r.longitude
          }))
        };
      } catch {
        return { results: [] };
      }
    }
  },
};
