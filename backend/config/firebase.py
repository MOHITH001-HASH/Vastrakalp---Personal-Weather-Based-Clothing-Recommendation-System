import json
import logging
import os

logger = logging.getLogger("vastrakalp.firebase")

try:
    import firebase_admin
    from firebase_admin import auth, credentials, firestore
except ImportError:
    firebase_admin = None
    auth = None
    credentials = None
    firestore = None
    logger.warning("firebase-admin is not installed.")

from .settings import FIREBASE_DATABASE_ID, FIREBASE_PROJECT_ID

db = None
firebase_auth = None

if firebase_admin is not None:
    try:
        if not firebase_admin._apps:
            service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON")
            cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
            options = {"projectId": FIREBASE_PROJECT_ID} if FIREBASE_PROJECT_ID else None

            if service_account_json:
                credential = credentials.Certificate(json.loads(service_account_json))
                firebase_admin.initialize_app(credential, options)
            elif cred_path and os.path.exists(cred_path):
                credential = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(credential, options)
            else:
                firebase_admin.initialize_app(options=options)

        db = firestore.client(database_id=FIREBASE_DATABASE_ID)
        firebase_auth = auth
        logger.info("Firebase Admin initialized for project: %s", FIREBASE_PROJECT_ID)
    except Exception:
        logger.exception("Firebase Admin initialization failed.")


def verify_firebase_token(token: str):
    """Verify a Firebase ID token with the Firebase Admin SDK."""
    if not token or not firebase_auth:
        return None

    try:
        return firebase_auth.verify_id_token(token)
    except Exception:
        logger.warning("Firebase ID token verification failed.")
        return None
