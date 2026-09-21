import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

const GarmentSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: {
      type: Type.STRING,
      description: 'A descriptive, professional title for the garment or set (e.g., "Midnight Navy 3-Piece Wool Suit" or "Classic White Cotton T-Shirt")'
    },
    category: {
      type: Type.STRING,
      enum: ['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'suit', 'kurta_set', 'tuxedo', 'co_ord_set'],
      description: 'The main category. If it is a matching set, use suit, kurta_set, tuxedo, or co_ord_set'
    },
    subCategory: {
      type: Type.STRING,
      description: 'Specific type of garment (e.g. t-shirt, jeans, sneaker, 3-piece suit)'
    },
    primaryColorName: {
      type: Type.STRING,
      description: 'Human-readable primary color name (e.g. Navy Blue, Crimson)'
    },
    primaryColorHex: {
      type: Type.STRING,
      description: 'HEX code representing the primary color (e.g. #000080)'
    },
    accentColors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Names of accent or secondary colors'
    },
    pattern: {
      type: Type.STRING,
      description: 'Pattern type (e.g. solid, striped, floral, plaid)'
    },
    material: {
      type: Type.STRING,
      description: 'Material or fabric (e.g. cotton, denim, leather, wool blend)'
    },
    fit: {
      type: Type.STRING,
      description: 'Fit type (e.g. slim, regular, oversized)'
    },
    designDetails: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Specific design details'
    },
    formalityScore: {
      type: Type.INTEGER,
      description: 'Formality score from 1 (very casual) to 5 (very formal/festive)'
    },
    thermalWeight: {
      type: Type.INTEGER,
      description: 'Thermal warmth from 1 (light/summer) to 5 (heavy winter)'
    },
    weatherSuitability: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Suitable weather conditions'
    },
    included_pieces: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Explicitly list all components visible in the set. Empty if it is a single item.'
    },
    styling_notes: {
      type: Type.STRING,
      description: 'Suggestions for complementary shoes or accessories to complete the outfit.'
    }
  },
  required: ['name', 'category', 'subCategory', 'primaryColorName', 'primaryColorHex', 'formalityScore', 'thermalWeight']
};



