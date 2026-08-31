import { StyleSheet, Text, View } from 'react-native';

const TEAL = '#17A6B8';
const GRAY = '#7E8B98';

/**
 * Overlapping rectangles with a '+' inside for "New Label"
 */
export function NewLabelIcon({ color = TEAL, size = 26 }: { color?: string; size?: number }) {
  const scale = size / 26;
  const boxW = 16 * scale;
  const boxH = 16 * scale;
  const stroke = 2 * scale;
  const radius = 4 * scale;

  return (
    <View style={[styles.iconBox, { width: size, height: size }]}>
      {/* Back rectangle (top-right) */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: boxW,
          height: boxH,
          borderRadius: radius,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      {/* Front rectangle (bottom-left) */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: boxW,
          height: boxH,
          borderRadius: radius,
          borderWidth: stroke,
          borderColor: color,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {/* Centered '+' */}
        <View style={{ width: 8 * scale, height: 8 * scale, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: 8 * scale,
              height: 2 * scale,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 2 * scale,
              height: 8 * scale,
              backgroundColor: color,
              borderRadius: 1,
            }}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * 4-quadrant scan icon with vertical scanner rays in bottom-right for "Scan Label"
 */
export function ScanLabelIcon({ color = TEAL, size = 26 }: { color?: string; size?: number }) {
  const scale = size / 26;
  const quadSize = 11 * scale;
  const stroke = 2 * scale;
  const radius = 3.2 * scale;

  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignContent: 'space-between',
      }}>
      {/* Top Left */}
      <View
        style={{
          width: quadSize,
          height: quadSize,
          borderRadius: radius,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      {/* Top Right */}
      <View
        style={{
          width: quadSize,
          height: quadSize,
          borderRadius: radius,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      {/* Bottom Left */}
      <View
        style={{
          width: quadSize,
          height: quadSize,
          borderRadius: radius,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      {/* Bottom Right: 3 vertical scanning lines */}
      <View
        style={{
          width: quadSize,
          height: quadSize,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 0.5 * scale,
        }}>
        <View
          style={{
            width: 2 * scale,
            height: 10 * scale,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
        <View
          style={{
            width: 2 * scale,
            height: 6 * scale,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
        <View
          style={{
            width: 2 * scale,
            height: 10 * scale,
            backgroundColor: color,
            borderRadius: 1,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Document with folded corner and badge label for "Print Excel" / "Print PDF"
 */
export function DocBadgeIcon({
  badge,
  color = GRAY,
  size = 34,
}: {
  badge: string;
  color?: string;
  size?: number;
}) {
  const scale = size / 34;
  const docW = 26 * scale;
  const docH = 32 * scale;
  const stroke = 2 * scale;
  const foldSize = 8 * scale;

  return (
    <View
      style={{
        width: docW,
        height: docH,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}>
      {/* Main document body border (except top-right fold) */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: docW,
          height: docH,
          borderWidth: stroke,
          borderColor: color,
          borderRadius: 4.5 * scale,
          borderTopRightRadius: 0,
        }}
      />
      {/* Fold corner line */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: foldSize,
          height: foldSize,
          borderLeftWidth: stroke,
          borderBottomWidth: stroke,
          borderColor: color,
          backgroundColor: '#FFFFFF',
          borderBottomLeftRadius: 3 * scale,
        }}
      />
      {/* Badge container inside doc */}
      <View
        style={{
          borderWidth: 1.2 * scale,
          borderColor: color,
          borderRadius: 2.5 * scale,
          paddingHorizontal: 3 * scale,
          paddingVertical: 1 * scale,
          marginBottom: 3.5 * scale,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text
          style={{
            color,
            fontSize: 7 * scale,
            fontWeight: '800',
            letterSpacing: 0.2,
            textAlign: 'center',
          }}>
          {badge}
        </Text>
      </View>
    </View>
  );
}

/**
 * Landscape / Photo icon for "Print Photo"
 */
export function PrintPhotoIcon({ color = TEAL, size = 32 }: { color?: string; size?: number }) {
  const scale = size / 32;
  const stroke = 2 * scale;
  const frameW = 28 * scale;
  const frameH = 28 * scale;

  return (
    <View
      style={{
        width: frameW,
        height: frameH,
        borderWidth: stroke,
        borderColor: color,
        borderRadius: 6 * scale,
        position: 'relative',
        overflow: 'hidden',
      }}>
      {/* Sun Circle */}
      <View
        style={{
          position: 'absolute',
          top: 4.5 * scale,
          right: 5.5 * scale,
          width: 5 * scale,
          height: 5 * scale,
          borderRadius: 2.5 * scale,
          backgroundColor: color,
        }}
      />
      {/* Diagonal Mountain 1 */}
      <View
        style={{
          position: 'absolute',
          bottom: -4 * scale,
          left: 2 * scale,
          width: 15 * scale,
          height: 15 * scale,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
      {/* Diagonal Mountain 2 */}
      <View
        style={{
          position: 'absolute',
          bottom: -2.5 * scale,
          right: 1.5 * scale,
          width: 10 * scale,
          height: 10 * scale,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/**
 * 4-corner brackets with "C" for "Label Clone"
 */
export function LabelCloneIcon({ color = TEAL, size = 32 }: { color?: string; size?: number }) {
  const scale = size / 32;
  const cornerSize = 8 * scale;
  const stroke = 2 * scale;
  const radius = 4 * scale;

  return (
    <View
      style={{
        width: size,
        height: size,
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Top Left */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: cornerSize,
          height: cornerSize,
          borderTopWidth: stroke,
          borderLeftWidth: stroke,
          borderColor: color,
          borderTopLeftRadius: radius,
        }}
      />
      {/* Top Right */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: cornerSize,
          height: cornerSize,
          borderTopWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
          borderTopRightRadius: radius,
        }}
      />
      {/* Bottom Left */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: cornerSize,
          height: cornerSize,
          borderBottomWidth: stroke,
          borderLeftWidth: stroke,
          borderColor: color,
          borderBottomLeftRadius: radius,
        }}
      />
      {/* Bottom Right */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: cornerSize,
          height: cornerSize,
          borderBottomWidth: stroke,
          borderRightWidth: stroke,
          borderColor: color,
          borderBottomRightRadius: radius,
        }}
      />
      {/* Centered Letter C */}
      <Text
        style={{
          color,
          fontSize: 16 * scale,
          fontWeight: '700',
          textAlign: 'center',
          lineHeight: 18 * scale,
        }}>
        C
      </Text>
    </View>
  );
}

/**
 * 3-node graph icon for Share
 */
export function ShareNodeIcon({ color = TEAL, size = 24 }: { color?: string; size?: number }) {
  const scale = size / 24;
  const nodeSize = 6 * scale;
  const stroke = 1.6 * scale;

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {/* Top diagonal connector line */}
      <View
        style={{
          position: 'absolute',
          top: 6 * scale,
          left: 6.5 * scale,
          width: 11 * scale,
          height: stroke,
          backgroundColor: color,
          transform: [{ rotate: '-30deg' }],
        }}
      />
      {/* Bottom diagonal connector line */}
      <View
        style={{
          position: 'absolute',
          bottom: 6 * scale,
          left: 6.5 * scale,
          width: 11 * scale,
          height: stroke,
          backgroundColor: color,
          transform: [{ rotate: '30deg' }],
        }}
      />
      {/* Left Node */}
      <View
        style={{
          position: 'absolute',
          top: 9 * scale,
          left: 2 * scale,
          width: nodeSize,
          height: nodeSize,
          borderRadius: nodeSize / 2,
          borderWidth: stroke,
          borderColor: color,
          backgroundColor: '#FFFFFF',
        }}
      />
      {/* Top Right Node */}
      <View
        style={{
          position: 'absolute',
          top: 2 * scale,
          right: 2 * scale,
          width: nodeSize,
          height: nodeSize,
          borderRadius: nodeSize / 2,
          borderWidth: stroke,
          borderColor: color,
          backgroundColor: '#FFFFFF',
        }}
      />
      {/* Bottom Right Node */}
      <View
        style={{
          position: 'absolute',
          bottom: 2 * scale,
          right: 2 * scale,
          width: nodeSize,
          height: nodeSize,
          borderRadius: nodeSize / 2,
          borderWidth: stroke,
          borderColor: color,
          backgroundColor: '#FFFFFF',
        }}
      />
    </View>
  );
}

/**
 * Film strip / photographic frame icon for "Use frame"
 */
export function UseFrameIcon({ color = '#214668', size = 36 }: { color?: string; size?: number }) {
  const scale = size / 36;
  const w = 24 * scale;
  const h = 34 * scale;
  const stroke = 2 * scale;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Outer film strip card */}
      <View
        style={{
          width: w,
          height: h,
          borderRadius: 4 * scale,
          borderWidth: stroke,
          borderColor: color,
          paddingVertical: 3 * scale,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
        {/* Horizontal frame window 1 */}
        <View
          style={{
            width: w - 2 * stroke - 4 * scale,
            height: 6 * scale,
            borderWidth: stroke * 0.8,
            borderColor: color,
            borderRadius: 1.5 * scale,
          }}
        />
        {/* Horizontal frame window 2 */}
        <View
          style={{
            width: w - 2 * stroke - 4 * scale,
            height: 6 * scale,
            borderWidth: stroke * 0.8,
            borderColor: color,
            borderRadius: 1.5 * scale,
          }}
        />
        {/* Horizontal frame window 3 */}
        <View
          style={{
            width: w - 2 * stroke - 4 * scale,
            height: 6 * scale,
            borderWidth: stroke * 0.8,
            borderColor: color,
            borderRadius: 1.5 * scale,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Overlapping card with plus icon for "Print directly"
 */
export function PrintDirectlyIcon({ color = '#17A6B8', size = 36 }: { color?: string; size?: number }) {
  const scale = size / 36;
  const cardW = 20 * scale;
  const cardH = 26 * scale;
  const stroke = 2 * scale;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {/* Back card offset/rotated */}
      <View
        style={{
          position: 'absolute',
          right: 4 * scale,
          top: 3 * scale,
          width: cardW,
          height: cardH,
          borderRadius: 4 * scale,
          borderWidth: stroke,
          borderColor: color,
          transform: [{ rotate: '12deg' }],
        }}
      />
      {/* Front card filled with plus */}
      <View
        style={{
          position: 'absolute',
          left: 4 * scale,
          bottom: 3 * scale,
          width: cardW,
          height: cardH,
          borderRadius: 4 * scale,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        {/* Plus sign */}
        <View style={{ width: 10 * scale, height: 10 * scale, alignItems: 'center', justifyContent: 'center' }}>
          <View
            style={{
              position: 'absolute',
              width: 10 * scale,
              height: 2.5 * scale,
              backgroundColor: '#FFFFFF',
              borderRadius: 1,
            }}
          />
          <View
            style={{
              position: 'absolute',
              width: 2.5 * scale,
              height: 10 * scale,
              backgroundColor: '#FFFFFF',
              borderRadius: 1,
            }}
          />
        </View>
      </View>
    </View>
  );
}

export function ShippingLabelIcon({ color = TEAL, size = 30 }: { color?: string; size?: number }) {
  const scale = size / 30;
  const stroke = 2 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 20 * scale,
          height: 24 * scale,
          borderRadius: 3 * scale,
          borderWidth: stroke,
          borderColor: color,
          backgroundColor: '#FFFFFF',
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 8 * scale,
          width: 12 * scale,
          height: stroke,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 13 * scale,
          width: 12 * scale,
          height: stroke,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: 18 * scale,
          width: 8 * scale,
          height: stroke,
          backgroundColor: color,
          borderRadius: 1,
        }}
      />
    </View>
  );
}

export function CustomizeIcon({ color = TEAL, size = 30 }: { color?: string; size?: number }) {
  const scale = size / 30;
  const stroke = 2 * scale;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 22 * scale,
          height: 16 * scale,
          borderRadius: 3 * scale,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 8 * scale,
          height: 8 * scale,
          borderRadius: 2 * scale,
          borderWidth: stroke,
          borderColor: color,
          backgroundColor: '#FFFFFF',
          bottom: 4 * scale,
          right: 4 * scale,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  iconBox: {
    position: 'relative',
  },
});
