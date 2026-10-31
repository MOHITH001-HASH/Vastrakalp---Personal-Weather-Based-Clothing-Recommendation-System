import time
import logging
from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from ..config.firebase import db, verify_firebase_token

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("vastrakalp.auth")


@router.post("/sync")
async def sync_user_endpoint(authorization: Optional[str] = Header(None)):
    """
    Syncs user profile with Firestore and creates default family structure.
    """
    if not authorization or "Bearer " not in authorization:
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = authorization.replace("Bearer ", "").strip()
    decoded_user = verify_firebase_token(token)

    if not decoded_user:
        raise HTTPException(status_code=401, detail="Invalid Firebase authentication token")

    uid = decoded_user.get("uid") or decoded_user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid Firebase authentication token")
    email = decoded_user.get("email") or "User"
    first_name = email.split("@")[0]
    if not db:
        raise HTTPException(status_code=503, detail="Firebase is unavailable")

    now_ms = int(time.time() * 1000)

    try:
        user_ref = db.collection("users").document(uid)
        user_snap = user_ref.get()

        if not user_snap.exists:
            family_ref = db.collection("families").document()
            family_data = {
                "familyName": f"{first_name}'s Family",
                "createdAt": now_ms
            }
            family_ref.set(family_data)

            profile_data = {
                "familyId": family_ref.id,
                "firstName": first_name,
                "role": "admin",
                "createdAt": now_ms,
                "preferences": {
                    "avoidColors": [],
                    "fitPreference": "regular"
                }
            }
            user_ref.set(profile_data)
            return {
                "message": "User and Family created",
                "user": profile_data,
                "familyId": family_ref.id
            }

        existing_data = user_snap.to_dict() or {}
        return {
            "message": "User synced",
            "user": existing_data,
            "familyId": existing_data.get("familyId")
        }
    except Exception as exc:
        logger.exception("Failed to sync Firebase user profile.")
        raise HTTPException(status_code=503, detail="Firebase user sync failed") from exc
