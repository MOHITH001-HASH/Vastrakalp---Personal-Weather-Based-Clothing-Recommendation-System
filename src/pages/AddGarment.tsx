import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, Loader2, Check, Clock, RefreshCw, AlertCircle, Edit3, XCircle } from 'lucide-react';
import { api, ApiError } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export default function AddGarment() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attributesArray, setAttributesArray] = useState<any[] | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownReason, setCountdownReason] = useState<string>('');
  
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, profile } = useAuth();

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
    console.log("Starting analysis with image...", image);
    try {
      const formData = new FormData();
      const compressedImage = await resizeImage(image);
      formData.append('image', compressedImage);
      
      const result = await api.analyzeGarment(formData);
      setAttributesArray(Array.isArray(result) ? result : [result]);
      setIsEditing(false);
    } catch (err: any) {
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
        err?.status === 503 ||
        err?.status === 504 ||
        /warming up|restarting|interrupted|server did not respond|network error|failed to fetch/i.test(err?.message || '');

      if (isRateLimit) {
        console.warn('Gemini rate limit quota reached:', err?.message || err);
        const retrySec = err?.retryAfterSeconds || 60;
        setCountdown(retrySec);
        setCountdownReason('Tokens Per Minute (TPM) limit reached on Gemini. Quota refreshes automatically.');
        setError(`Rate limit reached (Tokens Per Minute). Automatic retry scheduled in ${retrySec} seconds.`);
      } else if (isWarmup) {
        console.warn('Backend server momentarily warming up or reconnecting:', err?.message || err);
        const retrySec = err?.retryAfterSeconds || 2;
        setCountdown(retrySec);
        setCountdownReason('The backend server connection momentarily refreshed. Retrying automatically.');
        setError(null);
      } else {
        console.error('Failed to analyze:', err);
        setError(err.message || 'Analysis failed. You can retry or enter details manually.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleManualEntry = () => {
    setCountdown(null);
    setCountdownReason('');
    setError(null);
    setIsEditing(true);
    setAttributesArray([
      {
        name: 'New Wardrobe Item',
        category: 'top',
        subCategory: 'T-Shirt',
        primaryColorName: 'Black',
        primaryColorHex: '#1f2937',
        pattern: 'Solid',
        material: 'Cotton',
        fit: 'Regular',
        formalityScore: 2,
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
    <div className="p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Add to Wardrobe</h1>
        <p className="text-stone-500 mt-1">Upload a photo to automatically extract garment details.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
          {preview ? (
            <div className="relative w-full h-full flex flex-col items-center">
              <img src={preview} alt="Garment preview" className="max-h-80 object-contain rounded-xl mb-6" />
              <div className="flex gap-4">
                <button 
                  onClick={() => { setImage(null); setPreview(null); setAttributesArray(null);  setError(null); }}
                  className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition"
                >
                  Clear
                </button>
                {!attributesArray && (
                  <button 
                    onClick={handleAnalyze}
                    disabled={analyzing}
                    className="flex items-center px-6 py-2 text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 rounded-lg transition disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    Analyze Garment
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-stone-300">
                <Camera className="w-6 h-6 text-stone-400" />
              </div>
              <h3 className="font-medium text-stone-900 mb-1">Upload Photo</h3>
              <p className="text-sm text-stone-500 mb-6">JPEG or PNG, up to 10MB</p>
              <input 
                type="file" 
                accept="image/*" 
                className="hidden" 
                ref={fileInputRef} 
                onChange={handleFileChange}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2 bg-stone-900 text-white font-medium rounded-xl hover:bg-stone-800 transition"
              >
                Select File
              </button>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-3xl border border-stone-100 shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 pb-4 mb-4">
            <h3 className="font-semibold text-lg">
              AI Extracted Details
            </h3>
            {attributesArray && attributesArray.length > 0 && (
              <button 
                onClick={() => setIsEditing(!isEditing)}
                className="text-sm font-medium text-stone-600 hover:text-stone-900 transition"
              >
                {isEditing ? 'Done' : 'Edit'}
              </button>
            )}
          </div>
          
          {!attributesArray && !analyzing && !error && countdown === null && (
            <div className="h-48 flex items-center justify-center text-stone-400 text-sm">
              Upload and analyze an image to see details here.
            </div>
          )}
          
          {/* Active Countdown Banner for TPM / Warmup */}
          {countdown !== null && (
            <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl space-y-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 mt-0.5 text-amber-700">
                  <Clock className="w-5 h-5 animate-spin" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-amber-900 text-sm">
                      {countdownReason.includes('connection') || countdownReason.includes('reconnect') || countdownReason.includes('server')
                        ? 'Server Reconnecting'
                        : 'Rate Limit Cooldown Active'}
                    </p>
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-200 text-amber-900">
                      {countdown}s remaining
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    {countdownReason || 'Tokens Per Minute (TPM) quota reached. The application will automatically retry once quota refreshes.'}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-amber-200 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-600 h-full transition-all duration-1000"
                  style={{ width: `${Math.max(0, Math.min(100, (countdown / 60) * 100))}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => { setCountdown(null); handleAnalyze(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Now
                </button>
                <button
                  onClick={() => { setCountdown(null); setCountdownReason(''); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-lg text-xs font-medium transition"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Cancel Timer
                </button>
                <button
                  onClick={handleManualEntry}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white hover:bg-stone-800 rounded-lg text-xs font-semibold ml-auto transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Enter Details Manually
                </button>
              </div>
            </div>
          )}

          {/* Error Banner when not in countdown */}
          {error && countdown === null && (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl space-y-3 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center shrink-0 text-rose-700">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-rose-900 text-sm">Analysis Unavailable</p>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">{error}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={handleAnalyze}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Retry Analysis
                </button>
                <button
                  onClick={handleManualEntry}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white hover:bg-stone-800 rounded-lg text-xs font-semibold ml-auto transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Enter Details Manually
                </button>
              </div>
            </div>
          )}
          
          {analyzing && (
            <div className="h-48 flex flex-col items-center justify-center text-stone-500 space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-stone-400" />
              <p className="text-sm animate-pulse">Running Gemini Multimodal Analysis (with model fallback)...</p>
            </div>
          )}

          {attributesArray && attributesArray.length > 0 && (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
              <div className="text-sm font-medium text-stone-500 mb-2 border-b border-stone-100 pb-2 flex items-center justify-between">
                <span>Found {attributesArray.length} items in this outfit</span>
                {!isEditing && (
                  <span className="text-xs text-stone-400">Click &quot;Edit Details&quot; to customize</span>
                )}
              </div>
              {attributesArray.map((attributes, index) => (
                <div key={index} className="p-4 bg-stone-50 rounded-2xl border border-stone-100 space-y-4">
                  
                  <div className="col-span-2 mb-2">
                    <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Title</label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={attributes.name || ''}
                        onChange={(e) => updateAttribute(index, 'name', e.target.value)}
                        className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white font-semibold"
                        placeholder="Garment Name"
                      />
                    ) : (
                      <div className="font-semibold text-lg text-stone-900">{attributes.name}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Category</label>
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
                        <div className="font-medium text-stone-900 capitalize">{attributes.category}</div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Sub-Category</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={attributes.subCategory || ''}
                          onChange={(e) => updateAttribute(index, 'subCategory', e.target.value)}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white"
                        />
                      ) : (
                        <div className="font-medium text-stone-900 capitalize">{attributes.subCategory}</div>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Color</label>
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={attributes.primaryColorHex || '#000000'}
                            onChange={(e) => updateAttribute(index, 'primaryColorHex', e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border-0 p-0 shrink-0"
                          />
                          <input
                            type="text"
                            value={attributes.primaryColorName || ''}
                            onChange={(e) => updateAttribute(index, 'primaryColorName', e.target.value)}
                            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white"
                            placeholder="Color Name"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center">
                          <div 
                            className="w-4 h-4 rounded-full border border-stone-200 mr-2 shrink-0" 
                            style={{ backgroundColor: attributes.primaryColorHex }}
                          />
                          <span className="font-medium text-sm text-stone-900">{attributes.primaryColorName}</span>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Material</label>
                      {isEditing ? (
                        <input
                          type="text"
                          value={attributes.material || ''}
                          onChange={(e) => updateAttribute(index, 'material', e.target.value)}
                          className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm bg-white"
                        />
                      ) : (
                        <div className="font-medium text-stone-900 capitalize">{attributes.material || 'Unknown'}</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Formality (1-5)</label>
                      {isEditing ? (
                        <input
                          type="range"
                          min="1" max="5"
                          value={attributes.formalityScore || 3}
                          onChange={(e) => updateAttribute(index, 'formalityScore', parseInt(e.target.value))}
                          className="w-full accent-stone-900"
                        />
                      ) : (
                        <div className="flex gap-1 mt-1">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-2 h-2 rounded-full ${i <= attributes.formalityScore ? 'bg-stone-900' : 'bg-stone-200'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1">Warmth (1-5)</label>
                      {isEditing ? (
                        <input
                          type="range"
                          min="1" max="5"
                          value={attributes.thermalWeight || 3}
                          onChange={(e) => updateAttribute(index, 'thermalWeight', parseInt(e.target.value))}
                          className="w-full accent-orange-500"
                        />
                      ) : (
                        <div className="flex gap-1 mt-1">
                          {[1,2,3,4,5].map(i => (
                            <div key={i} className={`w-2 h-2 rounded-full ${i <= attributes.thermalWeight ? 'bg-orange-500' : 'bg-stone-200'}`} />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="pt-6 border-t border-stone-100 mt-6 sticky bottom-0 bg-white pb-2">
                <button
                  onClick={handleSave}
                  disabled={saving || isEditing}
                  className="w-full flex items-center justify-center py-3 px-4 bg-stone-900 hover:bg-stone-800 text-white font-medium rounded-xl transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Check className="w-5 h-5 mr-2" />}
                  {isEditing ? 'Save Edits First' : `Confirm & Add ${attributesArray.length} items to Closet`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
