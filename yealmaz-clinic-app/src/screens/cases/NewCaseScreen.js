import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, StatusBar, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Modal, SafeAreaView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../../api/client';
import { Colors, Spacing, Radius, Shadow, FontFamily } from '../../utils/theme';
import GlassCard from '../../components/GlassCard';
import { useLanguage } from '../../context/LanguageContext';

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
            borderColor: active ? Colors.primary : Colors.border,
            backgroundColor: active ? Colors.primary : Colors.surface,
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

// ── Original Case Picker — full-screen popup (for Remake/Redo) ─────────
// Debounced search over this clinic's own past cases — GET /cases auto-
// scopes to the clinic's own cases for a CLINIC-role token, so there's no
// risk of linking to another clinic's case. Mirrors the receptionist app's
// OriginalCasePicker: the lab's eventual free-remake-vs-50%-redo decision
// is priced off THIS linked case's totalAmount, so nothing can be decided
// without it — hence the link is required, not optional. Pops up the
// moment "Redo / Replacement" is checked, so searching happens right away
// instead of the clinic having to notice a field further down the form.
function OriginalCasePickerModal({ visible, onClose, onSelect }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); return; }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      api.get('/cases', { params: { search: query.trim(), limit: 15 } })
        .then(res => setResults(res.data.cases || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <SafeAreaView style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('newCase.searchOriginalCaseModalTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <MaterialCommunityIcons name="close" size={22} color={Colors.text2} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalHint}>
            {t('newCase.searchOriginalCaseHint')}
          </Text>
          <TextInput
            style={[styles.input, { marginTop: Spacing.md }]}
            placeholder={t('newCase.searchOriginalCasePlaceholder')}
            placeholderTextColor={Colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <ScrollView style={{ marginTop: Spacing.md }} keyboardShouldPersistTaps="handled">
            {searching ? (
              <View style={{ padding: Spacing.lg, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : !query.trim() ? (
              <Text style={styles.modalEmptyText}>{t('newCase.startTypingToSearch')}</Text>
            ) : results.length === 0 ? (
              <Text style={styles.modalEmptyText}>{t('newCase.noMatchingCases')}</Text>
            ) : results.map(rc => (
              <TouchableOpacity key={rc.id} style={styles.modalResultRow} onPress={() => onSelect(rc)}>
                <MaterialCommunityIcons name="clipboard-text-outline" size={18} color={Colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownText}>{rc.caseNumber || t('newCase.noScanNumber')} · {rc.patientName}</Text>
                  <Text style={{ fontSize: 11, color: Colors.text3, marginTop: 1 }}>
                    {rc.workType || ''}{rc.units ? ` · ${rc.units}u` : ''}{rc.shade ? ` · Shade ${rc.shade}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// Read-only summary of the linked case once one's been picked — tap to
// reopen the popup and pick a different one.
function SelectedOriginalCase({ selected, onPress, onClear }) {
  const { t } = useLanguage();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        padding: 12, borderRadius: Radius.md, borderWidth: 1.5,
        borderColor: Colors.border, backgroundColor: Colors.bg,
      }}
    >
      <MaterialCommunityIcons name="clipboard-text-outline" size={16} color={Colors.text2} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text1 }} numberOfLines={1}>
          {selected.caseNumber || t('newCase.noScanNumber')}
        </Text>
        <Text style={{ fontSize: 11, color: Colors.text3 }} numberOfLines={1}>
          {selected.patientName}{selected.workType ? ` · ${selected.workType}` : ''}
        </Text>
      </View>
      <TouchableOpacity onPress={onClear} hitSlop={8}>
        <MaterialCommunityIcons name="close" size={18} color={Colors.red} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

let itemKeySeq = 0;
const emptyItem = () => ({
  key: `item-${++itemKeySeq}`,
  workType: '', shade: '', dueDate: '',
  remake: false, remakeReason: '', originalCase: null,
  selectedTeeth: [], manualUnits: '',
});

// ── One work-type item within a (possibly multi-item) order ──────────
// Everything that used to be a single set of screen-level fields (Tooth
// Selection, Work Type, Shade, Redo, Due Date, estimated Amount) now lives
// here, repeated once per item — each item becomes its own independently-
// tracked case (own case number/QR) on submit.
// "14, 15, 16" → [14, 15, 16] — same format the odontogram/backend use.
const parseToothNumbers = (str) =>
  !str ? [] : String(str).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

function WorkItemCard({
  item, index, onChange, onRemove, canRemove,
  priceMap, durationMap, expressDurationMap, deliveryType, onFillFromOriginal,
}) {
  const { t } = useLanguage();
  const [showWorkTypes, setShowWorkTypes] = useState(false);
  const [showShades, setShowShades] = useState(false);
  const [customShade, setCustomShade] = useState(false);
  const [autoCalcDays, setAutoCalcDays] = useState(null);
  const [originalCasePickerOpen, setOriginalCasePickerOpen] = useState(false);

  // Selecting an original case pulls this item's own details straight from
  // it — a redo/replacement is almost always the same work, so there's no
  // reason to make the clinic re-type it.
  const selectOriginalCase = (rc) => {
    const teeth = parseToothNumbers(rc.toothNumbers);
    onChange({
      originalCase: rc,
      workType: rc.workType || item.workType,
      shade: rc.shade || item.shade,
      selectedTeeth: teeth,
      manualUnits: teeth.length === 0 && rc.units != null ? String(rc.units) : item.manualUnits,
    });
    onFillFromOriginal?.(rc);
    setOriginalCasePickerOpen(false);
  };

  // A remake/redo item's price is never computed here — the lab's Operation
  // Manager decides free-remake vs. 50%-of-original-case after review, so
  // totalAmount is forced to 0 at submission regardless of this item's own
  // work type/units (mirrors the receptionist app's same rule).
  const selectedPrice = useMemo(() => {
    if (item.remake) return null;
    const p = priceMap[item.workType];
    if (!p) return null;
    const isExpress = deliveryType === 'EXPRESS' && p.expressPrice != null;
    const unit = isExpress ? p.expressPrice : p.price;
    const isFlat = FLAT_PRICE_TYPES.has(item.workType);
    const count = isFlat ? 1 : Math.max(1, item.selectedTeeth.length);
    const total = Math.round(unit * count);
    return { unit, count, isFlat, isExpress, total };
  }, [priceMap, item.workType, deliveryType, item.selectedTeeth.length, item.remake]);

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
    <GlassCard strong style={styles.itemCard}>
      <View style={styles.itemCardHeader}>
        <Text style={styles.itemCardTitle}>{t('newCase.item', { n: index + 1 })}</Text>
        {canRemove && (
          <TouchableOpacity onPress={onRemove}>
            <Text style={styles.itemRemove}>{t('newCase.remove')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tooth Selection */}
      <Text style={styles.subHint}>{t('newCase.toothHint')}</Text>
      <View style={{ marginTop: 10 }}>
        <Odontogram selected={item.selectedTeeth} onToggle={toggleTooth} />
      </View>

      <View style={styles.teethSummaryRow}>
        {item.selectedTeeth.length > 0 ? (
          <>
            <Text style={styles.teethSelected}>
              {t('newCase.selected', { teeth: '' })}<Text style={{ color: Colors.primary, fontWeight: '700' }}>{item.selectedTeeth.join(', ')}</Text>
            </Text>
            <TouchableOpacity onPress={() => onChange({ selectedTeeth: [] })}>
              <Text style={styles.clearBtn}>{t('common.clearAll')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={styles.teethNone}>{t('newCase.noTeethSelected')}</Text>
        )}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>
          {item.selectedTeeth.length > 0 ? t('newCase.unitsAuto') : t('newCase.units')}
        </Text>
        <TextInput
          style={[styles.input, item.selectedTeeth.length > 0 && { opacity: 0.6 }]}
          keyboardType="numeric"
          placeholder={t('newCase.unitsPlaceholder')}
          placeholderTextColor={Colors.textMuted}
          value={item.selectedTeeth.length > 0 ? String(item.selectedTeeth.length) : item.manualUnits}
          onChangeText={v => { if (item.selectedTeeth.length === 0) onChange({ manualUnits: v }); }}
          editable={item.selectedTeeth.length === 0}
        />
      </View>

      {/* Work Details */}
      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('newCase.workType')}</Text>
        <TouchableOpacity
          style={[styles.input, styles.selectInput]}
          onPress={() => setShowWorkTypes(!showWorkTypes)}
        >
          <Text style={item.workType ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
            {item.workType || t('newCase.selectWorkType')}
          </Text>
          <MaterialCommunityIcons name={showWorkTypes ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text3} />
        </TouchableOpacity>
        {showWorkTypes && (
          <View style={styles.dropdown}>
            {Object.keys(priceMap).length === 0 ? (
              <Text style={{ padding: Spacing.md, fontSize: 13, color: Colors.text3, fontStyle: 'italic' }}>
                {t('newCase.noWorkTypes')}
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
            <Text style={styles.priceBoxLabel}>{t('newCase.estimatedAmount')}</Text>
            <Text style={styles.priceBoxValue}>
              Br {selectedPrice.total.toLocaleString('en-US')}
              {!selectedPrice.isFlat && selectedPrice.count > 1 && (
                <Text style={styles.priceBoxSub}>  ·  Br {selectedPrice.unit.toLocaleString('en-US')} × {selectedPrice.count}</Text>
              )}
              {selectedPrice.isExpress && <Text style={styles.priceBoxSub}>  ·  ⚡ {t('newCase.express')}</Text>}
            </Text>
          </View>
        )}
        {item.remake && (
          <View style={[styles.priceBox, { backgroundColor: Colors.amberDim, borderColor: Colors.amber + '40' }]}>
            <Text style={[styles.priceBoxLabel, { color: Colors.amber }]}>{t('newCase.pendingReview')}</Text>
            <Text style={{ fontSize: 12.5, color: Colors.text2, marginTop: 2 }}>
              {t('newCase.pendingReviewSub')}
            </Text>
          </View>
        )}
      </View>

      {!/aligner/i.test(item.workType || '') && (
        <View style={styles.formGroup}>
          <Text style={styles.label}>{t('newCase.shade')}</Text>
          <TouchableOpacity
            style={[styles.input, styles.selectInput]}
            onPress={() => { setShowShades(prev => !prev); setCustomShade(false); }}
          >
            <Text style={item.shade ? styles.selectText : styles.selectPlaceholder} numberOfLines={1}>
              {item.shade || t('newCase.selectShade')}
            </Text>
            <MaterialCommunityIcons name={showShades ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.text3} />
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
                  <Text style={[styles.dropdownText, { color: Colors.primary }]}>✏️  {t('newCase.customShade')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
          {customShade && (
            <TextInput
              style={[styles.input, { marginTop: 6 }]}
              placeholder={t('newCase.customShadePlaceholder')}
              placeholderTextColor={Colors.text3}
              value={item.shade}
              onChangeText={v => onChange({ shade: v })}
              autoFocus
            />
          )}
        </View>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('newCase.redoReplacement')}</Text>
        <TouchableOpacity
          onPress={() => {
            const turningOn = !item.remake;
            onChange({
              remake: turningOn,
              ...(turningOn ? {} : { remakeReason: '', originalCase: null }),
            });
            // Pop the search up immediately — no separate field to notice.
            if (turningOn) setOriginalCasePickerOpen(true);
          }}
          activeOpacity={0.8}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
            borderRadius: Radius.md, borderWidth: 1.5,
            borderColor: item.remake ? Colors.amber : Colors.border,
            backgroundColor: item.remake ? Colors.amber + '12' : Colors.bg,
          }}
        >
          <Text style={{ fontSize: 18 }}>{item.remake ? '☑' : '☐'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: item.remake ? Colors.amber : Colors.text1 }}>
              {t('newCase.redoCheckboxLabel')}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.text3 }}>
              {t('newCase.redoCheckboxSub')}
            </Text>
          </View>
        </TouchableOpacity>

        {item.remake && (
          <>
            <Text style={[styles.label, { marginTop: Spacing.md }]}>{t('newCase.originalCase')}</Text>
            {item.originalCase ? (
              <SelectedOriginalCase
                selected={item.originalCase}
                onPress={() => setOriginalCasePickerOpen(true)}
                onClear={() => onChange({ originalCase: null })}
              />
            ) : (
              <TouchableOpacity
                onPress={() => setOriginalCasePickerOpen(true)}
                activeOpacity={0.8}
                style={[styles.input, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
              >
                <MaterialCommunityIcons name="magnify" size={18} color={Colors.primary} />
                <Text style={{ fontSize: 13.5, color: Colors.primary, fontWeight: '700' }}>
                  {t('newCase.searchOriginalCase')}
                </Text>
              </TouchableOpacity>
            )}
            <OriginalCasePickerModal
              visible={originalCasePickerOpen}
              onClose={() => setOriginalCasePickerOpen(false)}
              onSelect={selectOriginalCase}
            />
            <Text style={[styles.label, { marginTop: Spacing.md }]}>{t('newCase.reasonOptional')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('newCase.reasonPlaceholder')}
              placeholderTextColor={Colors.textMuted}
              value={item.remakeReason}
              onChangeText={v => onChange({ remakeReason: v })}
            />
          </>
        )}
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t('newCase.dueDate')}</Text>
        {autoCalcDays ? (
          <View style={{
            backgroundColor: Colors.primary + '10',
            borderWidth: 1.5, borderColor: Colors.primary + '40',
            borderRadius: Radius.md, padding: Spacing.md,
          }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primary }}>
              📅 {formatDueDate(item.dueDate)}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.text3, marginTop: 2 }}>
              {t('newCase.autoCalculated', { days: autoCalcDays, plural: autoCalcDays !== 1 ? 's' : '', workType: item.workType })}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: Colors.text3, fontStyle: 'italic' }}>
            {t('newCase.selectWorkTypeForDueDate')}
          </Text>
        )}
      </View>
    </GlassCard>
  );
}

// ── Screen ────────────────────────────────────────────────
export default function NewCaseScreen({ navigation }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    patientName: '', patientAge: '', doctorName: '', doctorPhone: '',
    patientGender: '', notes: '',
    deliveryType: 'NORMAL', intakeMethod: 'PICKUP',
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
    const required = t('common.required');
    if (!form.patientName.trim()) { Alert.alert(required, t('newCase.requiredPatientName')); return false; }
    if (items.some(it => !it.workType)) { Alert.alert(required, t('newCase.requiredWorkType')); return false; }
    if (form.intakeMethod === 'EMAIL_3D_FILE' && !form.archUpper && !form.archLower) {
      Alert.alert(required, t('newCase.requiredArch'));
      return false;
    }
    // Doctor name/contact/shade are mandatory for new orders.
    if (!form.doctorName.trim())  { Alert.alert(required, t('newCase.requiredDoctorName')); return false; }
    if (!form.doctorPhone.trim()) { Alert.alert(required, t('newCase.requiredDoctorPhone')); return false; }
    for (const it of items) {
      if (!/aligner/i.test(it.workType) && !it.shade.trim()) {
        Alert.alert(required, t('newCase.requiredShade'));
        return false;
      }
      if (it.remake && !it.originalCase) {
        Alert.alert(required, t('newCase.requiredOriginalCase'));
        return false;
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
        // A remake/redo item's totalAmount is forced to 0 server-side
        // regardless of what's sent — the Operation Manager prices it
        // (free remake, or 50% of the linked original case) after review.
        const totalAmount = item.remake ? undefined : (unit != null ? Math.round(unit * count + fee) : undefined);
        return {
          workType: item.workType,
          shade: item.shade,
          toothNumbers: item.selectedTeeth.length > 0 ? item.selectedTeeth.join(', ') : undefined,
          units: resolvedUnits,
          remake: item.remake,
          remakeReason: item.remake ? (item.remakeReason.trim() || undefined) : undefined,
          originalCaseId: item.remake ? item.originalCase?.id : undefined,
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
        dropOffAtLab,
      };

      if (items.length === 1) {
        await api.post('/cases', { ...shared, ...buildItemPayload(items[0], 0) });
      } else {
        await api.post('/cases/bulk', { ...shared, items: items.map(buildItemPayload) });
      }

      Toast.show({
        type: 'success',
        text1: items.length > 1 ? t('newCase.submittedTitlePlural', { count: items.length }) : t('newCase.submittedTitle'),
        text2: dropOffAtLab
          ? t('newCase.submittedNoPickup')
          : t('newCase.submittedPickup'),
        visibilityTime: 4000,
      });
      navigation.navigate('Main', { screen: 'Cases' });
    } catch (err) {
      Alert.alert(t('newCase.submissionFailed'), err.response?.data?.error || t('common.genericError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={Colors.primary} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{t('newCase.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('newCase.headerTitle')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Patient Information ── */}
        <GlassCard strong style={styles.section}>
          <Text style={styles.sectionTitle}>{t('newCase.patientInfo')}</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('newCase.patientName')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('newCase.patientNamePlaceholder')}
              placeholderTextColor={Colors.text3}
              value={form.patientName}
              onChangeText={set('patientName')}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('newCase.doctorName')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('newCase.doctorNamePlaceholder')}
              placeholderTextColor={Colors.text3}
              value={form.doctorName}
              onChangeText={set('doctorName')}
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>{t('newCase.doctorPhone')}</Text>
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
              <Text style={styles.label}>{t('newCase.patientGender')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {[
                  { value: 'Male', label: t('newCase.genderMale') },
                  { value: 'Female', label: t('newCase.genderFemale') },
                ].map(g => {
                  const active = form.patientGender === g.value;
                  return (
                    <TouchableOpacity
                      key={g.value}
                      onPress={() => set('patientGender')(g.value)}
                      activeOpacity={0.8}
                      style={{
                        flex: 1, height: 48, alignItems: 'center', justifyContent: 'center',
                        borderRadius: Radius.md, borderWidth: 1.5,
                        borderColor: active ? Colors.primary : Colors.border,
                        backgroundColor: active ? Colors.primary + '15' : Colors.bg,
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: active ? Colors.primary : Colors.text2 }}>
                        {g.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('newCase.age')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('newCase.agePlaceholder')}
              placeholderTextColor={Colors.text3}
              value={form.patientAge}
              onChangeText={set('patientAge')}
              keyboardType="numeric"
            />
          </View>
        </GlassCard>

        {/* ── Work Items — one per work type; add more for a multi-item
            order (e.g. 2 Zirconia + a PFM crown) for the same visit ── */}
        <Text style={styles.itemsHeading}>{items.length > 1 ? t('newCase.workOrders', { count: items.length }) : t('newCase.workOrder')}</Text>
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
            onFillFromOriginal={rc => setForm(prev => ({
              ...prev,
              patientName:   rc.patientName || prev.patientName,
              patientAge:    rc.patientAge != null ? String(rc.patientAge) : prev.patientAge,
              patientGender: rc.patientGender || prev.patientGender,
              doctorName:    rc.doctorName || prev.doctorName,
              doctorPhone:   rc.doctorPhone || prev.doctorPhone,
            }))}
          />
        ))}
        <TouchableOpacity style={styles.addItemBtn} onPress={addItem} activeOpacity={0.8}>
          <Text style={styles.addItemBtnText}>{t('newCase.addItem')}</Text>
        </TouchableOpacity>

        {/* ── Intake Method ── */}
        <GlassCard strong style={styles.section}>
          <Text style={styles.sectionTitle}>{t('newCase.intakeMethod')}</Text>

          <View style={{ gap: 10 }}>
            {[
              { value: 'PICKUP',        label: t('newCase.intakePickupLabel'),   icon: 'moped',                  desc: t('newCase.intakePickupDesc') },
              { value: 'DROP_OFF',      label: t('newCase.intakeDropOffLabel'),    icon: 'package-variant-closed',  desc: t('newCase.intakeDropOffDesc') },
              { value: 'EMAIL_3D_FILE', label: t('newCase.intakeEmailLabel'), icon: 'laptop',              desc: t('newCase.intakeEmailDesc') },
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
                    borderColor: active ? Colors.primary : Colors.border,
                    backgroundColor: active ? Colors.primary + '12' : Colors.bg,
                  }}
                >
                  <MaterialCommunityIcons name={opt.icon} size={20} color={active ? Colors.primary : Colors.text2} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: FontFamily.bold, color: active ? Colors.primary : Colors.text1 }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontSize: 11, fontFamily: FontFamily.regular, color: Colors.text3 }}>{opt.desc}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {form.intakeMethod === 'EMAIL_3D_FILE' && (
            <View style={{ marginTop: 12, padding: 12, borderRadius: Radius.md, backgroundColor: Colors.primary + '10', borderWidth: 1.5, borderColor: Colors.primary + '40' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary, marginBottom: 8 }}>
                {t('newCase.archesScanned', { fee: ARCH_FEE.toLocaleString('en-US') })}
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  { field: 'archUpper', label: t('newCase.archUpper'), checked: form.archUpper },
                  { field: 'archLower', label: t('newCase.archLower'), checked: form.archLower },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.field}
                    onPress={() => set(opt.field)(!opt.checked)}
                    activeOpacity={0.8}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
                      padding: 10, borderRadius: Radius.md, borderWidth: 1.5,
                      borderColor: opt.checked ? Colors.primary : Colors.border,
                      backgroundColor: opt.checked ? Colors.surface : Colors.bg,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{opt.checked ? '☑' : '☐'}</Text>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: opt.checked ? Colors.primary : Colors.text1 }}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {archFee > 0 && (
                <Text style={{ fontSize: 12, color: Colors.primary, marginTop: 8, fontWeight: '600' }}>
                  {t('newCase.scanFeeNote', { fee: archFee.toLocaleString('en-US'), which: items.length > 1 ? t('newCase.scanFeeWhichFirst') : t('newCase.scanFeeWhichSingle') })}
                </Text>
              )}
            </View>
          )}
        </GlassCard>

        {/* ── Delivery ── */}
        <GlassCard strong style={styles.section}>
          <Text style={styles.sectionTitle}>{t('newCase.delivery')}</Text>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('newCase.deliveryType')}</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[
                { value: 'NORMAL',  label: t('newCase.deliveryNormalLabel'),  icon: 'truck-delivery-outline', desc: t('newCase.deliveryNormalDesc') },
                { value: 'EXPRESS', label: t('newCase.deliveryExpressLabel'), icon: 'lightning-bolt-outline',  desc: t('newCase.deliveryExpressDesc') },
              ].map(opt => {
                const active = form.deliveryType === opt.value;
                const activeColor = opt.value === 'EXPRESS' ? Colors.amber : Colors.primary;
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
                    <MaterialCommunityIcons name={opt.icon} size={22} color={active ? activeColor : Colors.text2} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontFamily: FontFamily.bold, color: active ? activeColor : Colors.text1 }}>
                        {opt.label}
                      </Text>
                      <Text style={{ fontSize: 10, fontFamily: FontFamily.regular, color: Colors.text3 }}>{opt.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>{t('newCase.notesLabel')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('newCase.notesPlaceholder')}
              placeholderTextColor={Colors.text3}
              value={form.notes}
              onChangeText={set('notes')}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </GlassCard>

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
              : <Text style={styles.submitText}>{items.length > 1 ? t('newCase.submitCases', { count: items.length }) : t('newCase.submitCase')}</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.cancelText}>{t('newCase.cancel')}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },

  // Original Case picker popup
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(11,29,58,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl,
    padding: Spacing.lg, maxHeight: '85%', minHeight: '55%',
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 16, fontFamily: FontFamily.extrabold, color: Colors.text1 },
  modalHint: { fontSize: 12, color: Colors.text3, marginTop: 4 },
  modalEmptyText: { padding: Spacing.lg, fontSize: 13, color: Colors.text3, fontStyle: 'italic', textAlign: 'center' },
  modalResultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  header: {
    backgroundColor: Colors.primary, paddingTop: 52, paddingBottom: 14,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomLeftRadius: Radius.xl, borderBottomRightRadius: Radius.xl,
  },
  backText: { fontSize: 14, color: '#fff', fontFamily: FontFamily.semibold, width: 60 },
  headerTitle: { fontSize: 18, fontFamily: FontFamily.extrabold, color: '#fff' },
  scroll: { padding: Spacing.lg, paddingBottom: 60 },

  section: {
    padding: Spacing.lg, marginBottom: Spacing.md,
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
    padding: Spacing.lg, marginBottom: Spacing.md,
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
    borderWidth: 1.5, borderColor: Colors.primary, borderStyle: 'dashed',
    borderRadius: Radius.md, paddingVertical: 12, alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addItemBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

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
  dropdownItemActive: { backgroundColor: Colors.primary + '10' },
  dropdownItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dropdownText: { fontSize: 14, color: Colors.text1 },
  dropdownTextActive: { color: Colors.primary, fontWeight: '700' },
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
    backgroundColor: Colors.primary, borderRadius: Radius.md,
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
  shadeChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  shadeChipText: { fontSize: 13, fontWeight: '600', color: Colors.text2 },
  shadeChipTextActive: { fontSize: 13, fontWeight: '700', color: Colors.primary },
});
