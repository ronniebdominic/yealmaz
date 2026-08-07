import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Colors, Radius, GLASS_BLUR_WEB, GLASS_BLUR_NATIVE } from '../utils/theme';

/**
 * Translucent, blurred, rounded panel — the core visual building block of
 * the glassmorphism redesign. Meant to sit on top of a colored/gradient
 * background (see Gradients.screen in theme.js) — glass has nothing to
 * show through against a flat single color.
 *
 * - `dark`: darker glass variant for use over the green header/hero areas
 *   (pair with light text), vs. the default light variant for content.
 * - `strong`: less transparent — for text-heavy cards where legibility
 *   matters more than how much of the backdrop shows through.
 *
 * Web gets a real CSS `backdrop-filter: blur()` (React Native Web passes
 * arbitrary style keys straight through as CSS). Native gets genuine blur
 * via expo-blur's <BlurView>, layered behind the content instead of a
 * flat-color fallback.
 */
export default function GlassCard({ children, style, dark = false, strong = false, radius = Radius.lg, ...rest }) {
  const bg = dark ? Colors.glassDark : (strong ? Colors.glassBgStrong : Colors.glassBg);
  const borderColor = dark ? Colors.glassDarkBorder : Colors.glassBorder;

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          {
            backgroundColor: bg,
            borderRadius: radius,
            borderWidth: 1,
            borderColor,
            backdropFilter: `blur(${GLASS_BLUR_WEB}px)`,
            WebkitBackdropFilter: `blur(${GLASS_BLUR_WEB}px)`,
          },
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={[{ borderRadius: radius, borderWidth: 1, borderColor, overflow: 'hidden' }, style]} {...rest}>
      <BlurView intensity={GLASS_BLUR_NATIVE} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: bg }]} />
      {children}
    </View>
  );
}
