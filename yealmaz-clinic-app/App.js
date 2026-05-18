import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, ActivityIndicator } from 'react-native';
import Toast from 'react-native-toast-message';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { Colors } from './src/utils/theme';

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
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.navy }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>🦷</Text>
        <ActivityIndicator color={Colors.accent} size="large" />
      </View>
    );
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppNavigator />
        <Toast />
      </AuthProvider>
    </QueryClientProvider>
  );
}
