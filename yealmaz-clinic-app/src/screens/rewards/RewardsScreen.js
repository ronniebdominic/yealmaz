import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const TABS = ['Rewards', 'History'];

export default function RewardsScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('Rewards');
  const [redeeming, setRedeeming] = useState(null);

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

  const handleRedeem = (item) => {
    if (available < item.pointsCost) {
      Alert.alert('Not Enough Points', `You need ${item.pointsCost} pts but have ${available} pts.`);
      return;
    }
    Alert.alert(
      'Redeem Reward',
      `Redeem "${item.name}" for ${item.pointsCost} points?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeeming(item.id);
            try {
              await api.post('/rewards/redeem', { rewardItemId: item.id });
              queryClient.invalidateQueries({ queryKey: ['rewards', 'my'] });
              Alert.alert('✅ Redeemed!', 'Your redemption request has been sent to the lab. They will confirm shortly.');
            } catch (err) {
              Alert.alert('Failed', err.response?.data?.error || 'Could not redeem. Please try again.');
            } finally {
              setRedeeming(null);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.blue} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎁 Rewards</Text>
      </View>

      {/* Points balance card */}
      <View style={styles.balanceCard}>
        <View style={styles.balanceRow}>
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Available</Text>
            <Text style={[styles.balanceStatValue, { color: '#fff' }]}>{available}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Earned</Text>
            <Text style={[styles.balanceStatValue, { color: Colors.accent }]}>{my?.totalEarned ?? 0}</Text>
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceStat}>
            <Text style={styles.balanceStatLabel}>Redeemed</Text>
            <Text style={[styles.balanceStatValue, { color: 'rgba(255,255,255,0.6)' }]}>{my?.totalRedeemed ?? 0}</Text>
          </View>
        </View>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Rewards catalog ── */}
        {tab === 'Rewards' && (
          <>
            {items.length === 0 ? (
              <View style={styles.empty}>
                <Text style={{ fontSize: 36, marginBottom: 12 }}>🎁</Text>
                <Text style={styles.emptyTitle}>No rewards available yet</Text>
                <Text style={styles.emptySub}>The lab will add rewards soon. Keep earning points!</Text>
              </View>
            ) : items.map(item => {
              const canRedeem = available >= item.pointsCost;
              const isRedeeming = redeeming === item.id;
              return (
                <View key={item.id} style={[styles.rewardCard, !canRedeem && styles.rewardCardDim]}>
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
                      : <Text style={[styles.redeemBtnText, !canRedeem && styles.redeemBtnTextDisabled]}>
                          {canRedeem ? '🎁 Redeem' : `Need ${item.pointsCost - available} more pts`}
                        </Text>
                    }
                  </TouchableOpacity>
                </View>
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
                    <View key={r.id} style={styles.txRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txDesc}>{r.rewardItem?.name}</Text>
                        <Text style={styles.txDate}>{format(new Date(r.createdAt), 'dd MMM yyyy')}</Text>
                      </View>
                      <View>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: statusColor }}>{r.status}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.red, textAlign: 'right' }}>-{r.pointsSpent} pts</Text>
                      </View>
                    </View>
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
                <View key={tx.id} style={styles.txRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txDesc}>{tx.description}</Text>
                    <Text style={styles.txDate}>{format(new Date(tx.createdAt), 'dd MMM yyyy, h:mm a')}</Text>
                  </View>
                  <Text style={[styles.txPoints, { color: tx.points > 0 ? Colors.green : Colors.red }]}>
                    {tx.points > 0 ? '+' : ''}{tx.points} pts
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },

  header: {
    backgroundColor: Colors.navy, paddingTop: 52, paddingBottom: 16,
    paddingHorizontal: Spacing.xl,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },

  balanceCard: {
    backgroundColor: Colors.navy, paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  balanceRow: {
    flexDirection: 'row', backgroundColor: Colors.navyMid,
    borderRadius: Radius.lg, padding: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  balanceStat: { flex: 1, alignItems: 'center' },
  balanceDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.12)', marginVertical: 4 },
  balanceStatLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginBottom: 4 },
  balanceStatValue: { fontSize: 28, fontWeight: '800' },
  balanceHint: { fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center' },

  tabBar: {
    flexDirection: 'row', backgroundColor: Colors.surface,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive: { borderBottomColor: Colors.blue },
  tabText: { fontSize: 13, fontWeight: '600', color: Colors.text3 },
  tabTextActive: { color: Colors.blue },

  scroll: { padding: Spacing.lg, paddingBottom: 40 },

  rewardCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm,
  },
  rewardCardDim: { opacity: 0.7 },
  rewardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  rewardName: { fontSize: 16, fontWeight: '700', color: Colors.text1, marginBottom: 3 },
  rewardDesc: { fontSize: 12, color: Colors.text3, lineHeight: 17 },
  costBadge: {
    backgroundColor: Colors.blue + '15', borderRadius: Radius.md,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
    marginLeft: Spacing.md, minWidth: 60,
  },
  costValue: { fontSize: 20, fontWeight: '800', color: Colors.blue },
  costLabel: { fontSize: 10, fontWeight: '700', color: Colors.blue, marginTop: 1 },
  redeemBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingVertical: 11, alignItems: 'center',
  },
  redeemBtnDisabled: { backgroundColor: Colors.surface2 },
  redeemBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  redeemBtnTextDisabled: { color: Colors.text3 },

  section: { marginBottom: Spacing.xl },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: Spacing.md,
  },
  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: Spacing.sm, ...Shadow.sm,
  },
  txDesc: { fontSize: 13, fontWeight: '600', color: Colors.text1, marginBottom: 2 },
  txDate: { fontSize: 11, color: Colors.text3 },
  txPoints: { fontSize: 14, fontWeight: '800' },

  empty: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text1, marginBottom: 6 },
  emptySub: { fontSize: 13, color: Colors.text3, textAlign: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 13, color: Colors.text3, fontStyle: 'italic' },
});
