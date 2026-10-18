# Vercel Serverless Function entry point for Python ASGI / FastAPI
from backend.main import app

# Export app for Vercel Python runtime
__all__ = ["app"]
