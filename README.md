# Vastrakalp — AI-Powered Wardrobe Management & Multi-Person Styling Platform

Vastrakalp is an enterprise-grade full-stack artificial intelligence application designed for smart wardrobe digitisation, intelligent garment taxonomy extraction, climate-adaptive daily styling, and family color-coordinated ensemble planning.

---

## 1. Executive Summary

Traditional digital wardrobe tools rely on manual tag entry and static categorization rules that fail when confronted with varying microclimates, thermal requirements, and multi-person event styling. Vastrakalp bridges this gap by integrating:

- **Computer Vision Multimodal Analysis**: Automatically extracts category, sub-category, primary/accent colors, hex codes, pattern, formality score, and thermal weight from a single garment photograph.
- **Microclimate & Weather Intelligence**: Integrates live geolocation-based meteorological data (temperature, apparent temperature, humidity, and precipitation probability) to ensure outfit recommendations match physical comfort thresholds.
- **HueSync™ Color Coordination Engine**: Solves multi-attendee ensemble planning for events (e.g., weddings, family photoshoots, dinners) using color theory (monochromatic, analogous, complementary, triadic) and individual wardrobe isolation.
- **Fail-Safe Adaptive Architecture**: Features an automated multi-tier AI model fallback pipeline coupled with a local deterministic rule-based matcher to ensure 100% operational uptime during rate limits or upstream service disruptions.

---

## 2. Technology Stack

### Frontend & Client Layer
- **Framework**: React 19 with TypeScript 5.8
- **Build System**: Vite 6 (SPA with Node.js backend integration)
- **Styling**: Tailwind CSS v4
- **State & Routing**: React Router v7, Custom React Hooks (`useAuth`, Firestore Listeners)
- **Icons & Animation**: Lucide React, Motion (Framer Motion)
- **Client Processing**: On-device Canvas and Web Workers for image preparation

### Backend & API Layer
- **Runtime**: Node.js 22 LTS with TypeScript via `tsx` / `esbuild`
- **Web Server**: Express 4 with CORS and JSON payload limiters (50MB streaming buffer)
- **Image Processing Engine**: Sharp (C++ libvips binding) for thumbnail generation, resizing (max 1024x1024), and WebP/JPEG compression
- **Authentication**: Firebase Admin SDK (Bearer JWT token verification)
- **AI Core**: Google GenAI SDK (`@google/genai`) with Gemini Multimodal Models

### Persistence & Security Layer
- **Primary Database**: Google Cloud Firestore (NoSQL Document Store)
- **Auth Provider**: Firebase Authentication (Email/Password, Token Exchange)
- **Security Rules**: Granular user-level RBAC (`firestore.rules`) enforcing data isolation per `auth.uid`

---

## 3. Core Modules & Capabilities

| Module | Location | Primary Responsibility |
| :--- | :--- | :--- |
| **Wardrobe Digitiser** | `/src/pages/AddGarment.tsx` | Photo upload, on-device pre-processing, AI vision extraction, manual attribute validation, and Firestore persistence. |
| **Digital Closet** | `/src/pages/Closet.tsx` | Multi-criteria filtering (category, formality, color, family member, thermal weight), sorting, and garment lifecycle management. |
| **Weather Stylist** | `/src/pages/Dashboard.tsx` | Real-time weather ingestion, daily vibe switching (`Casual Daily`, `Smart Casual`, `Relaxed Lounge`, `Active Outdoor`), and one-click wear logging. |
| **Event & Group Planner** | `/src/pages/Planner.tsx` | Natural language event query processing, multi-attendee wardrobe allocation, color palette selection, and conflict-free ensemble generation. |
| **Outfit Wear Tracker** | `/src/pages/Dashboard.tsx` | Historical timeline of worn items, frequency metrics, and wear logging via `garmentWears` collections. |

---

