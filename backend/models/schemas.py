from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class GarmentAnalysisResponse(BaseModel):
    category: str = Field(description="Top-level clothing category (top, bottom, outer, footwear, accessory, ethnic, suit, kurta_set, etc.)")
    subCategory: str = Field(description="Specific garment subcategory (shirt, t-shirt, trousers, bundi, blazer, saree, etc.)")
    primaryColorName: str = Field(description="Human-readable dominant color name (e.g. Navy Blue, Emerald Green)")
    primaryColorHex: str = Field(description="6-digit hex code of dominant color (e.g. #0F172A)")
    secondaryColorHex: Optional[str] = Field(default=None, description="Accent or pattern color hex")
    pattern: str = Field(description="Visual pattern (solid, striped, plaid, floral, textured, graphic)")
    formalityScore: int = Field(ge=1, le=5, description="Formality score from 1 (casual lounge) to 5 (black-tie festive)")
    thermalWeight: int = Field(ge=1, le=5, description="Thermal insulation weight from 1 (breathable summer) to 5 (heavy winter)")
    material: str = Field(description="Inferred fabric/material (cotton, linen, silk, wool, denim, polyester)")
    isCoOrdSet: bool = Field(default=False, description="Whether this is a multi-piece coordinated set")
    includedPieces: List[str] = Field(default_factory=list, description="Included garments if multi-piece set")
    stylingNotes: str = Field(description="Professional stylist notes and pairing suggestions")


class WeatherInput(BaseModel):
    temperature_celsius: Optional[float] = Field(default=27.0, alias="temp_c")
    apparent_temperature_celsius: Optional[float] = Field(default=29.5, alias="apparent_temp_c")
    humidity_percent: Optional[float] = Field(default=68.0, alias="humidity_pct")
    precipitation_probability: Optional[float] = Field(default=10.0, alias="rain_chance_pct")
    condition: Optional[str] = Field(default="Clear")

    class Config:
        populate_by_name = True


class ClosetGarment(BaseModel):
    id: str
    title: Optional[str] = None
    name: Optional[str] = None
    category: str
    subCategory: Optional[str] = None
    primary_color_hex: Optional[str] = Field(default="#000000", alias="primaryColorHex")
    primaryColorName: Optional[str] = None
    pattern: Optional[str] = "solid"
    material: Optional[str] = "cotton"
    formality_score: Optional[int] = Field(default=3, alias="formalityScore")
    thermal_weight: Optional[int] = Field(default=2, alias="thermalWeight")

    class Config:
        populate_by_name = True


class FamilyMemberCloset(BaseModel):
    member_id: str
    name: str
    relationship: Optional[str] = "self"
    gender: Optional[str] = "unspecified"
    closet: List[ClosetGarment] = Field(default_factory=list)


class MemberOutfitRecommendation(BaseModel):
    member_id: str
    name: str
    relationship: Optional[str] = ""
    selected_garment_ids: List[str] = Field(default_factory=list)
    outfit_name: str
    dominant_color_hex: str
    formality_score: int
    individual_styling_note: str


class FamilyOutfitPlanResponse(BaseModel):
    group_theme_title: str
    group_color_palette: List[str]
    weather_rationale: str
    coordination_rationale: str
    attending_outfits: List[MemberOutfitRecommendation]


class SuggestOutfitRequest(BaseModel):
    prompt: Optional[str] = None
    event_prompt: Optional[str] = None
    weather: Optional[Dict[str, Any]] = None
    garments: Optional[List[Dict[str, Any]]] = None
    family_closets: Optional[List[FamilyMemberCloset]] = None


class UserProfileSyncRequest(BaseModel):
    email: Optional[str] = None
    displayName: Optional[str] = None
