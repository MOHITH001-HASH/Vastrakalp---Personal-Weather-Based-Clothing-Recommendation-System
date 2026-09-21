import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, auth } from './server/config/firebase.js';
import authRoutes from './server/routes/auth.js';
import garmentRoutes from './server/routes/garments.js';
import outfitRoutes from './server/routes/outfits.js';
import weatherRoutes from './server/routes/weather.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (err) => {
  console.error('[Process Safety] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Safety] Unhandled Rejection:', reason);
});

async function startServer() {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/garments', garmentRoutes);
  app.use('/api/v1/outfits', outfitRoutes);
  app.use('/api/v1/weather', weatherRoutes);

  
  // Global API error handler
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

  
  // 404 for unmatched API routes
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'API Endpoint Not Found' });
  });

  const isProd = process.env.NODE_ENV === 'production';



  if (!isProd) {
    // Development: Use Vite middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production: Serve static files from Vite build output
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
