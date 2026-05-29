import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Alert,
  Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import api, { API_BASE } from '../../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, Radius, Shadow, STAGES, PAYMENT_STATUS } from '../../utils/theme';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';

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

const LAB = {
  name: 'Ye-Almaz Dental Laboratory',
  address: 'Addis Ababa, Ethiopia',
  phone: '+251 911 000 000',
};

function buildInvoiceHTML(c) {
  const inv = c.payment;
  const amount = (inv?.amount ?? c.totalAmount ?? 0).toLocaleString('en-IN');
  const issued = inv?.invoiceIssuedAt ? new Date(inv.invoiceIssuedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const due    = c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—';
  const isPaid = c.paymentStatus === 'VERIFIED';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${inv?.invoiceNumber || 'Invoice'}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;color:#1a1a2e;background:#fff;padding:32px;font-size:14px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:20px;border-bottom:3px solid #1565C0}
  .lab-name{font-size:20px;font-weight:800;color:#1565C0;margin-bottom:4px}
  .lab-sub{font-size:11px;color:#888;line-height:1.5}
  .inv-meta{text-align:right}
  .inv-meta h1{font-size:26px;font-weight:800;color:#1565C0;letter-spacing:2px}
  .inv-num{font-size:12px;color:#555;margin-top:4px;font-family:monospace}
  .status-pill{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;margin-top:6px}
  .paid{background:#D1FAE5;color:#065F46}
  .pending{background:#FEF3C7;color:#92400E}
  .section{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
  .section-title{font-size:9px;font-weight:700;color:#aaa;letter-spacing:1px;text-transform:uppercase;margin-bottom:5px}
  .bill-name{font-size:14px;font-weight:700;margin-bottom:3px}
  .bill-sub{font-size:12px;color:#666;line-height:1.6}
  .dates{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px}
  .date-val{font-size:12px;font-weight:600}
  .date-mono{font-family:monospace}
  table{width:100%;border-collapse:collapse;margin-bottom:20px}
  thead tr{background:#1565C0;color:#fff}
  th{padding:9px 14px;text-align:left;font-size:11px;font-weight:700;letter-spacing:0.5px}
  td{padding:12px 14px;border-bottom:1px solid #eee;font-size:13px}
  .total-row td{background:#F0F5FF;font-weight:700;border-bottom:none}
  .total-amt{color:#1565C0;font-size:18px;font-weight:800;text-align:right}
  .notes{background:#FFFBEB;border-radius:6px;padding:12px;font-size:12px;color:#555;margin-bottom:20px}
  .footer{margin-top:32px;padding-top:14px;border-top:1px solid #eee;font-size:10px;color:#aaa;text-align:center;line-height:1.7}
</style></head><body>
<div class="header">
  <div>
    <div class="lab-name">🦷 ${LAB.name}</div>
    <div class="lab-sub">${LAB.address}<br>${LAB.phone}</div>
  </div>
  <div class="inv-meta">
    <h1>INVOICE</h1>
    <div class="inv-num">${inv?.invoiceNumber || '—'}</div>
    <div><span class="status-pill ${isPaid ? 'paid' : 'pending'}">${isPaid ? '✓ PAID' : 'PAYMENT PENDING'}</span></div>
  </div>
</div>

<div class="section">
  <div>
    <div class="section-title">Bill To</div>
    <div class="bill-name">${c.clinic?.name || '—'}</div>
    <div class="bill-sub">${c.clinic?.address || ''}${c.clinic?.phone ? '<br>' + c.clinic.phone : ''}${c.clinic?.email ? '<br>' + c.clinic.email : ''}</div>
  </div>
  <div class="dates">
    <div><div class="section-title">Invoice Date</div><div class="date-val">${issued}</div></div>
    <div><div class="section-title">Due Date</div><div class="date-val">${due}</div></div>
    <div><div class="section-title">Case No.</div><div class="date-val date-mono">${c.caseNumber}</div></div>
    <div><div class="section-title">Patient</div><div class="date-val">${c.patientName}</div></div>
  </div>
</div>

<table>
  <thead><tr><th>Description</th><th>Details</th><th style="text-align:right">Amount</th></tr></thead>
  <tbody>
    <tr>
      <td><strong>${c.workType}</strong><br><span style="color:#888;font-size:11px">Dental Lab Work</span></td>
      <td style="color:#666">${[c.toothNumbers ? 'Teeth: ' + c.toothNumbers : '', c.shade ? 'Shade: ' + c.shade : ''].filter(Boolean).join('<br>') || '—'}</td>
      <td style="text-align:right;font-weight:700">₹${amount}</td>
    </tr>
    <tr class="total-row">
      <td colspan="2" style="text-align:right;font-size:13px">Total Amount</td>
      <td class="total-amt">₹${amount}</td>
    </tr>
  </tbody>
</table>

${inv?.invoiceNotes ? `<div class="notes"><strong>Notes:</strong> ${inv.invoiceNotes}</div>` : ''}

<div class="footer">
  Thank you for choosing Ye-Almaz Dental Laboratory<br>
  Please transfer to the provided bank account and upload your payment receipt in the clinic app.
</div>
</body></html>`;
}

function InfoRow({ label, value, valueColor }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}



export default function CaseDetailScreen({ navigation, route }) {
  const { caseId } = route.params;
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [screenshot, setScreenshot] = useState(null);

  const { data: caseData, isLoading: loading, isRefetching, error: loadError, refetch } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => api.get(`/cases/${caseId}`).then(r => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const refreshing = isRefetching && !loading;

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
      const token = await AsyncStorage.getItem('ya_clinic_token');
      if (!token) throw new Error('Not logged in. Please log out and log back in.');

      const formData = new FormData();

      if (Platform.OS === 'web') {
        // On web, expo-image-picker may provide a real File object on the asset.
        // Appending the RN { uri, type, name } object would just serialize as "[object Object]".
        if (screenshot.file) {
          formData.append('screenshot', screenshot.file, `payment_${caseId}.jpg`);
        } else {
          const resp = await fetch(screenshot.uri);
          const blob = await resp.blob();
          formData.append('screenshot', blob, `payment_${caseId}.jpg`);
        }
      } else {
        // On native iOS/Android: use React Native's file-object syntax
        formData.append('screenshot', {
          uri: screenshot.uri,
          type: screenshot.mimeType || screenshot.type || 'image/jpeg',
          name: `payment_${caseId}.jpg`,
        });
      }

      const url = `${API_BASE}/payments/${caseId}/upload`;
      console.log('[Upload] POST', url, '| platform:', Platform.OS);

      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      console.log('[Upload] response status:', res.status);

      // Read as text first — res.json() throws if server returns HTML (e.g. 502)
      const text = await res.text();
      console.log('[Upload] response body:', text.slice(0, 300));

      let data = {};
      try { data = JSON.parse(text); } catch { /* non-JSON response */ }

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      Alert.alert('✅ Uploaded!', 'Your payment screenshot has been submitted for verification.');
      setScreenshot(null);
      queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
    } catch (err) {
      console.error('[Upload] failed:', err);
      Alert.alert('Upload Failed', err.message || 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const downloadInvoice = async () => {
    if (!caseData) return;
    setGeneratingPdf(true);
    try {
      const html = buildInvoiceHTML(caseData);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Invoice ${caseData.payment?.invoiceNumber}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Invoice saved to: ${uri}`);
      }
    } catch (err) {
      Alert.alert('Error', 'Could not generate invoice PDF. Please try again.');
      console.error('[Invoice PDF]', err);
    } finally {
      setGeneratingPdf(false);
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
          <Text style={{ color: '#ef9a9a', fontSize: 12, textAlign: 'center', paddingHorizontal: 32 }}>
            Cannot reach server — check your network.
          </Text>
        ) : null}
      </View>
    );
  }

  const stage = STAGES[caseData.status] || STAGES.CASE_ACCEPTED;
  const pay = PAYMENT_STATUS[caseData.paymentStatus];
  const canUploadPayment = ['PAYMENT_REQUESTED', 'REJECTED'].includes(caseData.paymentStatus);
  const hasPaymentRequest = ['PAYMENT_REQUESTED', 'REJECTED', 'SCREENSHOT_UPLOADED', 'VERIFIED'].includes(caseData.paymentStatus);
  const amountDue = caseData.payment?.amount ?? caseData.totalAmount ?? 0;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetch} tintColor={Colors.accent} />}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Status Hero ── */}
        <View style={[styles.statusHero, { backgroundColor: stage.color }]}>
          <Text style={styles.statusHeroIcon}>{stage.icon}</Text>
          <Text style={styles.statusHeroLabel}>{stage.label}</Text>
          <Text style={styles.statusHeroCase}>{caseData.caseNumber}</Text>
        </View>


        {/* ── Case Info ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Case Details</Text>
          <InfoRow label="Patient" value={caseData.patientName} />
          <InfoRow label="Work Type" value={caseData.workType} />
          <InfoRow label="Tooth Numbers" value={caseData.toothNumbers} />
          {caseData.units != null && <InfoRow label="Units" value={String(caseData.units)} />}
          <InfoRow label="Shade" value={caseData.shade} />
          <InfoRow label="Due Date" value={caseData.dueDate ? format(new Date(caseData.dueDate), 'dd MMMM yyyy') : null} />
          <InfoRow label="Doctor" value={caseData.doctorName} />
          <InfoRow label="Doctor Phone" value={caseData.doctorPhone} />
          <InfoRow label="Patient Gender" value={caseData.patientGender} />
          {caseData.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Notes</Text>
              <Text style={styles.notesText}>{caseData.notes}</Text>
            </View>
          )}
        </View>

        {/* ── Payment Section ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment</Text>

          {/* No payment request yet */}
          {!hasPaymentRequest && (
            <View style={[styles.invoiceNotesBox, { backgroundColor: Colors.surface2 }]}>
              <Text style={{ fontSize: 13, color: Colors.text3, textAlign: 'center', lineHeight: 19 }}>
                The lab will send you a payment request once your work is ready for collection.
              </Text>
            </View>
          )}

          {/* Payment request received (PAYMENT_REQUESTED or REJECTED) + upload */}
          {hasPaymentRequest && caseData.paymentStatus !== 'VERIFIED' && (
            <>
              {/* Amount due card */}
              <View style={{
                backgroundColor: Colors.blue + '10', borderWidth: 1.5,
                borderColor: Colors.blue + '30', borderRadius: Radius.md,
                padding: Spacing.md, marginBottom: Spacing.md,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text3, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Amount Due</Text>
                  <Text style={{ fontSize: 24, fontWeight: '800', color: Colors.blue }}>
                    Br {amountDue.toLocaleString('en-US')}
                  </Text>
                </View>
                <View style={[styles.payStatusBadge, { backgroundColor: pay?.bg, marginBottom: 0 }]}>
                  <Text style={[styles.payStatusText, { color: pay?.color }]}>{pay?.label}</Text>
                </View>
              </View>

              {/* Payment instructions */}
              {caseData.payment?.invoiceNotes ? (
                <View style={[styles.invoiceNotesBox, { marginBottom: Spacing.md }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.text3, marginBottom: 4 }}>Payment Instructions</Text>
                  <Text style={styles.invoiceNotesText}>{caseData.payment.invoiceNotes}</Text>
                </View>
              ) : null}

              {/* Rejection reason */}
              {caseData.paymentStatus === 'REJECTED' && caseData.payment?.rejectionReason && (
                <View style={[styles.rejectionBox, { marginBottom: Spacing.md }]}>
                  <Text style={styles.rejectionTitle}>Receipt Rejected:</Text>
                  <Text style={styles.rejectionText}>{caseData.payment.rejectionReason}</Text>
                </View>
              )}

              {/* Uploaded screenshot preview */}
              {caseData.payment?.screenshotUrl && caseData.paymentStatus === 'SCREENSHOT_UPLOADED' && (
                <View style={[styles.screenshotWrap, { marginBottom: Spacing.md }]}>
                  <Text style={styles.screenshotLabel}>Submitted Receipt — Awaiting Verification</Text>
                  <Image source={{ uri: caseData.payment.screenshotUrl }} style={styles.screenshotImg} resizeMode="cover" />
                </View>
              )}

              {/* Upload section */}
              {canUploadPayment && (
                <View style={styles.uploadSection}>
                  <Text style={styles.uploadTitle}>
                    {caseData.paymentStatus === 'REJECTED' ? '🔄 Re-upload Receipt' : '📤 Upload Payment Receipt'}
                  </Text>
                  <Text style={styles.uploadSub}>
                    Upload a screenshot of your bank transfer or payment receipt.
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
                            : <Text style={styles.uploadBtnText}>✓ Submit</Text>
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
            </>
          )}

          {/* Verified — show invoice */}
          {caseData.paymentStatus === 'VERIFIED' && caseData.payment?.invoiceNumber && (
            <>
              <View style={styles.invoiceHeader}>
                <View>
                  <Text style={styles.invoiceTitle}>Invoice</Text>
                  <Text style={styles.invoiceNumber}>{caseData.payment.invoiceNumber}</Text>
                </View>
                <View style={[styles.invoiceAmountBadge, { backgroundColor: Colors.green + '15' }]}>
                  <Text style={styles.invoiceAmountLabel}>Amount Paid</Text>
                  <Text style={[styles.invoiceAmount, { color: Colors.green }]}>
                    Br {amountDue.toLocaleString('en-US')}
                  </Text>
                </View>
              </View>
              <View style={styles.invoiceDivider} />
              <View style={styles.invoiceRows}>
                <View style={styles.invoiceRow}>
                  <Text style={styles.invoiceRowLabel}>Work Type</Text>
                  <Text style={styles.invoiceRowValue}>{caseData.workType}</Text>
                </View>
                {caseData.payment.invoiceIssuedAt ? (
                  <View style={styles.invoiceRow}>
                    <Text style={styles.invoiceRowLabel}>Invoice Date</Text>
                    <Text style={styles.invoiceRowValue}>
                      {format(new Date(caseData.payment.invoiceIssuedAt), 'dd MMM yyyy')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.md }}>
                <View style={[styles.payStatusBadge, { backgroundColor: pay?.bg, marginBottom: 0 }]}>
                  <Text style={[styles.payStatusText, { color: pay?.color }]}>{pay?.label}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.pdfBtn, generatingPdf && { opacity: 0.6 }]}
                  onPress={downloadInvoice}
                  disabled={generatingPdf}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pdfBtnText}>{generatingPdf ? 'Generating…' : '📄 View PDF'}</Text>
                </TouchableOpacity>
              </View>
            </>
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
  pdfBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    paddingVertical: 8, paddingHorizontal: 14,
  },
  pdfBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

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
