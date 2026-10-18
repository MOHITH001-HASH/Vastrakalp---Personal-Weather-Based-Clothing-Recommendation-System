# Vastrakalp (वस्त्रकल्प) — AI-Powered Wardrobe Management & Multi-Person Styling Platform

Vastrakalp is a modern full-stack artificial intelligence application engineered for intelligent wardrobe digitization, automated computer-vision garment taxonomy extraction, climate-adaptive daily styling, and family color-coordinated ensemble planning (**HueSync™**).

---

## 1. Architecture Overview

Vastrakalp is built with a decoupled, dual-backend architecture designed for production resilience and cloud flexibility:

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                    |
|                                                                                   |
|  [ React 19 UI ] <---> [ useAuth / State ] <---> [ HTML5 Canvas Pre-Processing ]  |
+------------------------------------+----------------------------------------------+
                                     |
                          HTTPS / REST API (JWT Bearer)
                                     |
         +---------------------------+---------------------------+
         |                                                       |
+--------v------------------------------+      +-----------------v------------------------------+
|   PYTHON FASTAPI BACKEND (Cloud Run)  |      |   VERCEL SERVERLESS / NODE BACKEND (Vercel)   |
|   Directory: /backend                 |      |   Directory: /api & /server                    |
|                                       |      |                                                |
|   - FastAPI 0.115 + Pydantic v2       |      |   - Express 4 + TypeScript                     |
|   - Pillow Image Optimization         |      |   - Sharp Image Optimization                   |
|   - Google GenAI Python SDK           |      |   - Google GenAI Node SDK                      |
|   - Deterministic CV & HueSync        |      |   - Deterministic CV & HueSync                 |
|   - Cloud Run Multi-Stage Dockerfile  |      |   - Vercel Serverless Function Engine          |
+-------------------+-------------------+      +-----------------+------------------------------+
                    |                                            |
                    +--------------------+-----------------------+
                                         |
                               +---------v---------+
                               |  CLOUD FIRESTORE  |
                               |  (NoSQL Database) |
                               +-------------------+
```

---

## 2. Technology Stack

### Frontend Layer
- **Framework**: React 19 with TypeScript 5.8
- **Build System**: Vite 6 (SPA with optimized client-side routing)
- **Styling**: Tailwind CSS v4 with adaptive responsive layout
- **State & Routing**: React Router v7, Custom React Hooks (`useAuth`, Real-time Firestore Listeners)
- **Icons & Animation**: Lucide React, Motion (`motion/react`)

### Backend Layer (Python FastAPI Core)
- **Framework**: FastAPI with Pydantic v2 data validation schemas (`/backend`)
- **Runtime**: Python 3.10+ with Uvicorn ASGI server
- **Computer Vision & Image Optimization**: Pillow (PIL) for token-optimized 768px JPEG scaling and dominant color extraction
- **AI Orchestration**: Google GenAI SDK (`google-genai` / `google-generativeai`) with candidate model fallback (`gemini-3.8-flash`, `gemini-3.1-flash-lite`, `gemini-flash-latest`)
- **Resilience Engine**: Deterministic fallback engines for **both Garment Image Analysis AND Family Outfit Coordination**
- **Meteorological Service**: Open-Meteo REST API integration for real-time temperature, apparent heat index, humidity, and precipitation probability
- **Containerization**: Multi-stage Dockerfile (`Dockerfile.backend`) optimized for Google Cloud Run / Docker Compose

### Alternate Serverless Bridge (Vercel / Node.js)
- **Framework**: Express 4 / Vercel Serverless Function (`/api/index.ts`, `/server`)
- Provides zero-configuration hobby deployment on Vercel while preserving identical API contracts with the Python backend.

### Persistence & Security
- **Database**: Google Cloud Firestore (NoSQL Document Store)
- **Authentication**: Firebase Authentication (Google OAuth Popup, Email/Password)
- **Security Rules**: User-level Role-Based Access Control (`firestore.rules`) strictly isolating wardrobes per authenticated user UID.

---

## 3. High-Resilience Fallback Architecture

To handle upstream Gemini API rate limits (HTTP 429), high-demand spikes (HTTP 503), or network latency, Vastrakalp implements two-tier fallback across all AI operations:

| Operation | Primary AI Engine | Fallback Engine | Fallback Capability |
| :--- | :--- | :--- | :--- |
| **Garment Vision Extraction** | Gemini Multimodal Vision (`gemini-3.8-flash` / `gemini-3.1-flash-lite`) | **Local Deterministic Computer Vision Engine** | Analyzes image bytes via Pillow/Canvas to extract dominant RGB/hex, luminance, aspect-ratio heuristics, and standard styling metadata. |
| **HueSync™ Outfit Coordination** | Gemini Multimodal Prompt Orchestrator | **Algorithmic Color-Harmony Matcher** | Computes mathematical color harmony (analogous, complementary, monochromatic) and aligns thermal insulation to live weather metrics without external API calls. |

---

## 4. Running the Python Backend Locally & with Docker

### Option A: Local Python Environment
```bash
# 1. Navigate to backend directory
cd backend

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# 3. Install requirements
pip install -r requirements.txt

# 4. Set environment variables
export GEMINI_API_KEY="your-gemini-api-key"
export FIREBASE_PROJECT_ID="gen-lang-client-0005527197"
export FIREBASE_DATABASE_ID="ai-studio-77024999-4ce1-49cc-90b6-b6cec4d5a94a"

# 5. Run FastAPI development server
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
API Documentation will be available at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Health Check: `http://localhost:8000/api/health`

### Option B: Deploying Python Backend to Google Cloud Run
```bash
# 1. Build and push container to Google Artifact Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/vastrakalp-backend -f Dockerfile.backend

# 2. Deploy to Cloud Run
gcloud run deploy vastrakalp-backend \
  --image gcr.io/YOUR_PROJECT_ID/vastrakalp-backend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="your-key",FIREBASE_PROJECT_ID="your-project-id"
```

### Option C: Docker Compose (Full Stack)
```bash
docker-compose up --build
```

---

## 5. Deploying Frontend to Vercel

1. Push repository to **GitHub**.
2. Import project into [Vercel](https://vercel.com).
3. Set environment variables:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `NODE_ENV`: `production`
   - `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_DATABASE_ID`: (Copied from Firebase Console).
4. Click **Deploy**. Vercel will host the frontend and serverless endpoints.

---

## 6. Directory Structure

```
├── backend/                  # Full Python FastAPI Backend
│   ├── main.py               # FastAPI entry point, CORS, routers & exception handlers
│   ├── requirements.txt      # Python dependencies (FastAPI, uvicorn, google-genai, pillow, etc.)
│   ├── Dockerfile            # Container definition for Cloud Run
│   ├── config/               # Settings & Firebase Admin SDK configuration
│   ├── models/               # Pydantic v2 request/response schemas
│   ├── routers/              # Modular API endpoints (/garments, /outfits, /weather, /auth)
│   └── services/             # Gemini API orchestrator, fallback CV, & Open-Meteo client
├── src/                      # React 19 Frontend Application
│   ├── components/           # Reusable UI components & layouts
│   ├── pages/                # Closet, Dashboard, AddGarment, Planner, Login
│   ├── hooks/                # useAuth, useVoiceSpeech
│   └── lib/                  # Firebase Client SDK & API connectors
├── server/                   # Node.js / Express Serverless Bridge
├── firestore.rules           # Granular Firestore Role-Based Access Control
├── Dockerfile.backend        # Multi-stage Dockerfile for Cloud Run
└── docker-compose.yml        # Multi-container orchestration
```
