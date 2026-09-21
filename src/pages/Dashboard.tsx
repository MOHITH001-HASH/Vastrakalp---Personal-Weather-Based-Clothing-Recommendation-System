import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  CloudRain,
  Sun,
  SunMedium,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudSnow,
  CloudLightning,
  Thermometer,
  Wind,
  Plus,
  History,
  Loader2,
  Check,
  MapPin,
  Search,
  RefreshCw,
  Sparkles,
  ArrowRight,
  Shirt,
  Compass,
  AlertCircle,
  CheckCircle2,
  X,
  Pencil
} from 'lucide-react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../api/client';
import { Link } from 'react-router-dom';

interface WeatherData {
  location: {
    cityName: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  current: {
    temperature_c: number;
    temperature_f: number;
    apparent_temp_c: number;
    apparent_temp_f: number;
    humidity_pct: number;
    wind_speed_kmh: number;
    rain_chance_pct: number;
    weather_code: number;
    condition: string;
    icon: string;
    category: string;
    temp_high_c: number;
    temp_low_c: number;
  };
  styleAdvice?: {
    headline: string;
    recommendedThermalWeight: number;
    recommendedCategories: string[];
    fabricAdvice: string;
    colorPaletteAdvice: string;
    layeringAdvice: string;
  };
  isFallback?: boolean;
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 22) return 'Good evening';
  return 'Good night';
}

