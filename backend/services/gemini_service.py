import os
import json
import logging
from typing import Dict, Any, List
from .fallback_service import deterministic_analyze_garment, deterministic_family_outfit_plan

logger = logging.getLogger("vastrakalp.gemini")

CANDIDATE_MODELS = [
    "gemini-3.8-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest"
]

GARMENT_ANALYSIS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "category": {
            "type": "STRING",
            "description": "Primary garment classification: top, bottom, outer, footwear, accessory, ethnic, suit, kurta_set, tuxedo, co_ord_set"
        },
        "subCategory": {
            "type": "STRING",
            "description": "Specific clothing type: e.g. Bundi Set, Oxford Shirt, Chinos, Blazer, Saree"
        },
        "primaryColorName": {
            "type": "STRING",
            "description": "Clean, human-readable color name like Navy Blue, Olive Green, Ivory"
        },
        "primaryColorHex": {
            "type": "STRING",
            "description": "Standard 6-digit hex code representing the dominant tone"
        },
        "secondaryColorHex": {
            "type": "STRING",
            "description": "Optional secondary or accent color hex code"
        },
        "pattern": {
            "type": "STRING",
            "description": "Visual texture: Solid, Striped, Checked, Floral, Jacquard, Printed"
        },
        "formalityScore": {
            "type": "INTEGER",
            "description": "Integer 1 (casual lounge) to 5 (black-tie festive)"
        },
        "thermalWeight": {
            "type": "INTEGER",
            "description": "Integer 1 (light summer) to 5 (heavy winter)"
        },
        "material": {
            "type": "STRING",
            "description": "Dominant fabric: Cotton, Linen, Wool, Silk, Denim, Blend"
        },
        "isCoOrdSet": {
            "type": "BOOLEAN",
            "description": "True if outfit is a matching multi-piece set"
        },
        "includedPieces": {
            "type": "ARRAY",
            "items": {"type": "STRING"},
            "description": "Components included in a coordinated set"
        },
        "stylingNotes": {
            "type": "STRING",
            "description": "Curated styling recommendation for event pairings"
        }
    },
    "required": [
        "category",
        "subCategory",
        "primaryColorName",
        "primaryColorHex",
        "pattern",
        "formalityScore",
        "thermalWeight",
        "material",
        "isCoOrdSet",
        "includedPieces",
        "stylingNotes"
    ]
}


def analyze_garment_image_python(image_bytes: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
    """
    Analyzes garment photograph with Gemini Multimodal Vision API,
    falling back automatically to the deterministic computer vision engine on error or rate-limit.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    
    if api_key:
        prompt = (
            "You are an expert fashion stylist and textile specialist.\n"
            "Analyze the garment in the image. If the image presents a coordinated, multi-piece outfit "
            "(such as a 2-piece suit, 3-piece suit, tuxedo, kurta-pyjama set, Nehru/Bundi jacket set, or co-ord set), "
            "you MUST treat the entire outfit as ONE SINGLE COMPLETE UNIT.\n"
            "Output strictly valid JSON matching the schema."
        )

        for model_name in CANDIDATE_MODELS:
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)
                response = client.models.generate_content(
                    model=model_name,
                    contents=[
                        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                        prompt
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=GARMENT_ANALYSIS_SCHEMA,
                        temperature=0.2
                    )
                )
                if response.text:
                    return json.loads(response.text)
            except Exception as e:
                logger.warning(f"[Gemini Python] Model {model_name} failed: {e}. Trying next candidate...")

    # Fallback to local deterministic vision engine
    logger.info("[Gemini Python] Using deterministic image analysis fallback engine.")
    return deterministic_analyze_garment(image_bytes)


def suggest_family_outfit_python(
    event_prompt: str,
    weather: Dict[str, Any],
    family_closets: List[Any]
) -> Dict[str, Any]:
    """
    Generates multi-person family outfit coordination with Gemini API,
    falling back seamlessly to the deterministic HueSync rule engine.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")

    if api_key and family_closets:
        system_prompt = (
            "You are Vastrakalp HueSync™, an elite multi-person fashion director.\n"
            f"Event Context: {event_prompt}\n"
            f"Atmospheric Conditions: Temp {weather.get('temp_c', 27)}C, Humidity {weather.get('humidity_pct', 70)}%, Rain {weather.get('rain_chance_pct', 10)}%\n"
            "Coordinate harmonious outfits for all attending members without color clashes or duplicate items.\n"
            "Return valid JSON containing group_theme_title, group_color_palette, weather_rationale, coordination_rationale, attending_outfits."
        )

        for model_name in CANDIDATE_MODELS:
            try:
                from google import genai
                from google.genai import types

                client = genai.Client(api_key=api_key)
                closets_json = json.dumps([
                    m.model_dump() if hasattr(m, "model_dump") else m for m in family_closets
                ])
                response = client.models.generate_content(
                    model=model_name,
                    contents=[system_prompt, f"Available Wardrobes:\n{closets_json}"],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0.3
                    )
                )
                if response.text:
                    return json.loads(response.text)
            except Exception as e:
                logger.warning(f"[Gemini Python] Outfit model {model_name} error: {e}")

    # Fallback to local deterministic HueSync engine
    logger.info("[Gemini Python] Using deterministic HueSync family styling fallback engine.")
    return deterministic_family_outfit_plan(event_prompt, weather, family_closets)
