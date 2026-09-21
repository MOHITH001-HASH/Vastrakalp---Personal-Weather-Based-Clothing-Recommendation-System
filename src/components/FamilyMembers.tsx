import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  User, 
  Heart, 
  Search, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  Check, 
  X, 
  Calendar, 
  Shirt,
  ShieldAlert,
  Baby,
  Smile
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../hooks/useAuth';
import { FamilyMember, RelationshipType, Garment } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';

const AVATAR_COLORS = [
  '#ec4899', // Pink / Rose
  '#3b82f6', // Blue
  '#10b981', // Emerald / Green
  '#8b5cf6', // Purple
  '#f59e0b', // Amber / Gold
  '#06b6d4', // Cyan
  '#ef4444', // Coral / Red
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#d946ef', // Fuchsia
];

const RELATIONSHIP_OPTIONS: { label: string; value: RelationshipType; category: string }[] = [
  { label: 'Partner / Spouse', value: 'partner', category: 'Adult' },
  { label: 'Son', value: 'son', category: 'Child / Youth' },
  { label: 'Daughter', value: 'daughter', category: 'Child / Youth' },
  { label: 'Child (General)', value: 'child', category: 'Child / Youth' },
  { label: 'Father', value: 'father', category: 'Adult' },
  { label: 'Mother', value: 'mother', category: 'Adult' },
  { label: 'Parent (General)', value: 'parent', category: 'Adult' },
  { label: 'Brother', value: 'brother', category: 'Adult / Youth' },
  { label: 'Sister', value: 'sister', category: 'Adult / Youth' },
  { label: 'Sibling (General)', value: 'sibling', category: 'Adult / Youth' },
  { label: 'Friend', value: 'friend', category: 'Other' },
  { label: 'Other Relative', value: 'other', category: 'Other' },
];

interface FamilyMembersProps {
  onSelectMemberForCloset?: (memberId: string) => void;
  className?: string;
}

