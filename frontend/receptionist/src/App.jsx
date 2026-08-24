import LabDashboard from './pages/LabDashboard';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './AuthContext';
import Login from './pages/Login';
import AttendanceKiosk from './pages/AttendanceKiosk';
import AdminTrash from './pages/AdminTrash';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminPricing from './pages/AdminPricing';
import AdminCases from './pages/AdminCases';
import AdminCaseStatusBoard from './pages/AdminCaseStatusBoard';
import AdminLabPerformance from './pages/AdminLabPerformance';
import AdminDeliveryPerformance from './pages/AdminDeliveryPerformance';
import AdminClinics from './pages/AdminClinics';
import AdminUsers from './pages/AdminUsers';
import AdminZones from './pages/AdminZones';
import AdminRewards from './pages/AdminRewards';
import AdminInventory from './pages/AdminInventory';
import InventoryDashboard from './pages/InventoryDashboard';
import AdminHR from './pages/AdminHR';
import HRDashboard from './pages/HRDashboard';
import LeaderDashboard from './pages/LeaderDashboard';
import Cases from './pages/Cases';
import NewCase from './pages/NewCase';
import Delivery from './pages/Delivery';
import DeliveryDashboard from './pages/DeliveryDashboard';
import DispatchDashboard from './pages/DispatchDashboard';
import FinanceDashboard from './pages/FinanceDashboard';
import AdminViewBanner from './components/AdminViewBanner';
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

// Wraps a role dashboard reached via /view/* with the "admin view mode"
// banner — but only when the visitor is actually the admin previewing it,
// not when a real holder of that role reaches the same route directly.
function ViewAsPage({ label, children }) {
  const { user } = useAuth();
  return (
    <>
      {user?.role === 'ADMIN' && <AdminViewBanner label={label} />}
      {children}
    </>
  );
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DELIVERY') return <DeliveryDashboard />;
  if (user.role === 'DISPATCH') return <DispatchDashboard />;
  if (user.role === 'LAB_TECH') return <LabDashboard />;
  if (user.role === 'FINANCE' || user.role === 'FINANCE_AP' || user.role === 'FINANCE_CASHIER') return <FinanceDashboard />;
  if (user.role === 'INVENTORY_MANAGER') return <InventoryDashboard />;
  if (user.role === 'HR_MANAGER') return <HRDashboard />;
  if (user.role === 'LEADER') return <LeaderDashboard />;
  if (user.role === 'ADMIN' && user.email === 'admindashboard@yealmaz.com') return <Navigate to="/admin" replace />;
  return <Dashboard />;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      {/* Shared reception tablet. Deliberately outside ProtectedRoute: there is no
          user session on that device - see pages/AttendanceKiosk.jsx. */}
      <Route path="/kiosk" element={<AttendanceKiosk />} />
      <Route path="/" element={<ProtectedRoute><RoleHome /></ProtectedRoute>} />
      <Route path="/cases" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Cases /></ProtectedRoute>} />
      <Route path="/cases/new" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST','DISPATCH']}><NewCase /></ProtectedRoute>} />
      <Route path="/delivery" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']}><Delivery /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin/pricing" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminPricing /></ProtectedRoute>} />
      <Route path="/admin/cases" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminCases /></ProtectedRoute>} />
      <Route path="/admin/case-status" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminCaseStatusBoard /></ProtectedRoute>} />
      <Route path="/admin/lab-performance" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminLabPerformance /></ProtectedRoute>} />
      <Route path="/admin/delivery-performance" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminDeliveryPerformance /></ProtectedRoute>} />
      <Route path="/admin/clinics" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminClinics /></ProtectedRoute>} />
      <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminUsers /></ProtectedRoute>} />
      <Route path="/admin/trash" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminTrash /></ProtectedRoute>} />
      <Route path="/admin/zones" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminZones /></ProtectedRoute>} />
      <Route path="/admin/rewards" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminRewards /></ProtectedRoute>} />
      <Route path="/admin/inventory" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminInventory /></ProtectedRoute>} />
      <Route path="/admin/hr" element={<ProtectedRoute allowedRoles={['ADMIN']} allowedEmail="admindashboard@yealmaz.com"><AdminHR /></ProtectedRoute>} />

      {/* Admin "view as" — lets the admin account open the operational
          dashboard each role normally logs into directly, without a
          separate login per role. Same allowedEmail gate as /admin/*. */}
      <Route path="/view/receptionist" element={<ProtectedRoute allowedRoles={['ADMIN','RECEPTIONIST']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="Receptionist"><Dashboard /></ViewAsPage></ProtectedRoute>} />
      <Route path="/view/finance" element={<ProtectedRoute allowedRoles={['ADMIN','FINANCE']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="Finance"><FinanceDashboard /></ViewAsPage></ProtectedRoute>} />
      <Route path="/view/dispatch" element={<ProtectedRoute allowedRoles={['ADMIN','DISPATCH']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="Dispatch"><DispatchDashboard /></ViewAsPage></ProtectedRoute>} />
      <Route path="/view/delivery" element={<ProtectedRoute allowedRoles={['ADMIN','DELIVERY']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="Delivery"><DeliveryDashboard /></ViewAsPage></ProtectedRoute>} />
      <Route path="/view/lab" element={<ProtectedRoute allowedRoles={['ADMIN','LAB_TECH']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="Lab"><LabDashboard /></ViewAsPage></ProtectedRoute>} />
      <Route path="/view/hr" element={<ProtectedRoute allowedRoles={['ADMIN','HR_MANAGER']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="HR"><HRDashboard /></ViewAsPage></ProtectedRoute>} />
      <Route path="/view/leader" element={<ProtectedRoute allowedRoles={['ADMIN','LEADER']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="Operation Manager"><LeaderDashboard /></ViewAsPage></ProtectedRoute>} />
      <Route path="/view/inventory" element={<ProtectedRoute allowedRoles={['ADMIN','INVENTORY_MANAGER']} allowedEmail="admindashboard@yealmaz.com"><ViewAsPage label="Inventory"><InventoryDashboard /></ViewAsPage></ProtectedRoute>} />

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
