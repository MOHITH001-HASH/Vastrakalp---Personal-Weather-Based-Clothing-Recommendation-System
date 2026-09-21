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
  const [loading, setLoading] = useState(true);

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

  // Dynamic climate & weather themed style variables
  const getWeatherCardStyles = () => {
    const icon = weather?.current?.icon;
    const tempC = weather?.current?.temperature_c ?? 22;
    const isHot = tempC >= 28;
    const isCold = tempC <= 6;

    if (icon === 'CloudLightning') {
      return {
        cardBg: 'bg-gradient-to-br from-[#f5f0ff] via-[#ebe4ff] to-[#ddd0fc]',
        borderColor: 'border-purple-200/90',
        headerBorder: 'border-purple-200/80',
        iconBoxBg: 'bg-purple-100/90 border border-purple-300 text-purple-700 shadow-xs',
        statBoxBg: 'bg-white/85 border-purple-200/80 backdrop-blur-xs',
        adviceBoxBg: 'bg-purple-100/60 border-purple-200 text-purple-950',
        glowColor: 'bg-indigo-400/25',
        unitToggleBg: 'border-purple-200 bg-purple-100/70',
        activeBtnBg: 'hover:bg-purple-200/60 text-purple-900',
      };
    }

    if (icon === 'CloudRain' || icon === 'CloudDrizzle') {
      return {
        cardBg: 'bg-gradient-to-br from-[#eaf4fc] via-[#dcebf8] to-[#c7dff3]',
        borderColor: 'border-sky-200/90',
        headerBorder: 'border-sky-200/80',
        iconBoxBg: 'bg-sky-100/90 border border-sky-300 text-sky-700 shadow-xs',
        statBoxBg: 'bg-white/85 border-sky-200/80 backdrop-blur-xs',
        adviceBoxBg: 'bg-sky-100/60 border-sky-200 text-sky-950',
        glowColor: 'bg-sky-400/25',
        unitToggleBg: 'border-sky-200 bg-sky-100/70',
        activeBtnBg: 'hover:bg-sky-200/60 text-sky-900',
      };
    }

    if (icon === 'CloudSnow' || isCold) {
      return {
        cardBg: 'bg-gradient-to-br from-[#f2f9ff] via-[#e4f2fe] to-[#d2eafc]',
        borderColor: 'border-cyan-200/90',
        headerBorder: 'border-cyan-200/80',
        iconBoxBg: 'bg-cyan-100/90 border border-cyan-300 text-cyan-700 shadow-xs',
        statBoxBg: 'bg-white/85 border-cyan-200/80 backdrop-blur-xs',
        adviceBoxBg: 'bg-cyan-100/60 border-cyan-200 text-cyan-950',
        glowColor: 'bg-cyan-300/30',
        unitToggleBg: 'border-cyan-200 bg-cyan-100/70',
        activeBtnBg: 'hover:bg-cyan-200/60 text-cyan-900',
      };
    }

    if (icon === 'Cloud' || icon === 'CloudFog') {
      return {
        cardBg: 'bg-gradient-to-br from-[#f4f6f8] via-[#e8ecf1] to-[#d8dfe8]',
        borderColor: 'border-slate-300/90',
        headerBorder: 'border-slate-200/90',
        iconBoxBg: 'bg-slate-200/90 border border-slate-300 text-slate-700 shadow-xs',
        statBoxBg: 'bg-white/85 border-slate-300/80 backdrop-blur-xs',
        adviceBoxBg: 'bg-slate-200/60 border-slate-300 text-slate-900',
        glowColor: 'bg-slate-400/20',
        unitToggleBg: 'border-slate-300 bg-slate-200/70',
        activeBtnBg: 'hover:bg-slate-200 text-slate-900',
      };
    }

    if (icon === 'CloudSun') {
      return {
        cardBg: 'bg-gradient-to-br from-[#eef6fc] via-[#f7f5ed] to-[#fef6dc]',
        borderColor: 'border-amber-200/80',
        headerBorder: 'border-amber-100',
        iconBoxBg: 'bg-amber-100/90 border border-amber-300 text-amber-700 shadow-xs',
        statBoxBg: 'bg-white/85 border-amber-200/60 backdrop-blur-xs',
        adviceBoxBg: 'bg-amber-100/50 border-amber-200 text-amber-950',
        glowColor: 'bg-amber-300/25',
        unitToggleBg: 'border-amber-200 bg-amber-100/60',
        activeBtnBg: 'hover:bg-amber-100 text-amber-950',
      };
    }

    if (isHot) {
      return {
        cardBg: 'bg-gradient-to-br from-[#fff7ed] via-[#ffedd5] to-[#fef08a]/90',
        borderColor: 'border-amber-300',
        headerBorder: 'border-amber-200',
        iconBoxBg: 'bg-amber-100/95 border border-amber-400 text-amber-800 shadow-xs',
        statBoxBg: 'bg-white/85 border-amber-200 backdrop-blur-xs',
        adviceBoxBg: 'bg-amber-100/70 border-amber-300 text-amber-950',
        glowColor: 'bg-orange-400/30',
        unitToggleBg: 'border-amber-300 bg-amber-100/70',
        activeBtnBg: 'hover:bg-amber-200/60 text-amber-950',
      };
    }

    // Default Clear & Sunny Sky
    return {
      cardBg: 'bg-gradient-to-br from-[#eef7ff] via-[#e2efff] to-[#fef3c7]',
      borderColor: 'border-sky-200',
      headerBorder: 'border-sky-200/70',
      iconBoxBg: 'bg-amber-100/90 border border-amber-300 text-amber-700 shadow-xs',
      statBoxBg: 'bg-white/85 border-sky-200/70 backdrop-blur-xs',
      adviceBoxBg: 'bg-amber-100/50 border-amber-200 text-amber-950',
      glowColor: 'bg-amber-300/35',
      unitToggleBg: 'border-sky-200 bg-sky-100/60',
      activeBtnBg: 'hover:bg-sky-100 text-sky-950',
    };
  };

  // Get matching garment items for the suggested outfit
  const suggestedItems = getSuggestedGarments(suggestedOutfit, garments);
  const primaryAttendee = suggestedOutfit?.attending_outfits?.[0] || suggestedOutfit?.members?.[0];
  const weatherTheme = getWeatherCardStyles();

  return (
    <div id="dashboard-container" className="p-4 sm:p-8 max-w-6xl mx-auto space-y-7">
      {/* Top Header */}
      <header id="dashboard-header">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-950 flex items-center gap-2.5 flex-wrap font-serif">
            <span className="text-stone-900">{getTimeGreeting()},</span>
            {isEditingName ? (
              <span className="inline-flex items-center gap-1.5 align-middle">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  className="text-2xl sm:text-3xl font-bold tracking-tight text-stone-950 px-2.5 py-0.5 border-b-2 border-amber-800 bg-amber-50 rounded-lg outline-none max-w-[220px]"
                  placeholder="Your Name"
                />
                <button
                  onClick={handleSaveName}
                  className="p-1.5 bg-stone-950 text-amber-100 hover:bg-stone-800 rounded-xl transition shadow-xs"
                  title="Save Name"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setNameInput(profile?.firstName || '');
                    setIsEditingName(false);
                  }}
                  className="p-1.5 bg-[#ede5d8] text-stone-700 hover:bg-[#e2d8c8] rounded-xl transition"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                <span className="text-amber-900 hover:text-amber-950 transition border-b-2 border-transparent hover:border-amber-700/50" title="Click to edit name">
                  {profile?.firstName || 'there'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingName(true);
                  }}
                  className="p-1.5 text-stone-400 hover:text-amber-900 hover:bg-amber-100/60 rounded-lg transition"
                  title="Edit your name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </span>
            )}
          </h1>
        </div>
      </header>

      {/* Main Weather & Styling Context Grid */}
      <section id="weather-overview-section" className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weather Card (5 cols on lg) */}
        <div
          id="weather-card"
          className={`lg:col-span-5 ${weatherTheme.cardBg} rounded-3xl p-6 border ${weatherTheme.borderColor} shadow-md flex flex-col justify-between relative overflow-hidden transition-all duration-500`}
        >
          {/* Ambient atmospheric glow circle */}
          <div
            className={`absolute -top-12 -right-12 w-52 h-52 rounded-full blur-3xl pointer-events-none ${weatherTheme.glowColor} transition-colors duration-700`}
          />

          {/* Header & Location Controls */}
          <div className="relative z-1">
            <div className={`flex items-center justify-between gap-2 pb-3 border-b ${weatherTheme.headerBorder}`}>
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-white/80 shadow-2xs flex items-center justify-center shrink-0">
                  <MapPin className="w-3.5 h-3.5 text-rose-600" />
                </div>
                <span className="font-bold text-stone-900 text-sm truncate">
                  {weather?.location?.cityName || 'Detecting Location...'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  id="search-city-btn"
                  onClick={() => setShowSearch(!showSearch)}
                  className={`px-2.5 py-1 rounded-lg bg-white/70 hover:bg-white text-stone-800 transition text-xs flex items-center gap-1 font-semibold shadow-2xs border border-white/60`}
                  title="Change City"
                >
                  <Search className="w-3.5 h-3.5 text-stone-600" />
                  <span className="hidden sm:inline">Change</span>
                </button>
                <button
                  id="gps-location-btn"
                  onClick={handleUseGps}
                  disabled={locatingGps}
                  className={`p-1.5 rounded-lg bg-white/70 hover:bg-white text-stone-800 transition text-xs shadow-2xs border border-white/60`}
                  title="Use My Current GPS Location"
                >
                  {locatingGps ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-800" />
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
                  className={`p-1.5 rounded-lg bg-white/70 hover:bg-white text-stone-800 transition text-xs shadow-2xs border border-white/60`}
                  title="Refresh Weather Data"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${weatherLoading ? 'animate-spin text-amber-800' : ''}`} />
                </button>
              </div>
            </div>

            {/* City Search Dropdown Overlay */}
            {showSearch && (
              <div
                id="city-search-overlay"
                className="mt-3 p-3.5 bg-white/95 backdrop-blur-md rounded-2xl border border-stone-200/90 shadow-xl animate-in fade-in slide-in-from-top-2 duration-200 z-20 relative"
              >
                <div className="flex items-center gap-2 border-b border-stone-100 pb-2 mb-2">
                  <Search className="w-4 h-4 text-amber-700" />
                  <input
                    type="text"
                    placeholder="Search city (e.g., Paris, Tokyo, Mumbai, NYC)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full text-sm outline-none bg-transparent placeholder-stone-400 font-medium text-stone-900"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setShowSearch(false);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="text-stone-400 hover:text-stone-700 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {searching && (
                  <div className="flex items-center justify-center py-4 text-xs font-medium text-amber-900">
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
                        className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-50 text-xs text-stone-800 transition flex items-center justify-between font-medium"
                      >
                        <span className="font-semibold truncate">{city.displayName}</span>
                        <span className="text-[10px] text-stone-500 shrink-0 ml-2">
                          {city.latitude.toFixed(1)}°, {city.longitude.toFixed(1)}°
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick select presets */}
                <div className="pt-2 border-t border-stone-100 mt-2">
                  <div className="text-[10px] uppercase font-bold text-stone-500 tracking-wider mb-1.5">
                    Popular Hubs
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
                        className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-lg text-[11px] font-semibold transition border border-stone-200/70"
                      >
                        {city}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Weather Temperature & Condition Hero */}
            <div className="mt-5 flex items-center justify-between">
              <div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-4xl sm:text-5xl font-black tracking-tight text-stone-950 font-serif drop-shadow-2xs">
                    {tempUnit === 'C'
                      ? `${weather?.current?.temperature_c ?? 22}°C`
                      : `${weather?.current?.temperature_f ?? 72}°F`}
                  </span>
                  <div className={`inline-flex rounded-lg border p-0.5 text-xs font-bold shadow-2xs ${weatherTheme.unitToggleBg}`}>
                    <button
                      onClick={() => setTempUnit('C')}
                      className={`px-2 py-0.5 rounded-md transition ${
                        tempUnit === 'C' ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-700 hover:text-stone-950'
                      }`}
                    >
                      °C
                    </button>
                    <button
                      onClick={() => setTempUnit('F')}
                      className={`px-2 py-0.5 rounded-md transition ${
                        tempUnit === 'F' ? 'bg-white text-stone-950 shadow-xs' : 'text-stone-700 hover:text-stone-950'
                      }`}
                    >
                      °F
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 text-stone-800 font-semibold text-sm">
                  <span>{weather?.current?.condition || 'Mild & Clear'}</span>
                  <span className="text-stone-400">·</span>
                  <span className="text-xs text-stone-700 font-medium">
                    Feels like{' '}
                    <strong className="text-stone-950">
                      {tempUnit === 'C'
                        ? `${weather?.current?.apparent_temp_c ?? 22}°C`
                        : `${weather?.current?.apparent_temp_f ?? 72}°F`}
                    </strong>
                  </span>
                </div>
              </div>
              <div className={`p-3.5 rounded-2xl ${weatherTheme.iconBoxBg}`}>
                {renderWeatherIcon(weather?.current?.icon, 'w-10 h-10')}
              </div>
            </div>

            {/* Microclimate Stats Grid */}
            <div className="mt-5 grid grid-cols-3 gap-2.5 text-xs">
              <div className={`rounded-2xl p-2.5 flex flex-col items-center text-center shadow-2xs border ${weatherTheme.statBoxBg}`}>
                <div className="flex items-center text-stone-600 gap-1 mb-0.5 font-medium">
                  <CloudRain className="w-3.5 h-3.5 text-sky-600" />
                  <span className="text-[11px]">Rain Chance</span>
                </div>
                <span className="font-bold text-stone-950 text-sm">
                  {weather?.current?.rain_chance_pct ?? 15}%
                </span>
              </div>

              <div className={`rounded-2xl p-2.5 flex flex-col items-center text-center shadow-2xs border ${weatherTheme.statBoxBg}`}>
                <div className="flex items-center text-stone-600 gap-1 mb-0.5 font-medium">
                  <Thermometer className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-[11px]">Humidity</span>
                </div>
                <span className="font-bold text-stone-950 text-sm">
                  {weather?.current?.humidity_pct ?? 60}%
                </span>
              </div>

              <div className={`rounded-2xl p-2.5 flex flex-col items-center text-center shadow-2xs border ${weatherTheme.statBoxBg}`}>
                <div className="flex items-center text-stone-600 gap-1 mb-0.5 font-medium">
                  <Wind className="w-3.5 h-3.5 text-teal-600" />
                  <span className="text-[11px]">Wind Velocity</span>
                </div>
                <span className="font-bold text-stone-950 text-sm">
                  {weather?.current?.wind_speed_kmh ?? 10} km/h
                </span>
              </div>
            </div>
          </div>

          {/* Style Advice Footer Note */}
          <div className={`mt-5 pt-4 border-t ${weatherTheme.headerBorder} relative z-1`}>
            <div className={`p-3 rounded-2xl border flex items-start gap-2.5 ${weatherTheme.adviceBoxBg}`}>
              <div className="w-6 h-6 rounded-lg bg-white/80 shadow-2xs flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
              </div>
              <div>
                <p className="text-xs font-bold text-stone-950">
                  {weather?.styleAdvice?.headline || 'Temperate Everyday Dressing'}
                </p>
                <p className="text-[11px] text-stone-700 mt-0.5 leading-relaxed font-medium">
                  {weather?.styleAdvice?.layeringAdvice || 'Optimal for breathable single-layer styles and relaxed fits.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* AI Weather-Adapted Outfit Recommendation (7 cols on lg) */}
        <div
          id="weather-outfit-recommendation-card"
          className="lg:col-span-7 bg-gradient-to-br from-white via-[#fcfbf9] to-[#f9f5ee] rounded-3xl p-6 border border-[#e8dfd3] shadow-sm flex flex-col justify-between"
        >
          <div>
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#eee7dd]">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100/90 text-amber-950 border border-amber-300/80 rounded-full text-xs font-bold mb-1 shadow-2xs">
                  <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                  Daily Weather-Adaptive Stylist
                </div>
                <h3 className="font-bold text-lg sm:text-xl text-stone-950 font-serif">
                  {suggestedOutfit?.group_theme_title || "Today's Weather-Matched Fit"}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  id="regenerate-outfit-btn"
                  onClick={() => generateWeatherOutfit()}
                  disabled={generatingSuggestion || garments.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#f5efe6] hover:bg-[#eae0d2] text-stone-900 border border-[#e5ded3] text-xs font-semibold rounded-xl transition disabled:opacity-50 cursor-pointer shadow-2xs"
                  title="Generate another weather combination"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${generatingSuggestion ? 'animate-spin text-amber-700' : 'text-stone-600'}`} />
                  <span>{generatingSuggestion ? 'Styling...' : 'Try Another Combo'}</span>
                </button>
              </div>
            </div>

            {/* Quick Vibe Chips */}
            {garments.length > 0 && (
              <div className="pt-3 pb-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-bold text-stone-500 mr-1 uppercase tracking-wider">Aesthetic:</span>
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
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                      selectedVibe === vibe.id
                        ? 'bg-stone-950 text-amber-100 border-stone-950 shadow-xs'
                        : 'bg-[#f7f2ea] text-stone-700 border-[#e8ded2] hover:bg-[#eae1d3] hover:text-stone-950'
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
                <Loader2 className="w-8 h-8 animate-spin text-amber-700" />
                <p className="text-sm font-bold text-stone-900">
                  Calibrating climate data & selecting matching pieces...
                </p>
                <p className="text-xs text-stone-500 font-medium">
                  Balancing fabric breathability, rain protection, and color harmony
                </p>
              </div>
            ) : garments.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <Shirt className="w-10 h-10 text-amber-300 mx-auto" />
                <h4 className="font-bold text-stone-900 text-sm">Your wardrobe is empty</h4>
                <p className="text-xs text-stone-600 max-w-sm mx-auto font-medium">
                  Add a few pieces to your closet to unlock instant AI weather styling recommendations.
                </p>
                <Link
                  to="/closet"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-stone-900 text-amber-100 rounded-xl text-xs font-bold hover:bg-stone-800 transition shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  Add Garments to Closet
                </Link>
              </div>
            ) : suggestedItems.length > 0 ? (
              <div className="mt-3.5 space-y-3.5">
                {/* Color Harmony Palette Bar (if present) */}
                {suggestedOutfit?.group_color_palette && Array.isArray(suggestedOutfit.group_color_palette) && (
                  <div className="flex items-center justify-between px-3.5 py-2 bg-[#f6efe4] rounded-2xl border border-[#e8dfd3]">
                    <span className="text-[11px] font-bold text-stone-700">Curated Color Harmony:</span>
                    <div className="flex items-center gap-2">
                      {suggestedOutfit.group_color_palette.map((colorHex: string, cIdx: number) => (
                        <div
                          key={cIdx}
                          className="w-4 h-4 rounded-full border border-stone-300 shadow-xs"
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
                      className="bg-[#faf6f0] border border-[#ebe4da] rounded-2xl p-2.5 flex flex-col items-center text-center group hover:border-amber-300 hover:shadow-xs transition"
                    >
                      <div className="w-full aspect-square bg-white rounded-xl mb-2 overflow-hidden flex items-center justify-center p-1.5 border border-[#eee7dd]">
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
                      <span className="text-[10px] uppercase font-bold text-amber-900/70 tracking-wider">
                        {garment?.category}
                      </span>
                      <span className="text-xs font-bold text-stone-900 truncate w-full capitalize mt-0.5">
                        {garment?.subCategory || garment?.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full border border-stone-300 shrink-0"
                          style={{ backgroundColor: garment?.primaryColorHex || '#888888' }}
                        />
                        <span className="text-[10px] text-stone-600 truncate max-w-[75px] font-medium">
                          {garment?.primaryColorName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Weather & Style Rationale */}
                <div className="p-3.5 bg-[#fbf6ec] rounded-2xl border border-[#ede1cc] text-xs text-stone-800 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>Weather Adaptation Rationale:</span>
                  </div>
                  <p className="text-stone-700 font-medium">
                    {suggestedOutfit?.weather_rationale ||
                      primaryAttendee?.individual_styling_note ||
                      suggestedOutfit?.coordination_rationale ||
                      `Formulated to keep you comfortable in ${weather?.current?.temperature_c ?? 22}°C weather with breathable fabrics.`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-stone-600 font-medium">Ready to compute your weather outfit.</p>
                <button
                  onClick={() => generateWeatherOutfit()}
                  className="px-4 py-2 bg-stone-900 text-amber-100 rounded-xl text-xs font-bold hover:bg-stone-800 transition cursor-pointer shadow-xs"
                >
                  Generate Outfit Now
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {suggestedItems.length > 0 && !generatingSuggestion && (
            <div className="mt-4 pt-3.5 border-t border-[#eee7dd] flex flex-wrap items-center justify-between gap-3">
              <button
                id="log-suggested-worn-btn"
                onClick={handleLogSuggestedOutfit}
                disabled={loggingSuggestedOutfit || suggestedOutfitLogged}
                className="inline-flex items-center gap-2 px-4 py-2 bg-stone-950 hover:bg-stone-800 text-amber-100 text-xs font-bold rounded-xl transition disabled:opacity-60 shadow-xs cursor-pointer"
              >
                {suggestedOutfitLogged ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Logged to Outfit History
                  </>
                ) : loggingSuggestedOutfit ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    Logging...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 text-amber-300" />
                    Wear & Log Outfit Today
                  </>
                )}
              </button>

              <Link
                to="/planner"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 hover:text-amber-900 transition"
              >
                <span>Specific Event or Group? Open Planner</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
