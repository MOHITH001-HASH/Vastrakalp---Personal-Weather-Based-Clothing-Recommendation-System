import os
from pathlib import Path
from dotenv import load_dotenv

# Load root .env if present
root_dir = Path(__file__).resolve().parent.parent.parent
load_dotenv(root_dir / ".env")

PORT = int(os.getenv("PORT", 8000))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", os.getenv("VITE_FIREBASE_PROJECT_ID", "gen-lang-client-0005527197"))
FIREBASE_DATABASE_ID = os.getenv("FIREBASE_DATABASE_ID", os.getenv("VITE_FIREBASE_DATABASE_ID", "ai-studio-77024999-4ce1-49cc-90b6-b6cec4d5a94a"))
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "https://*.vercel.app",
    "https://*.run.app",
    "*"
]
