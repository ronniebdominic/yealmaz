import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../../api/client';
import { Colors, Spacing, Radius, FontFamily } from '../../utils/theme';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import GlassCard from '../../components/GlassCard';
import CaseListCard from '../../components/CaseListCard';

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

  const renderCase = ({ item: c }) => (
    <CaseListCard c={c} onPress={() => navigation.navigate('CaseDetail', { caseId: c.id })} />
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Cases</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('NewCase')}>
          <MaterialCommunityIcons name="plus" size={15} color={Colors.primaryDark} />
          <Text style={styles.newBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <GlassCard strong style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={18} color={Colors.text3} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient or case number…"
          placeholderTextColor={Colors.text3}
          value={search}
          onChangeText={changeSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => changeSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={17} color={Colors.text3} />
          </TouchableOpacity>
        ) : null}
      </GlassCard>

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
        <View style={styles.errorBanner}>
          <MaterialCommunityIcons name="wifi-off" size={15} color="#ef9a9a" />
          <Text style={styles.errorBannerText}>Cannot reach server — check your network.</Text>
        </View>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
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
                tintColor={Colors.primary}
              />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <MaterialCommunityIcons name="inbox-outline" size={40} color={Colors.text3} style={{ marginBottom: 12 }} />
                <Text style={{ fontSize: 16, fontFamily: FontFamily.bold, color: Colors.text1 }}>No cases found</Text>
                <Text style={{ fontSize: 13, fontFamily: FontFamily.regular, color: Colors.text3, marginTop: 4 }}>Try a different filter or search</Text>
              </View>
            }
          />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <GlassCard strong radius={0} style={styles.paginationRow}>
              <TouchableOpacity
                style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
                onPress={() => setPage(p => p - 1)}
                disabled={page === 1}
              >
                <MaterialCommunityIcons name="chevron-left" size={16} color="#fff" />
                <Text style={styles.pageBtnText}>Prev</Text>
              </TouchableOpacity>
              <Text style={styles.pageInfo}>{page} / {pagination.totalPages}</Text>
              <TouchableOpacity
                style={[styles.pageBtn, page === pagination.totalPages && styles.pageBtnDisabled]}
                onPress={() => setPage(p => p + 1)}
                disabled={page === pagination.totalPages}
              >
                <Text style={styles.pageBtnText}>Next</Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color="#fff" />
              </TouchableOpacity>
            </GlassCard>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    backgroundColor: Colors.primary, paddingTop: 52,
    paddingBottom: 16, paddingHorizontal: Spacing.xl,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
  },
  headerTitle: { fontSize: 22, fontFamily: FontFamily.extrabold, color: '#fff' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: Radius.full, paddingHorizontal: 14, paddingVertical: 7,
  },
  newBtnText: { fontSize: 13, fontFamily: FontFamily.bold, color: Colors.primaryDark },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: Spacing.lg,
    paddingHorizontal: Spacing.md,
  },
  searchInput: { flex: 1, height: 44, fontSize: 14, fontFamily: FontFamily.regular, color: Colors.text1 },

  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.lg, gap: 8, marginBottom: Spacing.md },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: Radius.full,
    backgroundColor: 'rgba(255,255,255,0.7)', borderWidth: 1.5, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 13, fontFamily: FontFamily.semibold, color: Colors.text2 },
  filterTextActive: { color: '#fff' },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: Spacing.lg, marginTop: 0,
    backgroundColor: '#3d1a1a', borderRadius: Radius.md, padding: Spacing.md,
    borderWidth: 1, borderColor: 'rgba(198,40,40,0.4)',
  },
  errorBannerText: { fontSize: 12, fontFamily: FontFamily.regular, color: '#ef9a9a', lineHeight: 17, flexShrink: 1 },

  list: { padding: Spacing.lg, paddingTop: 0, paddingBottom: 40 },

  empty: { alignItems: 'center', marginTop: 60 },

  paginationRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 12, paddingHorizontal: Spacing.lg,
  },
  pageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: Colors.primary, borderRadius: Radius.md,
  },
  pageBtnDisabled: { backgroundColor: Colors.text3 },
  pageBtnText: { fontSize: 13, fontFamily: FontFamily.bold, color: '#fff' },
  pageInfo: { fontSize: 13, color: Colors.text3, fontFamily: FontFamily.semibold },
});
