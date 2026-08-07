import React, { useEffect, useRef } from 'react';
import { View, Text, Image, Animated, StyleSheet, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, FontFamily } from '../utils/theme';

export default function SplashScreen() {
  const logoScale  = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Logo: scale-up + fade in
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Text fades in after logo settles
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    });

    // Pulsing dots loop
    const pulse = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1,   duration: 350, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 350, useNativeDriver: true }),
        ])
      );

    Animated.parallel([
      pulse(dot1, 0),
      pulse(dot2, 200),
      pulse(dot3, 400),
    ]).start();
  }, []);

  return (
    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* Logo — glass ring instead of flat white */}
      <Animated.View style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
        <View style={styles.logoRing}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="cover"
          />
        </View>
      </Animated.View>

      {/* Branding */}
      <Animated.View style={[styles.textBlock, { opacity: textOpacity }]}>
        <Text style={styles.appName}>Ye-Almaz</Text>
        <Text style={styles.appSub}>Dental Laboratory</Text>
        <View style={styles.divider} />
        <Text style={styles.tagline}>Clinic Management Portal</Text>
      </Animated.View>

      {/* Loading dots */}
      <View style={styles.dotsRow}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View key={i} style={[styles.dot, { opacity: dot }]} />
        ))}
      </View>

      {/* Footer */}
      <Text style={styles.footer}>Ye-Almaz Dental Lab · Addis Ababa</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  logoWrap: {
    marginBottom: 32,
  },
  logoRing: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    padding: 6,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 16,
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 59,
  },

  textBlock: {
    alignItems: 'center',
    marginBottom: 56,
  },
  appName: {
    fontSize: 34,
    fontFamily: FontFamily.extrabold,
    color: '#fff',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  appSub: {
    fontSize: 15,
    fontFamily: FontFamily.medium,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  divider: {
    width: 40,
    height: 2,
    backgroundColor: Colors.gold,
    borderRadius: 2,
    marginBottom: 14,
  },
  tagline: {
    fontSize: 13,
    fontFamily: FontFamily.semibold,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    position: 'absolute',
    bottom: 80,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.gold,
  },

  footer: {
    position: 'absolute',
    bottom: 36,
    fontSize: 11,
    fontFamily: FontFamily.regular,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },
});
