import { Router, Response } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { requireAuth, optionalAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { analyzeGarmentImage, GeminiRateLimitError } from '../services/gemini.js';
import { db } from '../config/firebase.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// AI Analysis
router.post('/analyze', optionalAuth, upload.single('image'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }

    let processedImageBuffer = req.file.buffer;
    let mimeType = 'image/jpeg';

    // 1. Optimize Image with sharp:
    // Resize down to max 768x768 JPEG at 75% quality.
    // This reduces token usage dramatically to a single vision tile (~258 tokens) and minimizes TPM exhaustion.
    try {
      processedImageBuffer = await sharp(req.file.buffer)
        .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 75, progressive: true })
        .toBuffer();
      mimeType = 'image/jpeg';
      console.log(`[Image Optimization] Optimized to 768px JPEG: ${(processedImageBuffer.length / 1024).toFixed(1)} KB`);
    } catch (sharpError) {
      console.warn('[Image Optimization] Sharp convert warning, checking fallback mime:', sharpError);
      if (['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
        mimeType = req.file.mimetype;
      }
    }

    // 2. Gemini Multimodal Analysis with automatic model fallback
    const attributes = await analyzeGarmentImage(processedImageBuffer, mimeType);

    // 3. Return attributes for human review
    res.json(attributes);
  } catch (error: any) {
    console.error('Analyze Garment Error:', error);

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
        error: 'Gemini Tokens Per Minute (TPM) or rate quota reached. Please wait for quota cooldown.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: error?.retryAfterSeconds || 60,
        isRateLimit: true
      });
    }

    const is503 = error?.status === 503 || error?.message?.includes('503') || error?.message?.includes('high demand');
    if (is503) {
      return res.status(503).json({
        error: 'Gemini service is experiencing high demand. Please try again shortly.',
        code: 'HIGH_DEMAND',
        retryAfterSeconds: 15
      });
    }

    res.status(500).json({ error: 'Failed to analyze garment: ' + (error?.message || 'Unknown error') });
  }
});

// Delete Garment route
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: 'Garment ID is required' });
    }

    try {
      await db.collection('garments').doc(id).delete();
    } catch (dbErr: any) {
      console.warn('Admin DB garment delete warning:', dbErr);
    }

    res.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('Delete Garment Error:', error);
    res.status(500).json({ error: error?.message || 'Failed to delete garment' });
  }
});

export default router;
