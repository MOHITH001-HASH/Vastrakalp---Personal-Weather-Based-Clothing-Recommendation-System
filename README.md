# Vastrakalp

Vastrakalp is a wardrobe and weather-based styling application. The backend is a Python FastAPI service; the browser application remains React, TypeScript, and Vite.

## Architecture

- **Frontend:** React 19, TypeScript, Vite, Firebase Authentication and Firestore client SDK.
- **Backend:** Python 3.12+, FastAPI, Uvicorn, Firebase Admin, Gemini, Pillow, and Open-Meteo.
- **Data:** Firebase Authentication and Cloud Firestore.
- **Hosting:** Vercel can host the frontend and Python API function together. Alternatively, host the frontend on Vercel and the Python API on Google Cloud Run.

See [ARCHITECTURE.md](ARCHITECTURE.md) for request flow and deployment topology.

## Local setup

Prerequisites: Python 3.12 or newer, Node.js 20 or newer, and npm.

1. Copy `.env.example` to `.env` and set `GEMINI_API_KEY`, `FIREBASE_PROJECT_ID`, and `FIREBASE_DATABASE_ID` to match the Firebase project and database used by `firebase-applet-config.json`. The checked-in file supplies the browser's Firebase client configuration unless you override it with the `VITE_FIREBASE_*` values.
2. Create and activate a Python environment, then install the API dependencies:

   ```powershell
   py -3.12 -m venv .venv
   .\.venv\Scripts\Activate.ps1
   python -m pip install -r requirements-cloudrun.txt
   ```

3. In a second terminal, install and start the frontend:

   ```powershell
   npm install
   npm run dev
   ```

4. Start the API from the repository root:

   ```powershell
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
   ```

The frontend is at `http://localhost:5173`; the API health check and interactive API docs are at `http://localhost:8000/api/health` and `http://localhost:8000/docs`. To use Firebase Admin locally, use Google Application Default Credentials or set `GOOGLE_APPLICATION_CREDENTIALS` to a local service-account file. Keep credential files out of source control.

To run the API in Docker, configure `.env` and run `docker compose up --build`. If the container needs Firebase Admin access locally, provide credentials via `FIREBASE_SERVICE_ACCOUNT_JSON` in the ignored `.env` file. Run the Vite frontend separately with `npm run dev`.

## Environment variables

Set server variables in `.env` for local work, Vercel project settings for Vercel, or Cloud Run environment/Secret Manager configuration for Cloud Run. Never commit actual secrets.

| Variable | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | For Gemini-backed analysis | Server-only Gemini API key. The app can use its deterministic fallback when unset. |
| `FIREBASE_PROJECT_ID` | Yes for Firebase Admin | Firebase/Google Cloud project ID. |
| `FIREBASE_DATABASE_ID` | Yes for this configured project | Firestore database ID matching the browser client configuration; use `(default)` only when using Firestore's default database. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Vercel only | Full service-account JSON stored as a protected server-side environment variable. Do not use a downloaded key on Cloud Run. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local only, optional | Path to a local service-account file; prefer Application Default Credentials. |
| `ALLOWED_ORIGINS` | Only for cross-origin browser API calls | Comma-separated exact browser origins, with no trailing slash or wildcard. Vercel's same-origin API does not require CORS configuration. |
| `PORT` | No | Local API port (default `8000`). Cloud Run provides its own `PORT`. |
| `VITE_API_URL` | Cloud Run frontend only | Public base URL of the Cloud Run API, for example `https://your-service-xxxxx-uc.a.run.app`. Leave blank for same-origin Vercel routing. |
| `VITE_FIREBASE_API_KEY` | If not using the checked-in client config | Public Firebase Web API key. |
| `VITE_FIREBASE_PROJECT_ID` | If not using the checked-in client config | Public Firebase project ID. |
| `VITE_FIREBASE_APP_ID` | If not using the checked-in client config | Public Firebase app ID. |
| `VITE_FIREBASE_AUTH_DOMAIN` | If not using the checked-in client config | Public Firebase Authentication domain. |
| `VITE_FIREBASE_STORAGE_BUCKET` | If not using the checked-in client config | Public Firebase Storage bucket. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | If not using the checked-in client config | Public Firebase messaging sender ID. |
| `VITE_FIREBASE_DATABASE_ID` | No | Public Firestore database ID used by the browser SDK. |

