import { useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { useNavigate } from 'react-router-dom';
import { version } from '../../package.json';
import LoginRobot from '../components/LoginRobot';
import '../styles/login-v8.css';

// Sign-in page (design: loginpagev8). The sign-in logic is unchanged — same fields, same login call, same error text,
// same redirect. The character squad only watches the form: it looks at you, reacts while you type, covers its eyes
// for the password. Sign-up / social / "remember me" from the design are not part of this app and are not shown.
export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // what the squad reacts to
  const [activeField, setActiveField] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [typingField, setTypingField] = useState(null);
  const typingTimer = useRef(null);

  const onType = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setIsTyping(true);
    setTypingField(field);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setIsTyping(false), 1200);
  };
  const onFocus = (field) => { setActiveField(field); setTypingField(field); };
  const onBlur = () => { setActiveField(null); setIsTyping(false); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const result = await login(form.email, form.password);
    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="login-screen-layout">
      <section className="robot-left-pane" aria-hidden="true">
        <div className="left-pane-backdrop" />
        <div className="robot-ambient-grid" />
        <div className="robot-showcase-container">
          <LoginRobot
            activeField={activeField}
            formStatus={loading ? 'loading' : 'idle'}
            email={form.email}
            isTyping={isTyping}
            typingField={typingField}
          />
        </div>
      </section>

      <section className="login-right-pane">
        <div className="form-content-wrapper">
          <header className="brand-header">
            <div className="brand-badge">
              {/* the logo is black line-art on a transparent background: a white disc shows it as designed */}
              <img className="login-logo-img" src="/logo.png" alt="Ye-Almaz Dental Laboratory" />
            </div>
            <div className="login-brand-name">
              <b>Ye-Almaz Dental Lab</b>
              <span>Management System</span>
            </div>
          </header>

          <div className="form-intro">
            <h1 className="form-title">Welcome back</h1>
            <p className="form-subtitle">Please enter your account details to access your workspace.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="input-group">
              <label htmlFor="login-email" className="input-label">Email address</label>
              <div className={`input-container ${activeField === 'email' ? 'focused' : ''}`}>
                <span className="input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                </span>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  placeholder="you@yealmaz.com"
                  value={form.email}
                  onChange={e => onType('email', e.target.value)}
                  onFocus={() => onFocus('email')}
                  onBlur={onBlur}
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="input-group">
              <div className="label-row">
                <label htmlFor="login-password" className="input-label">Password</label>
              </div>
              <div className={`input-container ${activeField === 'password' ? 'focused' : ''}`}>
                <span className="input-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => onType('password', e.target.value)}
                  onFocus={() => onFocus('password')}
                  onBlur={onBlur}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(s => !s)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                      <line x1="2" x2="22" y1="2" y2="22" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && <div className="login-error" role="alert">{error}</div>}

            <button type="submit" className={`submit-btn ${loading ? 'loading' : ''}`} disabled={loading}>
              {loading ? <span className="spinner-loader" aria-label="Signing in" /> : <span>Sign in</span>}
            </button>
          </form>

          <p className="login-version">Ye-Almaz Dental Lab Management System v{version}</p>
        </div>
      </section>
    </div>
  );
}
