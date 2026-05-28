import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

// ── Due-date rules (mirrors backend getDueDays) ──────────
function getDueDays(workType, priceMap = {}) {
  if (priceMap[workType]) return priceMap[workType];
  const w = (workType || '').toLowerCase();
  if (w.includes('coping'))   return 3;
  if (w.includes('aligner'))  return 6;
  if (w.includes('zirconia')) return 4;
  if (w.includes('ceramic'))  return 6;
  if (w.includes('emax'))     return 6;
  if (w.includes('guard') || w.includes('splint') || w.includes('retainer') ||
      w.includes('bleaching') || w.includes('gingival')) return 4;
  return 5;
}

function calcDueDate(workType, priceMap = {}) {
  const days = getDueDays(workType, priceMap);
  const d = new Date();
  d.setDate(d.getDate() + days);
  return { iso: d.toISOString().slice(0, 10), days };
}

function formatDueDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Work Types ────────────────────────────────────────────
const WORK_TYPES = [
  // Zirconia
  'Zirconia Express',
  'Full Contoured Zirconia',
  'Layered Zirconia Aesthetic',
  'Zirconia Screw Retained Crown',
  'Zirconia Veneer',
  'Zirconia Rest',
  'Zirconia Coping',
  'Custom Abutment',
  'Screw Retained Aesthetic',
  // Lithium Disilicate
  'Lithium Disilicate Inlays / Onlays / Crown',
  'Lithium Disilicate Veneers',
  // PFM
  'PFM Crown',
  'PFM Crown with Metal Try-In',
  'PFM Bridge',
  // Metal
  'Full Metal Crown',
  'Full Metal Bridge',
  'Metal Occlusal Crown',
  // Implant
  'Implant Crown PFM',
  'Implant Crown Zirconia',
  // Dentures
  'Complete Denture',
  'Flexible Denture',
  'Cast Partial Denture',
  // Temporary
  'Temporary Crown PMMA',
  'Temporary Bridge PMMA',
  // Digital / CAD
  'Surgical Guide',
  'Implant Planning',
  'Wax-Up Diagnostic',
  'CAD Design Service',
  '3D Printed Model',
  // Guards & Appliances
  'Orthodontic Retainer',
  'Night Guard Soft',
  'Night Guard Hard',
  'Sports Guard',
  'Bite Splint',
  'Bleaching Tray',
  'Clear Aligner Setup',
  'Gingival Mask',
  // Emax
  'Emax Crown',
  'Emax Veneer',
  'Emax Bridge',
  // Composite
  'Composite Veneer',
  'Composite Crown',
  // Specialty Prosthetics
  'Maryland Bridge',
  'Precision Attachment',
  'Telescopic Crown',
  'Bar Attachment',
  'Locator Housing',
  // PEEK
  'Peek Framework',
  'Peek Crown',
  // Implant Prosthetics
  'Hybrid Denture',
  'Implant Overdenture',
  'Temporary Abutment',
  'Healing Cap',
];

// ── Odontogram ────────────────────────────────────────────
const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const TOOTH_W = 26;
const TOOTH_H = 36;

