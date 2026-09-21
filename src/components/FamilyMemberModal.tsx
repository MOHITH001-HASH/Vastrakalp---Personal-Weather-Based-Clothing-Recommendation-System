import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Check, User, Heart, Sparkles, Loader2 } from 'lucide-react';
import { FamilyMember, RelationshipType } from '../types';
import { addDoc, collection, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';

interface FamilyMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberToEdit?: FamilyMember | null;
  onSaved: (member: FamilyMember, isNew: boolean) => void;
  onDeleted?: (memberId: string) => void;
}

const AVATAR_COLORS = [
  '#ec4899', // Pink / Rose
  '#3b82f6', // Blue
  '#10b981', // Emerald / Green
  '#8b5cf6', // Purple
  '#f59e0b', // Amber / Gold
  '#06b6d4', // Cyan
  '#ef4444', // Coral / Red
  '#6366f1', // Indigo
];

const RELATIONSHIP_OPTIONS: { label: string; value: RelationshipType; icon: string }[] = [
  { label: 'Partner / Spouse', value: 'partner', icon: '💍' },
  { label: 'Child (Son / Daughter)', value: 'child', icon: '🧸' },
  { label: 'Parent (Father / Mother)', value: 'parent', icon: '👑' },
  { label: 'Sibling (Brother / Sister)', value: 'sibling', icon: '🤝' },
  { label: 'Friend', value: 'friend', icon: '✨' },
  { label: 'Other', value: 'other', icon: '👤' },
];

