import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { 
  Loader2, 
  Sparkles, 
  Check, 
  Plus, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  Sun, 
  CloudRain, 
  Thermometer, 
  Wind, 
  CheckCircle2, 
  Users, 
  User, 
  Shirt, 
  Palette,
  Calendar
} from 'lucide-react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { FamilyMember, Garment, WeatherContext } from '../types';

export default function Planner() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedAttendeeIds, setSelectedAttendeeIds] = useState<string[]>(['self']);
  const { user, profile } = useAuth();

  // Live weather context state
  const [weather, setWeather] = useState<WeatherContext>({
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

  // Cooldown countdown timer
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

  // Load garments and family members
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      const garmentsCacheKey = `vastrakalp_garments_${user.uid}`;
      const membersCacheKey = `vastrakalp_family_members_${user.uid}`;

      try {
        const cachedGarments = localStorage.getItem(garmentsCacheKey);
        if (cachedGarments) setGarments(JSON.parse(cachedGarments));
        const cachedMembers = localStorage.getItem(membersCacheKey);
        if (cachedMembers) {
          const parsed = JSON.parse(cachedMembers);
          setFamilyMembers(parsed);
          // Default to selecting all family members for easy group planning
          setSelectedAttendeeIds(['self', ...parsed.map((m: FamilyMember) => m.id)]);
        }
      } catch {}

      try {
        const qG = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
        const snapG = await getDocs(qG);
        const dataG = snapG.docs.map(doc => ({ ...doc.data(), id: doc.id } as Garment));
        setGarments(dataG);
        try { localStorage.setItem(garmentsCacheKey, JSON.stringify(dataG)); } catch {}

        const qM = query(collection(db, 'familyMembers'), where('userId', '==', user.uid));
        const snapM = await getDocs(qM);
        const dataM = snapM.docs.map(doc => ({ ...doc.data(), id: doc.id } as FamilyMember));
        setFamilyMembers(dataM);
        try { localStorage.setItem(membersCacheKey, JSON.stringify(dataM)); } catch {}

        // If previously only 'self' was selected, update to include newly loaded members
        if (dataM.length > 0) {
          setSelectedAttendeeIds(prev => Array.from(new Set([...prev, ...dataM.map(m => m.id)])));
        }
      } catch (err) {
        console.warn('Operating with cached data in Planner:', err);
      }
    }
    loadData();
  }, [user]);

  const [logging, setLogging] = useState(false);
  const [logged, setLogged] = useState(false);

  const toggleAttendee = (id: string) => {
    setSelectedAttendeeIds(prev => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one attendee
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setSuggestion(null);
    setLogged(false);
    setError(null);
    setCountdown(null);

    try {
      let currentGarments = garments;
      if (currentGarments.length === 0 && user) {
        try {
          const q = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
          const snapshot = await getDocs(q);
          currentGarments = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Garment));
          setGarments(currentGarments);
        } catch (fetchErr) {
          console.warn('Failed to pre-fetch garments:', fetchErr);
        }
      }

      if (currentGarments.length === 0) {
        setError('Your wardrobe is empty. Please add garments before planning outfits.');
        setLoading(false);
        return;
      }

      // Check if we are doing multi-person family styling
      const isMultiPerson = selectedAttendeeIds.length > 1 || selectedAttendeeIds.some(id => id !== 'self');

      if (isMultiPerson && familyMembers.length > 0) {
        // Build partitioned family closets for each selected attendee
        const family_closets = selectedAttendeeIds.map(attendeeId => {
          if (attendeeId === 'self') {
            const selfGarments = currentGarments.filter(
              g => !g.memberId || g.memberId === 'self' || (user && g.memberId === user.uid)
            );
            return {
              member_id: 'self',
              name: profile?.firstName || 'You',
              relationship: 'self',
              garments: selfGarments
            };
          } else {
            const member = familyMembers.find(m => m.id === attendeeId);
            const memberGarments = currentGarments.filter(g => g.memberId === attendeeId);
            return {
              member_id: attendeeId,
              name: member?.name || 'Family Member',
              relationship: member?.relationship || 'family',
              relation: member?.relation || member?.relationship,
              age: member?.age,
              gender: member?.gender,
              notes: member?.notes,
              garments: memberGarments
            };
          }
        });

        const result = await api.suggestFamilyOutfit(prompt, weather, family_closets);
        setSuggestion(result);
      } else {
        // Single user personal styling
        const selfGarments = currentGarments.filter(
          g => !g.memberId || g.memberId === 'self' || (user && g.memberId === user.uid)
        );
        const result = await api.suggestOutfit(prompt, weather, selfGarments.length > 0 ? selfGarments : currentGarments);
        setSuggestion(result);
      }
    } catch (err: any) {
      const isRateLimit =
        err?.isRateLimit ||
        err?.code === 'RATE_LIMIT_EXCEEDED' ||
        err?.status === 429 ||
        /tokens per minute|tpm|quota|rate limit/i.test(err?.message || '');

      if (isRateLimit) {
        const sec = err?.retryAfterSeconds || 60;
        setCountdown(sec);
        setError(`Gemini rate limit reached (Tokens Per Minute). Retrying automatically in ${sec}s...`);
      } else {
        setError(err.message || 'Failed to generate outfit recommendation.');
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

  const suggestedGarmentIds: string[] = suggestion
    ? (attendingOutfits.length > 0
        ? attendingOutfits.flatMap((a: any) => a.selected_item_ids || [])
        : [suggestion.topId, suggestion.bottomId, suggestion.outerwearId, suggestion.footwearId, ...(suggestion.accessoryIds || [])]
      ).filter(Boolean)
    : [];

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

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Vastrakalp Family Styling Planner</h1>
      </header>

      {/* 1. Attending Family Members Selector */}
      <section className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-stone-700" />
            <span className="text-xs font-bold text-stone-700 uppercase tracking-wider">
              Select Attending Household Members
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelectedAttendeeIds(['self', ...familyMembers.map(m => m.id)])}
              className="text-stone-600 hover:text-stone-900 underline font-medium"
            >
              Select All
            </button>
            <span className="text-stone-300">·</span>
            <button
              type="button"
              onClick={() => setSelectedAttendeeIds(['self'])}
              className="text-stone-600 hover:text-stone-900 underline font-medium"
            >
              Just Me
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* User Self */}
          {(() => {
            const isSelected = selectedAttendeeIds.includes('self');
            const selfCount = garments.filter(g => !g.memberId || g.memberId === 'self' || (user && g.memberId === user.uid)).length;
            return (
              <button
                type="button"
                onClick={() => toggleAttendee('self')}
                className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                    : 'border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div className="w-6 h-6 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {(profile?.firstName || 'Y').charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <div>{profile?.firstName || 'You'} (Self)</div>
                    <div className={`text-[10px] font-normal ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                      {selfCount} pieces
                    </div>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-amber-300 shrink-0" />}
              </button>
            );
          })()}

          {/* Dynamic Family Members */}
          {familyMembers.map((member) => {
            const isSelected = selectedAttendeeIds.includes(member.id);
            const memberCount = garments.filter(g => g.memberId === member.id).length;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => toggleAttendee(member.id)}
                className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                    : 'border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div 
                    className="w-6 h-6 rounded-xl text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-xs"
                    style={{ backgroundColor: member.avatarColor || '#ec4899' }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <div className="truncate">{member.name}</div>
                    <div className={`text-[10px] font-normal capitalize ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                      {member.relation || member.relationship}{member.age !== undefined ? `, ${member.age}y` : ''} · {memberCount} pcs
                    </div>
                  </div>
                </div>
                {isSelected && <Check className="w-4 h-4 text-amber-300 shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Live Weather Conditions Card */}
      <section className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
              {weather.precipitation > 40 ? <CloudRain className="w-6 h-6 text-sky-600" /> : <Sun className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-stone-900">{weather.temperature}°C</span>
                <span className="text-xs font-medium text-stone-600">· {weather.condition}</span>
              </div>
              <p className="text-[11px] text-stone-400">Live Weather Context & Atmospheric Index</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-700">
              <CloudRain className="w-3.5 h-3.5 text-sky-600" />
              <span>Rain: <strong>{weather.precipitation}%</strong></span>
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

        {/* Active Weather Guardrails */}
        <div className="pt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-stone-800">Thermal Adaptation</p>
              <p className="text-stone-500 text-[11px]">
                {weather.humidity > 65 || weather.temperature > 28
                  ? 'Lightweight, breathable natural fabrics'
                  : 'Comfortable thermal index'}
              </p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-stone-800">Vastrakalp Palette Balance</p>
              <p className="text-stone-500 text-[11px]">Cohesive 3-4 shade palette; 0 unintentional twinning</p>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-stone-50 border border-stone-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-stone-800">Strict Closet Isolation</p>
              <p className="text-stone-500 text-[11px]">Outfits pulled strictly from respective member closets</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Event Prompt Form */}
      <section className="bg-white p-5 sm:p-6 rounded-3xl border border-stone-200/80 shadow-xs space-y-4">
        <form onSubmit={handleSuggest} className="flex flex-col sm:flex-row gap-3">
          <input 
            id="input-planner-prompt"
            type="text" 
            placeholder="Describe the occasion (e.g. 'Golden hour sunset wedding reception', 'Casual sunday brunch')"
            className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 text-sm"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
          <button 
            id="btn-submit-style-group"
            type="submit" 
            disabled={loading || !prompt.trim()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-stone-900 hover:bg-stone-800 text-white font-semibold rounded-2xl text-xs transition disabled:opacity-50 shadow-sm cursor-pointer"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            <span>{selectedAttendeeIds.length > 1 ? `Style Group (${selectedAttendeeIds.length})` : 'Style Outfit'}</span>
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

      {/* 4. Styled Outfits Result Section */}
      {suggestion && (
        <section className="space-y-6 animate-in fade-in duration-300">
          {/* Group Palette & Coordination Header */}
          <div className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-stone-100">
              <div>
                {themeTitle && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200/60 text-amber-900 text-xs font-semibold mb-2">
                    <Palette className="w-3.5 h-3.5 text-amber-600" />
                    <span>{themeTitle}</span>
                  </div>
                )}
                <h3 className="font-bold text-lg text-stone-900">Vastrakalp Group Color Harmony & Aesthetic Strategy</h3>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {paletteHexes && Array.isArray(paletteHexes) && paletteHexes.length > 0 && (
                  <div className="flex items-center gap-1.5 bg-stone-50 p-1.5 rounded-2xl border border-stone-200">
                    {paletteHexes.map((hex: string, idx: number) => (
                      <div 
                        key={idx} 
                        className="w-7 h-7 rounded-xl border border-stone-300 shadow-2xs transition transform hover:scale-110" 
                        style={{ backgroundColor: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                )}

                <button 
                  id="btn-log-group-outfit"
                  onClick={handleLogOutfit}
                  disabled={logging || logged}
                  className="shrink-0 flex items-center px-4 py-2 bg-stone-900 text-white text-xs font-semibold rounded-xl hover:bg-stone-800 transition disabled:opacity-50 shadow-sm"
                >
                  {logging ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : (logged ? <Check className="w-4 h-4 mr-1.5 text-emerald-400" /> : <Plus className="w-4 h-4 mr-1.5" />)}
                  {logged ? 'Logged to History' : 'Log Group Wear'}
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
                <span className="font-semibold">Weather & Fabric Balance: </span>
                {weatherRationale}
              </div>
            )}
          </div>

          {/* Attendee Outfits */}
          {attendingOutfits && attendingOutfits.length > 0 ? (
            <div className="space-y-6">
              {attendingOutfits.map((attendee: any, aIdx: number) => {
                const attendeeGarments = (attendee.selected_item_ids || [])
                  .map((id: string) => getGarment(id))
                  .filter(Boolean);

                const note = attendee.individual_styling_notes || attendee.individual_styling_note || attendee.outfit_summary;
                const relationship = attendee.relationship || attendee.relation;
                const member = familyMembers.find(m => m.id === attendee.member_id);
                const avatarColor = member?.avatarColor || (attendee.member_id === 'self' ? '#f59e0b' : '#ec4899');

                return (
                  <div key={attendee.member_id || aIdx} className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white text-sm shadow-xs"
                          style={{ backgroundColor: avatarColor }}
                        >
                          {attendee.name?.[0] || 'A'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-stone-900 text-base">{attendee.name}</h4>
                            <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-[11px] font-semibold text-stone-700 capitalize">
                              {relationship}
                            </span>
                            {attendee.dominant_color_hex && (
                              <div 
                                className="w-4 h-4 rounded-full border border-stone-300"
                                style={{ backgroundColor: attendee.dominant_color_hex }}
                                title={`Tone: ${attendee.dominant_color_hex}`}
                              />
                            )}
                          </div>
                          {note && <p className="text-xs text-stone-600 mt-1">{note}</p>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-3 py-1 rounded-xl bg-amber-50 text-amber-900 font-semibold border border-amber-200">
                          Formality: {attendee.formality_score || 3}/5
                        </span>
                      </div>
                    </div>

                    {attendeeGarments.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {attendeeGarments.map((garment: Garment) => (
                          <div key={garment.id} className="bg-stone-50 rounded-2xl border border-stone-200/80 overflow-hidden shadow-2xs flex flex-col justify-between">
                            <div className="aspect-square bg-white p-3 flex items-center justify-center relative">
                              {garment.imageUrl ? (
                                <img src={garment.imageUrl} alt={garment.name || garment.subCategory} className="object-contain w-full h-full mix-blend-multiply" />
                              ) : (
                                <div className="text-stone-300 text-xs">No Image</div>
                              )}
                              <div className="absolute top-2 left-2">
                                <span className="px-2 py-0.5 bg-stone-900/80 backdrop-blur text-white text-[9px] font-bold uppercase rounded-md">
                                  {garment.category}
                                </span>
                              </div>
                            </div>
                            <div className="p-3">
                              <div className="flex items-center justify-between mb-1">
                                <h5 className="font-semibold text-stone-900 text-xs truncate pr-1">{garment.name || garment.subCategory}</h5>
                                <div className="w-2.5 h-2.5 rounded-full border border-stone-300 shrink-0" style={{ backgroundColor: garment.primaryColorHex }} />
                              </div>
                              <p className="text-[11px] text-stone-500 capitalize">{garment.primaryColorName} · {garment.material || ''}</p>
                              <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-stone-200 text-[10px] text-stone-600">
                                <span>Warmth {garment.thermalWeight}/5</span>
                                <span>·</span>
                                <span>Formality {garment.formalityScore}/5</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 bg-stone-50 rounded-2xl text-xs text-stone-700">
                        <p>{note || 'Coordinates with the group palette and weather context.'}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Fallback individual items grid */
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {suggestedGarmentIds.map(id => getGarment(id)).filter(Boolean).map((garment: any) => (
                <div key={garment.id} className="bg-white rounded-3xl border border-stone-200/80 overflow-hidden shadow-2xs">
                  <div className="aspect-square bg-stone-50 p-4 flex items-center justify-center relative">
                    {garment.imageUrl ? (
                      <img src={garment.imageUrl} alt={garment.subCategory || garment.name} className="object-contain w-full h-full mix-blend-multiply" />
                    ) : (
                      <div className="text-stone-300 text-xs">No Image</div>
                    )}
                    <div className="absolute top-3 left-3">
                      <div className="px-2 py-0.5 bg-stone-900/80 backdrop-blur text-white text-[9px] font-bold uppercase rounded-md">
                        {garment.category}
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-stone-900 capitalize truncate pr-2 text-xs">{garment.name || garment.subCategory}</h4>
                      <div className="w-3 h-3 rounded-full border border-stone-200 shrink-0" style={{ backgroundColor: garment.primaryColorHex }} />
                    </div>
                    <p className="text-[11px] text-stone-500 capitalize">{garment.primaryColorName} · {garment.material || ''}</p>
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
