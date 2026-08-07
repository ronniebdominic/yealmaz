import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../../api/client';
import { Colors, Spacing, Radius, FontFamily } from '../../utils/theme';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import GlassCard from '../../components/GlassCard';
import ConfirmDialog from '../../components/ConfirmDialog';

const TABS = ['Rewards', 'History'];

export default function RewardsScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('Rewards');
  const [redeeming, setRedeeming] = useState(null);
  const [redeemTarget, setRedeemTarget] = useState(null);

  const { data: my, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['rewards', 'my'],
    queryFn: () => api.get('/rewards/my').then(r => r.data),
    staleTime: 30_000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ['rewards', 'items'],
    queryFn: () => api.get('/rewards/items').then(r => r.data),
    staleTime: 60_000,
  });

  const available = my?.available ?? 0;
  const refreshing = isRefetching && !isLoading;

  // RN's Alert.alert() doesn't render on web, so redeeming silently did
  // nothing in the PWA before — ConfirmDialog uses RN's <Modal>, which
  // react-native-web does support.
  const handleRedeem = (item) => {
    if (available < item.pointsCost) {
      Toast.show({ type: 'error', text1: 'Not enough points', text2: `You need ${item.pointsCost} pts but have ${available} pts.` });
      return;
    }
    setRedeemTarget(item);
  };

  const confirmRedeem = async () => {
    const item = redeemTarget;
    setRedeemTarget(null);
    if (!item) return;
    setRedeeming(item.id);
    try {
      await api.post('/rewards/redeem', { rewardItemId: item.id });
      queryClient.invalidateQueries({ queryKey: ['rewards', 'my'] });
      Toast.show({ type: 'success', text1: 'Redeemed!', text2: 'Your redemption request has been sent to the lab. They will confirm shortly.' });
    } catch (err) {
      Toast.show({ type: 'error', text1: 'Could not redeem', text2: err.response?.data?.error || 'Please try again.' });
    } finally {
      setRedeeming(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialCommunityIcons name="gift-outline" size={22} color="#fff" />
          <Text style={styles.headerTitle}>Rewards</Text>
        </View>

        {/* Points balance card */}
        <GlassCard dark radius={Radius.lg} style={styles.balanceRow}>
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Available</Text>
            <Text style={[styles.balanceStatValue, { color: '#fff' }]}>{available}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Earned</Text>
            <Text style={[styles.balanceStatValue, { color: Colors.primaryLight }]}>{my?.totalEarned ?? 0}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Redeemed</Text>
            <Text style={[styles.balanceStatValue, { color: 'rgba(255,255,255,0.6)' }]}>{my?.totalRedeemed ?? 0}</Text>
          </View>
        </GlassCard>
        <Text style={styles.balanceHint}>Earn points with every new case you submit</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tabBtn, tab === t && styles.tabBtnActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Rewards catalog ── */}
        {tab === 'Rewards' && (
          <>
            {items.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="gift-outline" size={36} color={Colors.text3} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>No rewards available yet</Text>
                <Text style={styles.emptySub}>The lab will add rewards soon. Keep earning points!</Text>
              </View>
            ) : items.map(item => {
              const canRedeem = available >= item.pointsCost;
              const isRedeeming = redeeming === item.id;
              return (
                <GlassCard strong key={item.id} style={[styles.rewardCard, !canRedeem && styles.rewardCardDim]}>
                  <View style={styles.rewardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rewardName}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.rewardDesc}>{item.description}</Text>
                      ) : null}
                    </View>
                    <View style={styles.costBadge}>
                      <Text style={styles.costValue}>{item.pointsCost}</Text>
                      <Text style={styles.costLabel}>pts</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[styles.redeemBtn, !canRedeem && styles.redeemBtnDisabled, isRedeeming && { opacity: 0.6 }]}
                    onPress={() => handleRedeem(item)}
                    disabled={!canRedeem || !!redeeming}
                    activeOpacity={0.8}
                  >
                    {isRedeeming
                      ? <ActivityIndicator color="#fff" size="small" />
                      : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {canRedeem && <MaterialCommunityIcons name="gift-outline" size={15} color="#fff" />}
                          <Text style={[styles.redeemBtnText, !canRedeem && styles.redeemBtnTextDisabled]}>
                            {canRedeem ? 'Redeem' : `Need ${item.pointsCost - available} more pts`}
                          </Text>
                        </View>
                      )
                    }
                  </TouchableOpacity>
                </GlassCard>
              );
            })}
          </>
        )}

        {/* ── History ── */}
        {tab === 'History' && (
          <>
            {/* Redemption requests */}
            {(my?.redemptions?.length ?? 0) > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>REDEMPTION REQUESTS</Text>
                {my.redemptions.map(r => {
                  const statusColor = r.status === 'APPROVED' ? Colors.green : r.status === 'REJECTED' ? Colors.red : Colors.amber;
                  return (
                    <GlassCard strong key={r.id} style={styles.txRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txDesc}>{r.rewardItem?.name}</Text>
                        <Text style={styles.txDate}>{format(new Date(r.createdAt), 'dd MMM yyyy')}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 12, fontFamily: FontFamily.bold, color: statusColor }}>{r.status}</Text>
                        <Text style={{ fontSize: 12, fontFamily: FontFamily.bold, color: Colors.red, textAlign: 'right' }}>-{r.pointsSpent} pts</Text>
                      </View>
                    </GlassCard>
                  );
                })}
              </View>
            )}

            {/* Transactions */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>POINT TRANSACTIONS</Text>
              {(my?.transactions?.length ?? 0) === 0 ? (
                <Text style={styles.emptyText}>No transactions yet. Submit a case to earn your first points!</Text>
              ) : my.transactions.map(tx => (
                <GlassCard strong key={tx.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txDesc}>{tx.description}</Text>
                    <Text style={styles.txDate}>{format(new Date(tx.createdAt), 'dd MMM yyyy, h:mm a')}</Text>
                  </View>
                  <Text style={[styles.txPoints, { color: tx.points > 0 ? Colors.green : Colors.red }]}>
                    {tx.points > 0 ? '+' : ''}{tx.points} pts
                  </Text>
                </GlassCard>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!redeemTarget}
        title="Redeem Reward"
        message={redeemTarget ? `Redeem "${redeemTarget.name}" for ${redeemTarget.pointsCost} points?` : ''}
        confirmLabel="Redeem"
        onCancel={() => setRedeemTarget(null)}
        onConfirm={confirmRedeem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },

  header: {
    backgroundColor: Colors.primary, paddingTop: 52, paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
  },
  headerTitle: { fontSize: 22, fontFamily: FontFamily.extrabold, color: '#fff' },

  balanceRow: {
    flexDirection: 'row', padding: Spacing.lg,
    marginTop: Spacing.lg, marginBottom: Spacing.sm,
  },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 4 },
  balanceStatLabel: { fontSize: 11, fontFamily: FontFamily.semibold, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  balanceStatValue: { fontSize: 28, fontFamily: FontFamily.extrabold },
  balanceHint: { fontSize: 11, fontFamily: FontFamily.regular, color: 'rgba(255,255,255,0.65)', textAlign: 'center' },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontFamily: FontFamily.semibold, color: Colors.text3 },
  tabTextActive: { color: Colors.primary },

  scroll: { padding: Spacing.lg, paddingBottom: 40 },

  rewardCard: {
    padding: Spacing.lg, marginBottom: Spacing.md,
  },
  rewardCardDim: { opacity: 0.7 },
  rewardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  rewardName: { fontSize: 16, fontFamily: FontFamily.bold, color: Colors.text1, marginBottom: 3 },
  rewardDesc: { fontSize: 12, fontFamily: FontFamily.regular, color: Colors.text3, lineHeight: 17 },
  costBadge: {
    backgroundColor: Colors.primary + '15', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
    marginLeft: Spacing.md, minWidth: 60,
  },
  costValue: { fontSize: 20, fontFamily: FontFamily.extrabold, color: Colors.primaryDark },
  costLabel: { fontSize: 10, fontFamily: FontFamily.bold, color: Colors.primaryDark, marginTop: 1 },
  redeemBtn: {
    backgroundColor: Colors.primary, borderRadius: Radius.md,
    paddingVertical: 11, alignItems: 'center',
  },
  redeemBtnDisabled: { backgroundColor: Colors.surface2 },
  redeemBtnText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },
  redeemBtnTextDisabled: { color: Colors.text3 },

  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    fontSize: 11, fontFamily: FontFamily.bold, color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.md,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: Spacing.md, marginBottom: Spacing.sm,
  },
  txDesc: { fontSize: 13, fontFamily: FontFamily.semibold, color: Colors.text1, marginBottom: 2 },
  txDate: { fontSize: 11, fontFamily: FontFamily.regular, color: Colors.text3 },
  txPoints: { fontSize: 14, fontFamily: FontFamily.extrabold },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: FontFamily.bold, color: Colors.text1, marginBottom: 6 },
  emptySub: { fontSize: 13, fontFamily: FontFamily.regular, color: Colors.text3, textAlign: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 13, fontFamily: FontFamily.regular, color: Colors.text3, fontStyle: 'italic' },
});
