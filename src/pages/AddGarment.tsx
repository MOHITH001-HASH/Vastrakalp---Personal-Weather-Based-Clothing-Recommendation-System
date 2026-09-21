import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, Loader2, Check, Clock, RefreshCw, AlertCircle, Edit3, XCircle, Users, User } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { FamilyMember } from '../types';

export default function AddGarment() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attributesArray, setAttributesArray] = useState<any[] | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownReason, setCountdownReason] = useState<string>('');
  
  // Family members state
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [targetMemberId, setTargetMemberId] = useState<string>('self');

  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  // Load family members
  useEffect(() => {
    async function loadMembers() {
      if (!user) return;
      try {
        const q = query(collection(db, 'familyMembers'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const members = snap.docs.map(d => ({ ...d.data(), id: d.id } as FamilyMember));
        setFamilyMembers(members);
      } catch (err) {
        console.warn('Could not load family members in AddGarment:', err);
      }
    }
    loadMembers();
  }, [user]);

  // Auto-retry timer for TPM cooldown / Warmup
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      setCountdownReason('');
      handleAnalyze();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
      setAttributesArray(null);
      setCountdown(null);
      setCountdownReason('');
      setError(null);
    }
  };

  const resizeImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 512;
        const MAX_HEIGHT = 512;
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
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          } else {
            resolve(file);
          }
        }, 'image/jpeg', 0.6);
      };
      img.onerror = () => resolve(file);
    });
  };

  const handleAnalyze = async () => {
    if (!image) return;
    setAnalyzing(true);
    setError(null);
    setCountdown(null);
    setCountdownReason('');
    try {
      const formData = new FormData();
      const resized = await resizeImage(image);
      formData.append('image', resized);

      const data = await api.analyzeGarment(formData);

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

  const handleManualEntryFallback = () => {
    setCountdown(null);
    setCountdownReason('');
    setError(null);
    setIsEditing(true);
    setAttributesArray([
      {
        name: 'New Garment',
        category: 'top',
        subCategory: 'Shirt',
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

  const handleSave = async () => {
    if (!attributesArray || !user || !profile || !image) return;
    setSaving(true);
    try {
      const storageFile = await resizeImage(image);
      const base64Url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(storageFile);
      });

      const isSelf = targetMemberId === 'self';
      const assignedMember = familyMembers.find(m => m.id === targetMemberId);
      const memberName = isSelf ? (profile?.firstName || 'You') : (assignedMember?.name || 'Family Member');
      const memberRelation = isSelf ? 'self' : (assignedMember?.relationship || 'other');

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
        
        await addDoc(collection(db, 'garments'), payload);
      }
      navigate('/closet');
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Save failed.');
    } finally {
      setSaving(false);
    }
  };
  
  const updateAttribute = (index: number, field: string, value: any) => {
    if (!attributesArray) return;
    const newArr = [...attributesArray];
    newArr[index] = { ...newArr[index], [field]: value };
    setAttributesArray(newArr);
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6">
      <header className="mb-2">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Add to Wardrobe</h1>
        <p className="text-stone-500 text-sm mt-1">Upload a photo to automatically extract garment details and assign to a family member.</p>
      </header>

      {/* Assign Garment to Family Member Card */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-700 uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-4 h-4 text-stone-500" />
            <span>Wardrobe Belongs To</span>
          </label>
          <span className="text-xs text-stone-500">Select family member</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={() => setTargetMemberId('self')}
            className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all flex items-center gap-2.5 ${
              targetMemberId === 'self'
                ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                : 'border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100'
            }`}
          >
            <div className="w-6 h-6 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xs font-bold">
              {(profile?.firstName || 'Y').charAt(0).toUpperCase()}
            </div>
            <div className="truncate">
              <div>{profile?.firstName || 'You'}</div>
              <div className={`text-[10px] font-normal ${targetMemberId === 'self' ? 'text-stone-300' : 'text-stone-400'}`}>Self</div>
            </div>
          </button>

          {familyMembers.map((member) => {
            const isSelected = targetMemberId === member.id;
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => setTargetMemberId(member.id)}
                className={`p-3 rounded-2xl border text-left text-xs font-semibold transition-all flex items-center gap-2.5 ${
                  isSelected
                    ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                    : 'border-stone-200 bg-stone-50/60 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <div 
                  className="w-6 h-6 rounded-xl text-white flex items-center justify-center text-xs font-bold shadow-xs"
                  style={{ backgroundColor: member.avatarColor || '#ec4899' }}
                >
                  {member.name.charAt(0).toUpperCase()}
                </div>
                <div className="truncate">
                  <div>{member.name}</div>
                  <div className={`text-[10px] font-normal capitalize ${isSelected ? 'text-stone-300' : 'text-stone-400'}`}>
                    {member.relationship}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs flex flex-col items-center justify-center min-h-[400px]">
          {preview ? (
            <div className="relative w-full h-full flex flex-col items-center">
              <img src={preview} alt="Garment preview" className="max-h-80 object-contain rounded-2xl mb-6 shadow-sm border border-stone-100" />
              <div className="flex gap-3">
                <button 
                  onClick={() => { setImage(null); setPreview(null); setAttributesArray(null); setError(null); }}
                  className="px-4 py-2 text-xs font-semibold text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-xl transition"
                >
                  Clear Photo
                </button>
                {!attributesArray && (
                  <button 
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="flex items-center px-6 py-2 text-xs font-semibold text-white bg-stone-900 hover:bg-stone-800 rounded-xl transition disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Analyze Garment
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center p-6">
              <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-stone-300 text-stone-400">
                <Camera className="w-7 h-7" />
              </div>
              <h3 className="font-semibold text-stone-900 mb-1">Upload Photo</h3>
              <p className="text-xs text-stone-500 mb-6">JPEG or PNG, clear image of clothing</p>
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-semibold transition shadow-sm cursor-pointer"
              >
                Choose Photo
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-200/80 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-100">
            <h2 className="text-base font-bold text-stone-900">Garment Tagging</h2>
            {attributesArray && (
              <button 
                onClick={() => setIsEditing(!isEditing)}
                className="text-xs font-semibold text-stone-600 hover:text-stone-900 underline"
              >
                {isEditing ? 'Done Editing' : 'Edit Attributes'}
              </button>
            )}
          </div>

          {countdown !== null && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-xs">
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
                  onClick={() => { setCountdown(null); handleAnalyze(); }}
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

          {error && countdown === null && (
            <div className="mb-4 p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-rose-900 font-semibold text-xs">
                <AlertCircle className="w-4 h-4 text-rose-700" />
                <span>Extraction Notice</span>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">{error}</p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleAnalyze}
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

          {attributesArray && attributesArray.length > 0 ? (
            <div className="space-y-4 flex-1 overflow-y-auto">
              {attributesArray.map((attributes, index) => (
                <div key={index} className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Title</label>
                    {isEditing ? (
                      <input 
                        type="text" 
                        value={attributes.name || ''} 
                        onChange={(e) => updateAttribute(index, 'name', e.target.value)}
                        className="w-full px-3 py-1.5 border border-stone-200 rounded-xl text-xs bg-white"
                      />
                    ) : (
                      <p className="font-semibold text-stone-900 text-sm">{attributes.name}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Category</label>
                      <p className="text-xs font-medium text-stone-800 capitalize">{attributes.category}</p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Color</label>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 rounded-full border border-stone-300" style={{ backgroundColor: attributes.primaryColorHex }} />
                        <span className="text-xs font-medium text-stone-800 capitalize">{attributes.primaryColorName}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Formality</label>
                      <p className="text-xs font-medium text-stone-800">{attributes.formalityScore}/5</p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">Warmth</label>
                      <p className="text-xs font-medium text-stone-800">{attributes.thermalWeight}/5</p>
                    </div>
                  </div>
                </div>
              ))}

              <div className="pt-4 mt-auto">
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-semibold transition disabled:opacity-50 shadow-sm"
                >
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                  Save to Wardrobe
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center text-stone-400 p-8">
              {analyzing ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin mb-2 text-stone-600" />
                  <p className="text-xs font-medium text-stone-700">Analyzing fabrics & silhouettes with Gemini AI...</p>
                </>
              ) : (
                <p className="text-xs">Upload an image and click analyze to extract attributes.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
