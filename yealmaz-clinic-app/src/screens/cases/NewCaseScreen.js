import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import Toast from 'react-native-toast-message';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow } from '../../utils/theme';

const SHADE_GROUPS = [
  { group: 'Vita A',  shades: ['A1', 'A2', 'A3', 'A3.5', 'A4'] },
  { group: 'Vita B',  shades: ['B1', 'B2', 'B3', 'B4'] },
  { group: 'Vita C',  shades: ['C1', 'C2', 'C3', 'C4'] },
  { group: 'Vita D',  shades: ['D2', 'D3', 'D4'] },
  { group: 'Bleach',  shades: ['BL1', 'BL2', 'BL3', 'BL4'] },
];
const ALL_SHADES = SHADE_GROUPS.flatMap(g => g.shades);

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

function formatDueDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Flat-rate work types (priced per item/arch, NOT multiplied by tooth count) ──
const FLAT_PRICE_TYPES = new Set([
  'Night Guard', 'Retainer', 'Clear Aligner', 'Bleaching Tray', 'Flexible Denture', 'Fexible Denture', '3D Printed Model',
]);

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

let itemKeySeq = 0;
const emptyItem = () => ({
  key: `item-${++itemKeySeq}`,
  workType: '', shade: '', dueDate: '', isRedo: false,
  selectedTeeth: [], manualUnits: '',
});

