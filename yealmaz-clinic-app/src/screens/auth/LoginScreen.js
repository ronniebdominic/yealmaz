import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { version } from '../../../package.json';
import { Colors, Spacing, Radius, FontFamily } from '../../utils/theme';
import GlassCard from '../../components/GlassCard';

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError('');
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (!result.success) setError(result.error);
  };

  return (
    <LinearGradient colors={[Colors.primary, Colors.primaryDark]} style={{ flex: 1 }}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Hero Section ── */}
        <View style={styles.hero}>
          <Image
            source={require('../../../assets/logo.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
          <Text style={styles.labName}>Ye-Almaz</Text>
          <Text style={styles.labSub}>Dental Laboratory</Text>
          <View style={styles.tagline}>
            <Text style={styles.taglineText}>Clinic Portal</Text>
          </View>
        </View>

        {/* ── Card ── */}
        <GlassCard strong radius={24} style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSub}>Sign in to your clinic account</Text>

          {error ? (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="email-outline" size={18} color={Colors.text3} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="clinic@example.com"
                placeholderTextColor={Colors.text3}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="lock-outline" size={18} color={Colors.text3} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={Colors.text3}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                autoComplete="password"
              />
              <TouchableOpacity onPress={() => setShowPass(!showPass)} style={styles.eyeBtn}>
                <MaterialCommunityIcons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.text3} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.loginBtnText}>Sign In</Text>
                <MaterialCommunityIcons name="arrow-right" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Don't have an account? Contact Ye-Almaz lab to get set up.
          </Text>
        </GlassCard>

        <Text style={styles.version}>Ye-Almaz Clinic App v{version}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flexGrow: 1, paddingBottom: Spacing.xxxl },

  // Hero
  hero: { alignItems: 'center', paddingTop: 60, paddingBottom: 32 },
  logoImage: {
    width: 110, height: 110, borderRadius: 55,
    marginBottom: 16,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: '#fff',
  },
  labName: {
    fontSize: 32, fontFamily: FontFamily.extrabold, color: '#fff',
    letterSpacing: -0.5,
  },
  labSub: { fontSize: 14, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  tagline: {
    marginTop: 12, backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 16, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  taglineText: { fontSize: 12, fontFamily: FontFamily.bold, color: Colors.primaryDark, letterSpacing: 0.5 },

  // Card
  card: {
    marginHorizontal: Spacing.lg,
    padding: Spacing.xl,
  },
  cardTitle: { fontSize: 22, fontFamily: FontFamily.extrabold, color: Colors.text1, marginBottom: 4 },
  cardSub: { fontSize: 14, fontFamily: FontFamily.regular, color: Colors.text3, marginBottom: Spacing.xl },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.redDim, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(198,40,40,0.2)',
  },
  errorText: { fontSize: 13, color: Colors.red, fontFamily: FontFamily.medium, flexShrink: 1 },

  // Form
  formGroup: { marginBottom: Spacing.lg },
  label: {
    fontSize: 11, fontFamily: FontFamily.bold, color: Colors.text3,
    letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  inputIcon: { marginRight: 8 },
  input: {
    flex: 1, height: 48,
    fontSize: 15, fontFamily: FontFamily.regular, color: Colors.text1,
  },
  eyeBtn: { padding: 6 },

  // Button
  loginBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    height: 52,
    marginTop: 4, marginBottom: Spacing.lg,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: 16, fontFamily: FontFamily.bold, letterSpacing: 0.3 },

  footerText: {
    fontSize: 12, fontFamily: FontFamily.regular, color: Colors.text3, textAlign: 'center', lineHeight: 18,
  },
  version: {
    textAlign: 'center', fontSize: 11, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.5)',
    marginTop: 24,
  },
});
