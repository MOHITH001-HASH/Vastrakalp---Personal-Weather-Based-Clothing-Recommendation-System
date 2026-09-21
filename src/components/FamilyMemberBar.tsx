import React from 'react';
import { Plus, User, Users, Edit2, Shield, Sparkles } from 'lucide-react';
import { FamilyMember } from '../types';

interface FamilyMemberBarProps {
  members: FamilyMember[];
  selectedMemberId: string; // 'all' | 'self' | memberId
  onSelectMember: (id: string) => void;
  onAddMemberClick: () => void;
  onEditMemberClick: (member: FamilyMember) => void;
  garmentCounts: Record<string, number>; // 'all' -> total, 'self' -> self count, memberId -> count
  userName?: string;
}

export default function FamilyMemberBar({
  members,
  selectedMemberId,
  onSelectMember,
  onAddMemberClick,
  onEditMemberClick,
  garmentCounts,
  userName = 'You'
}: FamilyMemberBarProps) {
  const selectedMember = members.find((m) => m.id === selectedMemberId);

  return (
    <div className="space-y-4">
      {/* Scrollable Member Switcher Chips */}
      <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-none">
        {/* All Family Closet Tab */}
        <button
          id="tab-member-all"
          type="button"
          onClick={() => onSelectMember('all')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
            selectedMemberId === 'all'
              ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
              : 'bg-white text-stone-700 border-stone-200/80 hover:bg-stone-50 hover:border-stone-300'
          }`}
        >
          <div className={`w-6 h-6 rounded-xl flex items-center justify-center text-xs ${
            selectedMemberId === 'all' ? 'bg-stone-800 text-amber-300' : 'bg-stone-100 text-stone-600'
          }`}>
            <Users className="w-3.5 h-3.5" />
          </div>
          <span>All Family Wardrobe</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedMemberId === 'all' ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-600'
          }`}>
            {garmentCounts['all'] || 0}
          </span>
        </button>

        {/* Primary User ("You") Tab */}
        <button
          id="tab-member-self"
          type="button"
          onClick={() => onSelectMember('self')}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
            selectedMemberId === 'self'
              ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
              : 'bg-white text-stone-700 border-stone-200/80 hover:bg-stone-50 hover:border-stone-300'
          }`}
        >
          <div className="w-6 h-6 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xs font-bold shadow-sm">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span>{userName} (You)</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            selectedMemberId === 'self' ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-600'
          }`}>
            {garmentCounts['self'] || 0}
          </span>
        </button>

        {/* Dynamic Family Members */}
        {members.map((member) => {
          const isSelected = selectedMemberId === member.id;
          const count = garmentCounts[member.id] || 0;
          return (
            <button
              key={member.id}
              id={`tab-member-${member.id}`}
              type="button"
              onClick={() => onSelectMember(member.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-xs font-semibold whitespace-nowrap transition-all border shrink-0 ${
                isSelected
                  ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                  : 'bg-white text-stone-700 border-stone-200/80 hover:bg-stone-50 hover:border-stone-300'
              }`}
            >
              <div 
                className="w-6 h-6 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm"
                style={{ backgroundColor: member.avatarColor || '#ec4899' }}
              >
                {member.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex items-center gap-1.5">
                <span>{member.name}</span>
                <span className={`text-[10px] font-normal capitalize ${
                  isSelected ? 'text-stone-400' : 'text-stone-500'
                }`}>
                  ({member.relation || member.relationship})
                </span>
                {member.age !== undefined && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                    isSelected ? 'bg-stone-800 text-amber-300' : 'bg-amber-50 text-amber-800'
                  }`}>
                    {member.age}y
                  </span>
                )}
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                isSelected ? 'bg-stone-800 text-stone-200' : 'bg-stone-100 text-stone-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Add Member Quick Action */}
        <button
          id="btn-add-family-member-trigger"
          type="button"
          onClick={onAddMemberClick}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100/80 border border-amber-200/80 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Member</span>
        </button>
      </div>

      {/* Profile Banner when specific member is selected */}
      {selectedMember && (
        <div className="p-4 rounded-2xl bg-white border border-stone-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-center gap-3.5">
            <div 
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0"
              style={{ backgroundColor: selectedMember.avatarColor || '#ec4899' }}
            >
              {selectedMember.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-stone-900">{selectedMember.name}&apos;s Closet</h3>
                <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px] font-semibold uppercase tracking-wider">
                  {selectedMember.relation || selectedMember.relationship}
                </span>
                {selectedMember.age !== undefined && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-100/70 text-amber-900 text-[11px] font-bold">
                    {selectedMember.age} years old
                  </span>
                )}
                {selectedMember.gender && (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-medium capitalize">
                    {selectedMember.gender}
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 mt-0.5">
                {selectedMember.notes || `Individual wardrobe inventory used during family event styling and HueSync™ coordination.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              id="btn-edit-active-member"
              type="button"
              onClick={() => onEditMemberClick(selectedMember)}
              className="px-3 py-1.5 rounded-xl border border-stone-200 text-stone-700 hover:bg-stone-50 text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Edit Member</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
