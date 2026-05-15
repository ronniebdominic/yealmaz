import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, StatusBar, Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

function MenuItem({ icon, label, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={[styles.menuLabel, danger && { color: Colors.red }]}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }) {
  const { clinic, logout } = useAuth();

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      <View style={styles.header}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{clinic?.name?.[0]?.toUpperCase() || 'C'}</Text>
        </View>
        <Text style={styles.clinicName}>{clinic?.name}</Text>
        <Text style={styles.clinicEmail}>{clinic?.email}</Text>
        {clinic?.phone && <Text style={styles.clinicPhone}>📞 {clinic.phone}</Text>}
        {clinic?.address && <Text style={styles.clinicAddress}>📍 {clinic.address}</Text>}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="📋" label="My Cases" onPress={() => navigation.navigate('Cases')} />
            <MenuItem icon="💳" label="Payment History" onPress={() => navigation.navigate('Cases', { filter: 'payment' })} />
            <MenuItem icon="➕" label="Submit New Case" onPress={() => navigation.navigate('NewCase')} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPPORT</Text>
          <View style={styles.menuCard}>
            <MenuItem icon="📞" label="Contact Ye-Almaz Lab" onPress={() => {}} />
            <MenuItem icon="❓" label="Help & FAQ" onPress={() => {}} />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.menuCard}>
            <MenuItem icon="🚪" label="Sign Out" onPress={handleLogout} danger />
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerLogo}>🦷 Ye-Almaz Dental Lab</Text>
          <Text style={styles.footerVersion}>Clinic App v1.0</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.navy, paddingTop: 52,
    paddingBottom: 28, paddingHorizontal: Spacing.xl,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 30, fontWeight: '800', color: Colors.navy },
  clinicName: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  clinicEmail: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 4 },
  clinicPhone: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 2 },
  clinicAddress: { fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },

  scroll: { padding: Spacing.lg, paddingBottom: 40 },
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  menuCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    overflow: 'hidden', ...Shadow.sm,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  menuIcon: { fontSize: 18, width: 32 },
  menuLabel: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.text1 },
  menuArrow: { fontSize: 20, color: Colors.text3 },

  footer: { alignItems: 'center', marginTop: 20 },
  footerLogo: { fontSize: 14, fontWeight: '700', color: Colors.text2, marginBottom: 4 },
  footerVersion: { fontSize: 12, color: Colors.text3 },
});