export default function FamilyMemberModal({
  isOpen,
  onClose,
  memberToEdit,
  onSaved,
  onDeleted
}: FamilyMemberModalProps) {
  const { user, profile } = useAuth();
  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<RelationshipType>('partner');
  const [relation, setRelation] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'unisex' | 'boy' | 'girl' | 'unspecified'>('female');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (memberToEdit) {
      setName(memberToEdit.name || '');
      setRelationship(memberToEdit.relationship || 'partner');
      setRelation(memberToEdit.relation || memberToEdit.relationship || 'partner');
      setAge(memberToEdit.age !== undefined ? String(memberToEdit.age) : '');
      setGender(memberToEdit.gender || 'female');
      setAvatarColor(memberToEdit.avatarColor || AVATAR_COLORS[0]);
      setNotes(memberToEdit.notes || '');
    } else {
      setName('');
      setRelationship('partner');
      setRelation('partner');
      setAge('');
      setGender('female');
      setAvatarColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
      setNotes('');
    }
    setError(null);
  }, [memberToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter a name for the family member.');
      return;
    }
    if (!user) {
      setError('You must be signed in to save family members.');
      return;
    }

    let parsedAge: number | undefined = undefined;
    if (age.trim() !== '') {
      const num = parseInt(age.trim(), 10);
      if (isNaN(num) || num < 0 || num > 130) {
        setError('Please enter a valid age between 0 and 130 years.');
        return;
      }
      parsedAge = num;
    }

    setSaving(true);
    setError(null);

    try {
      const now = Date.now();
      const payload: Record<string, any> = {
        userId: user.uid,
        familyId: profile?.familyId || `fam_${user.uid.slice(0, 8)}`,
        name: name.trim(),
        relationship,
        relation: relation.trim() || relationship,
        gender,
        avatarColor,
        notes: notes.trim().slice(0, 500),
        createdAt: memberToEdit?.createdAt || now,
        updatedAt: now,
      };

      if (parsedAge !== undefined) {
        payload.age = parsedAge;
      }

      if (memberToEdit && memberToEdit.id) {
        await updateDoc(doc(db, 'familyMembers', memberToEdit.id), payload);
        const updated: FamilyMember = { ...payload, id: memberToEdit.id } as FamilyMember;
        onSaved(updated, false);
      } else {
        const docRef = await addDoc(collection(db, 'familyMembers'), payload);
        const created: FamilyMember = { ...payload, id: docRef.id } as FamilyMember;
        onSaved(created, true);
      }
      onClose();
    } catch (err: any) {
      console.error('Failed to save family member:', err);
      setError(err?.message || 'Failed to save family member. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!memberToEdit || !memberToEdit.id || !onDeleted) return;
    if (!confirm(`Are you sure you want to remove ${memberToEdit.name} from your family closet?`)) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'familyMembers', memberToEdit.id));
      onDeleted(memberToEdit.id);
      onClose();
    } catch (err: any) {
      console.error('Failed to delete family member:', err);
      setError(err?.message || 'Failed to delete member.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        id="family-member-modal-content"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
              style={{ backgroundColor: avatarColor }}
            >
              {name ? name.trim().charAt(0).toUpperCase() : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">
                {memberToEdit ? `Edit ${memberToEdit.name}` : 'Add Family Member'}
              </h2>
              <p className="text-xs text-stone-500">
                Create an individual wardrobe profile for family coordination
              </p>
            </div>
          </div>
          <button
            id="btn-close-family-modal"
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium">
              {error}
            </div>
          )}

          {/* Name Field */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              Full Name or Nickname *
            </label>
            <input
              id="input-member-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah, Aarav, Priya, Dad"
              className="w-full px-4 py-3 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-sm"
            />
          </div>

          {/* Relationship Selection */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
              Relationship to You *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RELATIONSHIP_OPTIONS.map((opt) => {
                const isSelected = relationship === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setRelationship(opt.value);
                      setRelation(opt.label.split(' ')[0]);
                    }}
                    className={`px-3 py-2.5 rounded-2xl border text-left text-xs font-medium transition-all flex items-center gap-2 ${
                      isSelected
                        ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                        : 'border-stone-200 bg-stone-50/50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    <span className="text-sm">{opt.icon}</span>
                    <span className="truncate">{opt.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Age & Wardrobe Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Age (Years)
              </label>
              <div className="relative">
                <input
                  id="input-member-age"
                  type="number"
                  min="0"
                  max="130"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  placeholder="e.g. 28"
                  className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-stone-400">
                  yrs
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                Custom Relation Label
              </label>
              <input
                id="input-member-relation"
                type="text"
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                placeholder="e.g. Eldest Son, Sister, Mom"
                className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs"
              />
            </div>
          </div>

          {/* Gender / Style Category */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
              Style & Wardrobe Category
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { label: 'Womenswear', value: 'female' },
                { label: 'Menswear', value: 'male' },
                { label: 'Kids / Youth', value: 'child' },
              ].map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setGender(cat.value as any)}
                  className={`py-2 rounded-xl border text-center font-medium transition-all ${
                    gender === cat.value || (cat.value === 'child' && (gender === 'boy' || gender === 'girl'))
                      ? 'border-amber-600 bg-amber-50 text-amber-900 font-semibold'
                      : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Avatar Color Swatch Picker */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-2">
              Profile Avatar Badge Color
            </label>
            <div className="flex items-center gap-2.5 flex-wrap">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarColor(c)}
                  className={`w-8 h-8 rounded-full transition-transform flex items-center justify-center ${
                    avatarColor === c ? 'ring-2 ring-offset-2 ring-stone-900 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                >
                  {avatarColor === c && <Check className="w-4 h-4 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Notes / Preferences */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
              Styling Notes & Preferences (Optional)
            </label>
            <textarea
              id="input-member-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Loves pastel greens, dislikes synthetics in summer, prefers sneakers"
              className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-stone-100">
            {memberToEdit ? (
              <button
                id="btn-delete-family-member"
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="px-4 py-2.5 rounded-2xl text-rose-600 hover:bg-rose-50 text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Remove
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                id="btn-cancel-family-member"
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-2xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                id="btn-save-family-member"
                type="submit"
                disabled={saving || deleting}
                className="px-6 py-2.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {memberToEdit ? 'Save Changes' : 'Add to Family'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
