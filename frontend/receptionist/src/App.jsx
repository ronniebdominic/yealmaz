import LabDashboard from './pages/LabDashboard';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminPricing from './pages/AdminPricing';
import AdminCases from './pages/AdminCases';
import AdminClinics from './pages/AdminClinics';
import Cases from './pages/Cases';
import NewCase from './pages/NewCase';
import Delivery from './pages/Delivery';
import DeliveryDashboard from './pages/DeliveryDashboard';
import DispatchDashboard from './pages/DispatchDashboard';
import FinanceDashboard from './pages/FinanceDashboard';
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

function ProtectedRoute({ children, allowedRoles, allowedEmail }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  if (allowedEmail && user.email !== allowedEmail) return <Navigate to="/" replace />;
  return children;
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DELIVERY') return <DeliveryDashboard />;
  if (user.role === 'DISPATCH') return <DispatchDashboard />;
  if (user.role === 'LAB_TECH') return <LabDashboard />;
  if (user.role === 'FINANCE') return <FinanceDashboard />;
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
      <Route path="/delivery" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Delivery /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/pricing" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminPricing /></ProtectedRoute>} />
      <Route path="/admin/cases" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminCases /></ProtectedRoute>} />
      <Route path="/admin/clinics" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminClinics /></ProtectedRoute>} />
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
