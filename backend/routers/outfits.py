from fastapi import APIRouter, Header, HTTPException
from typing import Optional, Dict, Any, List

from ..models.schemas import SuggestOutfitRequest, FamilyMemberCloset
from ..services.gemini_service import suggest_family_outfit_python
from ..config.firebase import db, verify_firebase_token

router = APIRouter(prefix="/outfits", tags=["outfits"])


@router.post("/suggest")
async def suggest_outfit_endpoint(
    payload: SuggestOutfitRequest,
    authorization: Optional[str] = Header(None)
):
    """
    HueSync™ multi-person weather-calibrated styling engine.
    Coordinates color palettes, formalities, and breathable materials across family members.
    """
    event_prompt = payload.event_prompt or payload.prompt
    if not event_prompt:
        raise HTTPException(status_code=400, detail="Event prompt is required")

    weather_data = payload.weather or {
        "temp_c": 27.0,
        "apparent_temp_c": 29.5,
        "humidity_pct": 68.0,
        "rain_chance_pct": 10.0
    }

    family_closets = payload.family_closets or []

    # If single user closet provided
    if not family_closets:
        raw_garments = payload.garments or []
        token = authorization.replace("Bearer ", "") if authorization and "Bearer " in authorization else ""
        user = verify_firebase_token(token)

        if not raw_garments and db and user:
            try:
                docs = db.collection("garments").where("ownerId", "==", user.get("uid")).stream()
                raw_garments = [doc.to_dict() | {"id": doc.id} for doc in docs]
            except Exception:
                pass

        if not raw_garments:
            raise HTTPException(status_code=400, detail="Closet is empty. Please add garments first.")

        single_member_closet = {
            "member_id": "mem_01",
            "name": "You",
            "relationship": "self",
            "gender": "unspecified",
            "closet": [
                {
                    "id": str(g.get("id", i)),
                    "title": g.get("name") or g.get("title") or f"{g.get('primaryColorName', '')} {g.get('subCategory', g.get('category', 'Garment'))}".strip(),
                    "category": g.get("category", "top"),
                    "subCategory": g.get("subCategory"),
                    "primary_color_hex": g.get("primaryColorHex") or g.get("primary_color_hex") or "#1E293B",
                    "pattern": g.get("pattern", "solid"),
                    "material": g.get("material", "cotton"),
                    "formality_score": g.get("formalityScore") or g.get("formality_score") or 3,
                    "thermal_weight": g.get("thermalWeight") or g.get("thermal_weight") or 2
                }
                for i, g in enumerate(raw_garments)
            ]
        }
        family_closets = [single_member_closet]

    try:
        recommendation = suggest_family_outfit_python(
            event_prompt=event_prompt,
            weather=weather_data,
            family_closets=family_closets
        )
        return recommendation
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate outfit recommendation: {str(e)}"
        )
