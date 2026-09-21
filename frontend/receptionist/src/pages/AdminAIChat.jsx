// Full-page route for the AI Assistant - kept so /admin/ai-chat still
// resolves. The assistant is mainly reached through the floating button
// (components/FloatingAIAssistant.jsx), mounted in AdminLayout on every admin
// screen. Both render the same <AIAssistant/>, driven by the same useAIChat.
import AdminLayout from '../components/AdminLayout';
import AIAssistant from '../components/ai/AIAssistant';
import useAIChat from '../hooks/useAIChat';
import { MdSmartToy } from 'react-icons/md';

export default function AdminAIChat() {
  const chat = useAIChat();
  return (
    <AdminLayout>
      <div className="topbar">
        <div className="topbar-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <MdSmartToy className="mi" size={18} /> AI Assistant
        </div>
      </div>
      <div className="content" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 64px)', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        <div className="card ai-page-card">
          <AIAssistant chat={chat} focusSignal={1} />
        </div>
      </div>
    </AdminLayout>
  );
}
