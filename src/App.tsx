import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Closet from './pages/Closet';
import Family from './pages/Family';
import AddGarment from './pages/AddGarment';
import Planner from './pages/Planner';
import Login from './pages/Login';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="h-screen w-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="closet" element={<Closet />} />
            <Route path="family" element={<Family />} />
            <Route path="add-garment" element={<Navigate to="/closet" replace />} />
            <Route path="planner" element={<Planner />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
