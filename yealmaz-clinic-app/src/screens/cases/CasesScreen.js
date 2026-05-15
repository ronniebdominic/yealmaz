import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow, STAGES, PAYMENT_STATUS } from '../../utils/theme';
import { format } from 'date-fns';

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Payment', value: 'payment' },
  { label: 'Delivered', value: 'delivered' },
];

export default function CasesScreen({ navigation, route }) {
  const initialFilter = route.params?.filter || '';
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [apiError, setApiError] = useState('');

  const loadCases = useCallback(async () => {
    try {
      setApiError('');
      const params = { limit: 100 };
      if (search) params.search = search;
      if (filter === 'delivered') params.status = 'DELIVERED';
      const res = await api.get('/cases', { params });
      let data = res.data.cases || [];
      if (filter === 'active') data = data.filter(c => !['DELIVERED', 'ON_HOLD'].includes(c.status));
      if (filter === 'payment') data = data.filter(c => c.paymentStatus !== 'VERIFIED' && c.paymentStatus !== 'PENDING');
      setCases(data);
    } catch (err) {
      const msg = err.response
        ? `Server error ${err.response.status}: ${err.response.data?.error || err.response.statusText}`
        : 'Cannot reach server — check your network and API_BASE in client.js';
      setApiError(msg);
      console.error('[CasesScreen] loadCases failed:', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, filter]);

  useEffect(() => { loadCases(); }, [loadCases]);

  const renderCase = ({ item: c }) => {
    const stage = STAGES[c.status] || STAGES.RECEIVED;
    const pay = PAYMENT_STATUS[c.paymentStatus];

    return (
      <TouchableOpacity
        style={[styles.card, Shadow.sm]}
        onPress={() => navigation.navigate('CaseDetail', { caseId: c.id })}
        activeOpacity={0.88}
      >
        <View style={[styles.statusBar, { backgroundColor: stage.color }]} />
        <View style={styles.cardContent}>
          <View style={styles.cardTop}>
            <Text style={styles.patient}>{c.patientName}</Text>
            <Text style={styles.stageIcon}>{stage.icon}</Text>
          </View>
          <Text style={styles.caseNum}>{c.caseNumber}</Text>
          <Text style={styles.workType}>{c.workType}</Text>
          <View style={styles.cardBottom}>
            <View style={[styles.stagePill, { backgroundColor: stage.color + '18' }]}>
              <Text style={[styles.stagePillText, { color: stage.color }]}>{stage.label}</Text>
            </View>
            <View style={[styles.payPill, { backgroundColor: pay?.bg }]}>
              <Text style={[styles.payPillText, { color: pay?.color }]}>{pay?.label}</Text>
            </View>
          </View>
          <Text style={styles.date}>{format(new Date(c.createdAt), 'dd MMM yyyy')}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Cases</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => navigation.navigate('NewCase')}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient or case number…"
          placeholderTextColor={Colors.text3}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={{ fontSize: 16, color: Colors.text3 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {apiError ? (
        <View style={{ margin: Spacing.lg, backgroundColor: '#3d1a1a', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(198,40,40,0.4)' }}>
          <Text style={{ fontSize: 12, color: '#ef9a9a', lineHeight: 17 }}>⚠️ {apiError}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator color={Colors.blue} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={cases}
          keyExtractor={c => c.id}
          renderItem={renderCase}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCases(); }} tintColor={Colors.accent} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text1 }}>No cases found</Text>
              <Text style={{ fontSize: 13, color: Colors.text3, marginTop: 4 }}>Try a different filter or search</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.navy, paddingTop: 52,
    paddingBottom: 16, paddingHorizontal: Spacing.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  newBtn: { backgroundColor: Colors.accent, borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 7 },
  newBtnText: { fontSize: 13, fontWeight: '700', color: Colors.navy },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, margin: Spacing.lg,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: Colors.text1 },

  // Filters
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 8, marginBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.text2 },
  filterTextActive: { color: '#fff' },

  // List
  list: { padding: Spacing.lg, paddingTop: 0, paddingBottom: 40 },

  // Card
  card: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    flexDirection: 'row', marginBottom: 10, overflow: 'hidden',
  },
  statusBar: { width: 4 },
  cardContent: { flex: 1, padding: Spacing.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  patient: { fontSize: 16, fontWeight: '700', color: Colors.text1 },
  stageIcon: { fontSize: 20 },
  caseNum: { fontSize: 11, color: Colors.text3, fontFamily: 'monospace', marginBottom: 2 },
  workType: { fontSize: 13, color: Colors.text2, marginBottom: 8 },
  cardBottom: { flexDirection: 'row', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  stagePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  stagePillText: { fontSize: 10, fontWeight: '700' },
  payPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  payPillText: { fontSize: 10, fontWeight: '600' },
  date: { fontSize: 11, color: Colors.text3 },

  empty: { alignItems: 'center', marginTop: 60 },
});
