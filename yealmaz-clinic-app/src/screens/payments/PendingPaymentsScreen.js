import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Alert, Platform,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api from '../../api/client';
import { Colors, Spacing, Radius, FontFamily } from '../../utils/theme';
import GlassCard from '../../components/GlassCard';
import { useLanguage } from '../../context/LanguageContext';

const br = (n) => `Br ${Number(n || 0).toLocaleString('en-US')}`;

export default function PendingPaymentsScreen({ navigation }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['payments', 'my-pending'],
    queryFn: () => api.get('/payments/my-pending').then(r => r.data),
    refetchInterval: 60_000,
  });
  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get('/wallet').then(r => r.data),
  });

  React.useEffect(() => {
    const unsub = navigation.addListener('focus', () => refetch());
    return unsub;
  }, [navigation, refetch]);

  const cases = data?.cases || [];
  // A case with a receipt already awaiting Finance can't be paid again.
  const payable = cases.filter(c => c.paymentStatus !== 'SCREENSHOT_UPLOADED');
  const chosen = payable.filter(c => selected[c.id]);
  const chosenTotal = chosen.reduce((s, c) => s + c.amountDue, 0);
  const allSelected = payable.length > 0 && chosen.length === payable.length;
  const balance = wallet?.balance || 0;

  const toggle = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));
  const toggleAll = () => setSelected(allSelected ? {} : Object.fromEntries(payable.map(c => [c.id, true])));

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['payments'] });
    queryClient.invalidateQueries({ queryKey: ['wallet'] });
    queryClient.invalidateQueries({ queryKey: ['cases'] });
  };

  const payChapa = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    // Open the tab NOW, inside the tap — browsers block a window opened after an await.
    const popup = Platform.OS === 'web' ? window.open('', '_blank') : null;
    try {
      const res = await api.post('/wallet/pay-cases/chapa/initialize', { caseIds: chosen.map(c => c.id) });
      const { checkoutUrl, txRef } = res.data || {};
      if (!checkoutUrl) throw new Error(t('common.genericError'));
      if (Platform.OS === 'web') { if (popup) popup.location.href = checkoutUrl; else window.location.href = checkoutUrl; }
      else await WebBrowser.openBrowserAsync(checkoutUrl);
      setSelected({});
      (async () => {
        for (const wait of [0, 2000, 4000]) {
          if (wait) await new Promise(r => setTimeout(r, wait));
          try {
            const s = await api.get(`/wallet/chapa/status/${txRef}`, { timeout: 5000 });
            if (s.data?.status === 'APPROVED') { Alert.alert(t('pending.paidTitle'), t('pending.paidMsg')); break; }
          } catch { /* keep trying */ }
        }
        refreshAll();
      })();
    } catch (err) {
      if (popup) popup.close();
      Alert.alert(t('wallet.failed'), err.response?.data?.error || err.message || t('common.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const payBalance = async () => {
    if (!chosen.length || busy) return;
    setBusy(true);
    try {
      const res = await api.post('/wallet/pay-cases', { caseIds: chosen.map(c => c.id) });
      Alert.alert(t('pending.paidTitle'), t('pending.paidFromBalance', { amount: br(res.data.applied) }));
      setSelected({});
      refreshAll();
    } catch (err) {
      Alert.alert(t('wallet.failed'), err.response?.data?.error || err.message || t('common.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const renderItem = ({ item: c }) => {
    const locked = c.paymentStatus === 'SCREENSHOT_UPLOADED';
    const on = !!selected[c.id];
    return (
      <GlassCard style={styles.row}>
        <TouchableOpacity disabled={locked} onPress={() => toggle(c.id)} style={styles.check}>
          <MaterialCommunityIcons
            name={locked ? 'clock-outline' : on ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={24} color={locked ? Colors.amber : on ? Colors.primary : Colors.text3}
          />
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('CaseDetail', { caseId: c.id })}>
          <Text style={styles.caseNo}>{c.caseNumber || '—'} · {c.patientName}</Text>
          <Text style={styles.sub}>
            {c.workType}{c.deliveryDate ? ` · ${format(new Date(c.deliveryDate), 'dd MMM yyyy')}` : ''}
          </Text>
          {locked ? <Text style={[styles.sub, { color: Colors.amber }]}>{t('pending.awaitingReview')}</Text> : null}
        </TouchableOpacity>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.amount}>{br(c.amountDue)}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('CaseDetail', { caseId: c.id })}>
            <Text style={styles.payOne}>{t('pending.payThis')}</Text>
          </TouchableOpacity>
        </View>
      </GlassCard>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('pending.title')}</Text>
          <Text style={styles.headerSub}>{t('pending.summary', { count: data?.count || 0, total: br(data?.total) })}</Text>
        </View>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={cases}
          keyExtractor={c => c.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: Spacing.lg, paddingBottom: 190 }}
          refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={Colors.primary} />}
          ListHeaderComponent={
            <>
              {cases.length > 0 && (
                <GlassCard strong style={styles.summaryCard}>
                  <View style={styles.summaryRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.summaryLabel}>{t('pending.totalOwed')}</Text>
                      <Text style={styles.summaryTotal}>{br(data?.total)}</Text>
                    </View>
                    <View style={styles.summaryDivider} />
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.summaryLabel}>{t('pending.unpaidCases')}</Text>
                      <Text style={styles.summaryCount}>{data?.count || 0}</Text>
                    </View>
                  </View>
                  {balance > 0 && (
                    <View style={styles.summaryBalance}>
                      <MaterialCommunityIcons name="wallet-outline" size={16} color={Colors.green} />
                      <Text style={styles.summaryBalanceText}>
                        {t('pending.advanceAvailable', { amount: br(balance) })}
                      </Text>
                    </View>
                  )}
                </GlassCard>
              )}
              {payable.length > 1 ? (
                <TouchableOpacity onPress={toggleAll} style={styles.selectAll}>
                  <MaterialCommunityIcons name={allSelected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} color={Colors.primary} />
                  <Text style={styles.selectAllText}>{t('pending.selectAll')}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <MaterialCommunityIcons name="check-circle-outline" size={44} color={Colors.green} />
              <Text style={styles.emptyTitle}>{t('pending.emptyTitle')}</Text>
              <Text style={styles.sub}>{t('pending.emptySub')}</Text>
            </View>
          }
        />
      )}

      {chosen.length > 0 && (
        <GlassCard strong radius={0} style={styles.bar}>
          <Text style={styles.barTotal}>{t('pending.selected', { count: chosen.length, total: br(chosenTotal) })}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[styles.cta, { flex: 1 }, busy && { opacity: 0.6 }]} onPress={payChapa} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{t('pending.payChapa')}</Text>}
            </TouchableOpacity>
            {balance > 0 && (
              <TouchableOpacity style={[styles.cta, styles.ctaAlt, busy && { opacity: 0.6 }]} onPress={payBalance} disabled={busy}>
                <Text style={[styles.ctaText, { color: Colors.primary }]}>{t('pending.payBalance', { amount: br(balance) })}</Text>
              </TouchableOpacity>
            )}
          </View>
        </GlassCard>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    backgroundColor: Colors.primary, paddingTop: 52, paddingBottom: 18, paddingHorizontal: Spacing.xl,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
  },
  headerTitle: { fontSize: 20, fontFamily: FontFamily.extrabold, color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  summaryCard: { padding: Spacing.lg, marginBottom: Spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  summaryDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Colors.border },
  summaryLabel: { fontSize: 12, fontFamily: FontFamily.medium, color: Colors.text3 },
  summaryTotal: { fontSize: 24, fontFamily: FontFamily.extrabold, color: Colors.red, marginTop: 2 },
  summaryCount: { fontSize: 24, fontFamily: FontFamily.extrabold, color: Colors.text1, marginTop: 2 },
  summaryBalance: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.md, paddingTop: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
  summaryBalanceText: { fontSize: 12, fontFamily: FontFamily.semibold, color: Colors.green, flexShrink: 1 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 4 },
  selectAllText: { fontSize: 14, fontFamily: FontFamily.semibold, color: Colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: Spacing.md, marginBottom: Spacing.sm },
  check: { padding: 2 },
  caseNo: { fontSize: 14, fontFamily: FontFamily.semibold, color: Colors.text1 },
  sub: { fontSize: 12, color: Colors.text3, marginTop: 2 },
  amount: { fontSize: 15, fontFamily: FontFamily.bold, color: Colors.red },
  payOne: { fontSize: 12, fontFamily: FontFamily.semibold, color: Colors.primary, marginTop: 4 },
  emptyTitle: { fontSize: 16, fontFamily: FontFamily.bold, color: Colors.text1, marginTop: 10 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 60, padding: Spacing.md, gap: 8 },
  barTotal: { fontSize: 14, fontFamily: FontFamily.bold, color: Colors.text1 },
  cta: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 13, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  ctaAlt: { backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.primary },
  ctaText: { color: '#fff', fontFamily: FontFamily.bold, fontSize: 14 },
});
