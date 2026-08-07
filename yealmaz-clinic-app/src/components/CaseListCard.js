import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Spacing, Radius, FontFamily, STAGES, PAYMENT_STATUS } from '../utils/theme';
import GlassCard from './GlassCard';

// Shared case-row card — used by both HomeScreen (Recent Cases) and
// CasesScreen (the full list), which used to render two visually
// different card designs (icon-block vs. colored-left-bar). One card,
// one place to change it.
export default function CaseListCard({ c, onPress }) {
  const stage = STAGES[c.status] || STAGES.CASE_ACCEPTED;
  const pay = PAYMENT_STATUS[c.paymentStatus];
  const isOverdue = c.dueDate && new Date(c.dueDate) < new Date() && !['DELIVERED', 'CANCELLED'].includes(c.status);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.88}>
      <GlassCard strong style={styles.card}>
        <View style={[styles.iconBlock, { backgroundColor: stage.color + '18', borderColor: stage.color + '40' }]}>
          <MaterialCommunityIcons name={stage.icon} size={22} color={stage.color} />
        </View>
        <View style={styles.body}>
          <View style={styles.top}>
            <Text style={styles.patient} numberOfLines={1}>{c.patientName}</Text>
            <View style={[styles.stagePill, { backgroundColor: stage.color + '18' }]}>
              <Text style={[styles.stagePillText, { color: stage.color }]}>{stage.label}</Text>
            </View>
          </View>
          <Text style={styles.caseNumber}>{c.caseNumber || 'Scan # Pending'} · {c.workType}</Text>
          <View style={styles.bottom}>
            {pay && (
              <View style={[styles.payPill, { backgroundColor: pay.bg }]}>
                <Text style={[styles.payPillText, { color: pay.color }]}>{pay.label}</Text>
              </View>
            )}
            {isOverdue && (
              <View style={styles.overduePill}>
                <MaterialCommunityIcons name="alert-outline" size={11} color={Colors.red} />
                <Text style={styles.overdueText}>Overdue</Text>
              </View>
            )}
            {c.dueDate && <Text style={styles.dueDate}>Due {format(new Date(c.dueDate), 'dd MMM')}</Text>}
          </View>
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', marginBottom: 10, overflow: 'hidden' },
  iconBlock: { width: 56, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1 },
  body: { flex: 1, padding: Spacing.md },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3, gap: 8 },
  patient: { fontSize: 15, fontFamily: FontFamily.bold, color: Colors.text1, flex: 1 },
  caseNumber: { fontSize: 12, color: Colors.text3, fontFamily: 'monospace', marginBottom: 8 },
  stagePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.full },
  stagePillText: { fontSize: 10, fontFamily: FontFamily.bold },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  payPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  payPillText: { fontSize: 10, fontFamily: FontFamily.semibold },
  overduePill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.redDim, paddingHorizontal: 8, paddingVertical: 2, borderRadius: Radius.full },
  overdueText: { fontSize: 10, fontFamily: FontFamily.semibold, color: Colors.red },
  dueDate: { fontSize: 11, fontFamily: FontFamily.regular, color: Colors.text3 },
});
