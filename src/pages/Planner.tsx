import React from 'react';
import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { Loader2, Sparkles, Check, Plus, AlertCircle, Clock, RefreshCw, Sun, CloudRain, Thermometer, Wind, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

export default function Planner() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [garments, setGarments] = useState<any[]>([]);
  const { user } = useAuth();

  // Live weather context state
  const [weather, setWeather] = useState({
    temperature: 24,
    condition: 'Mainly Clear',
    precipitation: 15,
    humidity: 65,
    wind: '10km/h'
  });

  // Fetch live weather context
  useEffect(() => {
    async function loadWeather() {
      try {
        let params: any = undefined;
        const savedLoc = localStorage.getItem('vastrakalp_last_weather_loc');
        if (savedLoc) {
          const parsed = JSON.parse(savedLoc);
          if (parsed.latitude && parsed.longitude) {
            params = { lat: parsed.latitude, lon: parsed.longitude };
          }
        }
        const data = await api.getWeather(params);
        if (data?.current) {
          setWeather({
            temperature: data.current.temperature_c,
            condition: data.current.condition || 'Clear',
            precipitation: data.current.rain_chance_pct,
            humidity: data.current.humidity_pct,
            wind: `${data.current.wind_speed_kmh}km/h`
          });
        }
      } catch (err) {
        console.warn('Planner using default weather context:', err);
      }
    }
    loadWeather();
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      handleGenerate();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Load user's garments to render the suggested ones
  useEffect(() => {
    async function load() {
      if (!user) return;
      const cacheKey = `vastrakalp_garments_${user.uid}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setGarments(JSON.parse(cached));
        }
      } catch {
        // Ignore cache parse error
      }

      try {
        const q = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        setGarments(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          // Ignore cache save error
        }
      } catch (error) {
        console.warn('Operating with local garments cache in Planner while connecting to Firestore:', error);
      }
    }
    load();
  }, [user]);

  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  const handleLogOutfit = async () => {
    if (!user || suggestedGarmentIds.length === 0) return;
    setLogging(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const promises = suggestedGarmentIds.map(id => 
        addDoc(collection(db, 'garmentWears'), {
          garmentId: id,
          userId: user.uid,
          wornDate: today
        })
      );
      await Promise.all(promises);
      setLogged(true);
    } catch (error) {
      console.error('Failed to log outfit:', error);
      alert('Failed to log outfit to history.');
    } finally {
      setLogging(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setSuggestion(null);
    setLogged(false);
    setError(null);
    setCountdown(null);
    try {
      // Ensure garments are available
      let currentGarments = garments;
      if (currentGarments.length === 0 && user) {
        try {
          const q = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
          const snapshot = await getDocs(q);
          currentGarments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
          setGarments(currentGarments);
        } catch (fetchErr) {
          console.warn('Failed to pre-fetch garments:', fetchErr);
        }
      }

      if (currentGarments.length === 0) {
        setError('Your closet is empty. Please add garments before generating an outfit.');
        setLoading(false);
        return;
      }

      const result = await api.suggestOutfit(prompt, weather, currentGarments);
      setSuggestion(result);
    } catch (err: any) {
      const isRateLimit =
        err?.isRateLimit ||
        err?.code === 'RATE_LIMIT_EXCEEDED' ||
        err?.status === 429 ||
        /tokens per minute|tpm|quota|rate limit/i.test(err?.message || '');

      if (isRateLimit) {
        const sec = err?.retryAfterSeconds || 60;
        setCountdown(sec);
        setError(`Gemini rate limit reached (Tokens Per Minute). Retrying in ${sec}s...`);
      } else {
        setError(err.message || 'Failed to generate outfit suggestion.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSuggest = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleGenerate();
  };

  const getGarment = (id: string) => garments.find(g => g.id === id);

  const attendingOutfits = suggestion?.attending_outfits || suggestion?.attendee_outfits || [];
  const themeTitle = suggestion?.group_theme_title || suggestion?.palette_theme;
  const paletteHexes = suggestion?.group_color_palette || suggestion?.group_palette_hex || [];
  const coordinationRationale = suggestion?.coordination_rationale || suggestion?.coordination_notes || suggestion?.rationale;
  const weatherRationale = suggestion?.weather_rationale;

  // Extract all suggested garment IDs across attendee outfits or legacy format
  const suggestedGarmentIds: string[] = suggestion
    ? (attendingOutfits.length > 0
        ? attendingOutfits.flatMap((a: any) => a.selected_item_ids || [])
        : [suggestion.topId, suggestion.bottomId, suggestion.outerwearId, suggestion.footwearId, ...(suggestion.accessoryIds || [])]
      ).filter(Boolean)
    : [];

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">HueSync Family Styling Engine</h1>
        <p className="text-stone-500 mt-1">AI Personal & Group Wardrobe Stylist providing weather-adaptive, color-harmonious group recommendations.</p>
      </header>

      {/* Live Weather Conditions Card */}
      <section className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              {weather.precipitation > 40 ? <CloudRain className="w-6 h-6 text-sky-600" /> : <Sun className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-stone-900">{weather.temperature}°C</span>
                <span className="text-sm font-medium text-stone-600">· {weather.condition}</span>
              </div>
              <p className="text-xs text-stone-500">Live Weather Snapshot from Weather API</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-700">
              <CloudRain className="w-3.5 h-3.5 text-sky-600" />
              <span>Rain Prob: <strong>{weather.precipitation}%</strong></span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-700">
              <Thermometer className="w-3.5 h-3.5 text-rose-500" />
              <span>Humidity: <strong>{weather.humidity}%</strong></span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-700">
              <Wind className="w-3.5 h-3.5 text-stone-500" />
              <span>Wind: <strong>{weather.wind}</strong></span>
            </div>
          </div>
        </div>

        {/* Active Weather Guardrails Indicator */}
        <div className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-stone-800">Thermal Adaptation</p>
              <p className="text-stone-500">
                {weather.humidity > 65 || weather.temperature > 28
                  ? 'Humidity >65% or Temp >28°C: Lightweight, breathable fabrics'
                  : 'Comfortable thermal index: Layering allowed'}
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-stone-800">Color Harmony & Anti-Twinning</p>
              <p className="text-stone-500">Unifying 3-4 color palette; max 1 statement pattern</p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-stone-800">Strict Closet Isolation</p>
              <p className="text-stone-500">Individual attendee closets strictly preserved</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-4">
        <form onSubmit={handleSuggest} className="flex gap-4">
          <input 
            type="text" 
            placeholder="Describe the event and attendees (e.g. 'Outdoor terrace dinner with my dad and sister')"
            className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-stone-900"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button 
            type="submit" 
            disabled={loading || !prompt.trim()}
            className="flex items-center px-6 py-3 bg-stone-900 text-white font-medium rounded-xl hover:bg-stone-800 transition disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Sparkles className="w-5 h-5 mr-2" />}
            Style Group
          </button>
        </form>

        {countdown !== null && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 animate-spin text-amber-700" />
              <span>Rate limit cooldown active. Retrying automatically in <strong>{countdown}s</strong>...</span>
            </div>
            <button
              type="button"
              onClick={() => { setCountdown(null); handleGenerate(); }}
              className="flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              Retry Now
            </button>
          </div>
        )}

        {error && countdown === null && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}
      </section>

      {suggestion && (
        <section className="space-y-6">
          {/* Group Palette & Coordination Header */}
          <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-stone-100">
              <div>
                {themeTitle && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-amber-900 text-xs font-semibold mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>{themeTitle}</span>
                  </div>
                )}
                <h3 className="font-semibold text-lg text-stone-900">Group Color Harmony & Coordination</h3>
              </div>

              <div className="flex items-center gap-3">
                {paletteHexes && Array.isArray(paletteHexes) && paletteHexes.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-stone-50 p-1.5 rounded-2xl border border-stone-200">
                    {paletteHexes.map((hex: string, idx: number) => (
                      <div 
                        key={idx} 
                        className="w-7 h-7 rounded-xl border border-stone-300 shadow-sm transition transform hover:scale-110" 
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                )}

                <button 
                  onClick={handleLogOutfit}
                  disabled={logging || logged}
                  className="shrink-0 flex items-center px-4 py-2 bg-stone-900 text-white text-sm font-medium rounded-xl hover:bg-stone-800 transition disabled:opacity-50"
                >
                  {logging ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : (logged ? <Check className="w-4 h-4 mr-1.5 text-green-400" /> : <Plus className="w-4 h-4 mr-1.5" />)}
                  {logged ? 'Logged for Today' : 'Log Outfit'}
                </button>
              </div>
            </div>

            {coordinationRationale && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">Coordination Rationale</h4>
                <p className="text-stone-700 leading-relaxed text-sm">
                  {coordinationRationale}
                </p>
              </div>
            )}

            {weatherRationale && (
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-100 text-xs text-amber-900">
                <span className="font-semibold">Weather & Fabric Strategy: </span>
                {weatherRationale}
              </div>
            )}
          </div>

          {/* Attendee Outfits or Individual Garments */}
          {attendingOutfits && attendingOutfits.length > 0 ? (
            <div className="space-y-6">
              {attendingOutfits.map((attendee: any, aIdx: number) => {
                const attendeeGarments = (attendee.selected_item_ids || [])
                  .map((id: string) => getGarment(id))
                  .filter(Boolean);

                const note = attendee.individual_styling_note || attendee.outfit_summary;
                const relationship = attendee.relationship || attendee.relation;
                const itemTitles = attendee.item_titles || [];

                return (
                  <div key={attendee.member_id || aIdx} className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center font-bold text-stone-700 text-xs shadow-inner">
                          {attendee.name?.[0] || 'A'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-stone-900 text-base">{attendee.name}</h4>
                            <span className="px-2 py-0.5 rounded-md bg-stone-100 text-[11px] font-medium text-stone-600 capitalize">
                              {relationship}
                            </span>
                            {attendee.dominant_color_hex && (
                              <div 
                                className="w-3.5 h-3.5 rounded-full border border-stone-300"
                                style={{ backgroundColor: attendee.dominant_color_hex }}
                                title={`Dominant: ${attendee.dominant_color_hex}`}
                              />
                            )}
                          </div>
                          {note && <p className="text-xs text-stone-600 mt-0.5">{note}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 font-semibold border border-amber-200">
                          Formality: {attendee.formality_score}/5
                        </span>
                      </div>
                    </div>

                    {attendeeGarments.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {attendeeGarments.map((garment: any) => (
                          <div key={garment.id} className="bg-stone-50 rounded-2xl border border-stone-200/70 overflow-hidden shadow-sm">
                            <div className="aspect-square bg-white p-3 flex items-center justify-center relative">
                              {garment.imageUrl ? (
                                <img src={garment.imageUrl} alt={garment.subCategory || garment.title} className="object-contain w-full h-full mix-blend-multiply" />
                              ) : (
                                <div className="text-stone-300 text-xs">No Image</div>
                              )}
                              <div className="absolute top-2 left-2">
                                <span className="px-1.5 py-0.5 bg-stone-900/80 text-white text-[9px] font-bold uppercase rounded">
                                  {garment.category}
                                </span>
                              </div>
                            </div>
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-1">
                                <h5 className="font-semibold text-stone-900 text-xs truncate pr-1">{garment.title || garment.name || garment.subCategory}</h5>
                                <div className="w-2.5 h-2.5 rounded-full border border-stone-300 shrink-0" style={{ backgroundColor: garment.primaryColorHex || garment.primary_color_hex }} />
                              </div>
                              <p className="text-[11px] text-stone-500 capitalize">{garment.primaryColorName || ''} {garment.material || ''}</p>
                              <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-stone-200 text-[10px] text-stone-600">
                                <span>Warmth {garment.thermalWeight || garment.thermal_weight || 2}/5</span>
                                <span>·</span>
                                <span>Formality {garment.formalityScore || garment.formality_score || 3}/5</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-stone-50 rounded-xl text-xs text-stone-700 space-y-1">
                        {itemTitles.length > 0 && (
                          <p className="font-medium text-stone-900">
                            Selected items: {itemTitles.join(', ')}
                          </p>
                        )}
                        <p>{note}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback individual items grid */
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {suggestedGarmentIds.map(id => getGarment(id)).filter(Boolean).map((garment: any) => (
                <div key={garment.id} className="bg-white rounded-2xl border border-stone-100 overflow-hidden shadow-sm">
                  <div className="aspect-square bg-stone-50 p-4 flex items-center justify-center relative">
                    {garment.imageUrl ? (
                      <img src={garment.imageUrl} alt={garment.subCategory || garment.title} className="object-contain w-full h-full mix-blend-multiply" />
                    ) : (
                      <div className="text-stone-300">No Image</div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1">
                      <div className="px-2 py-1 bg-white/90 backdrop-blur text-[10px] font-bold uppercase tracking-wider text-stone-600 rounded-md">
                        {garment.category}
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-stone-900 capitalize truncate pr-2">{garment.title || garment.name || garment.subCategory}</h4>
                      <div className="w-3 h-3 rounded-full border border-stone-200 shrink-0" style={{ backgroundColor: garment.primaryColorHex || garment.primary_color_hex }} />
                    </div>
                    <p className="text-xs text-stone-500 capitalize">{garment.primaryColorName || ''} {garment.material || ''}</p>
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-stone-100 text-[11px] text-stone-600">
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 font-medium">Weight {garment.thermalWeight || garment.thermal_weight || 2}/5</span>
                      <span className="px-1.5 py-0.5 rounded bg-stone-100 font-medium">Formality {garment.formalityScore || garment.formality_score || 3}/5</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
