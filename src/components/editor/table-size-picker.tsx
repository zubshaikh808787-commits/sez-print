import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

const ACCENT = '#48C3C7';
const GRID_SIZE = 10;
const GRID_GAP = 4;

type TableSizePickerProps = {
  rows: number;
  columns: number;
  onRowsChange: (rows: number) => void;
  onColumnsChange: (columns: number) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function TableSizePicker({
  rows,
  columns,
  onRowsChange,
  onColumnsChange,
  onCancel,
  onConfirm,
}: TableSizePickerProps) {
  const { width: screenWidth } = useWindowDimensions();
  const modalWidth = Math.min(screenWidth * 0.62, 280);
  const gridInner = modalWidth - 32;
  const cellSize = (gridInner - GRID_GAP * (GRID_SIZE - 1)) / GRID_SIZE;

  const selectCell = (rowIndex: number, colIndex: number) => {
    onRowsChange(rowIndex + 1);
    onColumnsChange(colIndex + 1);
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.modal, { width: modalWidth }]}>
        <Text style={styles.title}>
          {rows} X {columns}
        </Text>

        <View style={[styles.grid, { width: gridInner }]}>
          {Array.from({ length: GRID_SIZE }, (_, rowIndex) => (
            <View key={`row-${rowIndex}`} style={styles.gridRow}>
              {Array.from({ length: GRID_SIZE }, (_, colIndex) => {
                const selected = rowIndex < rows && colIndex < columns;
                return (
                  <Pressable
                    key={`cell-${rowIndex}-${colIndex}`}
                    onPress={() => selectCell(rowIndex, colIndex)}
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
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 0,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 51,
  },
  title: {
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 16,
    lineHeight: 22,
  },
  grid: {
    alignSelf: 'center',
    marginBottom: 18,
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
  footer: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
    height: 45,
  },
  footerBtn: {
    flex: 1,
    height: 45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#D1D1D6',
    height: '100%',
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#007AFF',
  },
  confirmText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
  pressed: {
    backgroundColor: 'rgba(0, 0, 0, 0.06)',
  },
});
