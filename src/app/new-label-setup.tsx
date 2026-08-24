import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useSettingsStore } from '@/stores/settings-store';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;
const PAPER_TYPES = ['Receipt', 'Label', 'Cardstock', 'Transparent'] as const;

const STANDARD_SIZES = [
  { w: 40, h: 30, label: '40 × 30 mm (Standard)' },
  { w: 30, h: 15, label: '30 × 15 mm (Compact)' },
  { w: 50, h: 30, label: '50 × 30 mm (Medium)' },
  { w: 50, h: 80, label: '50 × 80 mm (Large)' },
];

export default function NewLabelSetupScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    isClone?: string;
    cloneFromId?: string;
    cloneName?: string;
    cloneWidth?: string;
    cloneHeight?: string;
  }>();
  const isClone = params.isClone === 'true';

  const defaults = useSettingsStore((s) => s.defaults);

  const [labelName, setLabelName] = useState(
    isClone ? `${params.cloneName ?? 'Label'} Copy` : 'New Label_1',
  );
  const [labelWidth, setLabelWidth] = useState(
    isClone && params.cloneWidth ? parseFloat(params.cloneWidth) : defaults.labelWidth,
  );
  const [labelHeight, setLabelHeight] = useState(
    isClone && params.cloneHeight ? parseFloat(params.cloneHeight) : defaults.labelHeight,
  );
  const [orientation, setOrientation] = useState<(typeof ORIENTATIONS)[number]>(
    `${defaults.orientation}°` as (typeof ORIENTATIONS)[number],
  );
  const [paperType, setPaperType] = useState<(typeof PAPER_TYPES)[number]>(defaults.paperType);

  // Edit Modals
  const [nameModalVisible, setNameModalVisible] = useState(false);
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [editingDimension, setEditingDimension] = useState<'width' | 'height'>('width');
  const [tempName, setTempName] = useState('');
  const [tempSize, setTempSize] = useState('');

  const handleOpenNameEdit = () => {
    setTempName(labelName);
    setNameModalVisible(true);
  };

  const handleSaveName = () => {
    if (tempName.trim()) {
      setLabelName(tempName.trim());
    }
    setNameModalVisible(false);
  };

  const handleOpenSizeEdit = (dimension: 'width' | 'height') => {
    setEditingDimension(dimension);
    setTempSize(dimension === 'width' ? String(labelWidth) : String(labelHeight));
    setSizeModalVisible(true);
  };

  const handleSaveSize = () => {
    const val = parseFloat(tempSize);
    if (!isNaN(val) && val > 0) {
      if (editingDimension === 'width') {
        setLabelWidth(Math.round(val * 100) / 100);
      } else {
        setLabelHeight(Math.round(val * 100) / 100);
      }
    }
    setSizeModalVisible(false);
  };

  const handleCreateLabel = () => {
    router.replace({
      pathname: '/edit',
      params: {
        labelName,
        labelWidth: String(labelWidth),
        labelHeight: String(labelHeight),
        orientation,
        paperType,
        ...(isClone && params.cloneFromId ? { cloneFromId: params.cloneFromId } : {}),
      },
    });
  };

  return (
    <View style={styles.root}>
      {/* Top Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={14}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>

        <Text style={styles.headerTitle}>{isClone ? 'Label Clone' : 'New Label'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Main Form Fields */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}>
        {/* Card 1: Label Name */}
        <Pressable
          onPress={handleOpenNameEdit}
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          <Text style={styles.fieldLabel}>Label Name</Text>
          <View style={styles.fieldValueWrap}>
            <Text style={styles.fieldValueText} numberOfLines={1}>
              {labelName}
            </Text>
            <Text style={styles.chevronRight}>›</Text>
          </View>
        </Pressable>

        {/* Card 2: Dimensions */}
        <View style={[styles.card, styles.cardColumn]}>
          <Pressable
            onPress={() => handleOpenSizeEdit('width')}
            style={({ pressed }) => [styles.cardRow, pressed && styles.cardPressed]}>
            <Text style={styles.fieldLabel}>Label Width</Text>
            <View style={styles.fieldValueWrap}>
              <Text style={styles.fieldValueText}>{labelWidth.toFixed(2)} mm</Text>
              <Text style={styles.chevronRight}>›</Text>
            </View>
          </Pressable>

          <View style={styles.divider} />

          <Pressable
            onPress={() => handleOpenSizeEdit('height')}
            style={({ pressed }) => [styles.cardRow, pressed && styles.cardPressed]}>
            <Text style={styles.fieldLabel}>Label Height</Text>
            <View style={styles.fieldValueWrap}>
              <Text style={styles.fieldValueText}>{labelHeight.toFixed(2)} mm</Text>
              <Text style={styles.chevronRight}>›</Text>
            </View>
          </Pressable>
        </View>

        {/* Card 3: Orientation */}
        <View style={styles.card}>
          <View style={styles.cardRowSpaced}>
            <Text style={styles.fieldLabel}>Orientation</Text>
            <View style={styles.pillGroup}>
              {ORIENTATIONS.map((opt) => {
                const active = opt === orientation;
                return (
                  <Pressable
                    key={opt}
                    onPress={() => setOrientation(opt)}
                    style={({ pressed }) => [
                      styles.pillBtn,
                      active ? styles.pillBtnActive : styles.pillBtnInactive,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={[styles.pillText, active ? styles.pillTextActive : styles.pillTextInactive]}>
                      {opt}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {/* Card 4: Paper Type */}
        <View style={styles.card}>
          <View style={styles.cardRowSpaced}>
            <Text style={styles.fieldLabel}>Paper Type</Text>
            <View style={styles.pillGroup}>
              {PAPER_TYPES.map((type) => {
                const active = type === paperType;
                return (
                  <Pressable
                    key={type}
                    onPress={() => setPaperType(type)}
                    style={({ pressed }) => [
                      styles.pillBtn,
                      active ? styles.pillBtnActive : styles.pillBtnInactive,
                      pressed && styles.pressed,
                    ]}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                      style={[
                        styles.pillTextPaper,
                        active ? styles.pillTextActive : styles.pillTextInactive,
                      ]}>
                      {type}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Floating Bottom Action Button: "New" */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.two + 6 }]}>
        <Pressable
          onPress={handleCreateLabel}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
          <Text style={styles.newButtonText}>New</Text>
        </Pressable>
      </View>

      {/* Edit Name Modal */}
      <Modal
        visible={nameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNameModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>Edit Label Name</Text>
            <TextInput
              style={styles.modalInput}
              value={tempName}
              onChangeText={setTempName}
              placeholder="e.g. New Label_1"
              placeholderTextColor="#94A3B8"
              autoFocus
            />
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setNameModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalSaveBtn]}
                onPress={handleSaveName}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Size Modal */}
      <Modal
        visible={sizeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSizeModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalHeading}>
              Set {editingDimension === 'width' ? 'Width' : 'Height'} (mm)
            </Text>
            <TextInput
              style={styles.modalInput}
              value={tempSize}
              onChangeText={setTempSize}
              placeholder="e.g. 40.00"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              autoFocus
            />

            {/* Quick Presets */}
            <Text style={styles.presetHeading}>Standard Presets:</Text>
            <View style={styles.presetRow}>
              {STANDARD_SIZES.map((s) => (
                <Pressable
                  key={s.label}
                  style={styles.presetChip}
                  onPress={() => {
                    setLabelWidth(s.w);
                    setLabelHeight(s.h);
                    setSizeModalVisible(false);
                  }}>
                  <Text style={styles.presetChipText}>{s.w}×{s.h}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalBtn, styles.modalCancelBtn]}
                onPress={() => setSizeModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalSaveBtn]}
                onPress={handleSaveSize}>
                <Text style={styles.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F0F3F8',
  },
  header: {
    backgroundColor: '#214668',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two + 4,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backChevron: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '300',
    lineHeight: 38,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 36,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowColor: '#0B1F33',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  cardPressed: {
    backgroundColor: '#F8FAFC',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 2,
  },
  cardRowSpaced: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    flexWrap: 'nowrap',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#EAECEF',
    width: '100%',
    marginVertical: 4,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2C3E50',
    flexShrink: 0,
    marginRight: 6,
  },
  fieldValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldValueText: {
    fontSize: 15,
    color: '#7E8B98',
    fontWeight: '400',
  },
  chevronRight: {
    fontSize: 22,
    color: '#A0AEC0',
    fontWeight: '300',
    marginTop: -2,
  },
  pillGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-end',
    flexWrap: 'nowrap',
  },
  pillBtn: {
    flex: 1,
    height: 38,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 1,
  },
  pillBtnActive: {
    backgroundColor: '#17A6B8',
  },
  pillBtnInactive: {
    backgroundColor: '#F1F3F6',
  },
  pillText: {
    fontSize: 11.5,
    textAlign: 'center',
    includeFontPadding: false,
    width: '100%',
  },
  pillTextPaper: {
    fontSize: 10.2,
    letterSpacing: -0.2,
    textAlign: 'center',
    includeFontPadding: false,
    width: '100%',
  },
  pillTextActive: {
    color: '#FFFFFF',
    fontWeight: '400',
  },
  pillTextInactive: {
    color: '#7E8B98',
    fontWeight: '400',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  newButton: {
    backgroundColor: '#17A6B8',
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 380,
    shadowColor: '#17A6B8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  newButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  modalHeading: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    height: 48,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  presetHeading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  presetChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  presetChipText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtn: {
    backgroundColor: '#F1F5F9',
  },
  modalSaveBtn: {
    backgroundColor: '#17A6B8',
  },
  modalCancelText: {
    color: '#64748B',
    fontSize: 15,
    fontWeight: '500',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
