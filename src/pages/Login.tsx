import { useAuth } from '../hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { Shirt } from 'lucide-react';

export default function Login() {
  const { user, login } = useAuth();

  if (user) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="w-16 h-16 bg-stone-900 rounded-2xl flex items-center justify-center mb-6">
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
          <button
            onClick={login}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-stone-900 hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-900 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}
