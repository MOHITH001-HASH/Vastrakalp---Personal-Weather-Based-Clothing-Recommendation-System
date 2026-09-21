# Vastrakalp (वस्त्रकल्प) — AI-Powered Wardrobe Management & Multi-Person Styling Platform

Vastrakalp is a modern, full-stack artificial intelligence application engineered for intelligent wardrobe digitization, automated computer-vision garment taxonomy extraction, climate-adaptive daily styling, and family color-coordinated ensemble planning (HueSync™).

---

## 1. Executive Overview

Traditional digital wardrobe tools rely on tedious manual tag entry and static categorization rules that fail when confronted with varying microclimates, thermal requirements, and multi-person event styling. Vastrakalp solves this through a multi-tier AI and distributed systems architecture:

- **Computer Vision Multimodal Analysis**: Automatically extracts category, sub-category, primary/accent colors, hex codes, pattern, formality score (1–5), and thermal weight (1–5) from a single garment photograph using Google Gemini Multimodal Foundation models.
- **Microclimate & Weather Intelligence**: Ingests real-time atmospheric metrics (temperature, apparent heat index, humidity, precipitation probability, and WMO codes) to ensure outfit recommendations match physical comfort thresholds.
- **HueSync™ Multi-Person Coordination Engine**: Solves multi-attendee ensemble planning for events (e.g., weddings, family photoshoots, festive gatherings, corporate dinners) using harmonic color theory (monochromatic, analogous, complementary, triadic) while preserving individual wardrobe isolation.
- **Fail-Safe Adaptive Resilience**: Features a multi-tier AI model fallback pipeline coupled with an offline-capable deterministic rule-based matcher to ensure 100% operational uptime during rate limits or upstream API disruptions.

---

## 2. Technology Stack & Topology

### Frontend & Client Layer
- **Framework**: React 19 with TypeScript 5.8
- **Build System**: Vite 6 (SPA with optimized client-side routing)
- **Styling & Design System**: Tailwind CSS v4 with adaptive responsive layout
- **State & Routing**: React Router v7, Custom React Hooks (`useAuth`, Real-time Firestore Listeners)
- **Icons & Animation**: Lucide React, Motion (`motion/react`)
- **Client Processing**: On-device Canvas and Web Workers for low-latency image pre-scaling and compression

### Backend & Serverless API Layer
- **Runtime**: Node.js 22 LTS with TypeScript (`tsx` / `esbuild`)
- **Server Framework**: Express 4 with modular sub-routers (`/api/v1/auth`, `/api/v1/garments`, `/api/v1/outfits`, `/api/v1/weather`)
- **Serverless Architecture**: Native Vercel Serverless Function entry point (`/api/index.ts`) with `vercel.json` URL rewrites
- **Image Optimization Pipeline**: Sharp (C++ libvips binding) for thumbnail generation, aspect-ratio preservation, and WebP/JPEG compression
- **Authentication**: Firebase Admin SDK (Bearer JWT token verification)
- **AI Core**: Google GenAI SDK (`@google/genai`) with Gemini Multimodal models and JSON schema enforcement

### Persistence & Security Layer
- **Primary Database**: Google Cloud Firestore (NoSQL Document Store)
- **Auth Provider**: Firebase Authentication (Email/Password, Google OAuth Popup)
- **Security Rules**: Granular user-level RBAC (`firestore.rules`) enforcing strict data isolation per `auth.uid`

---

## 3. Core Modules & Capabilities

| Module | Route / File | Primary Responsibility |
| :--- | :--- | :--- |
| **Wardrobe Digitiser** | `/src/pages/AddGarment.tsx` | Photo capture/upload, on-device canvas pre-scaling, Gemini Vision extraction, interactive tag review, and Firestore persistence. |
| **Digital Closet** | `/src/pages/Closet.tsx` | Multi-criteria filtering (category, formality, color, family member, thermal weight), search, and garment lifecycle management. |
| **Weather Stylist** | `/src/pages/Dashboard.tsx` | Real-time atmospheric ingestion, daily vibe switching (`Casual Daily`, `Smart Casual`, `Relaxed Lounge`, `Active Outdoor`), and one-click wear logging. |
| **HueSync™ Event Planner** | `/src/pages/Planner.tsx` | Natural language event query processing, multi-attendee wardrobe allocation, harmonic color palette selection, and conflict-free ensemble generation. |
| **Outfit Wear Tracker** | `/src/pages/Dashboard.tsx` | Historical timeline of worn items, frequency metrics, and wear logging via `garmentWears` sub-collections. |

---

## 4. System Architecture & Request Lifecycle

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT BROWSER                                    |
|                                                                                   |
|  [ React 19 UI ] <---> [ useAuth / State ] <---> [ HTML5 Canvas Pre-Processing ]  |
+------------------------------------+----------------------------------------------+
                                     |
                          HTTPS / REST API (JWT Bearer)
                                     |
+------------------------------------v----------------------------------------------+
|                         APPLICATION API GATEWAY                                   |
|      (Vercel Serverless `/api/index.ts`  OR  Standalone Node `/server.ts`)        |
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

## 5. Deployment Options

### Option A: Vercel (Recommended — 100% Free Hobby Tier)
1. Push this repository to **GitHub**.
2. Go to [vercel.com](https://vercel.com) and log in with GitHub.
3. Click **Add New... > Project** and select your `vastrakalp` repository.
4. Set Environment Variables:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - `NODE_ENV`: `production`
5. Click **Deploy**. Vercel will build the frontend via Vite and host the `/api` serverless backend automatically.

### Option B: Local / Self-Hosted Node.js Server
```bash
# 1. Install dependencies
npm install

# 2. Start development server (Node.js + Vite middleware on port 3000)
npm run dev

# 3. Build production bundle
npm run build

# 4. Start production server
npm start
```

---

## 6. Environment Configuration (`.env`)

```env
# ==========================================
# Server-Side AI Secrets
# ==========================================
GEMINI_API_KEY=your_gemini_api_key_here
NODE_ENV=production
PORT=3000

# ==========================================
# Client Firebase Config (Optional if firebase-applet-config.json exists)
# ==========================================
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

---

## 7. Zero-Trust Security & Data Isolation
- **Secret Isolation**: All AI keys (`GEMINI_API_KEY`) and Firebase Admin credentials remain strictly server-side.
- **Token Verification**: All `/api/v1/*` endpoints require Firebase ID Token verification via the Authorization header (`Bearer <token>`).
- **Data Boundary**: User records, garments, family profiles, and wear histories are partitioned per user UID and validated through Firestore Security Rules.
