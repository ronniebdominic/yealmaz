import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Cases from './pages/Cases';
import NewCase from './pages/NewCase';
import Payments from './pages/Payments';
import Delivery from './pages/Delivery';
import DeliveryDashboard from './pages/DeliveryDashboard';
import './index.css';

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

// Sends each role to their correct home screen
function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DELIVERY') return <DeliveryDashboard />;
  return <Dashboard />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />

      {/* Home — role-aware */}
      <Route path="/" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />

      {/* Receptionist + Admin only */}
      <Route path="/cases" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Cases /></ProtectedRoute>} />
      <Route path="/cases/new" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><NewCase /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Payments /></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Delivery /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontFamily: 'DM Sans, sans-serif', fontSize: '13px', borderRadius: '10px' },
            success: { iconTheme: { primary: '#16A34A', secondary: '#fff' } },
            error: { iconTheme: { primary: '#E53E3E', secondary: '#fff' } }
          }}
        />
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
