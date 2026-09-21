import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, Grid, Sparkles, LogOut, Pencil, Check, X, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { logout, profile, updateProfileName } = useAuth();
  const location = useLocation();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.firstName) {
      setNameInput(profile.firstName);
    }
  }, [profile?.firstName]);

  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingName]);

  const handleSaveName = async () => {
    if (nameInput.trim()) {
      await updateProfileName(nameInput.trim());
    }
    setIsEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveName();
    } else if (e.key === 'Escape') {
      setNameInput(profile?.firstName || '');
      setIsEditingName(false);
    }
  };

  const nav = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Wardrobe & Family Closets', href: '/closet', icon: Grid },
    { name: 'Family Members', href: '/family', icon: Users },
    { name: 'Outfit Planner', href: '/planner', icon: Sparkles },
  ];

  return (
    <div className="flex h-screen bg-[#f8f6f2] text-stone-900 font-sans">
      <nav className="w-64 bg-[#fbf9f6] border-r border-[#ebe4da] flex flex-col shadow-xs">
        <div className="h-16 flex items-center px-6 border-b border-[#eee7dd] bg-gradient-to-r from-[#f7f2ea] to-[#fbf9f6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-700 via-amber-800 to-amber-950 flex items-center justify-center text-amber-100 shadow-xs ring-1 ring-amber-900/30">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-stone-900 font-serif">
              Vastrakalp
            </h1>
          </div>
        </div>
        
        <div className="flex-1 py-6 px-3 space-y-1.5">
          {nav.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive 
                    ? 'bg-stone-900 text-amber-100 shadow-sm ring-1 ring-stone-950' 
                    : 'text-stone-700 hover:bg-[#ede5d8]/70 hover:text-stone-950'
                }`}
              >
                <Icon className={`w-5 h-5 mr-3 transition-colors ${isActive ? 'text-amber-400' : 'text-stone-500'}`} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-[#eee7dd] bg-[#f7f3eb]/60">
          <div className="flex items-center px-2 py-2 mb-2 rounded-xl hover:bg-[#eae1d3]/60 transition group">
            <div className="w-8 h-8 rounded-full bg-amber-800 text-amber-100 flex items-center justify-center font-bold text-xs mr-2.5 shrink-0 shadow-xs">
              {profile?.firstName?.[0]?.toUpperCase() || 'U'}
            </div>
            
            {isEditingName ? (
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <input
                  ref={inputRef}
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full text-xs font-semibold px-2 py-1 bg-white border border-amber-300 rounded-lg outline-none focus:ring-1 focus:ring-amber-800 text-stone-900"
                  placeholder="Your Name"
                />
                <button
                  onClick={handleSaveName}
                  className="p-1 text-emerald-700 hover:bg-emerald-100/60 rounded transition"
                  title="Save Name"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setNameInput(profile?.firstName || '');
                    setIsEditingName(false);
                  }}
                  className="p-1 text-stone-500 hover:bg-stone-200 rounded transition"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <p
                  className="text-sm font-semibold truncate text-stone-800 cursor-pointer hover:text-amber-900 transition"
                  onClick={() => setIsEditingName(true)}
                  title="Click to edit name"
                >
                  {profile?.firstName || 'User'}
                </p>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-amber-900 hover:bg-[#e4dbcd] rounded-md transition"
                  title="Edit Name"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center px-3 py-2 rounded-xl text-sm font-semibold text-stone-600 hover:bg-[#ede5d8]/70 hover:text-stone-900 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3 text-stone-500" />
            Sign Out
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-auto bg-[#f8f6f2]">
        <Outlet />
      </main>
    </div>
  );
}
