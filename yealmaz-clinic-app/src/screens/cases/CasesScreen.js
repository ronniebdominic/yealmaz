import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow, STAGES, PAYMENT_STATUS } from '../../utils/theme';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const FILTERS = [
  { label: 'All',      value: '' },
  { label: 'Active',   value: 'active' },
  { label: 'Payment',  value: 'payment' },
  { label: 'Delivered',value: 'delivered' },
];

const PAGE_SIZE = 20;

export default function CasesScreen({ navigation, route }) {
  const initialFilter = route.params?.filter || '';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(initialFilter);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const params = { limit: PAGE_SIZE, page };
  if (search) params.search = search;
  if (filter === 'delivered') params.status = 'DELIVERED';

  const { data, isLoading, isRefetching, error } = useQuery({
    queryKey: ['cases', 'list', filter, search, page],
    queryFn: async () => {
      const res = await api.get('/cases', { params });
      let cases = res.data.cases || [];
      if (filter === 'active')   cases = cases.filter(c => !['DELIVERED', 'ON_HOLD', 'CANCELLED'].includes(c.status));
      if (filter === 'payment')  cases = cases.filter(c => c.paymentStatus !== 'VERIFIED' && c.paymentStatus !== 'PENDING');
      return { cases, pagination: res.data.pagination };
    },
    staleTime: 30_000,
    keepPreviousData: true,
  });

  React.useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      queryClient.invalidateQueries({ queryKey: ['cases', 'list'] });
    });
    return unsub;
  }, [navigation, queryClient]);

  const cases = data?.cases || [];
  const pagination = data?.pagination || {};
  const refreshing = isRefetching && !isLoading;

  const changeFilter = (f) => { setFilter(f); setPage(1); };
  const changeSearch = (s) => { setSearch(s); setPage(1); };

  const renderCase = ({ item: c }) => {
    const stage = STAGES[c.status] || STAGES.CASE_ACCEPTED;
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
          <Text style={styles.caseNum}>{c.caseNumber || 'Scan # Pending'}</Text>
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

      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Cases</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewCase')}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient or case number…"
          placeholderTextColor={Colors.text3}
          value={search}
          onChangeText={changeSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => changeSearch('')}>
            <Text style={{ fontSize: 16, color: Colors.text3 }}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => changeFilter(f.value)}
          >
            <Text style={[styles.filterText, filter === f.value && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <View style={{ margin: Spacing.lg, backgroundColor: '#3d1a1a', borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: 'rgba(198,40,40,0.4)' }}>
          <Text style={{ fontSize: 12, color: '#ef9a9a', lineHeight: 17 }}>⚠️ Cannot reach server — check your network.</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={Colors.blue} style={{ marginTop: 60 }} />
      ) : (
        <>
          <FlatList
            data={cases}
            keyExtractor={c => c.id}
            renderItem={renderCase}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ['cases', 'list'] })}
                tintColor={Colors.accent}
              />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>📭</Text>
                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text1 }}>No cases found</Text>
                <Text style={{ fontSize: 13, color: Colors.text3, marginTop: 4 }}>Try a different filter or search</Text>
              </View>
            }
          />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <View style={styles.paginationRow}>
              <TouchableOpacity
                style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                onPress={() => setPage(p => p - 1)}
                disabled={page === 1}
              >
                <Text style={styles.pageBtnText}>← Prev</Text>
              </TouchableOpacity>
              <Text style={styles.pageInfo}>{page} / {pagination.totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, page === pagination.totalPages && styles.pageBtnDisabled]}
                onPress={() => setPage(p => p + 1)}
                disabled={page === pagination.totalPages}
              >
                <Text style={styles.pageBtnText}>Next →</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, margin: Spacing.lg,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    borderWidth: 1, borderColor: Colors.border, ...Shadow.sm,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: Colors.text1 },

  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 8, marginBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  filterText: { fontSize: 13, fontWeight: '600', color: Colors.text2 },
  filterTextActive: { color: '#fff' },

  list: { padding: Spacing.lg, paddingTop: 0, paddingBottom: 40 },

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

  paginationRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 12, paddingHorizontal: Spacing.lg,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  pageBtn: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.blue, borderRadius: Radius.md,
  },
  pageBtnDisabled: { backgroundColor: Colors.border },
  pageBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  pageInfo: { fontSize: 13, color: Colors.text3, fontWeight: '600' },
});
