import io
import logging
from typing import Optional

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from PIL import Image

from ..services.gemini_service import analyze_garment_image_python
from ..config.firebase import db, verify_firebase_token

router = APIRouter(prefix="/garments", tags=["garments"])
logger = logging.getLogger("vastrakalp.garments")


@router.post("/analyze")
async def analyze_garment_endpoint(
    image: UploadFile = File(...),
    authorization: Optional[str] = Header(None)
):
    """
    Multimodal AI garment attribute extraction.
    Automatically optimizes image to 768px JPEG and executes model fallback to local deterministic CV.
    """
    if not image:
        raise HTTPException(status_code=400, detail="No image file provided")

    token = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not verify_firebase_token(token):
        raise HTTPException(status_code=401, detail="Invalid Firebase authentication token")

    try:
        raw_bytes = await image.read()
        if len(raw_bytes) > 15 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image size exceeds 15MB limit")

        # Optimize image with PIL to max 768x768 JPEG 75% quality to save tokens and minimize latency
        optimized_bytes = raw_bytes
        mime_type = "image/jpeg"
        try:
            with Image.open(io.BytesIO(raw_bytes)) as pil_img:
                pil_img = pil_img.convert("RGB")
                pil_img.thumbnail((768, 768), Image.Resampling.LANCZOS)
                buf = io.BytesIO()
                pil_img.save(buf, format="JPEG", quality=75, optimize=True)
                optimized_bytes = buf.getvalue()
        except Exception:
            optimized_bytes = raw_bytes
            mime_type = image.content_type or "image/jpeg"

        # Analyze using Python Gemini service (with automatic local CV fallback)
        result = analyze_garment_image_python(optimized_bytes, mime_type=mime_type)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Garment analysis failed.")
        raise HTTPException(
            status_code=500,
            detail="Garment analysis failed"
        )


@router.delete("/{garment_id}")
async def delete_garment_endpoint(
    garment_id: str,
    authorization: Optional[str] = Header(None)
):
    """
    Deletes a garment from Firestore.
    """
    if not garment_id:
        raise HTTPException(status_code=400, detail="Garment ID is required")

    token = authorization.replace("Bearer ", "") if authorization and "Bearer " in authorization else ""
    user = verify_firebase_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid Firebase authentication token")

    uid = user.get("uid") or user.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid Firebase authentication token")
    if not db:
        raise HTTPException(status_code=503, detail="Firebase is unavailable")

    try:
        garment_ref = db.collection("garments").document(garment_id)
        garment = garment_ref.get()
        if not garment.exists:
            raise HTTPException(status_code=404, detail="Garment not found")

        data = garment.to_dict() or {}
        owns_garment = data.get("ownerId") == uid or data.get("userId") == uid
        family_id = data.get("familyId")
        if not owns_garment and family_id:
            user_snapshot = db.collection("users").document(uid).get()
            owns_garment = (user_snapshot.to_dict() or {}).get("familyId") == family_id
        if not owns_garment:
            raise HTTPException(status_code=404, detail="Garment not found")

        garment_ref.delete()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to delete garment.")
        raise HTTPException(status_code=503, detail="Garment deletion failed") from exc

    return {"success": True, "deletedId": garment_id}
