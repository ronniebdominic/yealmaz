// Full-page route for the AI Assistant — kept so /admin/ai-chat still
// resolves. The assistant is now primarily reached through the floating
// button (components/FloatingAIAssistant.jsx), mounted in AdminLayout on
// every admin screen. Both render the same <AIChatPanel/>.
import AdminLayout from '../components/AdminLayout';
import AIChatPanel from '../components/AIChatPanel';
import { MdSmartToy } from 'react-icons/md';

export default function AdminAIChat() {
  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MdSmartToy className="mi" size={18} /> AI Assistant
        </div>
      </div>
      <div className="content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <AIChatPanel />
      </div>
    </AdminLayout>
  );
}