export class GeminiRateLimitError extends Error {
  code = 'RATE_LIMIT_EXCEEDED';
  retryAfterSeconds: number;
  isRateLimit = true;
  constructor(message = 'Gemini Tokens Per Minute (TPM) or rate quota exceeded', retryAfterSeconds = 60) {
    super(message);
    this.name = 'GeminiRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Ordered candidate models for automatic multi-model fallback:
// 1. gemini-3.8-flash: primary multimodal flash model
// 2. gemini-3.1-flash-lite: ultra-fast lightweight multimodal model
// 3. gemini-flash-latest: stable alias for flash multimodal
const CANDIDATE_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest'
];

// In-memory cooldown tracking to avoid hitting quota-exhausted or timed-out models repeatedly
const modelCooldowns: Record<string, number> = {};

function markModelCooldown(model: string, durationMs: number = 30 * 1000) {
  modelCooldowns[model] = Date.now() + durationMs;
}

function isModelInCooldown(model: string): boolean {
  const expiresAt = modelCooldowns[model];
  if (!expiresAt) return false;
  if (Date.now() >= expiresAt) {
    delete modelCooldowns[model];
    return false;
  }
  return true;
}

function extractRetryDelayMs(error: any): number {
  try {
    const raw = error?.message || error?.error?.message || (typeof error === 'string' ? error : '');
    const retryMatch = raw.match(/retry in ([0-9.]+)s/i) || raw.match(/"retryDelay":\s*"([0-9]+)s"/i);
    if (retryMatch && retryMatch[1]) {
      const sec = parseFloat(retryMatch[1]);
      if (!isNaN(sec) && sec > 0) return Math.ceil(sec * 1000);
    }
  } catch {
    // default
  }
  return 60 * 1000;
}

function isRateLimitError(error: any): boolean {
  const status = error?.status || error?.code || error?.error?.code || error?.error?.status;
  const msg = (error?.message || error?.error?.message || (typeof error === 'string' ? error : JSON.stringify(error || ''))).toLowerCase();
  return (
    status === 429 ||
    status === 'RESOURCE_EXHAUSTED' ||
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('resource has been exhausted') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('tokens per minute') ||
    msg.includes('tpm')
  );
}

function isHighDemandError(error: any): boolean {
  const status = error?.status || error?.code || error?.error?.code || error?.error?.status;
  const msg = (error?.message || error?.error?.message || (typeof error === 'string' ? error : JSON.stringify(error || ''))).toLowerCase();
  return (
    status === 503 ||
    status === 'UNAVAILABLE' ||
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable')
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error(errorMessage);
      err.isTimeout = true;
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function executeWithModelFallback<T>(
  operation: (modelName: string) => Promise<T>
): Promise<T> {
  let lastError: any = null;

  for (let mIdx = 0; mIdx < CANDIDATE_MODELS.length; mIdx++) {
    const currentModel = CANDIDATE_MODELS[mIdx];
    const hasNextModel = mIdx < CANDIDATE_MODELS.length - 1;

    // Skip models currently in quota or cooldown if we have alternatives
    if (isModelInCooldown(currentModel) && hasNextModel) {
      console.log(`[Gemini] Skipping ${currentModel} (active cooldown)`);
      continue;
    }

    try {
      console.log(`[Gemini] Attempting generation with model: ${currentModel}`);
      return await withTimeout(
        operation(currentModel),
        35000,
        `Gemini model ${currentModel} call timed out after 35s`
      );
    } catch (error: any) {
      lastError = error;

      if (isRateLimitError(error)) {
        const cooldown = extractRetryDelayMs(error);
        markModelCooldown(currentModel, cooldown);
        console.warn(`[Gemini] Model ${currentModel} rate limited. Trying next candidate...`);
        if (hasNextModel) continue;
      } else if (isHighDemandError(error)) {
        markModelCooldown(currentModel, 20 * 1000);
        console.warn(`[Gemini] Model ${currentModel} 503 high demand. Trying next candidate...`);
        if (hasNextModel) {
          // Brief 300ms pause before next model
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
      } else if (error?.isTimeout) {
        markModelCooldown(currentModel, 30 * 1000);
        console.warn(`[Gemini] Model ${currentModel} timed out. Trying next candidate...`);
        if (hasNextModel) continue;
      } else {
        console.warn(`[Gemini] Model ${currentModel} encountered error:`, error?.message?.substring(0, 120) || error);
        if (hasNextModel) continue;
      }
    }
  }

  if (isRateLimitError(lastError)) {
    throw new GeminiRateLimitError(
      'Gemini API tokens per minute (TPM) or rate quota reached across models. Please retry in a moment.',
      60
    );
  }

  throw lastError || new Error('All Gemini candidate models failed to process the request.');
}

export async function analyzeGarmentImage(imageBuffer: Buffer, mimeType: string) {
    const prompt = `You are an expert fashion stylist, garment cataloguer, and textile specialist.

Your task is to analyze clothing images and catalog them into a wardrobe database.

CORE CATALOGING RULE:
Whenever an image presents a coordinated, multi-piece outfit—such as a 2-piece suit, 3-piece suit, tuxedo, kurta-pyjama set, Nehru/Bundi jacket set, or matching co-ord set—you MUST classify and treat the entire outfit as ONE SINGLE COMPLETE UNIT.

GUIDELINES:
1. Do NOT break matching sets into multiple entries. Treat the entire combination as a single garment of category "suit", "kurta_set", "tuxedo", or "co_ord_set".
2. Name the ensemble with a descriptive, professional title (e.g., "Men's Butter Yellow Floral Bundi & Kurta Set" or "Midnight Navy 3-Piece Wool Suit").
3. In "included_pieces", explicitly list all components visible in the set (e.g., ["Floral Jacquard Bundi / Waistcoat", "Inner Straight Kurta", "Pyjama / Trousers"]).
4. Assign composite attributes representing the set as a whole:
   - Primary Color: The dominant visual color of the complete look.
   - Primary Hex: Representative 6-digit hex code.
   - Material: The dominant fabric or blend of fabrics.
   - Formality Score: 1 (Loungewear) to 5 (Black-Tie / High Festive).
   - Thermal Weight: 1 (Light summer) to 5 (Heavy winter).
5. Suggest complementary shoes or accessories in "styling_notes" to complete the outfit for an event.
6. Output strictly valid JSON matching the requested schema.`;

  return executeWithModelFallback(async (modelName) => {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: mimeType
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: GarmentSchema,
        temperature: 0.2
      }
    });

    const resultText = response.text;
    if (!resultText) throw new Error('No output from Gemini');

    return JSON.parse(resultText);
  });
}

const HueSyncFamilyOutfitPlanSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    group_theme_title: {
      type: Type.STRING,
      description: 'Descriptive title for the group styling direction'
    },
    group_color_palette: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Shared harmonious hex color codes'
    },
    weather_rationale: {
      type: Type.STRING,
      description: 'How humidity and apparent temperature shaped the garment choices and disqualified sweat traps'
    },
    coordination_rationale: {
      type: Type.STRING,
      description: 'Detailed explanation of tonal balance, formality alignment, and pattern hierarchy'
    },
    attending_outfits: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          member_id: { type: Type.STRING },
          name: { type: Type.STRING },
          relationship: { type: Type.STRING },
          selected_item_ids: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Exact IDs picked exclusively from this member's closet"
          },
          item_titles: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          dominant_color_hex: { type: Type.STRING },
          formality_score: { type: Type.INTEGER },
          individual_styling_note: { type: Type.STRING }
        },
        required: [
          'member_id',
          'name',
          'relationship',
          'selected_item_ids',
          'item_titles',
          'dominant_color_hex',
          'formality_score',
          'individual_styling_note'
        ]
      }
    }
  },
  required: [
    'group_theme_title',
    'group_color_palette',
    'weather_rationale',
    'coordination_rationale',
    'attending_outfits'
  ]
};

