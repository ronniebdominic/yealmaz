import { MdLightMode, MdDarkMode } from 'react-icons/md';
import useTheme from '../hooks/useTheme';

// Dark / light switch. `tone` picks the styling to suit where it sits:
//   "sidebar" - icon button matching the logout control (the sidebar stays navy
//               in both themes), "page" - the app's ghost button for headers,
//   "row"     - full-width labelled button for menus / profile screens
//               (pass className to match the surrounding list).
export default function ThemeToggle({ tone = 'sidebar', style, className }) {
  const { theme, toggle } = useTheme();
  const toLight = theme === 'dark';
  const label = toLight ? 'Switch to light mode' : 'Switch to dark mode';
  const Icon = toLight ? MdLightMode : MdDarkMode;   // shows what you'll get
  if (tone === 'row') {
    return (
      <button type="button" className={`${className || 'btn btn-ghost'} theme-toggle`} onClick={toggle} aria-label={label} style={style}>
        <Icon size={16} aria-hidden="true" /> {toLight ? 'Light mode' : 'Dark mode'}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={tone === 'page' ? 'btn btn-tertiary btn-sm theme-toggle' : 'logout-btn theme-toggle'}
      onClick={toggle}
      aria-label={label}
      title={label}
      style={tone === 'page' ? { padding: 7, ...style } : style}
    >
      <Icon className="mi" size={tone === 'page' ? 15 : 17} aria-hidden="true" />
    </button>
  );
}
