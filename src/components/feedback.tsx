import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp } from '@/context/AppContext';

type FeedbackTone = 'success' | 'danger' | 'warning' | 'info';
type ToastInput = { title: string; message?: string; tone?: FeedbackTone };
type ConfirmInput = { title: string; message: string; confirmLabel: string; cancelLabel: string; destructive?: boolean; onConfirm: () => Promise<void> | void };
type FeedbackValue = { showToast: (input: ToastInput) => void; confirm: (input: ConfirmInput) => void };

const FeedbackContext = createContext<FeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const { theme, isRTL } = useApp();
  const [toast, setToast] = useState<ToastInput | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmInput | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((input: ToastInput) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(input);
    timer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const confirm = useCallback((input: ConfirmInput) => setConfirmation(input), []);
  const value = useMemo(() => ({ showToast, confirm }), [showToast, confirm]);
  const tone = toast?.tone ?? 'info';
  const toneColor = tone === 'success' ? theme.colors.success : tone === 'danger' ? theme.colors.danger : tone === 'warning' ? theme.colors.warning : theme.colors.primary;
  const toneSoft = tone === 'success' ? theme.colors.successSoft : tone === 'danger' ? theme.colors.dangerSoft : tone === 'warning' ? theme.colors.warningSoft : theme.colors.primarySoft;
  const icon: keyof typeof Feather.glyphMap = tone === 'success' ? 'check-circle' : tone === 'danger' ? 'alert-octagon' : tone === 'warning' ? 'alert-triangle' : 'info';

  return <FeedbackContext.Provider value={value}>{children}
    {toast ? <View pointerEvents="box-none" style={styles.toastLayer}>
      <Pressable accessibilityRole="alert" accessibilityLabel={[toast.title, toast.message].filter(Boolean).join('. ')} onPress={() => setToast(null)} style={[styles.toast, { backgroundColor: theme.colors.surfaceRaised, borderColor: toneColor, shadowColor: theme.shadow.color, shadowOpacity: theme.shadow.opacity, shadowRadius: theme.shadow.radius, elevation: theme.shadow.elevation }]}> 
        <View style={[styles.toastIcon, { backgroundColor: toneSoft }]}><Feather name={icon} size={19} color={toneColor} /></View>
        <View style={{ flex: 1 }}><Text style={[styles.toastTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{toast.title}</Text>{toast.message ? <Text style={[styles.toastMessage, { color: theme.colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{toast.message}</Text> : null}</View>
        <Feather name="x" size={18} color={theme.colors.textSubtle} />
      </Pressable>
    </View> : null}
    <Modal transparent visible={Boolean(confirmation)} animationType="fade" onRequestClose={() => setConfirmation(null)}>
      <View style={[styles.modalLayer, { backgroundColor: theme.colors.overlay }]}>
        <View style={[styles.dialog, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, shadowColor: theme.shadow.color, shadowOpacity: theme.shadow.opacity, shadowRadius: theme.shadow.radius, elevation: theme.shadow.elevation + 2 }]}>
          <View style={[styles.dialogIcon, { backgroundColor: confirmation?.destructive ? theme.colors.dangerSoft : theme.colors.primarySoft }]}><Feather name={confirmation?.destructive ? 'trash-2' : 'help-circle'} color={confirmation?.destructive ? theme.colors.danger : theme.colors.primary} size={22} /></View>
          <Text style={[styles.dialogTitle, { color: theme.colors.text, textAlign: isRTL ? 'right' : 'left' }]}>{confirmation?.title}</Text>
          <Text style={[styles.dialogMessage, { color: theme.colors.textMuted, textAlign: isRTL ? 'right' : 'left' }]}>{confirmation?.message}</Text>
          <View style={[styles.dialogActions, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={confirmation?.cancelLabel} onPress={() => setConfirmation(null)} style={[styles.dialogButton, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={{ color: theme.colors.text, fontWeight: '800' }}>{confirmation?.cancelLabel}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={confirmation?.confirmLabel} onPress={async () => { const task = confirmation?.onConfirm; setConfirmation(null); await task?.(); }} style={[styles.dialogButton, { backgroundColor: confirmation?.destructive ? theme.colors.danger : theme.colors.primary }]}><Text style={{ color: '#fff', fontWeight: '900' }}>{confirmation?.confirmLabel}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </FeedbackContext.Provider>;
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback must be used inside FeedbackProvider');
  return context;
}

const styles = StyleSheet.create({
  toastLayer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-start', paddingHorizontal: 16, paddingTop: 58, zIndex: 30 },
  toast: { minHeight: 68, borderWidth: 1, borderRadius: 20, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  toastIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  toastTitle: { fontWeight: '900', fontSize: 14 },
  toastMessage: { fontSize: 12, marginTop: 3, lineHeight: 18 },
  modalLayer: { flex: 1, justifyContent: 'center', padding: 24 },
  dialog: { borderWidth: 1, borderRadius: 26, padding: 20 },
  dialogIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  dialogTitle: { fontSize: 19, fontWeight: '900' },
  dialogMessage: { fontSize: 13, lineHeight: 21, marginTop: 8 },
  dialogActions: { gap: 10, marginTop: 22 },
  dialogButton: { flex: 1, minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
});
