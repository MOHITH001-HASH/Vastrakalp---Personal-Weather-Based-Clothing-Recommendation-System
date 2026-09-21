import { Router, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { db } from '../config/firebase.js';
import { suggestOutfit, suggestFamilyOutfit, GeminiRateLimitError } from '../services/gemini.js';

const router = Router();

router.post('/suggest', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      prompt, 
      event_prompt,
      weather, 
      garments: clientGarments,
      family_closets 
    } = req.body;

    const eventPrompt = event_prompt || prompt;
    if (!eventPrompt) {
      return res.status(400).json({ error: 'Event prompt is required' });
    }

    // 1. If structured family_closets are provided directly
    if (family_closets && Array.isArray(family_closets) && family_closets.length > 0) {
      const normalizedWeather = {
        temp_c: weather?.temp_c ?? weather?.temperature ?? 27.0,
        apparent_temp_c: weather?.apparent_temp_c ?? ((weather?.temp_c ?? weather?.temperature ?? 27.0) + 2.5),
        humidity_pct: weather?.humidity_pct ?? weather?.humidity ?? 70,
        rain_chance_pct: weather?.rain_chance_pct ?? weather?.precipitation ?? weather?.precipitationProbability ?? 10
      };

      const suggestion = await suggestFamilyOutfit({
        event_prompt: eventPrompt,
        weather: normalizedWeather,
        family_closets
      });

      return res.json(suggestion);
    }

    // 2. Otherwise handle individual / single user closet
    let garments = clientGarments;

    if (!garments || !Array.isArray(garments) || garments.length === 0) {
      try {
        const snapshot = await db.collection('garments').where('ownerId', '==', req.user!.uid).get();
        if (!snapshot.empty) {
          garments = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name || `${data.primaryColorName || ''} ${data.subCategory || data.category || 'Item'}`.trim(),
              category: data.category,
              subCategory: data.subCategory,
              primaryColorName: data.primaryColorName,
              primaryColorHex: data.primaryColorHex || '#000000',
              pattern: data.pattern || 'solid',
              formalityScore: data.formalityScore || 3,
              thermalWeight: data.thermalWeight || 2,
              material: data.material || 'unknown'
            };
          });
        }
      } catch (dbErr) {
        console.warn('Admin Firestore garment fetch not available:', dbErr);
      }
    }

    if (!garments || garments.length === 0) {
      return res.status(400).json({ error: 'Your closet is empty. Add some garments first.' });
    }

    // 3. Get suggestion from Gemini with Family Stylist Engine
    const suggestion = await suggestOutfit(eventPrompt, garments, weather);

    // 4. Return the suggestion
    res.json(suggestion);
  } catch (error: any) {
    console.error('Suggest Outfit Error:', error);

    const isRateLimit =
      error instanceof GeminiRateLimitError ||
      error?.code === 'RATE_LIMIT_EXCEEDED' ||
      error?.status === 429 ||
      error?.message?.includes('429') ||
      error?.message?.includes('Tokens Per Minute') ||
      error?.message?.includes('TPM') ||
      error?.message?.includes('quota');

    if (isRateLimit) {
      return res.status(429).json({
        error: 'Gemini Tokens Per Minute (TPM) or rate quota reached. Please wait a moment before trying again.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: error?.retryAfterSeconds || 60,
        isRateLimit: true
      });
    }

    res.status(500).json({ error: error?.message || 'Failed to suggest outfit' });
  }
});

export default router;
