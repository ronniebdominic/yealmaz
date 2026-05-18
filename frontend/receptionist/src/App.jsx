import LabDashboard from './pages/LabDashboard';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminPricing from './pages/AdminPricing';
import Cases from './pages/Cases';
import NewCase from './pages/NewCase';
import Payments from './pages/Payments';
import Billing from './pages/Billing';
import Delivery from './pages/Delivery';
import DeliveryDashboard from './pages/DeliveryDashboard';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DELIVERY') return <DeliveryDashboard />;
  if (user.role === 'LAB_TECH') return <LabDashboard />;
  if (user.role === 'ADMIN' && user.email === 'admindashboard@yealmaz.com') return <Navigate to="/admin" replace />;
  return <Dashboard />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />
      <Route path="/cases" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Cases /></ProtectedRoute>} />
      <Route path="/cases/new" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><NewCase /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Billing /></ProtectedRoute>} />
      <Route path="/payments" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Payments /></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Delivery /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/pricing" element={<ProtectedRoute allowedRoles={['ADMIN']}><AdminPricing /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
