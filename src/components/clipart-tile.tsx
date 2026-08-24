import { StyleSheet, Text, View } from 'react-native';

import { ClipartIcon } from '@/components/clipart-icon';
import type { ClipartItem } from '@/constants/clipart-library';

export function ClipartTile({ item }: { item: ClipartItem }) {
  return (
    <View style={styles.tile}>
      <ClipartIcon shapes={item.shapes} size={34} color="#111111" />
      <Text style={styles.label} numberOfLines={1}>
        {item.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#F4F6F8',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
    minHeight: 76,
    borderWidth: 1,
    borderColor: '#E2E6EC',
    gap: 4,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 10,
    color: '#4B5563',
    fontWeight: '500',
  },
});