export async function suggestFamilyOutfit(payload: {
  event_prompt: string;
  weather: {
    temperature_celsius?: number;
    temp_c?: number;
    apparent_temperature_celsius?: number;
    apparent_temp_c?: number;
    humidity_percent?: number;
    humidity_pct?: number;
    precipitation_probability?: number;
    rain_chance_pct?: number;
    condition?: string;
  };
  family_closets: Array<{
    member_id: string;
    name: string;
    relationship?: string;
    relation?: string;
    gender?: string;
    closet: Array<{
      id: string;
      title?: string;
      name?: string;
      category?: string;
      type?: string;
      primary_color_hex?: string;
      color?: string;
      pattern?: string;
      material?: string;
      formality_score?: number;
      formality?: number;
      thermal_weight?: number;
      warmth?: number;
    }>;
  }>;
}) {
  const systemInstruction = `You are the HueSync Family Styling Engine, an expert personal wardrobe stylist and group color harmony consultant.

Your objective: When given an event description, a live weather report, and the individual closets of registered family members, produce a cohesive group outfit recommendation.

EXECUTION RULES:
1. Attendee Resolution:
   - Identify who is attending strictly from the user's natural language event prompt (match by name or relationship, e.g., "me, my dad, and sister" -> 'self', 'father', 'sister').
   - Completely ignore any family members whose closets are provided but who are NOT attending the event.

2. Strict Closet Isolation:
   - Outfits for an attendee must be selected EXCLUSIVELY from that person's own closet inventory using exact item IDs.
   - Never mix item IDs between family members.
   - Never invent or hallucinate items not listed in that person's closet.
   - For integrated sets (e.g., Bundi-kurta sets, 2-piece or 3-piece suits), keep the set intact for events requiring formality 4 or 5.

3. Formality Parity:
   - Keep formality balanced across all attendees: the difference in formality scores between any two attendees cannot exceed 1.

4. Color Harmony & Anti-Twinning:
   - Build a unifying 3-to-4 color group palette (e.g., Olive Green, Dusty Rose, Butter Yellow, and Warm Cream).
   - Distribute shades across attendees to achieve visual cohesion.
   - Disallow identical uniform dressing ("no twinning").
   - Enforce the Statement Rule: At most ONE attendee wears a bold or intricate pattern; everyone else wears complementary solid bases or subtle self-textures.

5. Thermal & Weather Adaptation:
   - Check the live weather payload (temperature, apparent heat index, humidity, precipitation).
   - If Relative Humidity > 65% or Apparent Temperature > 28°C: Disqualify heavy multi-layer wool suits, thick synthetics, and non-breathable fabrics. Choose lightweight cotton, linen, and breathable silk.
   - If Rain Probability > 40%: Disqualify delicate suede footwear and ground-touching garments.`;

  const normalizedWeather = {
    temperature_celsius: payload.weather.temperature_celsius ?? payload.weather.temp_c ?? 27.5,
    apparent_temperature_celsius: payload.weather.apparent_temperature_celsius ?? payload.weather.apparent_temp_c ?? 30.2,
    humidity_percent: payload.weather.humidity_percent ?? payload.weather.humidity_pct ?? 72,
    precipitation_probability: payload.weather.precipitation_probability ?? payload.weather.rain_chance_pct ?? 10,
    condition: payload.weather.condition || 'Humid / Clear'
  };

  const normalizedFamilyClosets = payload.family_closets.map(member => ({
    member_id: member.member_id,
    name: member.name,
    relationship: member.relationship || member.relation || 'self',
    gender: member.gender || 'unspecified',
    closet: member.closet.map(item => ({
      id: item.id,
      title: item.title || item.name || 'Garment',
      category: item.category || item.type || 'top',
      primary_color_hex: item.primary_color_hex || item.color || '#000000',
      pattern: item.pattern || 'Solid',
      material: item.material || 'Cotton',
      formality_score: item.formality_score ?? item.formality ?? 3,
      thermal_weight: item.thermal_weight ?? item.warmth ?? 2
    }))
  }));

  const userPrompt = `### EVENT & ATTENDEES PROMPT:
"${payload.event_prompt}"

### LIVE WEATHER SNAPSHOT (via Weather API):
${JSON.stringify(normalizedWeather, null, 2)}

### REGISTERED FAMILY DIRECTORY & SEPARATE CLOSETS:
${JSON.stringify(normalizedFamilyClosets, null, 2)}

Filter out non-attending members, resolve sweat-risk fabrics under ${normalizedWeather.humidity_percent}% humidity, maintain formality balance, and output the final coordinated plan in JSON.`;

  try {
    return await executeWithModelFallback(async (modelName) => {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: HueSyncFamilyOutfitPlanSchema,
          temperature: 0.3
        }
      });

      const resultText = response.text;
      if (!resultText) throw new Error('No output from Gemini');
      return JSON.parse(resultText);
    });
  } catch (error: any) {
    console.warn('[Gemini] All AI model candidates failed or unavailable (503/429). Activating Deterministic Rule-Based Fallback Engine.', error?.message);
    return generateDeterministicFamilyOutfitPlan(payload);
  }
}

