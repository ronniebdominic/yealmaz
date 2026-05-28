import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
  StatusBar, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { version } from '../../../package.json';
import { Colors, Typography, Spacing, Radius, Shadow } from '../../utils/theme';

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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />
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
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>
          <Text style={styles.cardSub}>Sign in to your clinic account</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
            </View>
          ) : null}

          <View style={styles.formGroup}>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <View style={styles.inputWrap}>
              <Text style={styles.inputIcon}>✉️</Text>
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
              <Text style={styles.inputIcon}>🔒</Text>
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
                <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁️'}</Text>
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
              <Text style={styles.loginBtnText}>Sign In →</Text>
            )}
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Don't have an account? Contact Ye-Almaz lab to get set up.
          </Text>
        </View>

        <Text style={styles.version}>Ye-Almaz Clinic App v{version}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.navy },
  scroll: { flexGrow: 1, paddingBottom: Spacing.xxxl },

  // Hero
  hero: { alignItems: 'center', paddingTop: 60, paddingBottom: 32 },
  logoImage: {
    width: 110, height: 110, borderRadius: 55,
    marginBottom: 16,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: '#fff',
  },
  labName: {
    fontSize: 32, fontWeight: '800', color: '#fff',
    letterSpacing: -0.5,
  },
  labSub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  tagline: {
    marginTop: 12, backgroundColor: Colors.accent,
    paddingHorizontal: 16, paddingVertical: 5,
    borderRadius: Radius.full,
  },
  taglineText: { fontSize: 12, fontWeight: '700', color: Colors.navy, letterSpacing: 0.5 },

  // Card
  card: {
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: 24, padding: Spacing.xl,
    ...Shadow.lg,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: Colors.text1, marginBottom: 4 },
  cardSub: { fontSize: 14, color: Colors.text3, marginBottom: Spacing.xl },

  // Error
  errorBox: {
    backgroundColor: Colors.redDim, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(198,40,40,0.2)',
  },
  errorText: { fontSize: 13, color: Colors.red, fontWeight: '500' },

  // Form
  formGroup: { marginBottom: Spacing.lg },
  label: {
    fontSize: 11, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.8, marginBottom: 6, textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
  },
  inputIcon: { fontSize: 16, marginRight: 8 },
  input: {
    flex: 1, height: 48,
    fontSize: 15, color: Colors.text1,
  },
  eyeBtn: { padding: 6 },
  eyeIcon: { fontSize: 16 },

  // Button
  loginBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    height: 52, alignItems: 'center', justifyContent: 'center',
    marginTop: 4, marginBottom: Spacing.lg,
    ...Shadow.md,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.3 },

  footerText: {
    fontSize: 12, color: Colors.text3, textAlign: 'center', lineHeight: 18,
  },
  version: {
    textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.2)',
    marginTop: 24,
  },
});
