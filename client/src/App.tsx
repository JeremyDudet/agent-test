import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from "@/components/ui/toaster";

import AppShell from './components/AppShell';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { Dashboard } from './pages/Dashboard';
import { Expenses } from './pages/Expenses';
import useStore from './store/useStore';

const App: React.FC = () => {
  const isAuthenticated = useStore((state) => state.isAuthenticated);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppShell />}>
          {/* Public routes */}
          <Route
            index
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="expenses" element={<Expenses />} />
          </Route>

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </Router>
  );
};

export default App;
