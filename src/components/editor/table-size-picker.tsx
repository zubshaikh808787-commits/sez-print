import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

const GRID_SIZE = 8;
const GRID_GAP = 4;
const MIN_COUNT = 1;
const MAX_COUNT = 8;

type TableSizePickerProps = {
  rows: number;
  columns: number;
  onRowsChange: (rows: number) => void;
  onColumnsChange: (columns: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

function clampCount(value: number) {
  if (!Number.isFinite(value)) return MIN_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.round(value)));
}

function CountField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    const next = clampCount(Number.isFinite(parsed) ? parsed : value);
    setDraft(String(next));
    onChange(next);
  };

  return (
    <View style={styles.countField}>
      <Text style={styles.countLabel}>{label}</Text>
      <View style={styles.countControls}>
        <Pressable
          onPress={() => onChange(clampCount(value - 1))}
          style={({ pressed }) => [styles.countBtn, pressed && styles.pressed]}>
          <Text style={styles.countBtnText}>−</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={(raw) => {
            const cleaned = raw.replace(/[^0-9]/g, '');
            setDraft(cleaned);
            const parsed = parseInt(cleaned, 10);
            if (Number.isFinite(parsed) && parsed >= MIN_COUNT) {
              onChange(clampCount(parsed));
            }
          }}
          onBlur={() => commit(draft)}
          onSubmitEditing={() => commit(draft)}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          style={styles.countInput}
        />
        <Pressable
          onPress={() => onChange(clampCount(value + 1))}
          style={({ pressed }) => [styles.countBtn, pressed && styles.pressed]}>
          <Text style={styles.countBtnText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function TableSizePicker({
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  onCancel,
  onConfirm,
}: TableSizePickerProps) {
  const { width: screenWidth } = useWindowDimensions();
  const modalWidth = Math.min(screenWidth * 0.78, 320);
  const gridInner = modalWidth - 36;
  const cellSize = (gridInner - GRID_GAP * (GRID_SIZE - 1)) / GRID_SIZE;
  const safeRows = clampCount(rows);
  const safeColumns = clampCount(columns);

  const selectCell = (rowIndex: number, colIndex: number) => {
    onRowsChange(rowIndex + 1);
    onColumnsChange(colIndex + 1);
  };

  const selectFromPoint = (locationX: number, locationY: number) => {
    const pitch = cellSize + GRID_GAP;
    const colIndex = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(locationX / pitch)));
    const rowIndex = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(locationY / pitch)));
    selectCell(rowIndex, colIndex);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onCancel} />
        <View style={[styles.modal, { width: modalWidth }]}>
          <Text style={styles.title}>
            {safeColumns} X {safeRows}
          </Text>

          <View
            style={[styles.grid, { width: gridInner }]}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderGrant={(event) => {
              selectFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
            }}
            onResponderMove={(event) => {
              selectFromPoint(event.nativeEvent.locationX, event.nativeEvent.locationY);
            }}>
            {Array.from({ length: GRID_SIZE }, (_, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.gridRow} pointerEvents="none">
                {Array.from({ length: GRID_SIZE }, (_, colIndex) => {
                  const selected = rowIndex < safeRows && colIndex < safeColumns;
                  return (
                    <View
                      key={`cell-${rowIndex}-${colIndex}`}
                      style={[
                        styles.cell,
                        {
                          width: cellSize,
                          height: cellSize,
                          marginRight: colIndex < GRID_SIZE - 1 ? GRID_GAP : 0,
                        },
                        selected && styles.cellSelected,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>

          <View style={styles.writeRow}>
            <CountField label="Columns" value={safeColumns} onChange={onColumnsChange} />
            <CountField label="Rows" value={safeRows} onChange={onRowsChange} />
          </View>

          <View style={styles.footer}>
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <View style={styles.footerDivider} />
            <Pressable onPress={onConfirm} style={({ pressed }) => [styles.footerBtn, pressed && styles.pressed]}>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingTop: 18,
    paddingHorizontal: 16,
    paddingBottom: 0,
    overflow: 'hidden',
    zIndex: 2,
    elevation: 8,
  },
  title: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 14,
  },
  grid: {
    alignSelf: 'center',
    marginBottom: 14,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: GRID_GAP,
  },
  cell: {
    borderWidth: 1,
    borderColor: '#D8DEE6',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  cellSelected: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  writeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  countField: {
    flex: 1,
  },
  countLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  countControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBtnText: {
    fontSize: 18,
    lineHeight: 20,
    color: '#007AFF',
    fontWeight: '600',
  },
  countInput: {
    flex: 1,
    minWidth: 36,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D8DEE6',
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#007AFF',
    paddingVertical: 0,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
    height: 46,
    marginHorizontal: -16,
  },
  footerBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#D1D1D6',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#007AFF',
  },
  confirmText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#007AFF',
  },
  pressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
});
