import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Alert,
  Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow, STAGES, PAYMENT_STATUS } from '../../utils/theme';
import { format } from 'date-fns';

const STAGE_ORDER = [
  'CASE_ACCEPTED',
  'PLASTER_DEPARTMENT', 'MARGIN_DEPARTMENT',
  'SCANNING', 'DESIGNING',
  'MILLING_SINTERING', 'RESIN_3D_PRINTING', 'METAL_3D_PRINTING',
  'METAL_FINISHING', 'OPAQUE_APPLICATION',
  'CERAMIC_LAYERING', 'ZIRCONIA_FITTING_FINISHING',
  'GLAZING', 'THERMO_PRESS', 'TRIMMING',
  'QUALITY_CHECK', 'PAYMENT_INVOICING',
  'READY_TO_DISPATCH', 'OUT_FOR_DELIVERY', 'DELIVERED',
];

function InfoRow({ label, value, valueColor }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ status }) {
  const currentStep = STAGES[status]?.step ?? 0;
  const total = 15;

  return (
    <View style={styles.progressWrap}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(5, (currentStep / total) * 100)}%` }]} />
      </View>
      <View style={styles.progressSteps}>
        {STAGE_ORDER.map((s, i) => {
          const stage = STAGES[s];
          const done = i <= currentStep;
          const current = s === status;
          return (
            <View key={s} style={styles.progressStep}>
              <View style={[
                styles.stepDot,
                done && styles.stepDotDone,
                current && styles.stepDotCurrent,
              ]}>
                <Text style={styles.stepIcon}>{done ? stage.icon : '○'}</Text>
              </View>
              <Text style={[styles.stepLabel, current && { color: stage.color, fontWeight: '700' }]} numberOfLines={2}>
                {stage.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function CaseDetailScreen({ navigation, route }) {
  const { caseId } = route.params;
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [loadError, setLoadError] = useState('');

  const loadCase = useCallback(async () => {
    try {
      setLoadError('');
      const res = await api.get(`/cases/${caseId}`);
      setCaseData(res.data);
    } catch (err) {
      const msg = err.response
        ? `Server error ${err.response.status}: ${err.response.data?.error || err.response.statusText}`
        : 'Cannot reach server — check your network and API_BASE in client.js';
      setLoadError(msg);
      console.error('[CaseDetail] loadCase failed:', msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadCase();
    const interval = setInterval(loadCase, 15000);
    return () => clearInterval(interval);
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos to upload payment screenshot.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setScreenshot(result.assets[0]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) {
      setScreenshot(result.assets[0]);
    }
  };

  const uploadPayment = async () => {
    if (!screenshot) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('screenshot', {
        uri: screenshot.uri,
        type: 'image/jpeg',
        name: `payment_${caseId}.jpg`,
      });
      await api.post(`/payments/${caseId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      Alert.alert('✅ Uploaded!', 'Your payment screenshot has been submitted for verification.');
      setScreenshot(null);
      loadCase();
    } catch (err) {
      Alert.alert('Upload Failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={Colors.blue} size="large" />
      </View>
    );
  }

  if (loadError || !caseData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={{ fontSize: 32, marginBottom: 12 }}>⚠️</Text>
        <Text style={{ color: Colors.text1, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>
          {loadError ? 'Failed to load case' : 'Case not found'}
        </Text>
        {loadError ? (
          <Text style={{ color: '#ef9a9a', fontSize: 12, textAlign: 'center', paddingHorizontal: 32 }}>{loadError}</Text>
        ) : null}
      </View>
    );
  }

  const stage = STAGES[caseData.status] || STAGES.CASE_ACCEPTED;
  const pay = PAYMENT_STATUS[caseData.paymentStatus];
  const canUploadPayment = !['VERIFIED'].includes(caseData.paymentStatus);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{caseData.patientName}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadCase(); }} tintColor={Colors.accent} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Status Hero ── */}
        <View style={[styles.statusHero, { backgroundColor: stage.color }]}>
          <Text style={styles.statusHeroIcon}>{stage.icon}</Text>
          <Text style={styles.statusHeroLabel}>{stage.label}</Text>
          <Text style={styles.statusHeroCase}>{caseData.caseNumber}</Text>
        </View>

        {/* ── Progress bar ── */}
        <View style={[styles.card, { padding: Spacing.lg }]}>
          <Text style={styles.sectionLabel}>PRODUCTION PROGRESS</Text>
          <ProgressBar status={caseData.status} />
        </View>

        {/* ── Case Info ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Case Details</Text>
          <InfoRow label="Patient" value={caseData.patientName} />
          <InfoRow label="Work Type" value={caseData.workType} />
          <InfoRow label="Tooth Numbers" value={caseData.toothNumbers} />
          <InfoRow label="Shade" value={caseData.shade} />
          <InfoRow label="Due Date" value={caseData.dueDate ? format(new Date(caseData.dueDate), 'dd MMMM yyyy') : null} />
          {caseData.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{caseData.notes}</Text>
            </View>
          )}
        </View>

        {/* ── Invoice Card ── */}
        {caseData.payment?.invoiceNumber ? (
          <View style={styles.card}>
            <View style={styles.invoiceHeader}>
              <View>
                <Text style={styles.invoiceTitle}>Invoice</Text>
                <Text style={styles.invoiceNumber}>{caseData.payment.invoiceNumber}</Text>
              </View>
              <View style={[styles.invoiceAmountBadge, { backgroundColor: Colors.blue + '15' }]}>
                <Text style={styles.invoiceAmountLabel}>Amount Due</Text>
                <Text style={styles.invoiceAmount}>
                  ₹{(caseData.payment.amount ?? caseData.totalAmount ?? 0).toLocaleString('en-IN')}
                </Text>
              </View>
            </View>

            <View style={styles.invoiceDivider} />

            <View style={styles.invoiceRows}>
              <View style={styles.invoiceRow}>
                <Text style={styles.invoiceRowLabel}>Work Type</Text>
                <Text style={styles.invoiceRowValue}>{caseData.workType}</Text>
              </View>
              {caseData.toothNumbers ? (
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceRowLabel}>Tooth Numbers</Text>
                  <Text style={styles.invoiceRowValue}>{caseData.toothNumbers}</Text>
                </View>
              ) : null}
              {caseData.shade ? (
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceRowLabel}>Shade</Text>
                  <Text style={styles.invoiceRowValue}>{caseData.shade}</Text>
                </View>
              ) : null}
              {caseData.payment.invoiceIssuedAt ? (
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceRowLabel}>Issued</Text>
                  <Text style={styles.invoiceRowValue}>
                    {format(new Date(caseData.payment.invoiceIssuedAt), 'dd MMM yyyy')}
                  </Text>
                </View>
              ) : null}
            </View>

            {caseData.payment.invoiceNotes ? (
              <View style={styles.invoiceNotesBox}>
                <Text style={styles.invoiceNotesText}>{caseData.payment.invoiceNotes}</Text>
              </View>
            ) : null}

            {/* Payment status inside invoice card */}
            <View style={[styles.payStatusBadge, { backgroundColor: pay?.bg, marginTop: Spacing.md }]}>
              <Text style={[styles.payStatusText, { color: pay?.color }]}>{pay?.label}</Text>
            </View>
          </View>
        ) : caseData.totalAmount ? (
          /* Amount set but no invoice issued yet */
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Payment</Text>
            <View style={[styles.payStatusBadge, { backgroundColor: pay?.bg }]}>
              <Text style={[styles.payStatusText, { color: pay?.color }]}>{pay?.label}</Text>
            </View>
            <View style={styles.invoiceRow}>
              <Text style={styles.invoiceRowLabel}>Amount</Text>
              <Text style={[styles.invoiceRowValue, { color: Colors.blue, fontWeight: '700' }]}>
                ₹{caseData.totalAmount.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Payment Upload Section ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment Proof</Text>
          {!caseData.payment?.invoiceNumber && (
            <View style={[styles.invoiceNotesBox, { marginBottom: Spacing.md }]}>
              <Text style={{ fontSize: 13, color: Colors.text3, textAlign: 'center' }}>
                Invoice not yet issued by the lab. You'll be able to upload payment once an invoice is sent.
              </Text>
            </View>
          )}

          {caseData.paymentStatus === 'REJECTED' && caseData.payment?.rejectionReason && (
            <View style={styles.rejectionBox}>
              <Text style={styles.rejectionTitle}>Rejection Reason:</Text>
              <Text style={styles.rejectionText}>{caseData.payment.rejectionReason}</Text>
            </View>
          )}

          {caseData.payment?.screenshotUrl && (
            <View style={styles.screenshotWrap}>
              <Text style={styles.screenshotLabel}>Uploaded Screenshot</Text>
              <Image source={{ uri: caseData.payment.screenshotUrl }} style={styles.screenshotImg} resizeMode="cover" />
            </View>
          )}

          {canUploadPayment && caseData.payment?.invoiceNumber && (
            <View style={styles.uploadSection}>
              <Text style={styles.uploadTitle}>
                {caseData.paymentStatus === 'REJECTED' ? '🔄 Re-upload Payment' : '📤 Upload Payment Screenshot'}
              </Text>
              <Text style={styles.uploadSub}>
                Upload a screenshot of your bank transfer or payment receipt to unlock delivery.
              </Text>

              {screenshot ? (
                <View style={styles.previewWrap}>
                  <Image source={{ uri: screenshot.uri }} style={styles.previewImg} resizeMode="cover" />
                  <View style={styles.previewActions}>
                    <TouchableOpacity style={styles.changeBtn} onPress={() => setScreenshot(null)}>
                      <Text style={styles.changeBtnText}>Change</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.uploadBtn, uploading && { opacity: 0.6 }]}
                      onPress={uploadPayment}
                      disabled={uploading}
                    >
                      {uploading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.uploadBtnText}>✓ Submit Payment</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.uploadBtns}>
                  <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} activeOpacity={0.85}>
                    <Text style={styles.photoBtnIcon}>📷</Text>
                    <Text style={styles.photoBtnText}>Take Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.photoBtn} onPress={pickImage} activeOpacity={0.85}>
                    <Text style={styles.photoBtnIcon}>🖼️</Text>
                    <Text style={styles.photoBtnText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Stage Timeline ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Stage History</Text>
          {caseData.stages?.length === 0 ? (
            <Text style={{ color: Colors.text3, fontSize: 13 }}>No stage scans yet.</Text>
          ) : (
            caseData.stages?.map((s, i) => {
              const st = STAGES[s.stageName] || STAGES.CASE_ACCEPTED;
              return (
                <View key={s.id} style={styles.timelineItem}>
                  <View style={styles.timelineDotWrap}>
                    <View style={[styles.timelineDot, { backgroundColor: st.color }]}>
                      <Text style={{ fontSize: 10 }}>{st.icon}</Text>
                    </View>
                    {i < caseData.stages.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={styles.timelineLabel}>{st.label}</Text>
                    <Text style={styles.timelineTime}>
                      {format(new Date(s.scannedAt), 'dd MMM yyyy, h:mm a')}
                      {s.scannedBy ? ` · ${s.scannedBy}` : ''}
                    </Text>
                    {s.notes && <Text style={styles.timelineNotes}>{s.notes}</Text>}
                  </View>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bg },

  // Header
  header: {
    backgroundColor: Colors.navy, paddingTop: 52, paddingBottom: 14,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { width: 60 },
  backText: { fontSize: 14, color: Colors.accent, fontWeight: '600' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1, textAlign: 'center' },

  scroll: { paddingBottom: 40 },

  // Status hero
  statusHero: {
    alignItems: 'center', paddingVertical: 28,
  },
  statusHeroIcon: { fontSize: 40, marginBottom: 8 },
  statusHeroLabel: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 4 },
  statusHeroCase: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' },

  // Progress
  progressWrap: { marginTop: 8 },
  progressTrack: { height: 6, backgroundColor: Colors.border, borderRadius: 3, marginBottom: 16 },
  progressFill: { height: 6, backgroundColor: Colors.accent, borderRadius: 3 },
  progressSteps: { flexDirection: 'row', justifyContent: 'space-between' },
  progressStep: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.border, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  stepDotDone: { backgroundColor: Colors.accent + '30' },
  stepDotCurrent: { backgroundColor: Colors.accent, ...Shadow.sm },
  stepIcon: { fontSize: 12 },
  stepLabel: { fontSize: 8, color: Colors.text3, textAlign: 'center', lineHeight: 11 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12,
  },

  // Card
  card: {
    backgroundColor: Colors.surface, marginHorizontal: Spacing.lg,
    marginTop: Spacing.md, borderRadius: Radius.lg, padding: Spacing.lg,
    ...Shadow.sm,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text1, marginBottom: 12 },

  // Info rows
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  infoLabel: { fontSize: 13, color: Colors.text3, fontWeight: '500' },
  infoValue: { fontSize: 13, color: Colors.text1, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },

  // Notes
  notesBox: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.md,
  },
  notesLabel: { fontSize: 11, fontWeight: '700', color: Colors.text3, marginBottom: 4 },
  notesText: { fontSize: 13, color: Colors.text2, lineHeight: 19 },

  // Invoice card
  invoiceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: Spacing.md },
  invoiceTitle: { fontSize: 11, fontWeight: '700', color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  invoiceNumber: { fontSize: 15, fontWeight: '800', color: Colors.blue, fontFamily: 'monospace' },
  invoiceAmountBadge: { borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'flex-end' },
  invoiceAmountLabel: { fontSize: 10, fontWeight: '700', color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  invoiceAmount: { fontSize: 22, fontWeight: '800', color: Colors.blue },
  invoiceDivider: { height: 1, backgroundColor: Colors.border, marginBottom: Spacing.md },
  invoiceRows: { gap: 2 },
  invoiceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border },
  invoiceRowLabel: { fontSize: 13, color: Colors.text3, fontWeight: '500' },
  invoiceRowValue: { fontSize: 13, color: Colors.text1, fontWeight: '600', maxWidth: '55%', textAlign: 'right' },
  invoiceNotesBox: { backgroundColor: '#FFFBEB', borderRadius: Radius.md, padding: Spacing.md, marginTop: Spacing.md },
  invoiceNotesText: { fontSize: 12, color: Colors.text2, lineHeight: 18 },

  // Payment
  payStatusBadge: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.full, marginBottom: Spacing.md },
  payStatusText: { fontSize: 13, fontWeight: '700' },
  rejectionBox: { backgroundColor: Colors.redDim, borderRadius: Radius.md, padding: Spacing.md, marginBottom: Spacing.md },
  rejectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.red, marginBottom: 4 },
  rejectionText: { fontSize: 13, color: Colors.red },
  screenshotWrap: { marginBottom: Spacing.md },
  screenshotLabel: { fontSize: 12, fontWeight: '600', color: Colors.text3, marginBottom: 8 },
  screenshotImg: { width: '100%', height: 160, borderRadius: Radius.md, backgroundColor: Colors.border },

  // Upload
  uploadSection: {
    backgroundColor: Colors.surface2, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: 4,
  },
  uploadTitle: { fontSize: 14, fontWeight: '700', color: Colors.text1, marginBottom: 4 },
  uploadSub: { fontSize: 12, color: Colors.text3, marginBottom: Spacing.md, lineHeight: 17 },
  uploadBtns: { flexDirection: 'row', gap: 10 },
  photoBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: Spacing.lg, alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: Colors.border, borderStyle: 'dashed',
  },
  photoBtnIcon: { fontSize: 28 },
  photoBtnText: { fontSize: 13, fontWeight: '600', color: Colors.text2 },
  previewWrap: { gap: 10 },
  previewImg: { width: '100%', height: 180, borderRadius: Radius.md },
  previewActions: { flexDirection: 'row', gap: 10 },
  changeBtn: {
    flex: 1, backgroundColor: Colors.surface, borderRadius: Radius.md,
    padding: 12, alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  changeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.text2 },
  uploadBtn: {
    flex: 2, backgroundColor: Colors.green, borderRadius: Radius.md,
    padding: 12, alignItems: 'center',
  },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Timeline
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: Spacing.md },
  timelineDotWrap: { alignItems: 'center', width: 32 },
  timelineDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  timelineLine: {
    width: 2, flex: 1, backgroundColor: Colors.border,
    marginTop: 4, marginBottom: -8,
  },
  timelineContent: { flex: 1, paddingTop: 6 },
  timelineLabel: { fontSize: 13, fontWeight: '700', color: Colors.text1 },
  timelineTime: { fontSize: 11, color: Colors.text3, marginTop: 2 },
  timelineNotes: { fontSize: 11, color: Colors.text3, marginTop: 2, fontStyle: 'italic' },
});
