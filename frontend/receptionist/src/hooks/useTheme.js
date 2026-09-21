import { useCallback, useSyncExternalStore } from 'react';
import { getTheme, setTheme, applyTheme, subscribeTheme } from '../utils/theme';

// Shared theme state: every toggle on screen (sidebar, drawer, portal header)
// reads the same store, so they never disagree. Also re-applies on change so a
// change made in another tab shows up here.
export default function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => subscribeTheme(() => { applyTheme(getTheme()); cb(); }),
    getTheme,
    () => 'dark',
  );
  const toggle = useCallback(() => setTheme(getTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, toggle };
}
