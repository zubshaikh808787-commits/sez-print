import React, { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import type { ElementAnchorRect } from '@/lib/editor/quick-value';

const ACCENT = '#48C3C7';
const DANGER = '#E53935';
const MUTED = '#8A94A6';

export type QuickValueModalProps = {
  visible: boolean;
  initialValue: string;
  title?: string;
  placeholder?: string;
  anchorRect?: ElementAnchorRect;
  onCancel: () => void;
  onConfirm: (newValue: string) => void;
};

export function QuickValueModal({
  visible,
  initialValue,
  title,
  placeholder,
  anchorRect,
  onCancel,
  onConfirm,
}: QuickValueModalProps) {
  const [draft, setDraft] = useState(initialValue);
  const [cardHeight, setCardHeight] = useState(200);
  const inputRef = React.useRef<TextInput>(null);
  const openTimeRef = React.useRef(0);
  const { width: windowWidth } = useWindowDimensions();

  useEffect(() => {
    if (visible) {
      openTimeRef.current = Date.now();
      setDraft(initialValue);
    }
  }, [visible, initialValue]);

  const handleClear = () => {
    setDraft('');
  };

  const handleConfirm = () => {
    onConfirm(draft);
  };

  const handleBackdropPress = () => {
    // Ignore any backdrop tap within 800ms of opening.
    // This prevents continuous taps from immediately dismissing the modal!
    if (Date.now() - openTimeRef.current < 800) {
      return;
    }
    onCancel();
  };

  const cardWidth = Math.min(340, Math.max(280, windowWidth - 32));
  const minTop = 64; // Below top status bar / header

  let cardTop = minTop + 8;
  let cardLeft = (windowWidth - cardWidth) / 2;

  if (anchorRect && anchorRect.y > 0) {
    const elementCenterX = anchorRect.x + anchorRect.width / 2;
    cardLeft = Math.max(16, Math.min(windowWidth - cardWidth - 16, elementCenterX - cardWidth / 2));

    // Place directly ABOVE the element
    const aboveY = anchorRect.y - cardHeight - 12;
    if (aboveY >= minTop) {
      cardTop = aboveY;
    } else {
      // Element is near the top of the canvas: place at top boundary above the element
      cardTop = minTop;
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      onShow={() => {
        setTimeout(() => {
          inputRef.current?.focus();
        }, 50);
      }}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={handleBackdropPress}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View
          style={[
            styles.card,
            {
              position: 'absolute',
              top: cardTop,
              left: cardLeft,
              width: cardWidth,
            },
          ]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - cardHeight) > 4) {
              setCardHeight(h);
            }
          }}
          onStartShouldSetResponder={() => true}
          onTouchEnd={(e) => e.stopPropagation?.()}>
          {!!title && <Text style={styles.cardTitle}>{title}</Text>}

          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              autoFocus
              multiline
              placeholder={placeholder || 'Enter value'}
              placeholderTextColor="#94A3B8"
              selectionColor={ACCENT}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              onPress={onCancel}
              hitSlop={12}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleClear}
              hitSlop={12}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>

            <Pressable
              onPress={handleConfirm}
              hitSlop={12}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.btnPressed]}>
              <Text style={styles.confirmText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    zIndex: 9999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
    zIndex: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  inputContainer: {
    width: '100%',
    minHeight: 80,
    maxHeight: 160,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  input: {
    fontSize: 16,
    color: '#1E293B',
    textAlignVertical: 'top',
    minHeight: 60,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.6,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: MUTED,
  },
  clearText: {
    fontSize: 16,
    fontWeight: '600',
    color: DANGER,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: ACCENT,
  },
});
