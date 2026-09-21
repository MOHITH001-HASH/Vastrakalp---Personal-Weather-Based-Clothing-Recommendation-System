import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { auth, loginWithGoogle, logout, db } from '../lib/firebase';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfileName: (newName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Check for locally cached profile first for instant availability
        const cacheKey = `vastrakalp_user_profile_${firebaseUser.uid}`;
        let cachedProfile = null;
        try {
          const raw = localStorage.getItem(cacheKey);
          if (raw) cachedProfile = JSON.parse(raw);
        } catch {
          // Ignore JSON parse errors
        }

        const defaultProfile = {
          familyId: `fam_${firebaseUser.uid.slice(0, 8)}`,
          firstName: firebaseUser.displayName?.split(' ')[0] || firebaseUser.email?.split('@')[0] || 'User',
          role: 'admin',
          createdAt: Date.now(),
          preferences: {
            avoidColors: [],
            fitPreference: 'regular'
          }
        };

        if (cachedProfile) {
          setProfile(cachedProfile);
        } else {
          setProfile(defaultProfile);
        }

        try {
          // Check if user exists in Firestore
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (!userDoc.exists()) {
            // Create family
            const familyRef = doc(collection(db, 'families'));
            const now = Date.now();
            
            await setDoc(familyRef, {
              familyName: `${firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'My'}'s Family`,
              createdAt: now
            });
            
            // Create user profile
            const userProfile = {
              familyId: familyRef.id,
              firstName: firebaseUser.displayName?.split(' ')[0] || firebaseUser.email?.split('@')[0] || 'User',
              role: 'admin',
              createdAt: now,
              preferences: {
                avoidColors: [],
                fitPreference: 'regular'
              }
            };
            await setDoc(userRef, userProfile);
            setProfile(userProfile);
            try {
              localStorage.setItem(cacheKey, JSON.stringify(userProfile));
            } catch {
              // Ignore storage errors
            }
          } else {
            const data = userDoc.data();
            setProfile(data);
            try {
              localStorage.setItem(cacheKey, JSON.stringify(data));
            } catch {
              // Ignore storage errors
            }
          }
        } catch (e: any) {
          console.warn("User sync operating with cached/default profile while connecting to Firestore:", e?.message || e);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateProfileName = async (newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const updatedProfile = {
      ...(profile || {}),
      firstName: trimmed
    };
    setProfile(updatedProfile);

    if (user) {
      const cacheKey = `vastrakalp_user_profile_${user.uid}`;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(updatedProfile));
      } catch {
        // Ignore cache storage error
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, { firstName: trimmed }, { merge: true });
      } catch (err) {
        console.warn('Profile name updated locally; Firestore sync notice:', err);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login: loginWithGoogle, logout, updateProfileName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
