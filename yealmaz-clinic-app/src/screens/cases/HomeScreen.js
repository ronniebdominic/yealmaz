import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow, STAGES, PAYMENT_STATUS } from '../../utils/theme';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';

function StatCard({ value, label, color, icon, onPress }) {
  return (
    <TouchableOpacity style={[styles.statCard, Shadow.sm]} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function CaseCard({ c, onPress }) {
  const stage = STAGES[c.status] || STAGES.CASE_ACCEPTED;
  const pay = PAYMENT_STATUS[c.paymentStatus];
  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date() && !['DELIVERED', 'CANCELLED'].includes(c.status);

  return (
    <TouchableOpacity style={[styles.caseCard, Shadow.sm]} onPress={onPress} activeOpacity={0.88}>
      <View style={[styles.caseCardLeft, { backgroundColor: stage.color + '18', borderColor: stage.color + '40' }]}>
        <Text style={styles.caseIcon}>{stage.icon}</Text>
      </View>
      <View style={styles.caseCardBody}>
        <View style={styles.caseCardTop}>
          <Text style={styles.casePatient}>{c.patientName}</Text>
          <View style={[styles.stagePill, { backgroundColor: stage.color + '18' }]}>
            <Text style={[styles.stagePillText, { color: stage.color }]}>{stage.label}</Text>
          </View>
        </View>
        <Text style={styles.caseNumber}>{c.caseNumber} · {c.workType}</Text>
        <View style={styles.caseCardBottom}>
          <View style={[styles.payPill, { backgroundColor: pay?.bg }]}>
            <Text style={[styles.payPillText, { color: pay?.color }]}>{pay?.label}</Text>
          </View>
          {isOverdue && (
            <View style={styles.overduePill}>
              <Text style={styles.overdueText}>⚠️ Overdue</Text>
            </View>
          )}
          {c.dueDate && (
            <Text style={styles.dueDate}>Due {format(new Date(c.dueDate), 'dd MMM')}</Text>
          )}
        </View>
      </View>
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
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('../../../assets/logo.png')} style={styles.headerLogo} />
          <View>
            <Text style={styles.greeting}>{greeting()},</Text>
            <Text style={styles.clinicName}>{clinic?.name}</Text>
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
            tintColor={Colors.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── API Error Banner ── */}
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠️ Cannot reach server — check your network.</Text>
          </View>
        ) : null}

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          <StatCard value={active.length} label="Active" color={Colors.blue} icon="⚙️"
            onPress={() => navigation.navigate('Cases', { filter: 'active' })} />
          <StatCard value={pending.length} label="Pending Pay" color={Colors.amber} icon="💳"
            onPress={() => navigation.navigate('Cases', { filter: 'payment' })} />
          <StatCard value={delivered.length} label="Delivered" color={Colors.green} icon="✅"
            onPress={() => navigation.navigate('Cases', { filter: 'delivered' })} />
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>QUICK ACTIONS</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.blue }]}
            onPress={() => navigation.navigate('NewCase')} activeOpacity={0.85}>
            <Text style={styles.actionIcon}>➕</Text>
            <Text style={styles.actionLabel}>New Case</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.accent }]}
            onPress={() => navigation.navigate('Cases')} activeOpacity={0.85}>
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>My Cases</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.navy }]}
            onPress={() => navigation.navigate('Cases', { filter: 'payment' })} activeOpacity={0.85}>
            <Text style={styles.actionIcon}>💰</Text>
            <Text style={styles.actionLabel}>Payments</Text>
          </TouchableOpacity>
        </View>

        {/* ── Recent Cases ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>RECENT CASES</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Cases')}>
            <Text style={styles.seeAll}>See all →</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={Colors.blue} style={{ marginTop: 40 }} />
        ) : recent.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🦷</Text>
            <Text style={styles.emptyTitle}>No cases yet</Text>
            <Text style={styles.emptySub}>Submit your first case to get started</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => navigation.navigate('NewCase')}>
              <Text style={styles.emptyBtnText}>+ Submit New Case</Text>
            </TouchableOpacity>
          </View>
        ) : (
          recent.map(c => (
            <CaseCard key={c.id} c={c} onPress={() => navigation.navigate('CaseDetail', { caseId: c.id })} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  header: {
    backgroundColor: Colors.navy,
    paddingTop: 52, paddingBottom: 20,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  clinicName: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2, maxWidth: 220 },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: Colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.navy },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLogo: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: '#fff' },

  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, paddingBottom: 40 },

  statsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  statCard: {
    flex: 1, backgroundColor: Colors.surface,
    borderRadius: Radius.lg, padding: Spacing.lg,
    alignItems: 'center', gap: 4,
  },
  statIcon: { fontSize: 22, marginBottom: 2 },
  statValue: { fontSize: 26, fontWeight: '800', lineHeight: 30 },
  statLabel: { fontSize: 11, fontWeight: '600', color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  seeAll: { fontSize: 13, color: Colors.blue, fontWeight: '600' },

  actionsRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.xl },
  actionBtn: {
    flex: 1, borderRadius: Radius.lg, padding: Spacing.lg,
    alignItems: 'center', gap: 6,
  },
  actionIcon: { fontSize: 24 },
  actionLabel: { fontSize: 12, fontWeight: '700', color: '#fff', textAlign: 'center' },

  caseCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    flexDirection: 'row', marginBottom: 10, overflow: 'hidden',
  },
  caseCardLeft: {
    width: 56, alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1,
  },
  caseIcon: { fontSize: 22 },
  caseCardBody: { flex: 1, padding: Spacing.md },
  caseCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 },
  casePatient: { fontSize: 15, fontWeight: '700', color: Colors.text1, flex: 1, marginRight: 8 },
  caseNumber: { fontSize: 12, color: Colors.text3, fontFamily: 'monospace', marginBottom: 8 },
  stagePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  stagePillText: { fontSize: 10, fontWeight: '700' },
  caseCardBottom: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  payPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  payPillText: { fontSize: 10, fontWeight: '600' },
  overduePill: { backgroundColor: Colors.redDim, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  overdueText: { fontSize: 10, fontWeight: '600', color: Colors.red },
  dueDate: { fontSize: 11, color: Colors.text3 },

  errorBanner: {
    backgroundColor: '#3d1a1a', borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.lg,
    borderWidth: 1, borderColor: 'rgba(198,40,40,0.4)',
  },
  errorBannerText: { fontSize: 12, color: '#ef9a9a', lineHeight: 17 },

  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.text1, marginBottom: 6 },
  emptySub: { fontSize: 14, color: Colors.text3, marginBottom: 20, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
