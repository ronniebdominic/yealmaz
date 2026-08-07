import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Spacing, Radius, FontFamily } from '../utils/theme';
import GlassCard from './GlassCard';

// RN's Alert.alert() only renders on native — it's a silent no-op on web,
// so any confirmation flow that relies on it (redeeming a reward, signing
// out) just does nothing when tapped in the PWA. This is a themed dialog
// built on RN's <Modal>, which react-native-web does support, so it works
// identically on both.
export default function ConfirmDialog({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm, onCancel }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <GlassCard strong radius={Radius.lg} style={styles.box}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, destructive && styles.confirmBtnDanger]} onPress={onConfirm} activeOpacity={0.85}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(11,29,58,0.5)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
  box: { width: '100%', maxWidth: 340, padding: Spacing.xl },
  title: { fontSize: 17, fontFamily: FontFamily.bold, color: Colors.text1, marginBottom: 6 },
  message: { fontSize: 14, fontFamily: FontFamily.regular, color: Colors.text2, lineHeight: 20, marginBottom: Spacing.lg },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  cancelText: { fontSize: 14, fontFamily: FontFamily.semibold, color: Colors.text2 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: Radius.md, alignItems: 'center', backgroundColor: Colors.primary },
  confirmBtnDanger: { backgroundColor: Colors.red },
  confirmText: { fontSize: 14, fontFamily: FontFamily.bold, color: '#fff' },
});
