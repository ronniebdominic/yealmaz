import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Radius, FontFamily } from '../utils/theme';
import { useLanguage } from '../context/LanguageContext';

// Two-pill EN / አማርኛ switch. `variant`:
//   "pills"  — default, for use on a light surface (Profile menu row)
//   "ghost"  — translucent-on-dark, for the login hero over the green gradient
export default function LanguageSwitcher({ variant = 'pills', style }) {
  const { language, setLanguage, languages } = useLanguage();
  const ghost = variant === 'ghost';

  return (
    <View style={[styles.row, ghost && styles.rowGhost, style]}>
      {languages.map((l) => {
        const active = l.code === language;
        return (
          <TouchableOpacity
            key={l.code}
            onPress={() => setLanguage(l.code)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.pill,
              ghost && styles.pillGhost,
              active && (ghost ? styles.pillGhostActive : styles.pillActive),
            ]}
          >
            <Text style={[
              styles.pillText,
              ghost && styles.pillTextGhost,
              active && (ghost ? styles.pillTextGhostActive : styles.pillTextActive),
            ]}>
              {l.nativeLabel}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  rowGhost: { gap: 8 },

  pill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: Colors.surface2, borderWidth: 1, borderColor: Colors.border,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: 12.5, fontFamily: FontFamily.semibold, color: Colors.text2 },
  pillTextActive: { color: '#fff' },

  pillGhost: {
    paddingHorizontal: 13, paddingVertical: 6, borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  pillGhostActive: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: 'rgba(255,255,255,0.92)' },
  pillTextGhost: { fontSize: 12.5, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.85)' },
  pillTextGhostActive: { color: Colors.primaryDark },
});
