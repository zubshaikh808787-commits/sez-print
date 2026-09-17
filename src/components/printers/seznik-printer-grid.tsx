import React, { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Palette } from '@/constants/ui';
import {
  PRINTER_MODEL_LIST,
  SEZNIK_PRINTER_MODELS,
  type SeznikPrinterModel,
  type SeznikPrinterModelId,
} from '@/constants/printer-models';
import { getPrinterManager } from '@/lib/printer/printer-manager';
import { usePrinterStore } from '@/stores/printer-store';

interface SeznikPrinterGridProps {
  onSelectModel?: (model: SeznikPrinterModel) => void;
  selectedModelId?: SeznikPrinterModelId | null;
  onTestPrint?: (model: SeznikPrinterModel) => void | Promise<void>;
  onDisconnect?: (model: SeznikPrinterModel) => void | Promise<void>;
  compact?: boolean;
}

export const SeznikPrinterGrid: React.FC<SeznikPrinterGridProps> = ({
  onSelectModel,
  selectedModelId,
  onTestPrint,
  onDisconnect,
  compact = false,
}) => {
  const status = usePrinterStore((s) => s.status);
  const deviceName = usePrinterStore((s) => s.deviceName);
  const activeModelId = usePrinterStore((s) => s.selectedPrinterModel);
  const setSelectedPrinterModel = usePrinterStore((s) => s.setSelectedPrinterModel);
  const clearConnection = usePrinterStore((s) => s.clearConnection);

  const [connectedSdk, setConnectedSdk] = useState<SeznikPrinterModelId | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const refreshSdkStates = useCallback(() => {
    const mgr = getPrinterManager();
    if (mgr.isModelConnected('td404')) {
      setConnectedSdk('td404');
    } else if (mgr.isModelConnected('josh')) {
      setConnectedSdk('josh');
    } else if (mgr.isModelConnected('dev')) {
      setConnectedSdk('dev');
    } else if (mgr.isModelConnected('tez')) {
      setConnectedSdk('tez');
    } else if (mgr.isModelConnected('labelx')) {
      setConnectedSdk('labelx');
    } else if (status === 'connected') {
      setConnectedSdk(activeModelId);
    } else {
      setConnectedSdk(null);
    }
  }, [status, activeModelId]);

  useEffect(() => {
    refreshSdkStates();
    const interval = setInterval(refreshSdkStates, 2500);
    return () => clearInterval(interval);
  }, [refreshSdkStates]);

  const getModelStatus = (model: SeznikPrinterModel) => {
    if (connectedSdk === model.id && (status === 'connected' || getPrinterManager().isModelConnected(model.id))) {
      return 'connected';
    }
    return 'disconnected';
  };

  const handleSelect = async (model: SeznikPrinterModel) => {
    setSelectedPrinterModel(model.id);
    if (onSelectModel) {
      onSelectModel(model);
    }
  };

  const handleInternalDisconnect = async (model: SeznikPrinterModel) => {
    setIsDisconnecting(true);
    try {
      if (onDisconnect) {
        await onDisconnect(model);
      } else {
        await getPrinterManager().disconnect();
      }
      setConnectedSdk(null);
      clearConnection();
    } catch {
      // Ignored
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleInternalTestPrint = async (model: SeznikPrinterModel) => {
    setIsTesting(true);
    try {
      if (onTestPrint) {
        await onTestPrint(model);
      } else {
        const mgr = getPrinterManager();
        await mgr.printTestLabel(model.shortName);
        Alert.alert('Test Label Sent!', `Test pattern transmitted to ${model.name}.`);
      }
    } catch (err: any) {
      Alert.alert(
        'Print Error',
        err?.message || 'Failed to print test pattern. Please verify printer connection and label roll.',
      );
    } finally {
      setIsTesting(false);
    }
  };

  const currentSelection = selectedModelId ?? activeModelId;

  return (
    <View style={styles.container}>
      {PRINTER_MODEL_LIST.map((model) => {
        const modelConnected = getModelStatus(model) === 'connected';
        const isSelected = currentSelection === model.id;

        return (
          <View
            key={model.id}
            style={[
              styles.modelCard,
              isSelected && styles.modelCardSelected,
              modelConnected && styles.modelCardConnected,
            ]}>
            <Pressable
              onPress={() => handleSelect(model)}
              style={({ pressed }) => [styles.cardHeader, pressed && styles.cardPressed]}>
              {/* Icon Container */}
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: model.badgeColor },
                ]}>
                <AppIcon
                  name="printer"
                  tintColor={model.badgeTextColor}
                  size={compact ? 20 : 24}
                />
              </View>

              {/* Info Container */}
              <View style={styles.infoContainer}>
                <View style={styles.titleRow}>
                  <Text numberOfLines={1} style={styles.modelName}>
                    {model.name}
                  </Text>
                  <View
                    style={[
                      styles.typeBadge,
                      {
                        backgroundColor: model.badgeColor,
                        borderColor: model.badgeBorderColor,
                      },
                    ]}>
                    <Text style={[styles.typeBadgeText, { color: model.badgeTextColor }]}>
                      {model.shortName}
                    </Text>
                  </View>
                </View>

                <Text numberOfLines={1} style={styles.tagline}>
                  {model.tagline}
                </Text>

                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: modelConnected ? '#10B981' : isSelected ? Palette.accent : '#94A3B8' },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: modelConnected ? '#10B981' : isSelected ? Palette.accent : '#64748B' },
                    ]}>
                    {modelConnected
                      ? `Connected: ${deviceName ?? model.name}`
                      : isSelected
                      ? 'Selected — Tap to Scan & Link'
                      : 'Ready to Connect'}
                  </Text>
                </View>
              </View>

              {/* Action Arrow / Check */}
              <View style={styles.actionArrow}>
                {modelConnected ? (
                  <AppIcon name="checkmark.circle.fill" tintColor="#10B981" size={22} />
                ) : (
                  <AppIcon name="chevron.right" tintColor={isSelected ? Palette.accent : '#94A3B8'} size={18} />
                )}
              </View>
            </Pressable>

            {/* Connected Action Buttons */}
            {modelConnected && (
              <View style={styles.connectedActionsRow}>
                <Pressable
                  style={({ pressed }) => [styles.testPrintBtn, pressed && styles.btnPressed]}
                  onPress={() => handleInternalTestPrint(model)}
                  disabled={isTesting}>
                  {isTesting ? (
                    <ActivityIndicator size="small" color="#007AFF" />
                  ) : (
                    <>
                      <AppIcon name="printer" tintColor="#007AFF" size={15} />
                      <Text style={styles.testPrintBtnText}>Test Print</Text>
                    </>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.disconnectBtn, pressed && styles.btnPressed]}
                  onPress={() => handleInternalDisconnect(model)}
                  disabled={isDisconnecting}>
                  {isDisconnecting ? (
                    <ActivityIndicator size="small" color="#FF3B30" />
                  ) : (
                    <>
                      <AppIcon name="xmark" tintColor="#FF3B30" size={14} />
                      <Text style={styles.disconnectBtnText}>Disconnect</Text>
                    </>
                  )}
                </Pressable>
              </View>
            )}

            {!modelConnected && !compact && model.warningNotice && (
              <View style={[styles.warningBox, { borderColor: model.badgeBorderColor }]}>
                <Text style={styles.warningText}>{model.warningNotice}</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  modelCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  modelCardSelected: {
    borderColor: Palette.accent,
    borderWidth: 1.5,
    backgroundColor: '#F8FAFC',
  },
  modelCardConnected: {
    borderColor: '#10B981',
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardPressed: {
    opacity: 0.75,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  modelName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tagline: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  actionArrow: {
    marginLeft: 8,
  },
  connectedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  testPrintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    gap: 6,
  },
  testPrintBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
  },
  disconnectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 6,
  },
  disconnectBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FF3B30',
  },
  btnPressed: {
    opacity: 0.7,
  },
  warningBox: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
  },
  warningText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
});
