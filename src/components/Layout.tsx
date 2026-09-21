import React, { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home, Grid, Sparkles, LogOut, Pencil, Check, X } from 'lucide-react';
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
    { name: 'Personal Closet', href: '/closet', icon: Grid },
    { name: 'Outfit Planner', href: '/planner', icon: Sparkles },
  ];

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900 font-sans">
      <nav className="w-64 bg-white border-r border-stone-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-stone-100">
          <h1 className="text-xl font-bold tracking-tight">Vastrakalp</h1>
        </div>
        
        <div className="flex-1 py-6 px-3 space-y-1">
          {nav.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive 
                    ? 'bg-stone-900 text-white' 
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-stone-100">
          <div className="flex items-center px-2 py-2 mb-2 rounded-xl hover:bg-stone-50 transition group">
            <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-medium mr-2.5 shrink-0">
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
                  className="w-full text-xs font-medium px-2 py-1 bg-white border border-stone-300 rounded-lg outline-none focus:ring-1 focus:ring-stone-900"
                  placeholder="Your Name"
                />
                <button
                  onClick={handleSaveName}
                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition"
                  title="Save Name"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setNameInput(profile?.firstName || '');
                    setIsEditingName(false);
                  }}
                  className="p-1 text-stone-400 hover:bg-stone-100 rounded transition"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between flex-1 min-w-0">
                <p
                  className="text-sm font-medium truncate text-stone-800 cursor-pointer"
                  onClick={() => setIsEditingName(true)}
                  title="Click to edit name"
                >
                  {profile?.firstName || 'User'}
                </p>
                <button
                  onClick={() => setIsEditingName(true)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 rounded-md transition"
                  title="Edit Name"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center px-3 py-2 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-100 transition-colors"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </button>
        </div>
      </nav>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
