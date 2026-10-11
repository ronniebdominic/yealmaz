import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, StatusBar, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import api, { API_BASE } from '../../api/client';
import { Colors, Spacing, Radius, FontFamily } from '../../utils/theme';
import GlassCard from '../../components/GlassCard';
import { useLanguage } from '../../context/LanguageContext';

const br = (n) => `Br ${Number(n || 0).toLocaleString('en-US')}`;

export default function WalletScreen({ navigation }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [method, setMethod] = useState(null); // null | 'CHAPA' | 'CASH'
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api.get('/wallet').then(r => r.data),
    refetchInterval: 30_000,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['wallet'] });
  const parsedAmount = parseFloat(amount);
  const amountOk = Number.isFinite(parsedAmount) && parsedAmount > 0;

  const reset = () => { setMethod(null); setAmount(''); setReference(''); setReceipt(null); };

  const pickReceipt = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (!result.canceled) setReceipt(result.assets[0]);
  };

  // Same reconcile-with-backoff idea as CaseDetailScreen's Chapa flow.
  const confirmChapa = async (txRef) => {
    for (const wait of [0, 2000, 4000]) {
      if (wait) await new Promise(r => setTimeout(r, wait));
      try {
        const res = await api.get(`/wallet/chapa/status/${txRef}`, { timeout: 5000 });
        if (res.data?.status === 'APPROVED') return true;
      } catch { /* keep trying */ }
    }
    return false;
  };

  const payChapa = async () => {
    if (!amountOk || busy) { if (!amountOk) Alert.alert(t('wallet.failed'), t('wallet.invalidAmount')); return; }
    setBusy(true);
    try {
      const res = await api.post('/wallet/topup/chapa/initialize', { amount: parsedAmount });
      const { checkoutUrl, txRef } = res.data || {};
      if (!checkoutUrl) throw new Error(t('common.genericError'));
      if (Platform.OS === 'web') window.open(checkoutUrl, '_blank', 'noopener');
      else await WebBrowser.openBrowserAsync(checkoutUrl);
      reset();
      confirmChapa(txRef).then((ok) => {
        if (ok) Alert.alert(t('wallet.creditedTitle'), t('wallet.creditedMsg'));
        refresh();
      });
    } catch (err) {
      Alert.alert(t('wallet.failed'), err.response?.data?.error || err.message || t('common.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const submitCash = async () => {
    if (!amountOk || busy) { if (!amountOk) Alert.alert(t('wallet.failed'), t('wallet.invalidAmount')); return; }
    setBusy(true);
    try {
      const token = await AsyncStorage.getItem('ya_clinic_token');
      const form = new FormData();
      form.append('amount', String(parsedAmount));
      if (reference.trim()) form.append('reference', reference.trim());
      if (receipt) {
        if (Platform.OS === 'web') {
          if (receipt.file) form.append('screenshot', receipt.file, 'topup.jpg');
          else form.append('screenshot', await (await fetch(receipt.uri)).blob(), 'topup.jpg');
        } else {
          form.append('screenshot', { uri: receipt.uri, type: receipt.mimeType || 'image/jpeg', name: 'topup.jpg' });
        }
      }
      const res = await fetch(`${API_BASE}/wallet/topup/cash`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
      Alert.alert(t('wallet.submittedTitle'), t('wallet.submittedMsg'));
      reset();
      refresh();
    } catch (err) {
      Alert.alert(t('wallet.failed'), err.message || t('common.genericError'));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (s) => (s === 'PENDING' ? t('wallet.pendingApproval') : s === 'REJECTED' ? t('wallet.rejected') : t('wallet.approved'));
  const statusColor = (s) => (s === 'PENDING' ? Colors.amber : s === 'REJECTED' ? Colors.red : Colors.green);
  const typeLabel = (x) => ({ TOPUP: t('wallet.typeTopup'), DEDUCTION: t('wallet.typeDeduction'), ADJUSTMENT: t('wallet.typeAdjustment'), REFUND: t('wallet.typeRefund') }[x] || x);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('wallet.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard strong style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('wallet.balance')}</Text>
          {isLoading ? <ActivityIndicator color={Colors.primary} /> : <Text style={styles.balanceValue}>{br(data?.balance)}</Text>}
          <Text style={styles.balanceHint}>{t('wallet.balanceHint')}</Text>
        </GlassCard>

        <GlassCard strong style={styles.card}>
          <Text style={styles.sectionTitle}>{t('wallet.topUp')}</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder={t('wallet.amount')}
            placeholderTextColor={Colors.text3}
            keyboardType="numeric"
          />
          <View style={styles.methodRow}>
            <TouchableOpacity style={[styles.methodBtn, method === 'CHAPA' && styles.methodActive]} onPress={() => setMethod('CHAPA')}>
              <MaterialCommunityIcons name="credit-card-outline" size={18} color={method === 'CHAPA' ? '#fff' : Colors.primary} />
              <Text style={[styles.methodText, method === 'CHAPA' && { color: '#fff' }]}>{t('wallet.payWithChapa')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.methodBtn, method === 'CASH' && styles.methodActive]} onPress={() => setMethod('CASH')}>
              <MaterialCommunityIcons name="cash" size={18} color={method === 'CASH' ? '#fff' : Colors.primary} />
              <Text style={[styles.methodText, method === 'CASH' && { color: '#fff' }]}>{t('wallet.payWithCash')}</Text>
            </TouchableOpacity>
          </View>

          {method === 'CHAPA' && (
            <TouchableOpacity style={[styles.cta, busy && { opacity: 0.6 }]} onPress={payChapa} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{t('wallet.topUp')}</Text>}
            </TouchableOpacity>
          )}

          {method === 'CASH' && (
            <View style={{ gap: Spacing.sm }}>
              <Text style={styles.hint}>{t('wallet.cashHint')}</Text>
              <TextInput
                style={styles.input}
                value={reference}
                onChangeText={setReference}
                placeholder={t('wallet.reference')}
                placeholderTextColor={Colors.text3}
              />
              <TouchableOpacity style={styles.attachBtn} onPress={pickReceipt}>
                <MaterialCommunityIcons name="paperclip" size={18} color={Colors.primary} />
                <Text style={styles.methodText}>{t('wallet.attachReceipt')}</Text>
              </TouchableOpacity>
              {receipt ? <Image source={{ uri: receipt.uri }} style={styles.receipt} resizeMode="cover" /> : null}
              <TouchableOpacity style={[styles.cta, busy && { opacity: 0.6 }]} onPress={submitCash} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>{t('wallet.submit')}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </GlassCard>

        <Text style={styles.sectionTitle}>{t('wallet.history')}</Text>
        {!isLoading && (data?.transactions || []).length === 0 ? (
          <Text style={styles.hint}>{t('wallet.empty')}</Text>
        ) : (
          (data?.transactions || []).map(tx => {
            const credit = tx.type === 'TOPUP' || tx.type === 'REFUND' ? tx.type === 'TOPUP' : (tx.note || '').startsWith('+');
            return (
              <GlassCard key={tx.id} style={styles.txRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.txTitle}>{typeLabel(tx.type)}{tx.method ? ` · ${tx.method === 'CHAPA' ? 'Chapa' : 'Cash'}` : ''}</Text>
                  <Text style={styles.txSub}>{format(new Date(tx.createdAt), 'dd MMM yyyy, HH:mm')}</Text>
                  {tx.status !== 'APPROVED' ? <Text style={[styles.txStatus, { color: statusColor(tx.status) }]}>{statusLabel(tx.status)}</Text> : null}
                  {tx.status === 'REJECTED' && tx.rejectionReason ? <Text style={styles.txSub}>{tx.rejectionReason}</Text> : null}
                </View>
                <Text style={[styles.txAmount, { color: tx.status !== 'APPROVED' ? Colors.text3 : credit ? Colors.green : Colors.red }]}>
                  {credit ? '+' : '-'}{br(tx.amount)}
                </Text>
              </GlassCard>
            );
          })
        )}
      </ScrollView>
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
  back: { padding: 4 },
  headerTitle: { fontSize: 20, fontFamily: FontFamily.extrabold, color: '#fff' },
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  balanceCard: { padding: Spacing.xl, alignItems: 'center', gap: 6 },
  balanceLabel: { fontSize: 13, color: Colors.text2, fontFamily: FontFamily.medium },
  balanceValue: { fontSize: 32, color: Colors.primary, fontFamily: FontFamily.extrabold },
  balanceHint: { fontSize: 12, color: Colors.text3, textAlign: 'center' },
  card: { padding: Spacing.lg, gap: Spacing.md },
  sectionTitle: { fontSize: 16, fontFamily: FontFamily.bold, color: Colors.text1 },
  input: {
    borderWidth: 1, borderColor: Colors.glassBorder, borderRadius: Radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text1, backgroundColor: 'rgba(255,255,255,0.6)',
  },
  methodRow: { gap: Spacing.sm },
  methodBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12,
    borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.primary,
  },
  methodActive: { backgroundColor: Colors.primary },
  methodText: { fontSize: 13, color: Colors.primary, fontFamily: FontFamily.semibold, flexShrink: 1 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 },
  receipt: { width: '100%', height: 160, borderRadius: Radius.md },
  cta: { backgroundColor: Colors.primary, borderRadius: Radius.md, paddingVertical: 14, alignItems: 'center' },
  ctaText: { color: '#fff', fontFamily: FontFamily.bold, fontSize: 15 },
  hint: { fontSize: 12, color: Colors.text3 },
  txRow: { padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: 12 },
  txTitle: { fontSize: 14, fontFamily: FontFamily.semibold, color: Colors.text1 },
  txSub: { fontSize: 11, color: Colors.text3, marginTop: 2 },
  txStatus: { fontSize: 11, fontFamily: FontFamily.semibold, marginTop: 2 },
  txAmount: { fontSize: 15, fontFamily: FontFamily.bold },
});
