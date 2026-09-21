import express from 'express';
import cors from 'cors';
import authRoutes from '../server/routes/auth.js';
import garmentRoutes from '../server/routes/garments.js';
import outfitRoutes from '../server/routes/outfits.js';
import weatherRoutes from '../server/routes/weather.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/garments', garmentRoutes);
app.use('/api/v1/outfits', outfitRoutes);
app.use('/api/v1/weather', weatherRoutes);

// Global Error Handler
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Image file is too large. Please select a smaller image (under 10MB).' });
  }
  if (err.code === 'RATE_LIMIT_EXCEEDED' || err.status === 429) {
    return res.status(429).json({
      error: err.message || 'Tokens per minute (TPM) or rate quota exceeded.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfterSeconds: err.retryAfterSeconds || 60,
      isRateLimit: true
    });
  }
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

export default app;