export default function FamilyMembers({ onSelectMemberForCloset, className = '' }: FamilyMembersProps) {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [memberToEdit, setMemberToEdit] = useState<FamilyMember | null>(null);
  
  // Form Fields: Name, Relation, Age, etc.
  const [formData, setFormData] = useState<{
    name: string;
    relation: string;
    relationship: RelationshipType;
    age: string;
    gender: 'female' | 'male' | 'unisex' | 'boy' | 'girl' | 'unspecified';
    avatarColor: string;
    notes: string;
  }>({
    name: '',
    relation: 'Partner',
    relationship: 'partner',
    age: '',
    gender: 'female',
    avatarColor: AVATAR_COLORS[0],
    notes: '',
  });

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<FamilyMember | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 1. Fetch & Subscribe to Family Members in Firestore
  useEffect(() => {
    if (!user) {
      setMembers([]);
      setLoading(false);
      return;
    }

    const cacheKey = `vastrakalp_family_members_${user.uid}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setMembers(JSON.parse(cached));
        setLoading(false);
      }
    } catch {}

    const membersCollection = collection(db, 'familyMembers');
    const q = query(membersCollection, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedMembers: FamilyMember[] = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as Omit<FamilyMember, 'id'>),
          id: docSnap.id,
        }));
        
        // Sort: creation time ascending
        fetchedMembers.sort((a, b) => a.createdAt - b.createdAt);
        setMembers(fetchedMembers);
        setLoading(false);
        try {
          localStorage.setItem(cacheKey, JSON.stringify(fetchedMembers));
        } catch {}
      },
      (err) => {
        console.error('Failed to subscribe to family members in Firestore:', err);
        handleFirestoreError(err, OperationType.LIST, 'familyMembers');
        setLoading(false);
      }
    );

    // Also fetch garments to show count per family member
    const fetchGarments = async () => {
      try {
        const garmentsQ = query(collection(db, 'garments'), where('ownerId', '==', user.uid));
        const garmentsSnap = await getDocs(garmentsQ);
        const fetchedGarments = garmentsSnap.docs.map((d) => ({ ...d.data(), id: d.id } as Garment));
        setGarments(fetchedGarments);
      } catch (err) {
        console.warn('Could not load garments stats:', err);
      }
    };
    fetchGarments();

    return () => unsubscribe();
  }, [user]);

  // Handle open Add modal
  const handleOpenAddModal = () => {
    setMemberToEdit(null);
    setFormData({
      name: '',
      relation: 'Partner',
      relationship: 'partner',
      age: '',
      gender: 'female',
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      notes: '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Handle open Edit modal
  const handleOpenEditModal = (member: FamilyMember) => {
    setMemberToEdit(member);
    setFormData({
      name: member.name || '',
      relation: member.relation || member.relationship || 'Partner',
      relationship: member.relationship || 'partner',
      age: member.age !== undefined ? String(member.age) : '',
      gender: member.gender || 'female',
      avatarColor: member.avatarColor || AVATAR_COLORS[0],
      notes: member.notes || '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  // Save (Create / Update) Family Member in Firestore
  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setFormError('You must be signed in to save family members.');
      return;
    }

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }

    if (trimmedName.length > 100) {
      setFormError('Name cannot exceed 100 characters.');
      return;
    }

    let parsedAge: number | undefined = undefined;
    if (formData.age.trim() !== '') {
      const num = parseInt(formData.age.trim(), 10);
      if (isNaN(num) || num < 0 || num > 130) {
        setFormError('Please enter a valid age between 0 and 130 years.');
        return;
      }
      parsedAge = num;
    }

    setSaving(true);
    setFormError(null);

    const now = Date.now();
    const memberPayload: Record<string, any> = {
      userId: user.uid,
      familyId: profile?.familyId || `fam_${user.uid.slice(0, 8)}`,
      name: trimmedName,
      relationship: formData.relationship,
      relation: formData.relation.trim() || formData.relationship,
      avatarColor: formData.avatarColor,
      gender: formData.gender,
      notes: formData.notes.trim().slice(0, 500),
      createdAt: memberToEdit ? memberToEdit.createdAt : now,
      updatedAt: now,
    };

    if (parsedAge !== undefined) {
      memberPayload.age = parsedAge;
    }

    try {
      if (memberToEdit) {
        // Update existing in Firestore
        const docRef = doc(db, 'familyMembers', memberToEdit.id);
        await updateDoc(docRef, memberPayload);
        setSuccessToast(`Updated profile for ${trimmedName}`);
      } else {
        // Add new document to Firestore
        await addDoc(collection(db, 'familyMembers'), memberPayload);
        setSuccessToast(`Added ${trimmedName} to your family wardrobe`);
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      console.error('Error saving family member to Firestore:', err);
      try {
        handleFirestoreError(err, memberToEdit ? OperationType.UPDATE : OperationType.CREATE, 'familyMembers');
      } catch (handledErr: any) {
        setFormError(handledErr?.message || 'Failed to save family member to Firestore.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Remove / Delete Family Member from Firestore
  const handleDeleteMember = async (member: FamilyMember) => {
    if (!user) return;
    setDeletingId(member.id);

    try {
      const docRef = doc(db, 'familyMembers', member.id);
      await deleteDoc(docRef);
      setSuccessToast(`Removed ${member.name} from family members`);
      setConfirmDeleteMember(null);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      console.error('Error deleting family member from Firestore:', err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `familyMembers/${member.id}`);
      } catch (handledErr: any) {
        alert(handledErr?.message || 'Failed to delete family member.');
      }
    } finally {
      setDeletingId(null);
    }
  };

  // Filtered members list
  const filteredMembers = members.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.relation && m.relation.toLowerCase().includes(q)) ||
      m.relationship.toLowerCase().includes(q) ||
      (m.notes && m.notes.toLowerCase().includes(q))
    );
  });

  // Calculate garment count for a member
  const getGarmentCount = (memberId: string) => {
    return garments.filter((g) => g.memberId === memberId).length;
  };

  return (
    <div className={`space-y-6 ${className}`} id="family-members-component">
      {/* Toast Notification */}
      {successToast && (
        <div 
          id="toast-family-success"
          className="fixed bottom-6 right-6 z-50 bg-stone-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-stone-800 flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-200"
        >
          <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Check className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Family Members</h2>
              <p className="text-xs text-stone-500">
                Manage profiles with name, relation, and age for coordinated multi-person styling
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-search-family-members"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search family..."
              className="w-full pl-8 pr-3 py-2 rounded-xl border border-stone-200 bg-white text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Add Member Button */}
          <button
            id="btn-add-family-member-main"
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Member</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-stone-400">
          <Loader2 className="w-7 h-7 animate-spin text-stone-600 mb-2" />
          <p className="text-xs">Loading family members...</p>
        </div>
      ) : members.length === 0 ? (
        /* Empty State */
        <div 
          id="family-members-empty-state"
          className="p-10 border border-dashed border-stone-200 rounded-3xl text-center bg-stone-50/50 flex flex-col items-center justify-center"
        >
          <div className="w-14 h-14 rounded-3xl bg-amber-100 text-amber-700 flex items-center justify-center mb-4 shadow-sm">
            <Users className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-stone-900 mb-1">No Family Members Added Yet</h3>
          <p className="text-xs text-stone-500 max-w-md mb-6 leading-relaxed">
            Add your spouse, kids, parents, or siblings with their name, relation, and age to unlock individualized wardrobe catalogs and automated HueSync™ outfit coordination for family events.
          </p>
          <button
            id="btn-empty-add-family-member"
            type="button"
            onClick={handleOpenAddModal}
            className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-2xl text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add First Family Member</span>
          </button>
        </div>
      ) : (
        /* Grid of Family Member Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="family-members-grid">
          {filteredMembers.map((member) => {
            const garmentCount = getGarmentCount(member.id);
            return (
              <div
                key={member.id}
                id={`family-member-card-${member.id}`}
                className="p-5 bg-white border border-stone-200/90 rounded-3xl shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative overflow-hidden"
              >
                {/* Top Accent bar */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: member.avatarColor || '#ec4899' }}
                />

                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0"
                        style={{ backgroundColor: member.avatarColor || '#ec4899' }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-base font-bold text-stone-900 leading-tight">
                          {member.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10px] font-semibold uppercase tracking-wider">
                            {member.relation || member.relationship}
                          </span>
                          {member.age !== undefined && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-bold">
                              {member.age} yrs
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons (Edit / Delete) */}
                    <div className="flex items-center gap-1">
                      <button
                        id={`btn-edit-member-${member.id}`}
                        type="button"
                        onClick={() => handleOpenEditModal(member)}
                        className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-xl transition-colors"
                        title="Edit member"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        id={`btn-delete-member-${member.id}`}
                        type="button"
                        onClick={() => setConfirmDeleteMember(member)}
                        className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Notes / Details */}
                  {member.notes && (
                    <p className="text-xs text-stone-500 bg-stone-50 p-2.5 rounded-xl border border-stone-100 mb-3 italic line-clamp-2">
                      &ldquo;{member.notes}&rdquo;
                    </p>
                  )}
                </div>

                {/* Footer stats & Closet action */}
                <div className="pt-3 border-t border-stone-100 flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5 text-xs text-stone-600">
                    <Shirt className="w-3.5 h-3.5 text-stone-400" />
                    <span className="font-semibold text-stone-900">{garmentCount}</span>
                    <span className="text-stone-500">items in closet</span>
                  </div>

                  {onSelectMemberForCloset && (
                    <button
                      type="button"
                      onClick={() => onSelectMemberForCloset(member.id)}
                      className="text-xs font-semibold text-stone-900 hover:text-amber-600 hover:underline transition-colors"
                    >
                      View Wardrobe &rarr;
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            id="family-member-editor-modal"
            className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm"
                  style={{ backgroundColor: formData.avatarColor }}
                >
                  {formData.name.trim() ? formData.name.trim().charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-stone-900">
                    {memberToEdit ? `Edit ${memberToEdit.name}` : 'Add Family Member'}
                  </h3>
                  <p className="text-xs text-stone-500">
                    Specify name, relation, and age for this wardrobe profile
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveMember} className="p-6 space-y-4 overflow-y-auto flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Name Field */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Member Name *
                </label>
                <input
                  id="field-member-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Sarah, Aarav, Emily, Dad"
                  className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-sm"
                />
              </div>

              {/* 2. Relation & Relationship Field */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Relation Type *
                  </label>
                  <select
                    id="field-member-relationship"
                    value={formData.relationship}
                    onChange={(e) => {
                      const rel = e.target.value as RelationshipType;
                      const matchOpt = RELATIONSHIP_OPTIONS.find((o) => o.value === rel);
                      setFormData({ 
                        ...formData, 
                        relationship: rel,
                        relation: matchOpt?.label.split(' ')[0] || rel
                      });
                    }}
                    className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs"
                  >
                    {RELATIONSHIP_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Custom Relation Label
                  </label>
                  <input
                    id="field-member-relation-label"
                    type="text"
                    value={formData.relation}
                    onChange={(e) => setFormData({ ...formData, relation: e.target.value })}
                    placeholder="e.g. Eldest Son, Sister, Mom"
                    className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs"
                  />
                </div>
              </div>

              {/* 3. Age Field & Style Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Age (Years)
                  </label>
                  <div className="relative">
                    <input
                      id="field-member-age"
                      type="number"
                      min="0"
                      max="130"
                      value={formData.age}
                      onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                      placeholder="e.g. 28"
                      className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-stone-400">
                      years old
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                    Wardrobe Category
                  </label>
                  <select
                    id="field-member-gender"
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as any })}
                    className="w-full px-4 py-2.5 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs"
                  >
                    <option value="female">Womenswear</option>
                    <option value="male">Menswear</option>
                    <option value="child">Kids / Youth</option>
                    <option value="unisex">Unisex / Neutral</option>
                  </select>
                </div>
              </div>

              {/* 4. Avatar Color Swatches */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Avatar Badge Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {AVATAR_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({ ...formData, avatarColor: c })}
                      className={`w-7 h-7 rounded-full transition-transform flex items-center justify-center ${
                        formData.avatarColor === c ? 'ring-2 ring-offset-2 ring-stone-900 scale-110' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {formData.avatarColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Styling Notes */}
              <div>
                <label className="block text-xs font-semibold text-stone-700 uppercase tracking-wider mb-1.5">
                  Styling Notes & Fit Preferences
                </label>
                <textarea
                  id="field-member-notes"
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Prefers slim fits, favorite colors navy and blush pink, avoid wool"
                  className="w-full px-4 py-2 rounded-2xl border border-stone-200 bg-stone-50/50 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white text-xs resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-2xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-family-member"
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{memberToEdit ? 'Save Changes' : 'Add to Family'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE DIALOG */}
      {confirmDeleteMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div 
            id="dialog-confirm-delete-member"
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-stone-200 p-6 flex flex-col items-center text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-stone-900 mb-1">Remove Family Member?</h3>
            <p className="text-xs text-stone-500 mb-5 leading-relaxed">
              Are you sure you want to remove <span className="font-semibold text-stone-800">{confirmDeleteMember.name}</span> ({confirmDeleteMember.relation || confirmDeleteMember.relationship}) from your family closet?
            </p>
            <div className="flex items-center gap-2.5 w-full">
              <button
                type="button"
                onClick={() => setConfirmDeleteMember(null)}
                className="flex-1 py-2.5 rounded-2xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                id="btn-confirm-delete-member"
                type="button"
                disabled={deletingId === confirmDeleteMember.id}
                onClick={() => handleDeleteMember(confirmDeleteMember)}
                className="flex-1 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {deletingId === confirmDeleteMember.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
