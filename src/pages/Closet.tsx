import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Plus, 
  Upload, 
  Camera, 
  Loader2, 
  Trash2, 
  Heart, 
  X, 
  Sparkles, 
  Edit3, 
  Check, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  XCircle,
  Layers,
  Filter,
  Users,
  User,
  Tag,
  ArrowRight
} from 'lucide-react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { Garment, FamilyMember } from '../types';
import FamilyMemberBar from '../components/FamilyMemberBar';
import FamilyMemberModal from '../components/FamilyMemberModal';

// Category filter definitions
type CategoryFilter = 'all' | 'top' | 'bottom' | 'outerwear' | 'sets_suits' | 'footwear' | 'accessory';

export default function Closet() {
  const [searchParams] = useSearchParams();
  // 1. Closet grid & catalog state
  const [garments, setGarments] = useState<Garment[]>([]);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => searchParams.get('member') || 'all'); // 'all' | 'self' | member.id
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const { user, profile } = useAuth();

  useEffect(() => {
    const memberParam = searchParams.get('member');
    if (memberParam) {
      setSelectedMemberId(memberParam);
    }
  }, [searchParams]);

  // 2. Family Member Modal state
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<FamilyMember | null>(null);

  // 3. In-place modal & ingestion state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownReason, setCountdownReason] = useState<string>('');
  const retryCountRef = useRef<number>(0);
  
  // Target owner for new upload (defaults to active member tab if specific, else 'self')
  const [targetMemberId, setTargetMemberId] = useState<string>('self');

  // Extracted attributes array (supports single garment or multi-piece composite sets)
  const [attributesArray, setAttributesArray] = useState<any[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync targetMemberId with selectedMemberId when opening modal
  useEffect(() => {
    if (selectedMemberId === 'all') {
      setTargetMemberId('self');
    } else {
      setTargetMemberId(selectedMemberId);
    }
  }, [selectedMemberId, isModalOpen]);

  // Load user garments and family members on mount / auth change
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      
      const garmentsCacheKey = `vastrakalp_garments_${user.uid}`;
      const membersCacheKey = `vastrakalp_family_members_${user.uid}`;

      // 1. Read cache first for instantaneous rendering
      try {
        const cachedGarments = localStorage.getItem(garmentsCacheKey);
        if (cachedGarments) {
          setGarments(JSON.parse(cachedGarments));
        }
        const cachedMembers = localStorage.getItem(membersCacheKey);
        if (cachedMembers) {
          setFamilyMembers(JSON.parse(cachedMembers));
        }
      } catch {
        // Ignore cache JSON error
      }

      // 2. Fetch fresh data from Firestore
      try {
        // Load Garments
        const garmentsQuery = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
        const garmentsSnap = await getDocs(garmentsQuery);
        const fetchedGarments = garmentsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as Garment));
        setGarments(fetchedGarments);
        try {
          localStorage.setItem(garmentsCacheKey, JSON.stringify(fetchedGarments));
        } catch {}

        // Load Family Members
        const membersQuery = query(collection(db, 'familyMembers'), where('userId', '==', user.uid));
        const membersSnap = await getDocs(membersQuery);
        const fetchedMembers = membersSnap.docs.map(doc => ({ ...doc.data(), id: doc.id } as FamilyMember));
        setFamilyMembers(fetchedMembers);
        try {
          localStorage.setItem(membersCacheKey, JSON.stringify(fetchedMembers));
        } catch {}
      } catch (err) {
        console.warn('Operating with local cache while connecting to Firestore:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  // Auto-retry timer for TPM cooldown / Warmup
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setCountdownReason('');
      if (imageFile) {
        triggerAnalysis(imageFile);
      }
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown, imageFile]);

  // Image downsampling to reduce token usage and avoid TPM limits
  const resizeImage = (file: File): Promise<Blob | File> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.src = objectUrl;
        img.onload = () => {
          try {
            URL.revokeObjectURL(objectUrl);
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const MAX_HEIGHT = 800;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }
            } else {
              if (height > MAX_HEIGHT) {
                width = Math.round((width * MAX_HEIGHT) / height);
                height = MAX_HEIGHT;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(file);
            
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              resolve(blob || file);
            }, 'image/jpeg', 0.8);
          } catch {
            resolve(file);
          }
        };
        img.onerror = () => {
          try { URL.revokeObjectURL(objectUrl); } catch {}
          resolve(file);
        };
      } catch {
        resolve(file);
      }
    });
  };

  // Trigger Gemini Vision attribute analysis endpoint
  const triggerAnalysis = async (file: File) => {
    setAnalyzing(true);
    setError(null);
    setCountdown(null);
    setCountdownReason('');

    try {
      const optimizedBlob = await resizeImage(file);
      const formData = new FormData();
      formData.append('image', optimizedBlob, file.name || 'garment.jpg');

      const data = await api.analyzeGarment(formData);
      retryCountRef.current = 0;

      // Check if backend returned multiple items (e.g. Kurta + Pyjama set or Suit + Trouser)
      if (Array.isArray(data)) {
        setAttributesArray(data);
      } else if (data && data.items && Array.isArray(data.items)) {
        setAttributesArray(data.items);
      } else if (data) {
        setAttributesArray([data]);
      } else {
        throw new Error('No structured attributes returned from analysis.');
      }
    } catch (err: any) {
      console.warn('Garment analysis encountered condition:', err);
      const isRateLimit =
        err?.isRateLimit ||
        err?.code === 'RATE_LIMIT_EXCEEDED' ||
        err?.status === 429 ||
        /tokens per minute|tpm|quota|rate limit/i.test(err?.message || '');

      const isWarmup =
        err?.isWarmup ||
        err?.code === 'SERVER_WARMUP' ||
        err?.code === 'NETWORK_ERROR' ||
        err?.status === 0 ||
        err?.status === 502 ||
        err?.status === 503;

      if (isRateLimit) {
        const sec = err?.retryAfterSeconds || 60;
        setCountdown(sec);
        setCountdownReason(`Gemini Tokens Per Minute (TPM) limit reached. Waiting ${sec}s cooldown before automatic retry...`);
      } else if (isWarmup) {
        const sec = err?.retryAfterSeconds || 5;
        setCountdown(sec);
        setCountdownReason(`Backend server is starting up or handling requests. Retrying in ${sec}s...`);
      } else {
        setError(err?.message || 'Failed to analyze garment image. You can enter details manually.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
      setAttributesArray(null);
      setError(null);
      setCountdown(null);
      setCountdownReason('');
      triggerAnalysis(file);
    }
  };

  const handleManualEntryFallback = () => {
    setCountdown(null);
    setCountdownReason('');
    setError(null);
    setIsEditing(true);
    setAttributesArray([
      {
        name: 'New Wardrobe Item',
        category: 'top',
        subCategory: 'T-Shirt',
        primaryColorName: 'Navy Blue',
        primaryColorHex: '#1e3a8a',
        pattern: 'Solid',
        material: 'Cotton',
        fit: 'Regular',
        formalityScore: 3,
        thermalWeight: 2,
        included_pieces: [],
        styling_notes: ''
      }
    ]);
  };

  const updateAttribute = (index: number, field: string, value: any) => {
    if (!attributesArray) return;
    const newArr = [...attributesArray];
    newArr[index] = { ...newArr[index], [field]: value };
    setAttributesArray(newArr);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setImageFile(null);
    setPreviewUrl(null);
    setAttributesArray(null);
    setAnalyzing(false);
    setError(null);
    setCountdown(null);
    setCountdownReason('');
    setIsEditing(false);
  };

  // Save extracted/reviewed attributes to database with instant optimistic closet update
  const handleSaveToCloset = async () => {
    if (!attributesArray || !user || !profile || !imageFile) return;
    setSaving(true);
    try {
      const storageFile = await resizeImage(imageFile);
      const base64Url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(storageFile);
      });

      // Determine owner details
      const isSelf = targetMemberId === 'self';
      const assignedMember = familyMembers.find(m => m.id === targetMemberId);
      const memberName = isSelf ? (profile?.firstName || 'You') : (assignedMember?.name || 'Family Member');
      const memberRelation = isSelf ? 'self' : (assignedMember?.relationship || 'other');

      const newGarmentsToInsert: Garment[] = [];

      for (const attributes of attributesArray) {
        let hex = attributes.primaryColorHex || '#000000';
        if (!hex.startsWith('#')) hex = '#' + hex;
        if (hex.length === 4) {
          hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
        }
        hex = hex.padEnd(7, '0').slice(0, 7);

        const validCategories = ['top', 'bottom', 'outerwear', 'footwear', 'accessory', 'suit', 'kurta_set', 'tuxedo', 'co_ord_set'];
        const cat = (attributes.category || '').toLowerCase();
        const finalCategory = validCategories.includes(cat) ? cat : (validCategories.find(c => cat.includes(c)) || 'accessory');

        const now = Date.now();
        const payload: any = {
          ...attributes,
          name: (attributes.name || '').slice(0, 100),
          category: finalCategory,
          subCategory: (attributes.subCategory || '').slice(0, 50),
          primaryColorName: (attributes.primaryColorName || '').slice(0, 50),
          primaryColorHex: hex,
          pattern: attributes.pattern ? attributes.pattern.slice(0, 30) : '',
          material: attributes.material ? attributes.material.slice(0, 50) : '',
          fit: attributes.fit ? attributes.fit.slice(0, 30) : '',
          formalityScore: Math.max(1, Math.min(5, attributes.formalityScore || 3)),
          thermalWeight: Math.max(1, Math.min(5, attributes.thermalWeight || 3)),
          included_pieces: attributes.included_pieces || [],
          styling_notes: attributes.styling_notes || '',
          imageUrl: base64Url,
          ownerId: user.uid,
          userId: user.uid,
          familyId: profile.familyId,
          memberId: targetMemberId,
          memberName: memberName,
          memberRelation: memberRelation,
          isUserModified: false,
          isFavorite: false,
          createdAt: now,
          updatedAt: now,
        };

        Object.keys(payload).forEach(key => {
          if (payload[key] === null || payload[key] === undefined) {
            delete payload[key];
          }
        });

        const docRef = await addDoc(collection(db, 'garments'), payload);
        newGarmentsToInsert.push({ ...payload, id: docRef.id });
      }

      // Optimistically prepend the new garments to the top of the closet grid
      setGarments(prev => {
        const updated = [...newGarmentsToInsert, ...prev];
        try {
          localStorage.setItem(`vastrakalp_garments_${user.uid}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      // Dismiss modal
      closeModal();
    } catch (err: any) {
      console.error('Failed to save garment:', err);
      alert('Failed to save to closet. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this garment from the closet?')) return;
    try {
      await deleteDoc(doc(db, 'garments', id));
      setGarments(prev => {
        const filtered = prev.filter(g => g.id !== id);
        if (user) {
          try {
            localStorage.setItem(`vastrakalp_garments_${user.uid}`, JSON.stringify(filtered));
          } catch {}
        }
        return filtered;
      });
    } catch (error) {
      console.error('Failed to delete garment:', error);
      alert('Failed to delete garment. Please try again.');
    }
  };

  const handleToggleFavorite = async (id: string, current: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedFav = !current;
    // Optimistic UI update
    setGarments(prev => {
      const updated = prev.map(g => (g.id === id ? { ...g, isFavorite: updatedFav } : g));
      if (user) {
        try {
          localStorage.setItem(`vastrakalp_garments_${user.uid}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });

    try {
      await updateDoc(doc(db, 'garments', id), {
        isFavorite: updatedFav,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Failed to update favorite status:', error);
    }
  };

  // Family Member Saved Handler
  const handleFamilyMemberSaved = (savedMember: FamilyMember, isNew: boolean) => {
    setFamilyMembers(prev => {
      let updated: FamilyMember[];
      if (isNew) {
        updated = [...prev, savedMember];
      } else {
        updated = prev.map(m => (m.id === savedMember.id ? savedMember : m));
      }
      if (user) {
        try {
          localStorage.setItem(`vastrakalp_family_members_${user.uid}`, JSON.stringify(updated));
        } catch {}
      }
      return updated;
    });
    // Auto switch to newly added member's closet
    if (isNew) {
      setSelectedMemberId(savedMember.id);
    }
  };

  // Family Member Deleted Handler
  const handleFamilyMemberDeleted = (deletedMemberId: string) => {
    setFamilyMembers(prev => {
      const filtered = prev.filter(m => m.id !== deletedMemberId);
      if (user) {
        try {
          localStorage.setItem(`vastrakalp_family_members_${user.uid}`, JSON.stringify(filtered));
        } catch {}
      }
      return filtered;
    });
    if (selectedMemberId === deletedMemberId) {
      setSelectedMemberId('all');
    }
  };

  // Calculate garment counts per member
  const garmentCounts: Record<string, number> = {
    all: garments.length,
    self: garments.filter(g => !g.memberId || g.memberId === 'self' || (user && g.memberId === user.uid)).length
  };
  familyMembers.forEach(m => {
    garmentCounts[m.id] = garments.filter(g => g.memberId === m.id).length;
  });

  // Filter garments based on selected member AND selected category
  const filteredGarments = garments.filter((g) => {
    // 1. Member filter
    if (selectedMemberId === 'self') {
      const isSelf = !g.memberId || g.memberId === 'self' || (user && g.memberId === user.uid);
      if (!isSelf) return false;
    } else if (selectedMemberId !== 'all') {
      if (g.memberId !== selectedMemberId) return false;
    }

    // 2. Category filter
    if (activeCategory === 'all') return true;
    if (activeCategory === 'sets_suits') {
      return ['suit', 'kurta_set', 'tuxedo', 'co_ord_set'].includes(g.category);
    }
    return g.category === activeCategory;
  });

  // Helper to render owner tag on garment card
  const renderOwnerBadge = (garment: Garment) => {
    const isSelf = !garment.memberId || garment.memberId === 'self' || (user && garment.memberId === user.uid);
    if (isSelf) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-900/80 backdrop-blur-md text-white text-[10px] font-medium shadow-sm">
          <User className="w-3 h-3" />
          <span>{profile?.firstName || 'You'}</span>
        </span>
      );
    }

    const member = familyMembers.find(m => m.id === garment.memberId);
    const color = member?.avatarColor || '#ec4899';
    const name = garment.memberName || member?.name || 'Family';
    const relation = garment.memberRelation || member?.relationship;

    return (
      <span 
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md backdrop-blur-md text-white text-[10px] font-medium shadow-sm"
        style={{ backgroundColor: `${color}dd` }}
      >
        <span>{name}</span>
        {relation && <span className="opacity-80 text-[9px] capitalize">({relation})</span>}
      </span>
    );
  };

  const selectedMember = familyMembers.find(m => m.id === selectedMemberId);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Header with Add Button */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Wardrobe & Family Closets</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="btn-add-family-member-header"
            onClick={() => {
              setMemberToEdit(null);
              setIsFamilyModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-semibold transition-colors"
          >
            <Users className="w-4 h-4 text-stone-600" />
            <span>Family Members ({familyMembers.length})</span>
          </button>

          <button
            id="btn-add-garment-modal"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>
              {selectedMemberId === 'all' || selectedMemberId === 'self'
                ? 'Add Garment'
                : `Add for ${selectedMember?.name || 'Member'}`}
            </span>
          </button>
        </div>
      </header>

      {/* 2. Family Members Bar & Multi-Closet Switcher */}
      <section className="bg-stone-50/80 p-4 rounded-3xl border border-stone-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-3 px-1">
          <div className="flex items-center gap-2 text-xs font-bold text-stone-700 uppercase tracking-wider">
            <Users className="w-4 h-4 text-stone-500" />
            <span>Household Wardrobe Directory</span>
          </div>
          <span className="text-xs text-stone-500">
            {familyMembers.length > 0
              ? `${familyMembers.length + 1} Managed Closets`
              : 'Add family members to enable multi-person styling'}
          </span>
        </div>

        <FamilyMemberBar
          members={familyMembers}
          selectedMemberId={selectedMemberId}
          onSelectMember={setSelectedMemberId}
          onAddMemberClick={() => {
            setMemberToEdit(null);
            setIsFamilyModalOpen(true);
          }}
          onEditMemberClick={(member) => {
            setMemberToEdit(member);
            setIsFamilyModalOpen(true);
          }}
          garmentCounts={garmentCounts}
          userName={profile?.firstName || 'You'}
        />
      </section>

      {/* 3. Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-stone-100">
        {[
          { id: 'all', label: 'All Garments' },
          { id: 'top', label: 'Tops' },
          { id: 'bottom', label: 'Bottoms' },
          { id: 'outerwear', label: 'Outerwear' },
          { id: 'sets_suits', label: 'Sets & Suits' },
          { id: 'footwear', label: 'Footwear' },
          { id: 'accessory', label: 'Accessories' }
        ].map(cat => (
          <button
            key={cat.id}
            id={`filter-${cat.id}`}
            onClick={() => setActiveCategory(cat.id as CategoryFilter)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? 'bg-stone-900 text-white shadow-xs'
                : 'bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 4. Closet Content Grid / State Rendering */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
          <p className="text-sm font-medium text-stone-500">Loading wardrobe catalog...</p>
        </div>
      ) : filteredGarments.length === 0 ? (
        <div className="py-16 px-4 text-center bg-white rounded-3xl border border-stone-200/80 shadow-xs flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-stone-50 flex items-center justify-center text-stone-400">
            <Layers className="w-8 h-8" />
          </div>
          <div className="max-w-md">
            <h3 className="text-lg font-bold text-stone-900">
              {selectedMemberId === 'all'
                ? 'No Garments Found'
                : selectedMemberId === 'self'
                ? 'Your personal closet is empty'
                : `${selectedMember?.name || 'Member'}'s closet is empty`}
            </h3>
            <p className="text-stone-500 text-xs mt-1">
              {selectedMemberId === 'all'
                ? 'Digitise garments by taking a photo or uploading from your device to enable AI styling.'
                : `Add garments specifically for ${selectedMember?.name || 'this member'} to include them in family event coordination.`}
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-2xl shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Upload First Garment</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredGarments.map((garment) => (
            <div 
              key={garment.id} 
              id={`garment-card-${garment.id}`}
              className="group bg-white rounded-3xl border border-stone-200/80 overflow-hidden shadow-2xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div className="relative aspect-square bg-stone-100 overflow-hidden">
                {garment.imageUrl ? (
                  <img 
                    src={garment.imageUrl} 
                    alt={garment.name || garment.subCategory}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-400">
                    <Layers className="w-8 h-8" />
                  </div>
                )}

                {/* Owner Badge Pill on Image */}
                <div className="absolute top-3 left-3 z-10">
                  {renderOwnerBadge(garment)}
                </div>

                {/* Quick action buttons */}
                <div className="absolute z-10 top-3 right-3 flex flex-col gap-1.5">
                  <button
                    onClick={(e) => handleToggleFavorite(garment.id, !!garment.isFavorite, e)}
                    className={`p-2 ${
                      garment.isFavorite 
                        ? 'bg-rose-50 text-rose-500' 
                        : 'bg-white/90 text-stone-400 hover:text-rose-500 hover:bg-white'
                    } backdrop-blur-md rounded-full shadow-sm transition pointer-events-auto cursor-pointer`}
                    title="Toggle favorite"
                  >
                    <Heart className="w-4 h-4" fill={garment.isFavorite ? 'currentColor' : 'none'} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(garment.id, e)}
                    className="p-2 bg-white/90 backdrop-blur-md text-stone-400 hover:text-rose-600 hover:bg-white rounded-full transition shadow-sm pointer-events-auto cursor-pointer"
                    title="Delete garment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <h4 className="font-semibold text-stone-900 capitalize truncate text-sm">
                      {garment.name || garment.subCategory}
                    </h4>
                    <div 
                      className="w-3.5 h-3.5 rounded-full border border-stone-200 shrink-0 shadow-2xs" 
                      style={{ backgroundColor: garment.primaryColorHex }} 
                      title={garment.primaryColorName}
                    />
                  </div>
                  <p className="text-xs text-stone-500 capitalize truncate">
                    {garment.primaryColorName} · {garment.material || 'Standard Fabric'}
                  </p>
                  {garment.included_pieces && garment.included_pieces.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {garment.included_pieces.map((piece, pIdx) => (
                        <span key={pIdx} className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
                          {piece}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] font-medium text-stone-500">
                  <span>Formality: <strong>{garment.formalityScore}/5</strong></span>
                  <span>Warmth: <strong>{garment.thermalWeight}/5</strong></span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. In-Place Ingestion Modal (Bottom Sheet / Overlay) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div 
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-stone-100 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-stone-900">Add Item to Closet</h3>
                <p className="text-xs text-stone-500 mt-0.5">Upload a photo to extract fabrics, colors, and styling attributes with Gemini.</p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-full transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Assign to Family Member Selector */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80">
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
                  Assign Garment To
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTargetMemberId('self')}
                    className={`p-2.5 rounded-2xl border text-left text-xs font-medium transition-all flex items-center gap-2 ${
                      targetMemberId === 'self'
                        ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                        : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">
                      {(profile?.firstName || 'Y').charAt(0).toUpperCase()}
                    </div>
                    <span className="truncate">{profile?.firstName || 'You'} (Self)</span>
                  </button>

                  {familyMembers.map((member) => {
                    const isSelected = targetMemberId === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => setTargetMemberId(member.id)}
                        className={`p-2.5 rounded-2xl border text-left text-xs font-medium transition-all flex items-center gap-2 ${
                          isSelected
                            ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                            : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        <div 
                          className="w-5 h-5 rounded-lg text-white flex items-center justify-center text-[10px] font-bold"
                          style={{ backgroundColor: member.avatarColor || '#ec4899' }}
                        >
                          {member.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{member.name} ({member.relationship})</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hidden File Inputs */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />
              <input
                type="file"
                ref={cameraInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                capture="environment"
                className="hidden"
              />

              {/* Upload Selector or Image Preview */}
              {!previewUrl ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-stone-200 hover:border-stone-400 bg-stone-50 hover:bg-stone-100/60 transition gap-3 cursor-pointer group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-xs flex items-center justify-center text-stone-700 group-hover:scale-105 transition">
                      <Camera className="w-6 h-6" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-stone-900 text-sm">Take Photo</p>
                      <p className="text-xs text-stone-500 mt-0.5">Use device camera</p>
                    </div>
                  </button>

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex flex-col items-center justify-center p-8 rounded-2xl border-2 border-dashed border-stone-200 hover:border-stone-400 bg-stone-50 hover:bg-stone-100/60 transition gap-3 cursor-pointer group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white shadow-xs flex items-center justify-center text-stone-700 group-hover:scale-105 transition">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-stone-900 text-sm">Choose from Gallery</p>
                      <p className="text-xs text-stone-500 mt-0.5">Select image file</p>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selected Image Thumbnail Bar */}
                  <div className="flex items-center gap-4 p-3 bg-stone-50 rounded-2xl border border-stone-200/70">
                    <img 
                      src={previewUrl} 
                      alt="Thumbnail preview" 
                      className="w-16 h-16 object-cover rounded-xl border border-stone-200 bg-white"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-900 truncate">
                        {imageFile?.name || 'Selected Garment Photo'}
                      </p>
                      <p className="text-xs text-stone-500 mt-0.5">
                        {imageFile ? `${(imageFile.size / 1024).toFixed(1)} KB` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setImageFile(null);
                        setPreviewUrl(null);
                        setAttributesArray(null);
                        setError(null);
                        setCountdown(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white border border-stone-200 rounded-lg transition cursor-pointer"
                    >
                      Change Photo
                    </button>
                  </div>

                  {/* Loading Spinner & Skeleton */}
                  {analyzing && (
                    <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 bg-stone-50 rounded-2xl border border-stone-100">
                      <Loader2 className="w-8 h-8 animate-spin text-stone-600" />
                      <div>
                        <p className="font-semibold text-sm text-stone-800">Analyzing fabric & styling tags with Gemini...</p>
                        <p className="text-xs text-stone-500 mt-0.5">Extracting warmth, formality, category, and composite pieces</p>
                      </div>
                    </div>
                  )}

                  {/* Rate Limit / Cooldown Banner */}
                  {countdown !== null && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                          <Clock className="w-4 h-4 animate-spin text-amber-700" />
                          <span>Cooldown Active</span>
                        </div>
                        <span className="text-xs font-bold px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full">
                          {countdown}s remaining
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">{countdownReason}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => { setCountdown(null); if (imageFile) triggerAnalysis(imageFile); }}
                          className="flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry Now
                        </button>
                        <button
                          onClick={handleManualEntryFallback}
                          className="flex items-center gap-1 px-3 py-1 bg-stone-900 text-white hover:bg-stone-800 rounded-lg text-xs font-semibold ml-auto transition cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          Enter Details Manually
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Error State Banner */}
                  {error && countdown === null && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
                      <div className="flex items-center gap-2 text-rose-900 font-semibold text-sm">
                        <AlertCircle className="w-4 h-4 text-rose-700" />
                        <span>Extraction Issue</span>
                      </div>
                      <p className="text-xs text-rose-800 leading-relaxed">{error}</p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => { if (imageFile) triggerAnalysis(imageFile); }}
                          className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          Retry Analysis
                        </button>
                        <button
                          onClick={handleManualEntryFallback}
                          className="flex items-center gap-1 px-3 py-1 bg-stone-900 text-white hover:bg-stone-800 rounded-lg text-xs font-semibold ml-auto transition cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          Enter Details Manually
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Extracted Attributes Review Form */}
                  {attributesArray && attributesArray.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                        <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
                          {attributesArray.length > 1 ? `Detected Composite Set (${attributesArray.length} items)` : 'Detected Attributes'}
                        </span>
                        <button
                          onClick={() => setIsEditing(!isEditing)}
                          className="text-xs font-semibold text-stone-700 hover:text-stone-900 underline cursor-pointer"
                        >
                          {isEditing ? 'Done Editing' : 'Edit Tags'}
                        </button>
                      </div>

                      {attributesArray.map((attributes, index) => (
                        <div key={index} className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-3">
                          {/* Title / Name */}
                          <div>
                            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                              Title
                            </label>
                            {isEditing ? (
                              <input
                                type="text"
                                value={attributes.name || ''}
                                onChange={(e) => updateAttribute(index, 'name', e.target.value)}
                                className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white font-medium"
                              />
                            ) : (
                              <p className="font-semibold text-stone-900 text-sm">{attributes.name}</p>
                            )}
                          </div>

                          {/* Category & SubCategory */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                                Category
                              </label>
                              {isEditing ? (
                                <select
                                  value={attributes.category || ''}
                                  onChange={(e) => updateAttribute(index, 'category', e.target.value)}
                                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white"
                                >
                                  <option value="top">Top</option>
                                  <option value="bottom">Bottom</option>
                                  <option value="outerwear">Outerwear</option>
                                  <option value="footwear">Footwear</option>
                                  <option value="accessory">Accessory</option>
                                  <option value="suit">Suit</option>
                                  <option value="kurta_set">Kurta Set</option>
                                  <option value="tuxedo">Tuxedo</option>
                                  <option value="co_ord_set">Co-ord Set</option>
                                </select>
                              ) : (
                                <p className="text-xs font-medium text-stone-800 capitalize">{attributes.category}</p>
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                                Subcategory
                              </label>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={attributes.subCategory || ''}
                                  onChange={(e) => updateAttribute(index, 'subCategory', e.target.value)}
                                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white"
                                />
                              ) : (
                                <p className="text-xs font-medium text-stone-800 capitalize">{attributes.subCategory}</p>
                              )}
                            </div>
                          </div>

                          {/* Color & Dominant Hex */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                                Color Name
                              </label>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={attributes.primaryColorName || ''}
                                  onChange={(e) => updateAttribute(index, 'primaryColorName', e.target.value)}
                                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white"
                                />
                              ) : (
                                <p className="text-xs font-medium text-stone-800 capitalize">{attributes.primaryColorName}</p>
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                                Dominant Hex
                              </label>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-6 h-6 rounded-lg border border-stone-300 shrink-0" 
                                  style={{ backgroundColor: attributes.primaryColorHex || '#000000' }} 
                                />
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={attributes.primaryColorHex || ''}
                                    onChange={(e) => updateAttribute(index, 'primaryColorHex', e.target.value)}
                                    className="w-full px-2 py-1 border border-stone-200 rounded-lg text-xs bg-white font-mono"
                                  />
                                ) : (
                                  <span className="text-xs font-mono text-stone-700">{attributes.primaryColorHex}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Formality (1-5) & Warmth (1-5) */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                                Formality ({attributes.formalityScore || 3}/5)
                              </label>
                              {isEditing ? (
                                <input
                                  type="range"
                                  min="1"
                                  max="5"
                                  value={attributes.formalityScore || 3}
                                  onChange={(e) => updateAttribute(index, 'formalityScore', parseInt(e.target.value))}
                                  className="w-full accent-stone-900"
                                />
                              ) : (
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map(step => (
                                    <div 
                                      key={step} 
                                      className={`h-2 flex-1 rounded-full ${
                                        step <= (attributes.formalityScore || 3) ? 'bg-stone-800' : 'bg-stone-200'
                                      }`} 
                                    />
                                  ))}
                                </div>
                              )}
                            </div>

                            <div>
                              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                                Warmth ({attributes.thermalWeight || 3}/5)
                              </label>
                              {isEditing ? (
                                <input
                                  type="range"
                                  min="1"
                                  max="5"
                                  value={attributes.thermalWeight || 3}
                                  onChange={(e) => updateAttribute(index, 'thermalWeight', parseInt(e.target.value))}
                                  className="w-full accent-stone-900"
                                />
                              ) : (
                                <div className="flex gap-1">
                                  {[1, 2, 3, 4, 5].map(step => (
                                    <div 
                                      key={step} 
                                      className={`h-2 flex-1 rounded-full ${
                                        step <= (attributes.thermalWeight || 3) ? 'bg-amber-600' : 'bg-stone-200'
                                      }`} 
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Included pieces for sets / suits */}
                          {attributes.included_pieces && attributes.included_pieces.length > 0 && (
                            <div className="pt-1">
                              <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
                                Included Pieces in Set
                              </label>
                              <div className="flex flex-wrap gap-1.5">
                                {attributes.included_pieces.map((piece: string, pIdx: number) => (
                                  <span key={pIdx} className="text-xs bg-white border border-stone-200 text-stone-700 px-2 py-0.5 rounded-md">
                                    {piece}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 sm:p-6 border-t border-stone-100 flex items-center justify-between gap-3 bg-stone-50">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-2 text-stone-600 hover:text-stone-900 text-sm font-medium transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!attributesArray || attributesArray.length === 0 || saving || analyzing}
                onClick={handleSaveToCloset}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-sm transition cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving to Closet...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save to Closet</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Family Member Add / Edit Modal */}
      <FamilyMemberModal
        isOpen={isFamilyModalOpen}
        onClose={() => setIsFamilyModalOpen(false)}
        memberToEdit={memberToEdit}
        onSaved={handleFamilyMemberSaved}
        onDeleted={handleFamilyMemberDeleted}
      />
    </div>
  );
}
