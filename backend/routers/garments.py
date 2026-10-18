import io
from fastapi import APIRouter, UploadFile, File, Header, HTTPException, status
from typing import Optional
from PIL import Image

from ..services.gemini_service import analyze_garment_image_python
from ..config.firebase import db, verify_firebase_token

router = APIRouter(prefix="/garments", tags=["garments"])


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
        raise HTTPException(
            status_code=500,
            detail=f"Garment analysis failure: {str(exc)}"
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

    if db:
        try:
            db.collection("garments").document(garment_id).delete()
        except Exception as e:
            # Non-blocking delete warning
            pass

    return {"success": True, "deletedId": garment_id}
