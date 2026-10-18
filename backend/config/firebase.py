import os
import json
import logging
from pathlib import Path

logger = logging.getLogger("vastrakalp.firebase")

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, auth
    HAS_FIREBASE = True
except ImportError:
    HAS_FIREBASE = False
    logger.warning("firebase-admin is not installed. Running in mock/standalone mode.")

from .settings import FIREBASE_PROJECT_ID, FIREBASE_DATABASE_ID

db = None
firebase_auth = None

if HAS_FIREBASE:
    try:
        # Check if already initialized
        if not firebase_admin._apps:
            # Check for service account key file
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            if cred_path and os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred, {"projectId": FIREBASE_PROJECT_ID})
            else:
                # Initialize with project ID default credentials
                firebase_admin.initialize_app(options={"projectId": FIREBASE_PROJECT_ID})

        try:
            db = firestore.client(database=FIREBASE_DATABASE_ID)
        except Exception:
            db = firestore.client()
        firebase_auth = auth
        logger.info(f"Firebase Admin initialized for project: {FIREBASE_PROJECT_ID}")
    except Exception as e:
        logger.warning(f"Firebase Admin initialization deferred/failed: {e}")
        db = None
        firebase_auth = None


def verify_firebase_token(token: str):
    """
    Verifies Bearer JWT token from Authorization header using Firebase Admin Auth.
    """
    if not token:
        return None
    if not firebase_auth:
        # Fallback decode or mock for development
        return {"uid": "dev_user_123", "email": "user@vastrakalp.com"}
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception as err:
        logger.warning(f"Token verification error: {err}")
        return None
