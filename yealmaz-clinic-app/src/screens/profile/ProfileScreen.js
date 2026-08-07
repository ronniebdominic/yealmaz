import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, StatusBar, Linking,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Radius, FontFamily } from '../../utils/theme';
import GlassCard from '../../components/GlassCard';
import ConfirmDialog from '../../components/ConfirmDialog';

const LAB_PHONE = '+251911000000';

function MenuItem({ icon, label, onPress, danger, isLast }) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, isLast && { borderBottomWidth: 0 }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <MaterialCommunityIcons name={icon} size={19} color={danger ? Colors.red : Colors.text2} style={{ width: 32 }} />
      <Text style={[styles.menuLabel, danger && { color: Colors.red }]}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.text3} />
    </TouchableOpacity>
  );
}

export default function ProfileScreen({ navigation }) {
  const { clinic, logout } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <View style={styles.header}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{clinic?.name?.[0]?.toUpperCase() || 'C'}</Text>
        </View>
        <Text style={styles.clinicName}>{clinic?.name}</Text>
        {clinic?.code && <Text style={styles.clinicCode}>#{clinic.code}</Text>}
        <Text style={styles.clinicEmail}>{clinic?.email}</Text>
        {clinic?.phone && (
          <View style={styles.infoLine}>
            <MaterialCommunityIcons name="phone-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={styles.clinicPhone}>{clinic.phone}</Text>
          </View>
        )}
        {clinic?.address && (
          <View style={styles.infoLine}>
            <MaterialCommunityIcons name="map-marker-outline" size={13} color="rgba(255,255,255,0.75)" />
            <Text style={styles.clinicAddress}>{clinic.address}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ACCOUNT</Text>
          <GlassCard strong style={styles.menuCard}>
            <MenuItem icon="clipboard-text-outline" label="My Cases" onPress={() => navigation.navigate('Cases')} />
            <MenuItem icon="credit-card-outline" label="Payment History" onPress={() => navigation.navigate('Cases', { filter: 'payment' })} />
            <MenuItem icon="plus-circle-outline" label="Submit New Case" onPress={() => navigation.navigate('NewCase')} isLast />
          </GlassCard>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPPORT</Text>
          <GlassCard strong style={styles.menuCard}>
            <MenuItem icon="phone-outline" label="Contact Ye-Almaz Lab" onPress={() => Linking.openURL(`tel:${LAB_PHONE}`)} />
            <MenuItem icon="help-circle-outline" label="Help & FAQ" onPress={() => setShowHelp(true)} isLast />
          </GlassCard>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={() => setConfirmLogout(true)} activeOpacity={0.8}>
          <MaterialCommunityIcons name="logout" size={18} color={Colors.red} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerLogo}>🦷 Ye-Almaz Dental Lab</Text>
          <Text style={styles.footerVersion}>Clinic App v1.0</Text>
        </View>

      </ScrollView>

      <ConfirmDialog
        visible={confirmLogout}
        title="Sign Out"
        message="Are you sure you want to sign out of Ye-Almaz Clinic?"
        confirmLabel="Sign Out"
        destructive
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => { setConfirmLogout(false); logout(); }}
      />
      <ConfirmDialog
        visible={showHelp}
        title="Help & FAQ"
        message="For help with your account, orders, or anything else, call or message the lab directly — we're happy to walk you through it."
        confirmLabel="Call Lab"
        cancelLabel="Close"
        onCancel={() => setShowHelp(false)}
        onConfirm={() => { setShowHelp(false); Linking.openURL(`tel:${LAB_PHONE}`); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    backgroundColor: Colors.primary, paddingTop: 52,
    paddingBottom: 28, paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
  },
  avatarCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 30, fontFamily: FontFamily.extrabold, color: '#fff' },
  clinicName: { fontSize: 20, fontFamily: FontFamily.extrabold, color: '#fff', marginBottom: 4 },
  clinicCode: { fontSize: 13, fontFamily: FontFamily.bold, color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  clinicEmail: { fontSize: 13, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  infoLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  clinicPhone: { fontSize: 13, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.75)' },
  clinicAddress: { fontSize: 13, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },

  scroll: { padding: Spacing.lg, paddingBottom: 40 },
  section: { marginBottom: Spacing.md },
  sectionTitle: {
    fontSize: 11, fontFamily: FontFamily.bold, color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8,
  },
  menuCard: {
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.lg, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  menuLabel: { flex: 1, fontSize: 15, fontFamily: FontFamily.medium, color: Colors.text1 },

  logoutButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5',
    borderRadius: Radius.lg, paddingVertical: 15, marginBottom: Spacing.lg,
    gap: 8,
  },
  logoutText: { fontSize: 16, fontFamily: FontFamily.bold, color: Colors.red },

  footer: { alignItems: 'center', marginTop: 20 },
  footerLogo: { fontSize: 14, fontFamily: FontFamily.bold, color: Colors.text2, marginBottom: 4 },
  footerVersion: { fontSize: 12, fontFamily: FontFamily.regular, color: Colors.text3 },
});
