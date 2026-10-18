import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Shirt, AlertCircle, Loader2 } from 'lucide-react';

export default function Login() {
  const { user, login } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setErrorMsg(null);
      await login();
    } catch (err: any) {
      console.error('Login error:', err);
      if (err?.code === 'auth/unauthorized-domain' || err?.message?.includes('unauthorized domain') || err?.message?.includes('invalid')) {
        setErrorMsg('Domain not authorized in Firebase. Please add your Vercel domain in Firebase Console > Authentication > Settings > Authorized domains.');
      } else if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Sign-in popup was closed. Please click Sign in again.');
      } else if (err?.code === 'auth/popup-blocked') {
        setErrorMsg('Browser blocked the popup window. Please allow popups for this site and try again.');
      } else {
        setErrorMsg(err?.message || 'Failed to sign in with Google. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-stone-900 rounded-2xl flex items-center justify-center mb-6 shadow-md">
          <Shirt className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-center text-3xl font-extrabold text-stone-900 tracking-tight">
          Vastrakalp
        </h2>
        <p className="mt-2 text-center text-sm text-stone-600">
          AI Wardrobe & Family Stylist
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-10 px-4 shadow-xl shadow-stone-200/50 sm:rounded-3xl sm:px-10 border border-stone-100">
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900 text-xs leading-relaxed">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-950 mb-1">Authentication Notice</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-900 transition-colors cursor-pointer"
          >
            {isLoggingIn ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              'Sign in with Google'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