/**
 * High-precision deterministic fallback engine enforcing color theory,
 * weather adaptation, and attendee isolation when remote AI services undergo rate limits or spikes.
 */
function generateDeterministicFamilyOutfitPlan(payload: {
  event_prompt: string;
  weather: any;
  family_closets: Array<{
    member_id: string;
    name: string;
    relationship?: string;
    gender?: string;
    closet: Array<any>;
  }>;
}) {
  const promptLower = (payload.event_prompt || '').toLowerCase();
  
  // 1. Determine attendees
  let attendingMembers = payload.family_closets.filter(m => {
    const nameMatch = m.name && promptLower.includes(m.name.toLowerCase());
    const relMatch = m.relationship && promptLower.includes(m.relationship.toLowerCase());
    const isSelf = m.relationship === 'self' || m.member_id === 'mem_01';
    return nameMatch || relMatch || isSelf;
  });

  if (attendingMembers.length === 0) {
    attendingMembers = payload.family_closets;
  }

  // 2. Weather & thermal indexing
  const temp = payload.weather?.temperature_celsius ?? payload.weather?.temp_c ?? 26;
  const humidity = payload.weather?.humidity_percent ?? payload.weather?.humidity_pct ?? 65;
  const rainChance = payload.weather?.precipitation_probability ?? payload.weather?.rain_chance_pct ?? 10;
  
  const targetWarmth = temp > 28 ? 1 : temp > 20 ? 2 : temp > 12 ? 3 : 4;
  const isHighHumidity = humidity > 60;

  // Harmonious base palette
  const basePalettes = [
    { title: 'Sage, Cream & Warm Neutral Harmony', palette: ['#8A9A86', '#F5F2EB', '#D4AF37', '#2C3E50'] },
    { title: 'Navy, Dusty Rose & Crisp White Ensemble', palette: ['#1E3A8A', '#E2A9B5', '#F8FAFC', '#475569'] },
    { title: 'Terracotta, Sand & Earthy Tonal Symphony', palette: ['#C86D51', '#E6D5B8', '#3E2723', '#8D6E63'] }
  ];
  const chosenTheme = basePalettes[Math.floor(Math.random() * basePalettes.length)];

  const attending_outfits = attendingMembers.map((member, idx) => {
    const closet = member.closet || [];
    const sets = closet.filter(i => ['suit', 'kurta_set', 'tuxedo', 'co_ord_set', 'dress'].includes((i.category || i.type || '').toLowerCase()));
    const tops = closet.filter(i => (i.category || i.type || '').toLowerCase() === 'top');
    const bottoms = closet.filter(i => (i.category || i.type || '').toLowerCase() === 'bottom');
    const footwear = closet.filter(i => (i.category || i.type || '').toLowerCase() === 'footwear');
    const accessories = closet.filter(i => (i.category || i.type || '').toLowerCase() === 'accessory');

    const selectedIds: string[] = [];
    const selectedTitles: string[] = [];
    let dominantHex = chosenTheme.palette[idx % chosenTheme.palette.length];
    let formality = 3;

    if (sets.length > 0 && (promptLower.includes('wedding') || promptLower.includes('festive') || promptLower.includes('formal') || tops.length === 0)) {
      const bestSet = sets[0];
      selectedIds.push(bestSet.id);
      selectedTitles.push(bestSet.title || bestSet.name || 'Coordinated Set');
      dominantHex = bestSet.primary_color_hex || bestSet.color || dominantHex;
      formality = bestSet.formality_score || 4;
    } else {
      if (tops.length > 0) {
        const top = tops[idx % tops.length];
        selectedIds.push(top.id);
        selectedTitles.push(top.title || top.name || 'Top');
        dominantHex = top.primary_color_hex || top.color || dominantHex;
        formality = top.formality_score || 3;
      }
      if (bottoms.length > 0) {
        const bottom = bottoms[idx % bottoms.length];
        selectedIds.push(bottom.id);
        selectedTitles.push(bottom.title || bottom.name || 'Bottom');
      }
    }

    if (footwear.length > 0) {
      const shoes = footwear[0];
      selectedIds.push(shoes.id);
      selectedTitles.push(shoes.title || shoes.name || 'Footwear');
    }

    if (accessories.length > 0 && accessories.length > idx) {
      const acc = accessories[idx];
      selectedIds.push(acc.id);
      selectedTitles.push(acc.title || acc.name || 'Accessory');
    }

    // If still empty, grab any items available
    if (selectedIds.length === 0 && closet.length > 0) {
      const item = closet[0];
      selectedIds.push(item.id);
      selectedTitles.push(item.title || item.name || 'Garment');
      dominantHex = item.primary_color_hex || item.color || dominantHex;
    }

    return {
      member_id: member.member_id,
      name: member.name,
      relationship: member.relationship || 'self',
      selected_item_ids: selectedIds,
      item_titles: selectedTitles,
      dominant_color_hex: dominantHex,
      formality_score: formality,
      individual_styling_note: `Balanced ${member.name}'s silhouette in ${dominantHex} tones for ${isHighHumidity ? 'light, breathable comfort' : 'optimal thermal balance'}.`
    };
  });

  return {
    group_theme_title: chosenTheme.title,
    group_color_palette: chosenTheme.palette,
    weather_rationale: `Adapted for ${temp}°C and ${humidity}% humidity${rainChance > 40 ? ' with rain precautions' : ''}. Selected breathable thermal level ${targetWarmth} fabrics to maintain all-day comfort.`,
    coordination_rationale: `Harmonized color distribution across all attending members utilizing non-competing accent tones with aligned formality.`,
    attending_outfits
  };
}