// ── One work-type item within a (possibly multi-item) order ──────────
// Everything that used to be a single set of screen-level fields (Tooth
// Selection, Work Type, Shade, Redo, Due Date, estimated Amount) now lives
// here, repeated once per item — each item becomes its own independently-
// tracked case (own case number/QR) on submit.
function WorkItemCard({
  item, index, onChange, onRemove, canRemove,
  priceMap, durationMap, expressDurationMap, deliveryType,
}) {
  const [showWorkTypes, setShowWorkTypes] = useState(false);
  const [showShades, setShowShades] = useState(false);
  const [customShade, setCustomShade] = useState(false);
  const [autoCalcDays, setAutoCalcDays] = useState(null);

  const selectedPrice = useMemo(() => {
    const p = priceMap[item.workType];
    if (!p) return null;
    const isExpress = deliveryType === 'EXPRESS' && p.expressPrice != null;
    const unit = isExpress ? p.expressPrice : p.price;
    const isFlat = FLAT_PRICE_TYPES.has(item.workType);
    const count = isFlat ? 1 : Math.max(1, item.selectedTeeth.length);
    const total = Math.round(unit * count * (item.isRedo ? 0.5 : 1));
    return { unit, count, isFlat, isExpress, isRedo: item.isRedo, total };
  }, [priceMap, item.workType, deliveryType, item.selectedTeeth.length, item.isRedo]);

  useEffect(() => {
    if (!item.workType) return;
    const isExpress = deliveryType === 'EXPRESS';
    let days = isExpress && expressDurationMap[item.workType] != null
      ? expressDurationMap[item.workType]
      : durationMap[item.workType];
    if (days == null) days = getDueDays(item.workType);
    const d = new Date();
    d.setDate(d.getDate() + days);
    onChange({ dueDate: d.toISOString().slice(0, 10) });
    setAutoCalcDays(days);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.workType, deliveryType, durationMap, expressDurationMap]);

  const selectWorkType = (w) => {
    onChange({ workType: w });
    setShowWorkTypes(false);
  };

  const toggleTooth = (num) => {
    const next = item.selectedTeeth.includes(num)
      ? item.selectedTeeth.filter(t => t !== num)
      : [...item.selectedTeeth, num].sort((a, b) => a - b);
    onChange({ selectedTeeth: next });
  };

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemCardHeader}>
        <Text style={styles.itemCardTitle}>ITEM {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity onPress={onRemove}>
            <Text style={styles.itemRemove}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tooth Selection */}
      <Text style={styles.subHint}>Tap teeth to mark affected tooth/teeth (FDI numbering)</Text>
      <View style={{ marginTop: 10 }}>
        <Odontogram selected={item.selectedTeeth} onToggle={toggleTooth} />
      </View>

      <View style={styles.teethSummaryRow}>
        {item.selectedTeeth.length > 0 ? (
          <>
            <Text style={styles.teethSelected}>
              Selected: <Text style={{ color: Colors.blue, fontWeight: '700' }}>{item.selectedTeeth.join(', ')}</Text>
            </Text>
            <TouchableOpacity onPress={() => onChange({ selectedTeeth: [] })}>
              <Text style={styles.clearBtn}>Clear all</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.teethNone}>No teeth selected</Text>
        )}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>
          Units{item.selectedTeeth.length > 0 ? ' (auto)' : ''}
        </Text>
        <TextInput
          style={[styles.input, item.selectedTeeth.length > 0 && { opacity: 0.6 }]}
          keyboardType="numeric"
          placeholder="Enter number of units"
          placeholderTextColor={Colors.textMuted}
          value={item.selectedTeeth.length > 0 ? String(item.selectedTeeth.length) : item.manualUnits}
          onChangeText={v => { if (item.selectedTeeth.length === 0) onChange({ manualUnits: v }); }}
          editable={item.selectedTeeth.length === 0}
        />
      </View>

      {/* Work Details */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>Work Type *</Text>
        <TouchableOpacity
          style={[styles.input, styles.selectInput]}
          onPress={() => setShowWorkTypes(!showWorkTypes)}
        >
          <Text style={item.workType ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
            {item.workType || 'Select work type…'}
          </Text>
          <Text style={styles.selectArrow}>{showWorkTypes ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showWorkTypes && (
          <View style={styles.dropdown}>
            {Object.keys(priceMap).length === 0 ? (
              <Text style={{ padding: Spacing.md, fontSize: 13, color: Colors.text3, fontStyle: 'italic' }}>
                No work types available yet — please contact the lab.
              </Text>
            ) : (
              <ScrollView nestedScrollEnabled style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
                {Object.values(priceMap).map(p => (
                  <TouchableOpacity
                    key={p.workType}
                    style={[styles.dropdownItem, styles.dropdownItemRow, item.workType === p.workType && styles.dropdownItemActive]}
                    onPress={() => selectWorkType(p.workType)}
                  >
                    <Text style={[styles.dropdownText, { flex: 1 }, item.workType === p.workType && styles.dropdownTextActive]} numberOfLines={1}>
                      {p.workType}
                    </Text>
                    <Text style={styles.dropdownPrice}>Br {Number(p.price).toLocaleString('en-US')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {selectedPrice && (
          <View style={styles.priceBox}>
            <Text style={styles.priceBoxLabel}>Estimated Amount</Text>
            <Text style={styles.priceBoxValue}>
              Br {selectedPrice.total.toLocaleString('en-US')}
              {!selectedPrice.isRedo && !selectedPrice.isFlat && selectedPrice.count > 1 && (
                <Text style={styles.priceBoxSub}>  ·  Br {selectedPrice.unit.toLocaleString('en-US')} × {selectedPrice.count}</Text>
              )}
              {selectedPrice.isExpress && <Text style={styles.priceBoxSub}>  ·  ⚡ express</Text>}
              {selectedPrice.isRedo && <Text style={styles.priceBoxSub}>  ·  ♻️ 50% redo</Text>}
            </Text>
          </View>
        )}
      </View>

      {!/aligner/i.test(item.workType || '') && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>Shade *</Text>
          <TouchableOpacity
            style={[styles.input, styles.selectInput]}
            onPress={() => { setShowShades(prev => !prev); setCustomShade(false); }}
          >
            <Text style={item.shade ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
              {item.shade || 'Select shade…'}
            </Text>
            <Text style={styles.selectArrow}>{showShades ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showShades && (
            <View style={styles.dropdown}>
              <ScrollView nestedScrollEnabled style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
                {SHADE_GROUPS.map(g => (
                  <View key={g.group} style={{ paddingHorizontal: Spacing.md, paddingTop: Spacing.md }}>
                    <Text style={styles.shadeGroupLabel}>{g.group}</Text>
                    <View style={styles.shadeChips}>
                      {g.shades.map(s => (
                        <TouchableOpacity
                          key={s}
                          style={[styles.shadeChip, item.shade === s && styles.shadeChipActive]}
                          onPress={() => { onChange({ shade: s }); setShowShades(false); setCustomShade(false); }}
                        >
                          <Text style={[styles.shadeChipText, item.shade === s && styles.shadeChipTextActive]}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.dropdownItem, { marginTop: 4 }]}
                  onPress={() => { setShowShades(false); setCustomShade(true); if (ALL_SHADES.includes(item.shade)) onChange({ shade: '' }); }}
                >
                  <Text style={[styles.dropdownText, { color: Colors.blue }]}>✏️  Custom shade…</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
          {customShade && (
            <TextInput
              style={[styles.input, { marginTop: 6 }]}
              placeholder="Type shade (e.g. OM3, 3M2)…"
              placeholderTextColor={Colors.text3}
              value={item.shade}
              onChangeText={v => onChange({ shade: v })}
              autoFocus
            />
          )}
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Redo / Replacement</Text>
        <TouchableOpacity
          onPress={() => onChange({ isRedo: !item.isRedo })}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
            borderRadius: Radius.md, borderWidth: 1.5,
            borderColor: item.isRedo ? Colors.amber : Colors.border,
            backgroundColor: item.isRedo ? Colors.amber + '12' : Colors.bg,
          }}
        >
          <Text style={{ fontSize: 18 }}>{item.isRedo ? '☑' : '☐'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: item.isRedo ? Colors.amber : Colors.text1 }}>
              This is a redo / replacement
            </Text>
            <Text style={{ fontSize: 11, color: Colors.text3 }}>
              Replacing an existing restoration — charged at 50%
            </Text>
          </View>
        </TouchableOpacity>
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
              📅 {formatDueDate(item.dueDate)}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.text3, marginTop: 2 }}>
              Auto-calculated · {autoCalcDays} day{autoCalcDays !== 1 ? 's' : ''} for {item.workType}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: Colors.text3, fontStyle: 'italic' }}>
            Select a work type to auto-calculate the due date
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────
export default function NewCaseScreen({ navigation }) {
  const [form, setForm] = useState({
    patientName: '', patientAge: '', doctorName: '', doctorPhone: '',
    patientGender: '', notes: '',
    deliveryType: 'NORMAL', deliveryDate: '', intakeMethod: 'PICKUP',
    archUpper: false, archLower: false,
  });
  const [items, setItems] = useState([emptyItem()]);
  const [submitting, setSubmitting] = useState(false);
  // The lab's pricing list is the single source of truth for selectable work types
  const [priceList, setPriceList] = useState([]);

  // Digital-scan intake fee: Br 500 per arch, on top of the work-type price.
  // Applied to the first item only — one scan session covers the whole visit.
  // Mirrors the receptionist app's New Case page exactly.
  const ARCH_FEE = 500;
  const archFee = (form.intakeMethod === 'EMAIL_3D_FILE')
    ? (form.archUpper ? ARCH_FEE : 0) + (form.archLower ? ARCH_FEE : 0)
    : 0;

  useEffect(() => {
    api.get('/prices').then(res => setPriceList(res.data || [])).catch(() => {});
  }, []);

  const durationMap = useMemo(() => {
    const m = {};
    priceList.forEach(p => { if (p.durationDays != null) m[p.workType] = p.durationDays; });
    return m;
  }, [priceList]);

  const expressDurationMap = useMemo(() => {
    const m = {};
    priceList.forEach(p => { if (p.expressDurationDays != null) m[p.workType] = p.expressDurationDays; });
    return m;
  }, [priceList]);

  const priceMap = useMemo(
    () => Object.fromEntries(priceList.map(p => [p.workType, p])),
    [priceList]
  );

  const set = (field) => (val) => setForm(prev => ({ ...prev, [field]: val }));

  const updateItem = (index, patch) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, ...patch } : it));
  };
  const addItem = () => setItems(prev => [...prev, emptyItem()]);
  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const validate = () => {
    if (!form.patientName.trim()) { Alert.alert('Required', 'Please enter the patient name.'); return false; }
    if (items.some(it => !it.workType)) { Alert.alert('Required', 'Please select a work type for every item.'); return false; }
    if (form.intakeMethod === 'EMAIL_3D_FILE' && !form.archUpper && !form.archLower) {
      Alert.alert('Required', 'Select at least one arch (Upper/Lower) that was scanned.');
      return false;
    }
    // Doctor name/contact/shade are mandatory for new orders (historical entries with a delivery date are exempt)
    if (!form.deliveryDate) {
      if (!form.doctorName.trim())  { Alert.alert('Required', "Please enter the doctor's name."); return false; }
      if (!form.doctorPhone.trim()) { Alert.alert('Required', "Please enter the doctor's contact number."); return false; }
      for (const it of items) {
        if (!/aligner/i.test(it.workType) && !it.shade.trim()) {
          Alert.alert('Required', 'Please select a shade for every non-aligner item.');
          return false;
        }
      }
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const buildItemPayload = (item, index) => {
        const resolvedUnits = item.selectedTeeth.length > 0
          ? item.selectedTeeth.length
          : item.manualUnits ? parseInt(item.manualUnits) : undefined;
        const p = priceMap[item.workType];
        const isExpress = form.deliveryType === 'EXPRESS' && p?.expressPrice != null;
        const unit = p ? (isExpress ? p.expressPrice : p.price) : null;
        const isFlat = FLAT_PRICE_TYPES.has(item.workType);
        const count = isFlat ? 1 : Math.max(1, item.selectedTeeth.length);
        // Arch scan fee rides on the first item only — one scan session covers the whole visit.
        const fee = index === 0 ? archFee : 0;
        const totalAmount = unit != null ? Math.round((unit * count + fee) * (item.isRedo ? 0.5 : 1)) : undefined;
        return {
          workType: item.workType,
          shade: item.shade,
          toothNumbers: item.selectedTeeth.length > 0 ? item.selectedTeeth.join(', ') : undefined,
          units: resolvedUnits,
          isRedo: item.isRedo,
          totalAmount,
        };
      };

      const isEmailFile = form.intakeMethod === 'EMAIL_3D_FILE';
      const archLabel = [form.archUpper && 'Upper', form.archLower && 'Lower'].filter(Boolean).join(' & ');
      const scanNote = isEmailFile
        ? `3D file intake — Arches scanned: ${archLabel || 'none selected'}${archFee > 0 ? ` (Br ${archFee.toLocaleString('en-US')} scan fee)` : ''}`
        : null;
      const dropOffAtLab = form.intakeMethod === 'DROP_OFF' || isEmailFile;

      const shared = {
        patientName: form.patientName,
        doctorName: form.doctorName,
        doctorPhone: form.doctorPhone,
        patientGender: form.patientGender,
        patientAge: form.patientAge ? parseInt(form.patientAge) : undefined,
        notes: [scanNote, form.notes].filter(Boolean).join('\n'),
        deliveryType: form.deliveryType,
        deliveryDate: form.deliveryDate || undefined,
        dropOffAtLab,
      };

      if (items.length === 1) {
        await api.post('/cases', { ...shared, ...buildItemPayload(items[0], 0) });
      } else {
        await api.post('/cases/bulk', { ...shared, items: items.map(buildItemPayload) });
      }

      Toast.show({
        type: 'success',
        text1: items.length > 1 ? `${items.length} Cases Submitted!` : 'Case Submitted!',
        text2: dropOffAtLab
          ? 'Your case is on its way into production — no pickup needed.'
          : 'Dispatch will assign a driver to collect the impression.',
        visibilityTime: 4000,
      });
      navigation.navigate('Main', { screen: 'Cases' });
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
            <Text style={styles.label}>Doctor Name *</Text>
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
              <Text style={styles.label}>Doctor Phone *</Text>
              <TextInput
                style={styles.input}
                placeholder="+251 911 000 000"
                placeholderTextColor={Colors.text3}
                value={form.doctorPhone}
                onChangeText={set('doctorPhone')}
                keyboardType="phone-pad"
              />
            </View>
            <View style={{ width: 12 }} />
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Patient Gender</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['Male', 'Female'].map(g => {
                  const active = form.patientGender === g;
                  return (
                    <TouchableOpacity
                      key={g}
                      onPress={() => set('patientGender')(g)}
                      activeOpacity={0.8}
                      style={{
                        flex: 1, height: 48, alignItems: 'center', justifyContent: 'center',
                        borderRadius: Radius.md, borderWidth: 1.5,
                        borderColor: active ? Colors.blue : Colors.border,
                        backgroundColor: active ? Colors.blue + '15' : Colors.bg,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? Colors.blue : Colors.text2 }}>
                        {g}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.formGroup}>
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
        </View>

        {/* ── Work Items — one per work type; add more for a multi-item
            order (e.g. 2 Zirconia + a PFM crown) for the same visit ── */}
        <Text style={styles.itemsHeading}>WORK ORDER{items.length > 1 ? `S (${items.length})` : ''}</Text>
        {items.map((item, i) => (
          <WorkItemCard
            key={item.key}
            item={item}
            index={i}
            onChange={patch => updateItem(i, patch)}
            onRemove={() => removeItem(i)}
            canRemove={items.length > 1}
            priceMap={priceMap}
            durationMap={durationMap}
            expressDurationMap={expressDurationMap}
            deliveryType={form.deliveryType}
          />
        ))}
        <TouchableOpacity style={styles.addItemBtn} onPress={addItem} activeOpacity={0.8}>
          <Text style={styles.addItemBtnText}>＋ Add another work item</Text>
        </TouchableOpacity>

        {/* ── Intake Method ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INTAKE METHOD</Text>

          <View style={{ gap: 10 }}>
            {[
              { value: 'PICKUP',        label: 'To Be Picked Up',   icon: '🛵', desc: 'A delivery exec will collect the impression from you' },
              { value: 'DROP_OFF',      label: 'Dropped at Lab',    icon: '📦', desc: 'You’re bringing the impression to the lab yourself' },
              { value: 'EMAIL_3D_FILE', label: '3D File (Digital Scan)', icon: '💻', desc: 'You’re sending an intraoral scan file instead of a physical impression' },
            ].map(opt => {
              const active = form.intakeMethod === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => set('intakeMethod')(opt.value)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    padding: 12, borderRadius: Radius.md, borderWidth: 2,
                    borderColor: active ? Colors.blue : Colors.border,
                    backgroundColor: active ? Colors.blue + '12' : Colors.bg,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{opt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: active ? Colors.blue : Colors.text1 }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 11, color: Colors.text3 }}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {form.intakeMethod === 'EMAIL_3D_FILE' && (
            <View style={{ marginTop: 12, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.blue + '10', borderWidth: 1.5, borderColor: Colors.blue + '40' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.blue, marginBottom: 8 }}>
                Arch(es) Scanned — Br {ARCH_FEE.toLocaleString('en-US')} per arch
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  { field: 'archUpper', label: 'Upper Arch', checked: form.archUpper },
                  { field: 'archLower', label: 'Lower Arch', checked: form.archLower },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.field}
                    onPress={() => set(opt.field)(!opt.checked)}
                    activeOpacity={0.8}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      padding: 10, borderRadius: Radius.md, borderWidth: 1.5,
                      borderColor: opt.checked ? Colors.blue : Colors.border,
                      backgroundColor: opt.checked ? Colors.surface : Colors.bg,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{opt.checked ? '☑' : '☐'}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: opt.checked ? Colors.blue : Colors.text1 }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {archFee > 0 && (
                <Text style={{ fontSize: 12, color: Colors.blue, marginTop: 8, fontWeight: '600' }}>
                  Scan fee: Br {archFee.toLocaleString('en-US')} — added on top of the {items.length > 1 ? 'first item’s' : 'work-type'} price.
                </Text>
              )}
            </View>
          )}
        </View>

        {/* ── Delivery ── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DELIVERY</Text>

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
            <Text style={styles.label}>Delivery Date <Text style={{ fontSize: 11, color: Colors.text3, fontWeight: '400' }}>(historical cases only — YYYY-MM-DD)</Text></Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 2024-03-15"
              placeholderTextColor={Colors.text3}
              value={form.deliveryDate}
              onChangeText={set('deliveryDate')}
              keyboardType="numbers-and-punctuation"
            />
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
              : <Text style={styles.submitText}>{items.length > 1 ? `Submit ${items.length} Cases` : 'Submit Case'}</Text>
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

  itemsHeading: {
    fontSize: 11, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, marginTop: 2,
  },
  itemCard: {
    backgroundColor: Colors.surface, borderRadius: Radius.lg,
    padding: Spacing.lg, marginBottom: Spacing.md, ...Shadow.sm,
    borderWidth: 1, borderColor: Colors.border,
  },
  itemCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  itemCardTitle: {
    fontSize: 11, fontWeight: '800', color: Colors.text3, letterSpacing: 0.6,
  },
  itemRemove: {
    fontSize: 12, fontWeight: '700', color: Colors.red,
  },
  addItemBtn: {
    borderWidth: 1.5, borderColor: Colors.blue, borderStyle: 'dashed',
    borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addItemBtnText: { fontSize: 13, fontWeight: '700', color: Colors.blue },

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
  dropdownItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownText: { fontSize: 14, color: Colors.text1 },
  dropdownTextActive: { color: Colors.blue, fontWeight: '700' },
  dropdownPrice: { fontSize: 12, fontWeight: '700', color: Colors.text3, marginLeft: 10 },

  // Estimated amount box
  priceBox: {
    marginTop: 12, padding: Spacing.md, borderRadius: Radius.md,
    backgroundColor: Colors.green + '10', borderWidth: 1.5, borderColor: Colors.green + '40',
  },
  priceBoxLabel: { fontSize: 11, fontWeight: '700', color: Colors.text3, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 },
  priceBoxValue: { fontSize: 18, fontWeight: '800', color: Colors.green },
  priceBoxSub: { fontSize: 12, fontWeight: '600', color: Colors.text3 },

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

  // Shade dropdown
  shadeGroupLabel: {
    fontSize: 10, fontWeight: '700', color: Colors.text3,
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 6,
  },
  shadeChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  shadeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.md,
    borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bg,
  },
  shadeChipActive: { borderColor: Colors.blue, backgroundColor: Colors.blue + '15' },
  shadeChipText: { fontSize: 13, fontWeight: '600', color: Colors.text2 },
  shadeChipTextActive: { fontSize: 13, fontWeight: '700', color: Colors.blue },
});