function Odontogram({ selected, onToggle }) {
  const renderRow = (teeth, isUpper) => {
    const items = [];
    for (const num of teeth) {
      // Insert midline separator before tooth 21 (upper) and tooth 31 (lower)
      if ((isUpper && num === 21) || (!isUpper && num === 31)) {
        items.push(
          <View key="mid" style={{ width: 8, height: TOOTH_H, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 1.5, height: TOOTH_H, backgroundColor: Colors.border2 }} />
          </View>
        );
      }
      const active = selected.includes(num);
      items.push(
        <TouchableOpacity
          key={num}
          onPress={() => onToggle(num)}
          activeOpacity={0.65}
          style={{
            width: TOOTH_W,
            height: TOOTH_H,
            alignItems: 'center',
            justifyContent: 'center',
            marginHorizontal: 1,
            borderWidth: 1.5,
            borderColor: active ? Colors.blue : Colors.border,
            backgroundColor: active ? Colors.blue : Colors.surface,
            borderTopLeftRadius: isUpper ? 4 : 0,
            borderTopRightRadius: isUpper ? 4 : 0,
            borderBottomLeftRadius: isUpper ? 0 : 4,
            borderBottomRightRadius: isUpper ? 0 : 4,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '700', color: active ? '#fff' : Colors.text3 }}>
            {num}
          </Text>
        </TouchableOpacity>
      );
    }
    return <View style={{ flexDirection: 'row' }}>{items}</View>;
  };

  // Fixed inner width: 16 teeth × (TOOTH_W + 2 margin) + midline 8
  const innerW = 16 * (TOOTH_W + 2) + 8;

  return (
    <View style={{ backgroundColor: Colors.surface2, borderRadius: Radius.md, padding: 10, borderWidth: 1, borderColor: Colors.border }}>
      {/* Horizontal scroll so teeth never get squeezed */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View style={{ width: innerW }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.text3 }}>R</Text>
            <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.text3 }}>L</Text>
          </View>

          {renderRow(UPPER_TEETH, true)}

          {/* Arch divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 18, marginVertical: 3, backgroundColor: Colors.bg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border, paddingHorizontal: 6 }}>
            <Text style={{ fontSize: 7, fontWeight: '700', color: Colors.text3, letterSpacing: 1 }}>UPPER</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: Colors.border, marginHorizontal: 8 }} />
            <Text style={{ fontSize: 7, fontWeight: '700', color: Colors.text3, letterSpacing: 1 }}>LOWER</Text>
          </View>

          {renderRow(LOWER_TEETH, false)}
        </View>
      </ScrollView>
    </View>
  );
}


// ── Screen ────────────────────────────────────────────────
export default function NewCaseScreen({ navigation }) {
  const [form, setForm] = useState({
    patientName: '', patientAge: '', doctorName: '', workType: '',
    shade: '', notes: '', dueDate: '', deliveryType: 'NORMAL',
  });
  const [selectedTeeth, setSelectedTeeth] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [showWorkTypes, setShowWorkTypes] = useState(false);
  const [autoCalcDays, setAutoCalcDays] = useState(null);
  const [priceMap, setPriceMap] = useState({});

  useEffect(() => {
    api.get('/prices').then(res => {
      const map = {};
      res.data.forEach(p => { if (p.durationDays) map[p.workType] = p.durationDays; });
      setPriceMap(map);
    }).catch(() => {});
  }, []);

  const set = (field) => (val) => setForm(prev => ({ ...prev, [field]: val }));

  const selectWorkType = (w) => {
    const { iso, days } = calcDueDate(w, priceMap);
    setForm(prev => ({ ...prev, workType: w, dueDate: iso }));
    setAutoCalcDays(days);
    setShowWorkTypes(false);
  };

  const toggleTooth = (num) => {
    setSelectedTeeth(prev =>
      prev.includes(num)
        ? prev.filter(t => t !== num)
        : [...prev, num].sort((a, b) => a - b)
    );
  };

  const validate = () => {
    if (!form.patientName.trim()) { Alert.alert('Required', 'Please enter the patient name.'); return false; }
    if (!form.workType) { Alert.alert('Required', 'Please select a work type.'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/cases', {
        ...form,
        toothNumbers: selectedTeeth.length > 0 ? selectedTeeth.join(', ') : undefined,
        patientAge: form.patientAge ? parseInt(form.patientAge) : undefined,
      });
      Alert.alert(
        '✅ Case Submitted!',
        `Case ${res.data.caseNumber} has been created. A QR code has been generated for lab tracking.`,
        [
          { text: 'View Case', onPress: () => navigation.replace('CaseDetail', { caseId: res.data.id }) },
          { text: 'Done', onPress: () => navigation.goBack() },
        ]
      );
    } catch (err) {
      Alert.alert('Submission Failed', err.response?.data?.error || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.navy} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Case</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Patient Information ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PATIENT INFORMATION</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Patient Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ahmed Al-Rashid"
              placeholderTextColor={Colors.text3}
              value={form.patientName}
              onChangeText={set('patientName')}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Doctor Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Dr. Sarah Ahmed"
              placeholderTextColor={Colors.text3}
              value={form.doctorName}
              onChangeText={set('doctorName')}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 34"
                placeholderTextColor={Colors.text3}
                value={form.patientAge}
                onChangeText={set('patientAge')}
                keyboardType="numeric"
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Shade</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. A2, B1"
                placeholderTextColor={Colors.text3}
                value={form.shade}
                onChangeText={set('shade')}
              />
            </View>
          </View>
        </View>

        {/* ── Tooth Selection ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>TOOTH SELECTION</Text>
          <Text style={styles.subHint}>Tap teeth to mark affected tooth/teeth (FDI numbering)</Text>

          <View style={{ marginTop: 10 }}>
            <Odontogram selected={selectedTeeth} onToggle={toggleTooth} />
          </View>

          <View style={styles.teethSummaryRow}>
            {selectedTeeth.length > 0 ? (
              <>
                <Text style={styles.teethSelected}>
                  Selected: <Text style={{ color: Colors.blue, fontWeight: '700' }}>{selectedTeeth.join(', ')}</Text>
                </Text>
                <TouchableOpacity onPress={() => setSelectedTeeth([])}>
                  <Text style={styles.clearBtn}>Clear all</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={styles.teethNone}>No teeth selected</Text>
            )}
          </View>
        </View>

        {/* ── Work Details ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WORK DETAILS</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Work Type *</Text>
            <TouchableOpacity
              style={[styles.input, styles.selectInput]}
              onPress={() => setShowWorkTypes(!showWorkTypes)}
            >
              <Text style={form.workType ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
                {form.workType || 'Select work type…'}
              </Text>
              <Text style={styles.selectArrow}>{showWorkTypes ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showWorkTypes && (
              <View style={styles.dropdown}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                  {WORK_TYPES.map(w => (
                    <TouchableOpacity
                      key={w}
                      style={[styles.dropdownItem, form.workType === w && styles.dropdownItemActive]}
                      onPress={() => selectWorkType(w)}
                    >
                      <Text style={[styles.dropdownText, form.workType === w && styles.dropdownTextActive]}>
                        {w}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Due Date</Text>
            {autoCalcDays ? (
              <View style={{
                backgroundColor: Colors.blue + '10',
                borderWidth: 1.5, borderColor: Colors.blue + '40',
                borderRadius: Radius.md, padding: Spacing.md,
              }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.blue }}>
                  📅 {formatDueDate(form.dueDate)}
                </Text>
                <Text style={{ fontSize: 11, color: Colors.text3, marginTop: 2 }}>
                  Auto-calculated · {autoCalcDays} day{autoCalcDays !== 1 ? 's' : ''} for {form.workType}
                </Text>
              </View>
            ) : (
              <Text style={{ fontSize: 12, color: Colors.text3, fontStyle: 'italic' }}>
                Select a work type to auto-calculate the due date
              </Text>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Delivery Type</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { value: 'NORMAL',  label: 'Normal Delivery',  icon: '🚚', desc: 'Standard turnaround' },
                { value: 'EXPRESS', label: 'Express Delivery', icon: '⚡', desc: 'Priority / urgent' },
              ].map(opt => {
                const active = form.deliveryType === opt.value;
                const activeColor = opt.value === 'EXPRESS' ? Colors.amber : Colors.blue;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => set('deliveryType')(opt.value)}
                    activeOpacity={0.8}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      padding: 12, borderRadius: Radius.md,
                      borderWidth: 2,
                      borderColor: active ? activeColor : Colors.border,
                      backgroundColor: active ? activeColor + '12' : Colors.bg,
                    }}
                  >
                    <Text style={{ fontSize: 22 }}>{opt.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? activeColor : Colors.text1 }}>
                        {opt.label}
                      </Text>
                      <Text style={{ fontSize: 10, color: Colors.text3 }}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Notes / Special Instructions</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Any special instructions for the lab…"
              placeholderTextColor={Colors.text3}
              value={form.notes}
              onChangeText={set('notes')}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* ── Submit ── */}
        <View style={styles.submitWrap}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>Submit Case</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    backgroundColor: Colors.navy, paddingTop: 52, paddingBottom: 14,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backText: { fontSize: 14, color: Colors.accent, fontWeight: '600', width: 60 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  scroll: { padding: Spacing.lg, paddingBottom: 60 },

  section: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm,
  },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4,
  },
  subHint: {
    fontSize: 11, color: Colors.text3, marginBottom: 2,
  },

  formGroup: { marginBottom: Spacing.lg },
  label: {
    fontSize: 12, fontWeight: '700', color: Colors.text2,
    letterSpacing: 0.3, marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.bg, borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    height: 48, fontSize: 14, color: Colors.text1,
  },
  textArea: { height: 100, paddingTop: Spacing.md },
  row: { flexDirection: 'row' },

  // Teeth summary
  teethSummaryRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginTop: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  teethSelected: { fontSize: 12, color: Colors.text2, flex: 1 },
  teethNone: { fontSize: 12, color: Colors.text3, fontStyle: 'italic' },
  clearBtn: { fontSize: 12, fontWeight: '700', color: Colors.red },

  // Work type dropdown
  selectInput: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  selectText: { fontSize: 14, color: Colors.text1, flex: 1 },
  selectPlaceholder: { fontSize: 14, color: Colors.text3, flex: 1 },
  selectArrow: { fontSize: 12, color: Colors.text3 },
  dropdown: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, marginTop: 4, ...Shadow.md,
  },
  dropdownItem: {
    paddingHorizontal: Spacing.lg, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  dropdownItemActive: { backgroundColor: Colors.blue + '10' },
  dropdownText: { fontSize: 14, color: Colors.text1 },
  dropdownTextActive: { color: Colors.blue, fontWeight: '700' },

  // Submit
  submitWrap: { gap: 10, marginTop: 8 },
  submitBtn: {
    backgroundColor: Colors.blue, borderRadius: Radius.md,
    height: 54, alignItems: 'center', justifyContent: 'center', ...Shadow.md,
  },
  submitText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelBtn: {
    height: 48, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.md,
  },
  cancelText: { fontSize: 15, fontWeight: '600', color: Colors.text2 },
});
