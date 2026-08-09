import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, Platform, Animated, StyleSheet, TouchableOpacity } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFonts, Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold } from '@expo-google-fonts/sora';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Colors, Gradients, GLASS_BLUR_WEB, GLASS_BLUR_NATIVE } from './src/utils/theme';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import SplashScreen from './src/screens/SplashScreen';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
    },
  },
});

import LoginScreen from './src/screens/auth/LoginScreen';
import HomeScreen from './src/screens/cases/HomeScreen';
import CasesScreen from './src/screens/cases/CasesScreen';
import CaseDetailScreen from './src/screens/cases/CaseDetailScreen';
import NewCaseScreen from './src/screens/cases/NewCaseScreen';
import ProfileScreen from './src/screens/profile/ProfileScreen';
import RewardsScreen from './src/screens/rewards/RewardsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const TAB_ICONS = {
  Home: 'view-dashboard-outline',
  Cases: 'clipboard-text-outline',
  NewCase: 'plus-circle-outline',
  Rewards: 'gift-outline',
  Profile: 'account-circle-outline',
};

function TabIcon({ name, focused, color }) {
  return <MaterialCommunityIcons name={TAB_ICONS[name]} size={focused ? 25 : 23} color={color} />;
}

// Glass tab-bar background — real blur on native, CSS backdrop-filter on web.
function GlassTabBackground() {
  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          StyleSheet.absoluteFillObject,
          {
            backgroundColor: Colors.glassBgStrong,
            borderTopWidth: 1,
            borderTopColor: Colors.glassBorder,
            backdropFilter: `blur(${GLASS_BLUR_WEB}px)`,
            WebkitBackdropFilter: `blur(${GLASS_BLUR_WEB}px)`,
          },
        ]}
      />
    );
  }
  return (
    <View style={StyleSheet.absoluteFillObject}>
      <BlurView intensity={GLASS_BLUR_NATIVE} tint="light" style={StyleSheet.absoluteFillObject} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: Colors.glassBgStrong, borderTopWidth: 1, borderTopColor: Colors.glassBorder }]} />
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color }) => <TabIcon name={route.name} focused={focused} color={color} />,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.text3,
        tabBarStyle: { backgroundColor: 'transparent', borderTopWidth: 0, height: 60, paddingBottom: 8, paddingTop: 6, elevation: 0 },
        tabBarBackground: () => <GlassTabBackground />,
        tabBarLabelStyle: { fontSize: 11, fontFamily: 'Sora_600SemiBold' },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Cases" component={CasesScreen} options={{ tabBarLabel: 'My Cases' }} />
      <Tab.Screen name="NewCase" component={NewCaseScreen} options={{ tabBarLabel: 'New Case' }} />
      <Tab.Screen name="Rewards" component={RewardsScreen} options={{ tabBarLabel: 'Rewards' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { clinic, loading } = useAuth();

  // Subscribe to push notifications once the clinic is logged in (web only)
  usePushNotifications(!!clinic);
  const [minTimeDone, setMinTimeDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (!minTimeDone || loading) {
    return <SplashScreen />;
  }
  return (
    <NavigationContainer theme={{ colors: { background: 'transparent' } }}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: 'transparent' } }}>
        {!clinic ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="CaseDetail" component={CaseDetailScreen} />
            <Stack.Screen name="NewCase" component={NewCaseScreen} options={{ animation: 'slide_from_bottom' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ── Offline banner (web + native) ────────────────────────────────────────────
function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const slideAnim = useRef(new Animated.Value(-48)).current;

  useEffect(() => {
    const show = () => {
      setOffline(true);
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    };
    const hide = () => {
      Animated.timing(slideAnim, { toValue: -48, duration: 300, useNativeDriver: true }).start(() =>
        setOffline(false)
      );
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('offline', show);
      window.addEventListener('online', hide);
      return () => { window.removeEventListener('offline', show); window.removeEventListener('online', hide); };
    }
  }, []);

  if (!offline) return null;
  return (
    <Animated.View style={[offlineStyles.bar, { transform: [{ translateY: slideAnim }] }]}>
      <Text style={offlineStyles.text}>⚡ You're offline — showing cached data</Text>
    </Animated.View>
  );
}

const offlineStyles = StyleSheet.create({
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    backgroundColor: Colors.ink, paddingVertical: 12, paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: { color: '#FFD166', fontSize: 13, fontFamily: 'Sora_600SemiBold' },
});

// ── Install-as-app banner (web only) ─────────────────────────────────────
// Chrome/Edge/Android fire `beforeinstallprompt` when the PWA criteria
// (manifest + service worker, both now in place — see public/manifest.json
// and public/sw.js) are met; capturing that event is the only way to offer
// an explicit in-app "Install" button instead of relying on the browser's
// own address-bar icon. iOS Safari never fires that event — there's no
// programmatic install there, so it gets one-time instructions instead.
function InstallAppBanner() {
  const [installEvent, setInstallEvent] = useState(null);
  const [mode, setMode] = useState(null); // 'chrome' | 'ios'
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-64)).current;

  const show = () => {
    setVisible(true);
    Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: false }).start();
  };
  const hide = (remember) => {
    Animated.timing(slideAnim, { toValue: -64, duration: 250, useNativeDriver: false }).start(() => setVisible(false));
    if (remember) { try { window.localStorage.setItem('pwaInstallDismissed', '1'); } catch {} }
  };

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) return; // already installed — nothing to offer

    let dismissed = false;
    try { dismissed = window.localStorage.getItem('pwaInstallDismissed') === '1'; } catch {}
    if (dismissed) return;

    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallEvent(e);
      setMode('chrome');
      show();
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    const ua = window.navigator.userAgent || '';
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
    if (isIOS && isSafari) {
      setMode('ios');
      show();
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
    hide(true);
  };

  if (Platform.OS !== 'web' || !visible) return null;

  return (
    <Animated.View style={[installStyles.bar, { transform: [{ translateY: slideAnim }] }]}>
      <MaterialCommunityIcons name="cellphone-arrow-down" size={20} color={Colors.textWhite} />
      <Text style={installStyles.text} numberOfLines={2}>
        {mode === 'ios'
          ? 'Install this app: tap Share, then "Add to Home Screen"'
          : 'Install Ye-Almaz Clinic for quicker, full-screen access'}
      </Text>
      {mode === 'chrome' && (
        <TouchableOpacity onPress={install} style={installStyles.installBtn}>
          <Text style={installStyles.installBtnText}>Install</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity onPress={() => hide(true)} style={installStyles.closeBtn} hitSlop={8}>
        <MaterialCommunityIcons name="close" size={16} color="rgba(255,255,255,0.8)" />
      </TouchableOpacity>
    </Animated.View>
  );
}

const installStyles = StyleSheet.create({
  bar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9998,
    backgroundColor: Colors.primary, paddingVertical: 10, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  text: { flex: 1, color: Colors.textWhite, fontSize: 12.5, fontFamily: 'Sora_600SemiBold', lineHeight: 17 },
  installBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999 },
  installBtnText: { color: Colors.textWhite, fontSize: 12.5, fontFamily: 'Sora_700Bold' },
  closeBtn: { padding: 2 },
});

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold, Sora_800ExtraBold,
  });

  if (!fontsLoaded) {
    return <SplashScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LinearGradient colors={Gradients.screen} style={{ flex: 1 }}>
          <OfflineBanner />
          <InstallAppBanner />
          <AppNavigator />
          <Toast />
        </LinearGradient>
      </AuthProvider>
    </QueryClientProvider>
  );
}