## 4. System Architecture & Topology

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                    |
|                                                                                   |
|  [ React 19 UI ] <---> [ useAuth / State ] <---> [ Local Canvas / Sharp Pre-proc] |
+------------------------------------+----------------------------------------------+
                                     |
                          HTTPS / REST API (JWT Bearer)
                                     |
+------------------------------------v----------------------------------------------+
|                              EXPRESS BACKEND                                      |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  | Request Router (/api/v1)                                                    |  |
|  |   ├── /auth      -> User sync & Profile Handlers                            |  |
|  |   ├── /garments  -> Sharp Image Optimization & Vision Ingestion             |  |
|  |   ├── /outfits   -> Multi-Agent Prompt Orchestration & HueSync Planner      |  |
|  |   └── /weather   -> Open-Meteo Meteorological Aggregator                    |  |
|  +-----------------------------------------------------------------------------+  |
|                                    |                                              |
|  +---------------------------------v-------------------------------------------+  |
|  | AI Orchestration Layer (server/services/gemini.ts)                          |  |
|  |   ├── Model Tier 1: gemini-2.5-flash (Primary Latency-Optimized)            |  |
|  |   ├── Model Tier 2: gemini-2.5-pro   (High Reasoning Fallback)              |  |
|  |   ├── Model Tier 3: gemini-3.6       (Secondary Fallback)                   |  |
|  |   └── Algorithmic Matcher            (Deterministic Local Rule Engine)      |  |
|  +-----------------------------------------------------------------------------+  |
+-------------------+------------------------------------+--------------------------+
                    |                                    |
             Google GenAI API                   Firebase Admin / Firestore
                    |                                    |
+-------------------v---+                        +-------v--------------------------+
|  GEMINI VISION & AI   |                        |        CLOUD FIRESTORE           |
|  - Structured Output  |                        |  - users / garments / outfits    |
|  - JSON Schema Enforce|                        |  - familyMembers / garmentWears  |
+-----------------------+                        +----------------------------------+
```

---

## 5. API Endpoints

### Authentication & Profile
- `POST /api/v1/auth/sync`: Verifies Firebase JWT, bootstraps user profile in Firestore if absent, and returns synced metadata.

### Garments
- `POST /api/v1/garments/analyze`: Accepts multipart form image (`image/jpeg`, `image/png`, `image/webp`), processes via Sharp, and returns structured Gemini Vision attribute extraction (`GarmentAnalysisResult`).
- `POST /api/v1/garments`: Validates and saves a new garment to the user's closet.
- `GET /api/v1/garments`: Retrieves all garments associated with the authenticated user ID.
- `DELETE /api/v1/garments/:id`: Deletes garment document and associated wear records.

### Outfits & AI Styling
- `POST /api/v1/outfits/suggest`: Accepts event prompt, optional meteorological payload, and user garment pool. Returns a complete `HueSyncFamilyOutfitPlan` with color theory rationales, formality scores, and selected item IDs per attendee.

### Weather
- `GET /api/v1/weather`: Fetches current temperature, apparent temperature, humidity, precipitation probability, and wind metrics from Open-Meteo for coordinates or city names.
- `GET /api/v1/weather/search`: Auto-completes geographical queries for location selection.

---

## 6. Environment Configuration

Define the following keys in your environment (or `.env` file):

```env
# Google Gemini API Key (Server-Side Only)
GEMINI_API_KEY=your_gemini_api_key_here

# Firebase Configuration
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 7. Build and Run Commands

```bash
# Install dependencies
npm install

# Start development server (Node.js + Vite middleware on port 3000)
npm run dev

# Perform static type checking and linting
npm run lint

# Compile production bundle (Vite SPA + esbuild Node server)
npm run build

# Start compiled production server
npm start
```

---

## 8. License & Security

This project is configured with zero-trust client security:
- All third-party credentials and AI API keys remain exclusively on the server runtime.
- Client calls to `/api/v1/*` require Firebase ID Token verification via the Authorization header (`Bearer <token>`).
- Database documents are protected by strict Firestore Security Rules restricting read/write access to the resource owner.
