import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, Platform, Animated, StyleSheet } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Colors } from './src/utils/theme';
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

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }) {
  const icons = { Home: focused?'🏠':'🏡', Cases: focused?'📋':'📄', NewCase: focused?'➕':'✚', Profile: focused?'👤':'👥' };
  return <Text style={{ fontSize: 22 }}>{icons[name]}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: Colors.blue,
        tabBarInactiveTintColor: Colors.text3,
        tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border, borderTopWidth: 1, height: 60, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Cases" component={CasesScreen} options={{ tabBarLabel: 'My Cases' }} />
      <Tab.Screen name="NewCase" component={NewCaseScreen} options={{ tabBarLabel: 'New Case' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

function AppNavigator() {
  const { clinic, loading } = useAuth();
  const [minTimeDone, setMinTimeDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMinTimeDone(true), 2500);
    return () => clearTimeout(t);
  }, []);

  if (!minTimeDone || loading) {
    return <SplashScreen />;
  }
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
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
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
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
    backgroundColor: '#1a1a2e', paddingVertical: 12, paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: { color: '#FFD166', fontSize: 13, fontWeight: '600' },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineBanner />
        <AppNavigator />
        <Toast />
      </AuthProvider>
    </QueryClientProvider>
  );
}