`VITE_*` values are compiled into the browser bundle and are **public configuration, not secrets**. Do not put Gemini keys, service-account credentials, or other server credentials in a `VITE_*` variable.

## Deploy to Vercel

The repository includes `api/index.py`, which exports the FastAPI ASGI application, and `vercel.json`, which routes `/api/*` to that function and other paths to the Vite SPA. Vercel installs the lean root `requirements.txt`; the function configuration excludes frontend source, built assets, and documentation from its bundle.

1. Import the repository into Vercel and keep the repository root as the project root.
2. Before deploying, add these **Production** environment variables in **Project Settings → Environment Variables**:
   - `GEMINI_API_KEY`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_DATABASE_ID`, matching the browser Firebase database configuration
   - `FIREBASE_SERVICE_ACCOUNT_JSON` containing the Firebase Admin service-account JSON, stored as a sensitive server-side value
   - `VITE_FIREBASE_*` values only if the checked-in `firebase-applet-config.json` is not the desired public client configuration
3. Deploy. The Vercel API and frontend share an origin, so leave `VITE_API_URL` blank. Set `FIREBASE_SERVICE_ACCOUNT_JSON` only in server-side project environment settings, never with a `VITE_` prefix.

Create a dedicated service account with only the permissions the app requires, protect and rotate its key, and configure Firebase Authentication's authorized domains and Firestore security rules. Vercel functions do not have Cloud Run's attached service identity; a server-side service-account credential is needed for Firebase Admin access there.

## Deploy the Python API to Google Cloud Run

Use Cloud Run for the API and Vercel for the React frontend. Before deployment, enable Cloud Run, Cloud Build, Artifact Registry, and Firestore APIs; create an Artifact Registry Docker repository; and select a region. Give the Cloud Run runtime service account Firestore access (for example, `roles/datastore.user`). Cloud Run uses Application Default Credentials from that identity; do not upload a service-account key.

1. Create a Secret Manager secret for `GEMINI_API_KEY`, grant the Cloud Run runtime service account permission to access that secret, and set its value there.
2. Build the Python container from the repository root:

   ```sh
   gcloud builds submit --tag REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/vastrakalp-api --file Dockerfile.backend .
   ```

3. Deploy the image. Replace the example values with your project, region, runtime service account, and Vercel origin:

   ```sh
   gcloud run deploy vastrakalp-api --image REGION-docker.pkg.dev/PROJECT_ID/REPOSITORY/vastrakalp-api --region REGION --service-account vastrakalp-runtime@PROJECT_ID.iam.gserviceaccount.com --allow-unauthenticated --set-env-vars "FIREBASE_PROJECT_ID=PROJECT_ID,FIREBASE_DATABASE_ID=FIRESTORE_DATABASE_ID,ALLOWED_ORIGINS=https://YOUR-APP.vercel.app" --set-secrets "GEMINI_API_KEY=gemini-api-key:latest"
   ```

   `--allow-unauthenticated` makes the HTTP service reachable by the browser; application routes still verify Firebase ID tokens. Weather and health endpoints are public.
4. Set the Vercel production variable `VITE_API_URL` to the Cloud Run service URL, and set the backend `ALLOWED_ORIGINS` to the exact Vercel frontend origin. Redeploy the frontend after changing its `VITE_*` variables.

Set `FIREBASE_DATABASE_ID` to the same database used by the browser configuration; use `(default)` only if the app is configured for the default Firestore database. Cloud Run's `PORT` is supplied by the platform and the container binds to it. Verify the deployed service at `/api/health`, then test sign-in, a protected API request, and the frontend-to-API connection.

## Checks

```sh
npm run lint
npm run build
python -m compileall -q backend api
python -m unittest discover -s tests
```

Live deployment checks require configured Firebase, Gemini, Vercel, and Google Cloud resources.
