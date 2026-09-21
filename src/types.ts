export type RelationshipType = 
  | 'self'
  | 'partner'
  | 'spouse'
  | 'child'
  | 'son'
  | 'daughter'
  | 'parent'
  | 'father'
  | 'mother'
  | 'sibling'
  | 'brother'
  | 'sister'
  | 'friend'
  | 'other';

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  relationship: RelationshipType;
  relation?: string;
  age?: number;
  gender?: 'male' | 'female' | 'unisex' | 'boy' | 'girl' | 'unspecified';
  avatarColor: string;
  notes?: string;
  familyId?: string;
  createdAt: number;
  updatedAt?: number;
}

export type GarmentCategory = 
  | 'top' 
  | 'bottom' 
  | 'outerwear' 
  | 'footwear' 
  | 'accessory' 
  | 'suit' 
  | 'kurta_set' 
  | 'tuxedo' 
  | 'co_ord_set';

export interface Garment {
  id: string;
  ownerId: string;
  userId?: string;
  familyId?: string;
  memberId?: string; // 'self' or familyMember.id
  memberName?: string;
  memberRelation?: string;
  name?: string;
  category: string;
  subCategory: string;
  primaryColorName: string;
  primaryColorHex: string;
  accentColors?: string[];
  pattern?: string;
  material?: string;
  fit?: string;
  designDetails?: string[];
  formalityScore: number;
  thermalWeight: number;
  weatherSuitability?: string[];
  included_pieces?: string[];
  styling_notes?: string;
  imageUrl?: string;
  isFavorite?: boolean;
  isLaundry?: boolean;
  isUserModified?: boolean;
  purchasePrice?: number;
  createdAt: number;
  updatedAt: number;
}

export interface WeatherContext {
  temperature: number;
  condition: string;
  precipitation: number;
  humidity: number;
  wind: string;
}

export interface AttendeeOutfit {
  member_id: string;
  name: string;
  relationship: string;
  selected_item_ids: string[];
  individual_styling_notes: string;
  formality_score: number;
}

export interface HueSyncFamilyOutfitPlan {
  group_theme_title: string;
  group_color_palette: string[];
  coordination_rationale: string;
  weather_rationale: string;
  attending_outfits: AttendeeOutfit[];
  formality_balance_status?: string;
  suggested_accessories_summary?: string;
}