export default function Dashboard() {
  const { user, profile, updateProfileName } = useAuth();
  const [garments, setGarments] = useState<any[]>([]);
  const [history, setHistory] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [logging, setLogging] = useState<string | null>(null);

  // User name editing states
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.firstName) {
      setNameInput(profile.firstName);
    }
  }, [profile?.firstName]);

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleSaveName = async () => {
    if (nameInput.trim()) {
      await updateProfileName(nameInput.trim());
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setNameInput(profile?.firstName || '');
      setIsEditingName(false);
    }
  };

  // Weather states
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [locatingGps, setLocatingGps] = useState(false);

  // City Search Modal / Dropdown
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Weather-driven AI recommendation states
  const [suggestedOutfit, setSuggestedOutfit] = useState<any | null>(null);
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [loggingSuggestedOutfit, setLoggingSuggestedOutfit] = useState(false);
  const [suggestedOutfitLogged, setSuggestedOutfitLogged] = useState(false);

  // Fetch live weather
  const fetchWeather = async (params?: { lat?: number; lon?: number; city?: string }) => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const data = await api.getWeather(params);
      setWeather(data);
      // Save last known location preference
      if (data?.location) {
        localStorage.setItem('vastrakalp_last_weather_loc', JSON.stringify(data.location));
      }
    } catch (err: any) {
      console.error('Failed to fetch weather:', err);
      setWeatherError('Unable to load live weather. Using cached/standard climate profile.');
    } finally {
      setWeatherLoading(false);
    }
  };

  // Initial weather load on mount
  useEffect(() => {
    let initialParams: { lat?: number; lon?: number; city?: string } | undefined;
    try {
      const savedLoc = localStorage.getItem('vastrakalp_last_weather_loc');
      if (savedLoc) {
        const parsed = JSON.parse(savedLoc);
        if (parsed.latitude && parsed.longitude) {
          initialParams = { lat: parsed.latitude, lon: parsed.longitude, city: parsed.cityName };
        }
      }
    } catch {
      // Ignore storage errors
    }

    if (!initialParams && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetchWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          fetchWeather(initialParams);
        },
        { timeout: 5000 }
      );
    } else {
      fetchWeather(initialParams);
    }
  }, []);

  // Request browser GPS position
  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setWeatherError('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        fetchWeather({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setShowSearch(false);
      },
      (err) => {
        setLocatingGps(false);
        console.warn('Geolocation denied or failed:', err);
        setWeatherError('Location access was denied or timed out. You can search your city manually.');
      },
      { timeout: 8000 }
    );
  };

  // Handle City search debounced
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.searchCities(searchQuery);
        setSearchResults(res.results || []);
      } catch (err) {
        console.error('City search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery]);

  // Load user garments & wear history
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      const gCacheKey = `vastrakalp_garments_${user.uid}`;
      try {
        const cachedG = localStorage.getItem(gCacheKey);
        if (cachedG) {
          setGarments(JSON.parse(cachedG));
        }
      } catch {
        // Ignore cache parse error
      }

      try {
        const gQuery = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
        const gSnapshot = await getDocs(gQuery);
        const gData = gSnapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        setGarments(gData);
        try {
          localStorage.setItem(gCacheKey, JSON.stringify(gData));
        } catch {
          // Ignore cache save error
        }

        const wQuery = query(collection(db, 'garmentWears'), where('userId', '==', user.uid));
        const wSnapshot = await getDocs(wQuery);
        const wData = wSnapshot.docs.map((doc) => doc.data());

        const grouped: Record<string, any[]> = {};
        wData.forEach((wear) => {
          const garment = gData.find((g) => g.id === wear.garmentId);
          if (garment) {
            if (!grouped[wear.wornDate]) grouped[wear.wornDate] = [];
            grouped[wear.wornDate].push(garment);
          }
        });

        const sortedGroups: Record<string, any[]> = {};
        Object.keys(grouped)
          .sort((a, b) => b.localeCompare(a))
          .forEach((date) => {
            const uniqueGarments = grouped[date].filter(
              (v, i, a) => a.findIndex((t) => t.id === v.id) === i
            );
            sortedGroups[date] = uniqueGarments;
          });

        setHistory(sortedGroups);
      } catch (error) {
        console.warn('Operating with local dashboard cache while connecting to Firestore:', error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  // Daily styling vibe options for weather outfit
  const [selectedVibe, setSelectedVibe] = useState<'casual' | 'smart_casual' | 'relaxed' | 'active'>('casual');

  // Helper to extract items from any schema variant
  const getSuggestedGarments = (suggestion: any, allGarments: any[]): any[] => {
    if (!suggestion || !allGarments || allGarments.length === 0) return [];

    // 1. Primary HueSync attending_outfits schema
    const primaryAttendee = suggestion?.attending_outfits?.[0];
    if (primaryAttendee?.selected_item_ids && Array.isArray(primaryAttendee.selected_item_ids) && primaryAttendee.selected_item_ids.length > 0) {
      const items = primaryAttendee.selected_item_ids
        .map((id: string) => allGarments.find((g) => String(g.id) === String(id)))
        .filter(Boolean);
      if (items.length > 0) return items;
    }

    // 2. Members slot fallback schema
    const member = suggestion?.members?.[0];
    if (member) {
      if (Array.isArray(member.selected_item_ids) && member.selected_item_ids.length > 0) {
        const items = member.selected_item_ids
          .map((id: string) => allGarments.find((g) => String(g.id) === String(id)))
          .filter(Boolean);
        if (items.length > 0) return items;
      }
      const slotIds = [member.topId, member.bottomId, member.outerwearId, member.footwearId, ...(member.accessoryIds || [])].filter(Boolean);
      if (slotIds.length > 0) {
        const items = slotIds.map((id: string) => allGarments.find((g) => String(g.id) === String(id))).filter(Boolean);
        if (items.length > 0) return items;
      }
    }

    // 3. Match by titles if IDs were remapped
    if (primaryAttendee?.item_titles && Array.isArray(primaryAttendee.item_titles) && primaryAttendee.item_titles.length > 0) {
      const matched = primaryAttendee.item_titles
        .map((title: string) => {
          const lower = title.toLowerCase();
          return allGarments.find((g) => {
            const gName = (g.name || `${g.primaryColorName || ''} ${g.subCategory || g.category || ''}`).toLowerCase();
            return gName.includes(lower) || lower.includes(gName);
          });
        })
        .filter(Boolean);
      if (matched.length > 0) return matched;
    }

    return [];
  };

  // Smart local fallback in case Gemini hits rate limits or is offline
  const createFallbackOutfit = (vibe: string) => {
    if (!garments || garments.length === 0) return null;

    const isCold = weather ? weather.current.temperature_c < 18 : false;
    const isHot = weather ? weather.current.temperature_c > 28 : false;

    const tops = garments.filter((g) => g.category === 'top');
    const bottoms = garments.filter((g) => g.category === 'bottom');
    const outerwears = garments.filter((g) => g.category === 'outerwear');
    const shoes = garments.filter((g) => g.category === 'footwear');
    const sets = garments.filter((g) => ['suit', 'kurta_set', 'co_ord_set', 'dress'].includes(g.category));

    let chosen: any[] = [];
    if (vibe === 'smart_casual' && sets.length > 0) {
      chosen.push(sets[0]);
    } else {
      const top = tops.find((g) => isHot ? (g.thermalWeight || 2) <= 2 : isCold ? (g.thermalWeight || 2) >= 2 : true) || tops[0] || garments[0];
      const bottom = bottoms.find((g) => g.id !== top?.id) || bottoms[0];
      if (top) chosen.push(top);
      if (bottom && bottom.id !== top?.id) chosen.push(bottom);
      if (isCold && outerwears.length > 0) chosen.push(outerwears[0]);
      if (shoes.length > 0) chosen.push(shoes[0]);
    }

    if (chosen.length === 0) {
      chosen = garments.slice(0, 2);
    }

    const palette = chosen.map((g) => g.primaryColorHex || '#4b5563').filter(Boolean);
    const vibeLabel = vibe === 'smart_casual' ? 'Smart Casual' : vibe === 'relaxed' ? 'Relaxed & Breathable' : vibe === 'active' ? 'Active Outdoors' : 'Casual Daily';

    return {
      group_theme_title: `Weather-Matched ${vibeLabel}`,
      group_color_palette: palette.length > 0 ? palette : ['#1e293b', '#64748b', '#e2e8f0'],
      weather_rationale: `Selected lightweight, breathable staples suited for today's ${weather?.current?.temperature_c ?? 24}°C climate and ${weather?.current?.humidity_pct ?? 60}% humidity.`,
      coordination_rationale: `Balanced, complementary pieces from your wardrobe providing thermal comfort and clean aesthetic harmony.`,
      attending_outfits: [
        {
          member_id: user?.uid || 'user',
          name: profile?.firstName || 'You',
          relationship: 'self',
          selected_item_ids: chosen.map((g) => g.id),
          item_titles: chosen.map((g) => g.name || g.subCategory || 'Garment'),
          dominant_color_hex: chosen[0]?.primaryColorHex || '#1e293b',
          formality_score: vibe === 'smart_casual' ? 3 : 2,
          individual_styling_note: `Coordinated fit selected for all-day comfort in ${weather?.current?.condition || 'current'} conditions.`
        }
      ]
    };
  };

  // Generate or regenerate weather-smart casual outfit
  const generateWeatherOutfit = async (vibeOverride?: 'casual' | 'smart_casual' | 'relaxed' | 'active') => {
    if (!garments || garments.length === 0) {
      setSuggestionError('Please add items to your closet to get personalized weather styling.');
      return;
    }

    const currentVibe = vibeOverride || selectedVibe;
    if (vibeOverride) {
      setSelectedVibe(vibeOverride);
    }

    setGeneratingSuggestion(true);
    setSuggestionError(null);
    setSuggestedOutfitLogged(false);

    try {
      const weatherPayload = weather
        ? {
            temp_c: weather.current.temperature_c,
            apparent_temp_c: weather.current.apparent_temp_c,
            humidity_pct: weather.current.humidity_pct,
            rain_chance_pct: weather.current.rain_chance_pct,
            condition: weather.current.condition,
          }
        : { temp_c: 24, apparent_temp_c: 25, humidity_pct: 60, rain_chance_pct: 10, condition: 'Mild' };

      const vibeDescriptions: Record<string, string> = {
        casual: 'an everyday, comfortable casual look for running errands or meeting friends',
        smart_casual: 'a crisp, elevated smart casual outfit suitable for work or dinner',
        relaxed: 'a breezy, relaxed loungewear look prioritizing maximum breathability',
        active: 'a functional, lightweight active outfit for outdoor movement'
      };

      const prompt = `Style ${vibeDescriptions[currentVibe] || 'an everyday casual outfit'} for today's weather conditions (${weatherPayload.condition}, ${weatherPayload.temp_c}°C, feels like ${weatherPayload.apparent_temp_c}°C, ${weatherPayload.humidity_pct}% humidity, ${weatherPayload.rain_chance_pct}% rain chance). Select complementary pieces strictly from my closet matching this thermal index and comfort.`;

      const result = await api.suggestOutfit(prompt, weatherPayload, garments);
      
      // Verify if resolved result has items
      const resolvedItems = getSuggestedGarments(result, garments);
      if (resolvedItems.length > 0) {
        setSuggestedOutfit(result);
      } else {
        // Fallback to robust local pairing if AI returned unmatched IDs
        const fallback = createFallbackOutfit(currentVibe);
        setSuggestedOutfit(fallback);
      }
    } catch (err: any) {
      console.warn('AI weather outfit service note (using intelligent closet matcher):', err);
      const fallback = createFallbackOutfit(currentVibe);
      if (fallback) {
        setSuggestedOutfit(fallback);
      } else {
        setSuggestionError('Could not generate an outfit recommendation. Please add more items to your closet.');
      }
    } finally {
      setGeneratingSuggestion(false);
    }
  };

  // Auto-generate suggestion once weather and garments are loaded
  useEffect(() => {
    if (!suggestedOutfit && garments.length > 0 && weather && !generatingSuggestion) {
      generateWeatherOutfit();
    }
  }, [garments.length, !!weather]);

  // Quick re-log an outfit from history
  const handleReLog = async (date: string) => {
    if (!user) return;
    setLogging(date);
    try {
      const today = new Date().toISOString().split('T')[0];
      const garmentsToLog = history[date];

      const promises = garmentsToLog.map((g) =>
        addDoc(collection(db, 'garmentWears'), {
          garmentId: g.id,
          userId: user.uid,
          wornDate: today,
        })
      );

      await Promise.all(promises);

      setHistory((prev) => {
        const next = { ...prev };
        next[today] = garmentsToLog;
        const sortedGroups: Record<string, any[]> = {};
        Object.keys(next)
          .sort((a, b) => b.localeCompare(a))
          .forEach((d) => {
            sortedGroups[d] = next[d];
          });
        return sortedGroups;
      });
    } catch (error) {
      console.error('Failed to relog outfit:', error);
      alert('Failed to log outfit.');
    } finally {
      setTimeout(() => setLogging(null), 1000);
    }
  };

  // Log today's suggested outfit directly from the Dashboard
  const handleLogSuggestedOutfit = async () => {
    if (!user || suggestedItems.length === 0) return;
    setLoggingSuggestedOutfit(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const promises = suggestedItems.map((g: any) =>
        addDoc(collection(db, 'garmentWears'), {
          garmentId: g.id,
          userId: user.uid,
          wornDate: today,
        })
      );

      await Promise.all(promises);

      setHistory((prev) => {
        const next = { ...prev };
        next[today] = suggestedItems;
        const sortedGroups: Record<string, any[]> = {};
        Object.keys(next)
          .sort((a, b) => b.localeCompare(a))
          .forEach((d) => {
            sortedGroups[d] = next[d];
          });
        return sortedGroups;
      });

      setSuggestedOutfitLogged(true);
    } catch (err) {
      console.error('Failed to log suggested outfit:', err);
    } finally {
      setLoggingSuggestedOutfit(false);
    }
  };

  // Render weather icon dynamically
  const renderWeatherIcon = (iconName?: string, className = 'w-6 h-6') => {
    switch (iconName) {
      case 'SunMedium':
        return <SunMedium className={`${className} text-amber-500`} />;
      case 'CloudSun':
        return <CloudSun className={`${className} text-amber-500`} />;
      case 'Cloud':
        return <Cloud className={`${className} text-stone-500`} />;
      case 'CloudFog':
        return <CloudFog className={`${className} text-stone-400`} />;
      case 'CloudDrizzle':
        return <CloudDrizzle className={`${className} text-sky-400`} />;
      case 'CloudRain':
        return <CloudRain className={`${className} text-sky-600`} />;
      case 'CloudSnow':
        return <CloudSnow className={`${className} text-cyan-400`} />;
      case 'CloudLightning':
        return <CloudLightning className={`${className} text-indigo-500`} />;
      case 'Sun':
      default:
        return <Sun className={`${className} text-amber-500`} />;
    }
  };

  // Get matching garment items for the suggested outfit
  const suggestedItems = getSuggestedGarments(suggestedOutfit, garments);
  const primaryAttendee = suggestedOutfit?.attending_outfits?.[0] || suggestedOutfit?.members?.[0];

  return (
    <div id="dashboard-container" className="p-4 sm:p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <header id="dashboard-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold tracking-tight text-stone-900 flex items-center gap-2 flex-wrap">
            <span>{getTimeGreeting()},</span>
            {isEditingName ? (
              <span className="inline-flex items-center gap-1.5 align-middle">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-900 px-2 py-0.5 border-b-2 border-stone-800 bg-stone-100/80 rounded-md outline-none max-w-[200px]"
                  placeholder="Your Name"
                />
                <button
                  onClick={handleSaveName}
                  className="p-1.5 bg-stone-900 text-white hover:bg-stone-800 rounded-lg transition"
                  title="Save Name"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setNameInput(profile?.firstName || '');
                    setIsEditingName(false);
                  }}
                  className="p-1.5 bg-stone-200 text-stone-600 hover:bg-stone-300 rounded-lg transition"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                <span className="hover:text-stone-700 transition" title="Click to edit name">
                  {profile?.firstName || 'there'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(true);
                  }}
                  className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition"
                  title="Edit your name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </span>
            )}
          </h1>
        </div>
        <p className="text-stone-500 mt-1">
          Real-time local weather context and tailored wardrobe styling.
        </p>
      </header>

      {/* Main Weather & Styling Context Grid */}
      <section id="weather-overview-section" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weather Card (5 cols on lg) */}
        <div
          id="weather-card"
          className="lg:col-span-5 bg-gradient-to-br from-white to-stone-50/70 rounded-3xl p-6 border border-stone-200/80 shadow-sm flex flex-col justify-between relative overflow-hidden"
        >
          {/* Header & Location Controls */}
          <div>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="font-semibold text-stone-900 text-sm truncate">
                  {weather?.location?.cityName || 'Detecting Location...'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  id="search-city-btn"
                  onClick={() => setShowSearch(!showSearch)}
                  className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition text-xs flex items-center gap-1 font-medium"
                  title="Change City"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Change</span>
                </button>
                <button
                  id="gps-location-btn"
                  onClick={handleUseGps}
                  disabled={locatingGps}
                  className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition text-xs"
                  title="Use My Current GPS Location"
                >
                  {locatingGps ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-stone-700" />
                  ) : (
                    <Compass className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  id="refresh-weather-btn"
                  onClick={() =>
                    fetchWeather(
                      weather?.location?.latitude
                        ? { lat: weather.location.latitude, lon: weather.location.longitude }
                        : undefined
                    )
                  }
                  disabled={weatherLoading}
                  className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition text-xs"
                  title="Refresh Weather Data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* City Search Dropdown Overlay */}
            {showSearch && (
              <div
                id="city-search-overlay"
                className="mt-3 p-3 bg-white rounded-2xl border border-stone-200 shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 z-10"
              >
                <div className="flex items-center gap-2 border-b border-stone-100 pb-2 mb-2">
                  <Search className="w-4 h-4 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Search city (e.g., Paris, Tokyo, Mumbai, NYC)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-sm outline-none bg-transparent placeholder-stone-400"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="text-stone-400 hover:text-stone-600 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {searching && (
                  <div className="flex items-center justify-center py-4 text-xs text-stone-500">
                    <Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching cities...
                  </div>
                )}

                {!searching && searchResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {searchResults.map((city) => (
                      <button
                        key={city.id || `${city.latitude}_${city.longitude}`}
                        onClick={() => {
                          fetchWeather({ lat: city.latitude, lon: city.longitude, city: city.displayName });
                          setShowSearch(false);
                          setSearchQuery('');
                          setSearchResults([]);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-stone-100 text-xs text-stone-800 transition flex items-center justify-between"
                      >
                        <span className="font-medium truncate">{city.displayName}</span>
                        <span className="text-[10px] text-stone-400 shrink-0 ml-2">
                          {city.latitude.toFixed(1)}°, {city.longitude.toFixed(1)}°
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick select presets */}
                <div className="pt-2 border-t border-stone-100 mt-2">
                  <div className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider mb-1">
                    Quick Select
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['New York', 'London', 'Tokyo', 'Mumbai', 'Paris', 'San Francisco'].map((city) => (
                      <button
                        key={city}
                        onClick={() => {
                          fetchWeather({ city });
                          setShowSearch(false);
                          setSearchQuery('');
                        }}
                        className="px-2 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md text-[11px] font-medium transition"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Weather Temperature & Condition Hero */}
            <div className="mt-4 flex items-center justify-between">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-stone-900">
                    {tempUnit === 'C'
                      ? `${weather?.current?.temperature_c ?? 22}°C`
                      : `${weather?.current?.temperature_f ?? 72}°F`}
                  </span>
                  <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 text-xs font-semibold">
                    <button
                      onClick={() => setTempUnit('C')}
                      className={`px-1.5 py-0.5 rounded-md transition ${
                        tempUnit === 'C' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'
                      }`}
                    >
                      °C
                    </button>
                    <button
                      onClick={() => setTempUnit('F')}
                      className={`px-1.5 py-0.5 rounded-md transition ${
                        tempUnit === 'F' ? 'bg-white text-stone-900 shadow-xs' : 'text-stone-500'
                      }`}
                    >
                      °F
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-stone-600 font-medium text-sm">
                  <span>{weather?.current?.condition || 'Mild & Clear'}</span>
                  <span className="text-stone-300">·</span>
                  <span className="text-xs text-stone-500">
                    Feels like{' '}
                    {tempUnit === 'C'
                      ? `${weather?.current?.apparent_temp_c ?? 22}°C`
                      : `${weather?.current?.apparent_temp_f ?? 72}°F`}
                  </span>
                </div>
              </div>
              <div className="p-3 bg-stone-100/80 rounded-2xl border border-stone-200/50 shadow-inner">
                {renderWeatherIcon(weather?.current?.icon, 'w-10 h-10')}
              </div>
            </div>

            {/* Microclimate Stats Grid */}
            <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
              <div className="bg-white/80 border border-stone-100 rounded-xl p-2.5 flex flex-col items-center text-center">
                <div className="flex items-center text-stone-400 gap-1 mb-0.5">
                  <CloudRain className="w-3.5 h-3.5 text-sky-500" />
                  <span className="text-[11px]">Rain</span>
                </div>
                <span className="font-semibold text-stone-800 text-sm">
                  {weather?.current?.rain_chance_pct ?? 15}%
                </span>
              </div>

              <div className="bg-white/80 border border-stone-100 rounded-xl p-2.5 flex flex-col items-center text-center">
                <div className="flex items-center text-stone-400 gap-1 mb-0.5">
                  <Thermometer className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[11px]">Humidity</span>
                </div>
                <span className="font-semibold text-stone-800 text-sm">
                  {weather?.current?.humidity_pct ?? 60}%
                </span>
              </div>

              <div className="bg-white/80 border border-stone-100 rounded-xl p-2.5 flex flex-col items-center text-center">
                <div className="flex items-center text-stone-400 gap-1 mb-0.5">
                  <Wind className="w-3.5 h-3.5 text-teal-500" />
                  <span className="text-[11px]">Wind</span>
                </div>
                <span className="font-semibold text-stone-800 text-sm">
                  {weather?.current?.wind_speed_kmh ?? 10} km/h
                </span>
              </div>
            </div>
          </div>

          {/* Style Advice Footer Note */}
          <div className="mt-5 pt-4 border-t border-stone-100">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-stone-900">
                  {weather?.styleAdvice?.headline || 'Temperate Everyday Dressing'}
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5 leading-relaxed">
                  {weather?.styleAdvice?.layeringAdvice || 'Optimal for breathable single-layer styles and relaxed fits.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Weather-Adapted Outfit Recommendation (7 cols on lg) */}
        <div
          id="weather-outfit-recommendation-card"
          className="lg:col-span-7 bg-white rounded-3xl p-6 border border-stone-200/80 shadow-sm flex flex-col justify-between"
        >
          <div>
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200/60 rounded-full text-xs font-semibold mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  Daily Weather-Adaptive Stylist
                </div>
                <h3 className="font-bold text-lg text-stone-900">
                  {suggestedOutfit?.group_theme_title || "Today's Weather-Matched Fit"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="regenerate-outfit-btn"
                  onClick={() => generateWeatherOutfit()}
                  disabled={generatingSuggestion || garments.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-medium rounded-xl transition disabled:opacity-50 cursor-pointer"
                  title="Generate another weather combination"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generatingSuggestion ? 'animate-spin' : ''}`} />
                  <span>{generatingSuggestion ? 'Styling...' : 'Try Another Combo'}</span>
                </button>
              </div>
            </div>

            {/* Quick Vibe Chips */}
            {garments.length > 0 && (
              <div className="pt-3 pb-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-semibold text-stone-400 mr-1 uppercase tracking-wider">Vibe:</span>
                {[
                  { id: 'casual', label: 'Casual Daily' },
                  { id: 'smart_casual', label: 'Smart Casual' },
                  { id: 'relaxed', label: 'Relaxed Lounge' },
                  { id: 'active', label: 'Active Outdoor' },
                ].map((vibe) => (
                  <button
                    key={vibe.id}
                    onClick={() => generateWeatherOutfit(vibe.id as any)}
                    disabled={generatingSuggestion}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                      selectedVibe === vibe.id
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200 hover:text-stone-900'
                    }`}
                  >
                    {vibe.label}
                  </button>
                ))}
              </div>
            )}

            {/* Garment Grid / Content */}
            {generatingSuggestion ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-stone-600" />
                <p className="text-sm font-medium text-stone-700">
                  Calibrating climate data & selecting matching pieces...
                </p>
                <p className="text-xs text-stone-400">
                  Balancing fabric breathability, rain protection, and color harmony
                </p>
              </div>
            ) : garments.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <Shirt className="w-10 h-10 text-stone-300 mx-auto" />
                <h4 className="font-semibold text-stone-800 text-sm">Your wardrobe is empty</h4>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">
                  Add a few pieces to your closet to unlock instant AI weather styling recommendations.
                </p>
                <Link
                  to="/closet"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Garments to Closet
                </Link>
              </div>
            ) : suggestedItems.length > 0 ? (
              <div className="mt-3 space-y-3.5">
                {/* Color Harmony Palette Bar (if present) */}
                {suggestedOutfit?.group_color_palette && Array.isArray(suggestedOutfit.group_color_palette) && (
                  <div className="flex items-center justify-between px-3 py-2 bg-stone-50 rounded-xl border border-stone-100">
                    <span className="text-[11px] font-medium text-stone-500">Curated Color Harmony:</span>
                    <div className="flex items-center gap-1.5">
                      {suggestedOutfit.group_color_palette.map((colorHex: string, cIdx: number) => (
                        <div
                          key={cIdx}
                          className="w-4 h-4 rounded-full border border-stone-300 shadow-2xs"
                          style={{ backgroundColor: colorHex }}
                          title={colorHex}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Outfit Items Horizontal Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {suggestedItems.map((garment, idx) => (
                    <div
                      key={garment?.id || idx}
                      className="bg-stone-50/80 border border-stone-200/60 rounded-2xl p-2.5 flex flex-col items-center text-center group hover:border-stone-300 transition"
                    >
                      <div className="w-full aspect-square bg-white rounded-xl mb-2 overflow-hidden flex items-center justify-center p-1.5 border border-stone-100">
                        {garment?.imageUrl ? (
                          <img
                            src={garment.imageUrl}
                            alt={garment.name || garment.subCategory}
                            className="w-full h-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform duration-200"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Shirt className="w-6 h-6 text-stone-300" />
                        )}
                      </div>
                      <span className="text-[10px] uppercase font-semibold text-stone-400 tracking-wider">
                        {garment?.category}
                      </span>
                      <span className="text-xs font-semibold text-stone-900 truncate w-full capitalize mt-0.5">
                        {garment?.subCategory || garment?.name}
                      </span>
                      <div className="flex items-center gap-1 mt-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-stone-300 shrink-0"
                          style={{ backgroundColor: garment?.primaryColorHex || '#888888' }}
                        />
                        <span className="text-[10px] text-stone-500 truncate max-w-[75px]">
                          {garment?.primaryColorName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Weather & Style Rationale */}
                <div className="p-3.5 bg-amber-50/50 rounded-2xl border border-amber-100/70 text-xs text-stone-700 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-semibold text-stone-900 mb-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Weather Adaptation Rationale:</span>
                  </div>
                  <p className="text-stone-600">
                    {suggestedOutfit?.weather_rationale ||
                      primaryAttendee?.individual_styling_note ||
                      suggestedOutfit?.coordination_rationale ||
                      `Formulated to keep you comfortable in ${weather?.current?.temperature_c ?? 22}°C weather with breathable fabrics.`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-stone-500">Ready to compute your weather outfit.</p>
                <button
                  onClick={() => generateWeatherOutfit()}
                  className="px-4 py-2 bg-stone-900 text-white rounded-xl text-xs font-medium hover:bg-stone-800 transition cursor-pointer"
                >
                  Generate Outfit Now
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {suggestedItems.length > 0 && !generatingSuggestion && (
            <div className="mt-4 pt-3.5 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3">
              <button
                id="log-suggested-worn-btn"
                onClick={handleLogSuggestedOutfit}
                disabled={loggingSuggestedOutfit || suggestedOutfitLogged}
                className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-xl transition disabled:opacity-60 shadow-sm cursor-pointer"
              >
                {suggestedOutfitLogged ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Logged to Outfit History
                  </>
                ) : loggingSuggestedOutfit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Logging...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    Wear & Log Outfit Today
                  </>
                )}
              </button>

              <Link
                to="/planner"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 transition"
              >
                <span>Specific Event or Group? Open Planner</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Outfit History Section */}
      <section id="outfit-history-section">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-stone-900">Outfit History</h2>
            <p className="text-xs text-stone-500 mt-0.5">Track what you and your family have worn recently.</p>
          </div>
          <div className="flex items-center text-stone-500 text-sm font-medium">
            <History className="w-4 h-4 mr-1.5 text-stone-400" />
            <span>Activity Log</span>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
          </div>
        ) : Object.keys(history).length === 0 ? (
          <div className="bg-white border border-stone-200/80 rounded-3xl p-12 text-center shadow-sm">
            <History className="w-10 h-10 text-stone-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-stone-900 mb-1">No outfit history logged yet</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Whenever you log an outfit or accept today's weather recommendation, it will be saved here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(history).map(([date, outfitGarments]: [string, any[]]) => (
              <div key={date} className="bg-white rounded-3xl border border-stone-200/80 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4 border-b border-stone-100 pb-3">
                  <div>
                    <h3 className="font-semibold text-stone-900 text-sm sm:text-base">
                      {new Date(date).toLocaleDateString(undefined, {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </h3>
                    <p className="text-xs text-stone-500">{outfitGarments.length} pieces worn</p>
                  </div>
                  <button
                    onClick={() => handleReLog(date)}
                    disabled={logging !== null}
                    className="flex items-center px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold rounded-xl transition disabled:opacity-50"
                  >
                    {logging === date ? (
                      <>
                        <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                        Logged!
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Wear Again Today
                      </>
                    )}
                  </button>
                </div>

                <div className="flex gap-3 overflow-x-auto pb-2">
                  {outfitGarments.map((garment) => (
                    <div
                      key={garment.id}
                      className="shrink-0 w-28 bg-stone-50/70 border border-stone-200/60 rounded-2xl overflow-hidden p-2 text-center"
                    >
                      <div className="aspect-square bg-white rounded-xl flex items-center justify-center p-1 mb-1.5 border border-stone-100">
                        {garment.imageUrl ? (
                          <img
                            src={garment.imageUrl}
                            alt={garment.subCategory}
                            className="w-full h-full object-contain mix-blend-multiply"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-stone-300 text-[10px]">No image</span>
                        )}
                      </div>
                      <span className="font-semibold text-stone-900 text-xs capitalize block truncate">
                        {garment.subCategory || garment.name}
                      </span>
                      <span className="text-[10px] text-stone-500 capitalize block truncate">
                        {garment.primaryColorName}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
