import React from 'react';
import { useNavigate } from 'react-router-dom';
import FamilyMembers from '../components/FamilyMembers';

export default function Family() {
  const navigate = useNavigate();

  const handleSelectMemberForCloset = (memberId: string) => {
    navigate(`/closet?member=${memberId}`);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8 space-y-6">
      <FamilyMembers onSelectMemberForCloset={handleSelectMemberForCloset} />
    </div>
  );
}