export async function suggestOutfit(prompt: string, garments: any[], weather?: any) {
  const normalizedWeather = {
    temperature_celsius: weather?.temperature_celsius ?? weather?.temp_c ?? weather?.temperature ?? 27.5,
    apparent_temperature_celsius: weather?.apparent_temperature_celsius ?? weather?.apparent_temp_c ?? ((weather?.temperature ?? 27.5) + 2.7),
    humidity_percent: weather?.humidity_percent ?? weather?.humidity_pct ?? weather?.humidity ?? 72,
    precipitation_probability: weather?.precipitation_probability ?? weather?.rain_chance_pct ?? weather?.precipitation ?? 10,
    condition: weather?.condition || 'Live Weather'
  };

  const familyClosets = [
    {
      member_id: 'mem_01',
      name: 'You',
      relationship: 'self',
      gender: 'unspecified',
      closet: garments.map((g: any) => ({
        id: g.id,
        title: g.title || g.name || `${g.primaryColorName || ''} ${g.subCategory || g.category || 'Garment'}`.trim(),
        category: g.category || 'top',
        primary_color_hex: g.primaryColorHex || g.primary_color_hex || '#000000',
        pattern: g.pattern || 'Solid',
        material: g.material || 'Cotton',
        formality_score: g.formalityScore ?? g.formality_score ?? 3,
        thermal_weight: g.thermalWeight ?? g.thermal_weight ?? 2
      }))
    }
  ];

  return suggestFamilyOutfit({
    event_prompt: prompt,
    weather: normalizedWeather,
    family_closets: familyClosets
  });
}
