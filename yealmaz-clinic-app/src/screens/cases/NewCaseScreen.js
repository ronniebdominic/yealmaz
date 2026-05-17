import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

const WORK_TYPES = [
  'PFM Crown', 'Zirconia Crown', 'Full Denture', 'Partial Denture',
  'Bridge', 'Veneer', 'Inlay / Onlay', 'Clear Aligner',
  'Night Guard', 'Implant Crown', 'Other',
];

export default function NewCaseScreen({ navigation }) {
  const [form, setForm] = useState({
    patientName: '', patientAge: '', doctorName: '', workType: '',
    toothNumbers: '', shade: '', notes: '',
    dueDate: '', totalAmount: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [showWorkTypes, setShowWorkTypes] = useState(false);

  const set = (field) => (val) => setForm(prev => ({ ...prev, [field]: val }));

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
        patientAge: form.patientAge ? parseInt(form.patientAge) : undefined,
        totalAmount: form.totalAmount ? parseFloat(form.totalAmount) : undefined,
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

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Patient Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>PATIENT INFORMATION</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Patient Name *</Text>
            <TextInput style={styles.input} placeholder="e.g. Ahmed Al-Rashid" placeholderTextColor={Colors.text3} value={form.patientName} onChangeText={set('patientName')} />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Doctor Name</Text>
            <TextInput style={styles.input} placeholder="e.g. Dr. Sarah Ahmed" placeholderTextColor={Colors.text3} value={form.doctorName} onChangeText={set('doctorName')} />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Age</Text>
              <TextInput style={styles.input} placeholder="e.g. 34" placeholderTextColor={Colors.text3} value={form.patientAge} onChangeText={set('patientAge')} keyboardType="numeric" />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Shade</Text>
              <TextInput style={styles.input} placeholder="e.g. A2, B1" placeholderTextColor={Colors.text3} value={form.shade} onChangeText={set('shade')} />
            </View>
          </View>
        </View>

        {/* Work Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WORK DETAILS</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Work Type *</Text>
            <TouchableOpacity style={[styles.input, styles.selectInput]} onPress={() => setShowWorkTypes(!showWorkTypes)}>
              <Text style={form.workType ? styles.selectText : styles.selectPlaceholder}>
                {form.workType || 'Select work type…'}
              </Text>
              <Text style={styles.selectArrow}>{showWorkTypes ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showWorkTypes && (
              <View style={styles.dropdown}>
                {WORK_TYPES.map(w => (
                  <TouchableOpacity key={w} style={[styles.dropdownItem, form.workType === w && styles.dropdownItemActive]}
                    onPress={() => { set('workType')(w); setShowWorkTypes(false); }}>
                    <Text style={[styles.dropdownText, form.workType === w && styles.dropdownTextActive]}>{w}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Tooth Numbers</Text>
            <TextInput style={styles.input} placeholder="e.g. 14, 15, 16" placeholderTextColor={Colors.text3} value={form.toothNumbers} onChangeText={set('toothNumbers')} />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Due Date</Text>
              <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.text3} value={form.dueDate} onChangeText={set('dueDate')} />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Amount (₹)</Text>
              <TextInput style={styles.input} placeholder="e.g. 2500" placeholderTextColor={Colors.text3} value={form.totalAmount} onChangeText={set('totalAmount')} keyboardType="numeric" />
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

        {/* Submit */}
        <View style={styles.submitWrap}>
          <TouchableOpacity
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.submitText}>🦷 Submit Case & Generate QR</Text>
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
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14,
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

  // Select
  selectInput: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  selectText: { fontSize: 14, color: Colors.text1 },
  selectPlaceholder: { fontSize: 14, color: Colors.text3 },
  selectArrow: { fontSize: 12, color: Colors.text3 },
  dropdown: {
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
    borderRadius: Radius.md, marginTop: 4, ...Shadow.md,
    maxHeight: 220, overflow: 'scroll',
  },
  dropdownItem: { paddingHorizontal: Spacing.lg, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: Colors.border },
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
