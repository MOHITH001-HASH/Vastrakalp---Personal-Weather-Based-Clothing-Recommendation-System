import React, { useState, useEffect, useRef } from 'react';
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
  Filter
} from 'lucide-react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';

// Category filter definitions
type CategoryFilter = 'all' | 'top' | 'bottom' | 'outerwear' | 'sets_suits' | 'footwear' | 'accessory';

interface Garment {
  id: string;
  name?: string;
  category: string;
  subCategory: string;
  primaryColorName: string;
  primaryColorHex: string;
  pattern?: string;
  material?: string;
  fit?: string;
  formalityScore: number;
  thermalWeight: number;
  included_pieces?: string[];
  styling_notes?: string;
  imageUrl?: string;
  isFavorite?: boolean;
  ownerId?: string;
  familyId?: string;
  createdAt?: number;
}

export default function Closet() {
  // 1. Closet grid & catalog state
  const [garments, setGarments] = useState<Garment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const { user, profile } = useAuth();

  // 2. In-place modal & ingestion state
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
  
  // Extracted attributes array (supports single garment or multi-piece composite sets)
  const [attributesArray, setAttributesArray] = useState<any[] | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load user garments on mount / auth change
  useEffect(() => {
    async function load() {
      if (!user) return;
      const cacheKey = `vastrakalp_garments_${user.uid}`;
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          setGarments(JSON.parse(cached));
        }
      } catch {
        // Ignore JSON error
      }

      try {
        const q = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Garment));
        setGarments(data);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          // Ignore cache save error
        }
      } catch (err) {
        console.warn('Operating with local garments cache while connecting to Firestore:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
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

  // Trigger FastAPI / Express backend ingestion endpoint
  const triggerAnalysis = async (file: File) => {
    setAnalyzing(true);
    setError(null);
    setCountdown(null);
    setCountdownReason('');
    try {
      const formData = new FormData();
      const compressedImage = await resizeImage(file);
      formData.append('image', compressedImage, file.name || 'garment.jpg');

      const result = await api.analyzeGarment(formData);
      const items = Array.isArray(result) ? result : [result];
      setAttributesArray(items);
      setIsEditing(false);
      retryCountRef.current = 0;
    } catch (err: any) {
      const isRateLimit =
        err?.isRateLimit ||
        err?.code === 'RATE_LIMIT_EXCEEDED' ||
        err?.status === 429 ||
        /tokens per minute|tpm|rate limit quota/i.test(err?.message || '');

      if (isRateLimit) {
        console.warn('Gemini rate limit quota reached, scheduling retry:', err?.message || err);
        const retrySec = err?.retryAfterSeconds || 30;
        setCountdown(retrySec);
        setCountdownReason('Tokens Per Minute (TPM) quota reached on Gemini. Retrying automatically.');
        setError(null);
      } else {
        console.error('Failed to analyze garment:', err);
        setError(err?.message || 'Failed to analyze image. Please retry or enter details manually.');
        setCountdown(null);
        setCountdownReason('');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      retryCountRef.current = 0;
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setAttributesArray(null);
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
        subCategory: 'Shirt / Top',
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

  // Close modal and reset upload state cleanly
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
          familyId: profile.familyId,
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
      setGarments(prev => [...newGarmentsToInsert, ...prev]);

      // Dismiss modal
      closeModal();
    } catch (err: any) {
      console.error('Failed to save garment:', err);
      alert('Failed to save to closet. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle favorite status
  const handleToggleFavorite = async (id: string, currentStatus: boolean, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const newStatus = !currentStatus;
      await updateDoc(doc(db, 'garments', id), { isFavorite: newStatus });
      setGarments(prev => prev.map(g => g.id === id ? { ...g, isFavorite: newStatus } : g));
    } catch (err) {
      console.error('Failed to update favorite status:', err);
    }
  };

  // Delete garment
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Optimistically remove from state
    setGarments(prev => prev.filter(g => g.id !== id));

    try {
      await deleteDoc(doc(db, 'garments', id));
    } catch (err: any) {
      console.warn('Client direct delete failed, attempting backend fallback deletion:', err?.message || err);
      try {
        await api.deleteGarment(id);
      } catch (backendErr: any) {
        console.error('Failed to delete garment on backend:', backendErr);
      }
    }
  };

  // Filter garments based on category tab
  const filteredGarments = garments.filter((garment) => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'sets_suits') {
      return ['suit', 'kurta_set', 'tuxedo', 'co_ord_set'].includes(garment.category);
    }
    return garment.category === activeCategory;
  });

  const categoryTabs = [
    { id: 'all', label: 'All Items', count: garments.length },
    { id: 'top', label: 'Tops', count: garments.filter(g => g.category === 'top').length },
    { id: 'bottom', label: 'Bottoms', count: garments.filter(g => g.category === 'bottom').length },
    { id: 'outerwear', label: 'Outerwear', count: garments.filter(g => g.category === 'outerwear').length },
    { 
      id: 'sets_suits', 
      label: 'Sets / Suits', 
      count: garments.filter(g => ['suit', 'kurta_set', 'tuxedo', 'co_ord_set'].includes(g.category)).length 
    },
    { id: 'footwear', label: 'Footwear', count: garments.filter(g => g.category === 'footwear').length },
    { id: 'accessory', label: 'Accessories', count: garments.filter(g => g.category === 'accessory').length },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* 1. Header with Title & Action */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-stone-900">Personal Closet</h1>
          <p className="text-stone-500 mt-1">Catalog, curate, and auto-tag your wardrobe seamlessly.</p>
        </div>

        {/* Top-Right Add Item Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl shadow-sm transition cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>Add Item</span>
        </button>
      </header>

      {/* 2. Category Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-stone-200">
        {categoryTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveCategory(tab.id as CategoryFilter)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
              activeCategory === tab.id
                ? 'bg-stone-900 text-white shadow-sm'
                : 'bg-white text-stone-600 hover:bg-stone-100 hover:text-stone-900 border border-stone-200/70'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeCategory === tab.id ? 'bg-stone-700 text-stone-200' : 'bg-stone-100 text-stone-500'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* 3. Closet Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
          <p className="text-sm text-stone-500">Loading your wardrobe collection...</p>
        </div>
      ) : filteredGarments.length === 0 ? (
        <div className="bg-white border border-stone-100 rounded-3xl p-12 text-center shadow-sm flex flex-col items-center">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mb-4 text-stone-400">
            <Filter className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">
            {activeCategory === 'all' ? 'Your closet is empty' : `No items in ${categoryTabs.find(t => t.id === activeCategory)?.label}`}
          </h3>
          <p className="text-stone-500 mt-1 mb-6 max-w-sm text-sm">
            {activeCategory === 'all'
              ? 'Start cataloging your wardrobe by taking a photo or selecting an image from your device.'
              : 'Try selecting a different category or add a new piece to this category.'}
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-white font-medium rounded-xl hover:bg-stone-800 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item Now</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[...filteredGarments]
            .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0))
            .map((garment) => {
              const isComposite = ['suit', 'kurta_set', 'tuxedo', 'co_ord_set'].includes(garment.category);
              return (
                <div 
                  key={garment.id} 
                  className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden shadow-sm hover:shadow-md transition flex flex-col group"
                >
                  <div className="aspect-square bg-stone-50 p-4 flex items-center justify-center relative">
                    {garment.imageUrl ? (
                      <img 
                        src={garment.imageUrl} 
                        alt={garment.subCategory || garment.name} 
                        className="object-contain w-full h-full mix-blend-multiply pointer-events-none" 
                      />
                    ) : (
                      <div className="text-stone-300 text-sm">No Image</div>
                    )}
                    
                    {/* Category / Composite Set Badge */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1">
                      <span className="px-2 py-1 bg-white/95 backdrop-blur text-[10px] font-bold uppercase tracking-wider text-stone-700 rounded-md shadow-xs border border-stone-200/60">
                        {garment.category.replace('_', ' ')}
                      </span>
                      {isComposite && (
                        <span className="px-2 py-0.5 bg-amber-500/90 text-white text-[9px] font-bold uppercase tracking-wider rounded-md shadow-xs flex items-center gap-1">
                          <Layers className="w-2.5 h-2.5" />
                          Set
                        </span>
                      )}
                    </div>

                    {/* Quick action buttons */}
                    <div className="absolute z-10 top-3 right-3 flex flex-col gap-1.5">
                      <button
                        onClick={(e) => handleToggleFavorite(garment.id, !!garment.isFavorite, e)}
                        className={`p-2 ${
                          garment.isFavorite 
                            ? 'bg-rose-50 text-rose-500' 
                            : 'bg-white/90 text-stone-400 hover:text-rose-500 hover:bg-white'
                        } backdrop-blur rounded-full shadow-sm transition pointer-events-auto cursor-pointer`}
                        title="Toggle favorite"
                      >
                        <Heart className="w-4 h-4" fill={garment.isFavorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        onClick={(e) => handleDelete(garment.id, e)}
                        className="p-2 bg-white/90 backdrop-blur text-stone-400 hover:text-rose-600 hover:bg-white rounded-full transition shadow-sm pointer-events-auto cursor-pointer"
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
              );
            })}
        </div>
      )}

      {/* 4. Floating Action Button (FAB) for Mobile & Rapid Access */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-6 right-6 sm:hidden w-14 h-14 bg-stone-900 text-white rounded-full shadow-lg hover:bg-stone-800 flex items-center justify-center transition cursor-pointer z-20"
        aria-label="Add Item"
      >
        <Plus className="w-6 h-6" />
      </button>

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
    </div>
  );
}
