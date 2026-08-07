import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { Colors, Spacing, Radius, FontFamily } from '../../utils/theme';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import GlassCard from '../../components/GlassCard';
import CaseListCard from '../../components/CaseListCard';

function StatCard({ value, label, color, icon, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ flex: 1 }}>
      <GlassCard strong style={styles.statCard}>
        <View style={[styles.statIconWrap, { backgroundColor: color + '18' }]}>
          <MaterialCommunityIcons name={icon} size={20} color={color} />
        </View>
        <Text style={[styles.statValue, { color }]}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </GlassCard>
    </TouchableOpacity>
  );
}

export default function HomeScreen({ navigation }) {
  const { clinic } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['cases', 'home'],
    queryFn: () => api.get('/cases?limit=50').then(r => r.data.cases || []),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const cases = data || [];
  const refreshing = isRefetching && !isLoading;

  // Reload whenever this screen comes back into focus
  React.useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      queryClient.invalidateQueries({ queryKey: ['cases', 'home'] });
    });
    return unsub;
  }, [navigation, queryClient]);

  const active    = cases.filter(c => !['DELIVERED', 'ON_HOLD', 'CANCELLED'].includes(c.status));
  const pending   = cases.filter(c => c.paymentStatus === 'SCREENSHOT_UPLOADED');
  const delivered = cases.filter(c => c.status === 'DELIVERED');
  const recent    = [...cases].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('../../../assets/logo.png')} style={styles.headerLogo} />
          <View style={{ flexShrink: 1 }}>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.clinicName} numberOfLines={1}>{clinic?.name}</Text>
          </View>
        </View>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{clinic?.name?.[0]?.toUpperCase() || 'C'}</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refetch}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── API Error Banner ── */}
        {error ? (
          <View style={styles.errorBanner}>
            <MaterialCommunityIcons name="wifi-off" size={15} color="#ef9a9a" />
            <Text style={styles.errorBannerText}>Cannot reach server — check your network.</Text>
          </View>
        ) : null}

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <StatCard value={active.length} label="Active" color={Colors.primary} icon="progress-clock"
            onPress={() => navigation.navigate('Cases', { filter: 'active' })} />
          <StatCard value={pending.length} label="Pending Pay" color={Colors.amber} icon="credit-card-clock-outline"
            onPress={() => navigation.navigate('Cases', { filter: 'payment' })} />
          <StatCard value={delivered.length} label="Delivered" color={Colors.green} icon="check-circle-outline"
            onPress={() => navigation.navigate('Cases', { filter: 'delivered' })} />
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.primary }]}
            onPress={() => navigation.navigate('NewCase')} activeOpacity={0.85}>
            <MaterialCommunityIcons name="plus-circle-outline" size={22} color="#fff" />
            <Text style={styles.actionLabel}>New Case</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.accent }]}
            onPress={() => navigation.navigate('Cases')} activeOpacity={0.85}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#fff" />
            <Text style={styles.actionLabel}>My Cases</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.ink }]}
            onPress={() => navigation.navigate('Cases', { filter: 'payment' })} activeOpacity={0.85}>
            <MaterialCommunityIcons name="cash-multiple" size={22} color="#fff" />
            <Text style={styles.actionLabel}>Payments</Text>
          </TouchableOpacity>
        </View>

        {/* ── Recent Cases ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT CASES</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Cases')} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Text style={styles.seeAll}>See all</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : recent.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="tooth-outline" size={48} color={Colors.primary} style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>No cases yet</Text>
            <Text style={styles.emptySub}>Submit your first case to get started</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('NewCase')}>
              <MaterialCommunityIcons name="plus" size={16} color="#fff" />
              <Text style={styles.emptyBtnText}>Submit New Case</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recent.map(c => (
            <CaseListCard key={c.id} c={c} onPress={() => navigation.navigate('CaseDetail', { caseId: c.id })} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  header: {
    backgroundColor: Colors.primary,
    paddingTop: 52, paddingBottom: 20,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
  },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: FontFamily.medium },
  clinicName: { fontSize: 20, fontFamily: FontFamily.extrabold, color: '#fff', marginTop: 2 },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontFamily: FontFamily.extrabold, color: '#fff' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headerLogo: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', backgroundColor: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  statCard: {
    padding: Spacing.lg,
    alignItems: 'center', gap: 4,
  },
  statIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  statValue: { fontSize: 26, fontFamily: FontFamily.extrabold, lineHeight: 30 },
  statLabel: { fontSize: 11, fontFamily: FontFamily.semibold, color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionTitle: {
    fontSize: 11, fontFamily: FontFamily.bold, color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  seeAll: { fontSize: 13, color: Colors.primary, fontFamily: FontFamily.semibold },

  actionsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  actionBtn: {
    flex: 1, borderRadius: Radius.lg, padding: Spacing.lg,
    alignItems: 'center', gap: 6,
  },
  actionLabel: { fontSize: 12, fontFamily: FontFamily.bold, color: '#fff', textAlign: 'center' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#3d1a1a', borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(198,40,40,0.4)',
  },
  errorBannerText: { fontSize: 12, fontFamily: FontFamily.regular, color: '#ef9a9a', lineHeight: 17, flexShrink: 1 },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontFamily: FontFamily.bold, color: Colors.text1, marginBottom: 6 },
  emptySub: { fontSize: 14, fontFamily: FontFamily.regular, color: Colors.text3, marginBottom: 20, textAlign: 'center' },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontFamily: FontFamily.bold },
});
