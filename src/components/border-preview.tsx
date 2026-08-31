import { StyleSheet, Text, View } from 'react-native';

import type { BorderStyleId } from '@/constants/border-library';

export function BorderPreview({ styleId }: { styleId: BorderStyleId }) {
  switch (styleId) {
    case 'solid-thin':
      return <View style={[styles.box, { borderWidth: 1 }]} />;
    case 'solid-medium':
      return <View style={[styles.box, { borderWidth: 2.5 }]} />;
    case 'solid-thick':
      return <View style={[styles.box, { borderWidth: 4 }]} />;
    case 'dashed':
      return <View style={[styles.box, styles.dashed]} />;
    case 'dotted':
      return <View style={[styles.box, styles.dotted]} />;
    case 'double':
      return (
        <View style={[styles.box, { borderWidth: 3, borderColor: '#111827' }]}>
          <View style={styles.doubleInner} />
        </View>
      );
    case 'rounded':
      return <View style={[styles.box, { borderWidth: 2, borderRadius: 12 }]} />;
    case 'ticket':
      return (
        <View style={styles.ticketWrap}>
          <View style={styles.ticketNotchLeft} />
          <View style={[styles.box, styles.ticketBody]} />
          <View style={styles.ticketNotchRight} />
        </View>
      );
    case 'label-frame':
      return (
        <View style={styles.labelFrameOuter}>
          <View style={styles.labelFrameInner} />
        </View>
      );
    case 'price-tag':
      return (
        <View style={styles.priceTag}>
          <View style={styles.priceTagHole} />
        </View>
      );
    case 'corner-brackets':
      return (
        <View style={styles.box}>
          <View style={[styles.bracket, styles.bracketTL]} />
          <View style={[styles.bracket, styles.bracketTR]} />
          <View style={[styles.bracket, styles.bracketBL]} />
          <View style={[styles.bracket, styles.bracketBR]} />
        </View>
      );
    case 'scallop':
      return (
        <View style={styles.scallopWrap}>
          <View style={styles.scallopTopRow}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.scallopBump} />
            ))}
          </View>
          <View style={[styles.box, { borderWidth: 2, marginTop: -8 }]} />
        </View>
      );
    case 'ornate':
      return (
        <View style={styles.ornateOuter}>
          <View style={styles.ornateInner} />
        </View>
      );
    case 'wave':
      return (
        <View style={styles.waveWrap}>
          <View style={styles.waveLine} />
          <View style={[styles.box, { borderWidth: 2, marginTop: 6 }]} />
        </View>
      );
    case 'stamp':
      return <View style={[styles.box, styles.stampEdge]} />;
    case 'industrial':
      return (
        <View style={styles.industrialPlate}>
          <View style={styles.industrialBolt} />
          <View style={[styles.industrialBolt, { right: 6, left: undefined }]} />
        </View>
      );
    case 'triple-line':
      return (
        <View style={styles.tripleOuter}>
          <View style={styles.tripleMid}>
            <View style={styles.tripleInner} />
          </View>
        </View>
      );
    case 'shadow-box':
      return (
        <View style={styles.shadowWrap}>
          <View style={styles.shadowBox} />
        </View>
      );
    case 'inset-panel':
      return (
        <View style={styles.insetOuter}>
          <View style={styles.insetMid}>
            <View style={styles.insetInner} />
          </View>
        </View>
      );
    case 'pill-shape':
      return <View style={[styles.box, styles.pillShape]} />;
    case 'barcode-frame':
      return (
        <View style={styles.barcodeFrame}>
          <View style={styles.barcodeBars} />
        </View>
      );
    case 'shipping-box':
      return (
        <View style={styles.shippingBox}>
          <View style={styles.shippingTape} />
          <View style={styles.shippingFlap} />
        </View>
      );
    case 'zigzag':
      return (
        <View style={styles.zigzagWrap}>
          <View style={styles.zigzagTop} />
          <View style={[styles.box, { borderWidth: 2, marginTop: -1 }]} />
        </View>
      );
    case 'chain-link':
      return (
        <View style={styles.chainWrap}>
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={[styles.chainLink, i % 2 === 1 && styles.chainLinkOffset]} />
          ))}
        </View>
      );
    case 'laurel':
      return (
        <View style={styles.laurelWrap}>
          <View style={[styles.laurelLeaf, styles.laurelLeft]} />
          <View style={[styles.laurelLeaf, styles.laurelRight]} />
          <View style={[styles.box, { borderWidth: 2, marginHorizontal: 10 }]} />
        </View>
      );
    case 'vintage-frame':
      return (
        <View style={styles.vintageOuter}>
          <View style={styles.vintageCornerTL} />
          <View style={styles.vintageCornerTR} />
          <View style={styles.vintageCornerBL} />
          <View style={styles.vintageCornerBR} />
          <View style={styles.vintageInner} />
        </View>
      );
    case 'art-deco':
      return (
        <View style={styles.artDecoOuter}>
          <View style={styles.artDecoTop} />
          <View style={styles.artDecoBottom} />
          <View style={styles.artDecoInner} />
        </View>
      );
    case 'rope-border':
      return (
        <View style={styles.ropeWrap}>
          <View style={styles.ropeTopRow}>
            {Array.from({ length: 7 }).map((_, i) => (
              <View key={i} style={styles.ropeSegment} />
            ))}
          </View>
          <View style={[styles.box, { borderWidth: 2, marginTop: -4 }]} />
        </View>
      );
    case 'caution-stripes':
      return (
        <View style={styles.cautionWrap}>
          <View style={styles.cautionStripes} />
          <View style={styles.cautionInner} />
        </View>
      );
    case 'hazard-diamond':
      return (
        <View style={styles.hazardWrap}>
          <View style={styles.hazardDiamond}>
            <Text style={styles.hazardText}>!</Text>
          </View>
        </View>
      );
    case 'warning-bar':
      return (
        <View style={styles.warningWrap}>
          <View style={styles.warningBar} />
          <View style={[styles.box, { borderWidth: 2, marginTop: 4 }]} />
        </View>
      );
    case 'crosshair':
      return (
        <View style={styles.box}>
          <View style={[styles.crosshair, styles.crosshairTL]} />
          <View style={[styles.crosshair, styles.crosshairTR]} />
          <View style={[styles.crosshair, styles.crosshairBL]} />
          <View style={[styles.crosshair, styles.crosshairBR]} />
        </View>
      );
    default:
      return <View style={[styles.box, { borderWidth: 2 }]} />;
  }
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    height: '100%',
    borderColor: '#111827',
    backgroundColor: 'transparent',
    borderRadius: 2,
  },
  dashed: {
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  dotted: {
    borderWidth: 2,
    borderStyle: 'dotted',
  },
  doubleInner: {
    flex: 1,
    margin: 4,
    borderWidth: 1.5,
    borderColor: '#111827',
  },
  ticketWrap: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketBody: {
    flex: 1,
    borderWidth: 2,
    height: '78%',
  },
  ticketNotchLeft: {
    width: 10,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    marginRight: -5,
    zIndex: 1,
  },
  ticketNotchRight: {
    width: 10,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EEF1F5',
    marginLeft: -5,
    zIndex: 1,
  },
  labelFrameOuter: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#111827',
    padding: 4,
    backgroundColor: '#FFFFFF',
  },
  labelFrameInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
  },
  priceTag: {
    width: '88%',
    height: '78%',
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '-8deg' }],
    alignSelf: 'center',
  },
  priceTagHole: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#EEF1F5',
  },
  bracket: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: '#111827',
  },
  bracketTL: {
    top: 4,
    left: 4,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  bracketTR: {
    top: 4,
    right: 4,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bracketBL: {
    bottom: 4,
    left: 4,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bracketBR: {
    bottom: 4,
    right: 4,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  scallopWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  scallopTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  scallopBump: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
  },
  ornateOuter: {
    width: '100%',
    height: '100%',
    borderWidth: 3,
    borderColor: '#111827',
    padding: 3,
    backgroundColor: '#FFFFFF',
  },
  ornateInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
    borderStyle: 'dashed',
  },
  waveWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  waveLine: {
    height: 8,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#111827',
    borderStyle: 'dashed',
  },
  stampEdge: {
    borderWidth: 2,
    borderStyle: 'dotted',
    borderRadius: 2,
  },
  industrialPlate: {
    width: '100%',
    height: '100%',
    borderWidth: 3,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  industrialBolt: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#111827',
  },
  tripleOuter: {
    width: '100%',
    height: '100%',
    borderWidth: 3,
    borderColor: '#111827',
    padding: 2,
    backgroundColor: '#FFFFFF',
  },
  tripleMid: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
    padding: 2,
  },
  tripleInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
  },
  shadowWrap: {
    width: '100%',
    height: '100%',
    paddingLeft: 4,
    paddingTop: 4,
  },
  shadowBox: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
  },
  insetOuter: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#D1D5DB',
    padding: 3,
  },
  insetMid: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#6B7280',
    padding: 3,
    backgroundColor: '#E5E7EB',
  },
  insetInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
  },
  pillShape: {
    borderWidth: 2,
    borderRadius: 999,
  },
  barcodeFrame: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    justifyContent: 'flex-end',
    padding: 6,
  },
  barcodeBars: {
    height: '42%',
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#F3F4F6',
  },
  shippingBox: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  shippingTape: {
    position: 'absolute',
    top: '46%',
    left: 0,
    right: 0,
    height: 8,
    backgroundColor: '#9CA3AF',
    opacity: 0.55,
  },
  shippingFlap: {
    position: 'absolute',
    top: 0,
    left: '34%',
    width: '32%',
    height: 12,
    borderWidth: 2,
    borderColor: '#111827',
    borderTopWidth: 0,
    backgroundColor: '#F9FAFB',
  },
  zigzagWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  zigzagTop: {
    height: 6,
    marginHorizontal: 4,
    borderTopWidth: 2,
    borderColor: '#111827',
    transform: [{ skewX: '-20deg' }],
  },
  chainWrap: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  chainLink: {
    width: 12,
    height: 18,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
  },
  chainLinkOffset: {
    marginTop: 6,
  },
  laurelWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
  },
  laurelLeaf: {
    position: 'absolute',
    width: 10,
    height: 18,
    borderWidth: 2,
    borderColor: '#111827',
    borderRadius: 8,
    top: '38%',
  },
  laurelLeft: {
    left: 2,
    transform: [{ rotate: '-24deg' }],
  },
  laurelRight: {
    right: 2,
    transform: [{ rotate: '24deg' }],
  },
  vintageOuter: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    padding: 6,
  },
  vintageInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
  },
  vintageCornerTL: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 10,
    height: 10,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#111827',
  },
  vintageCornerTR: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#111827',
  },
  vintageCornerBL: {
    position: 'absolute',
    bottom: 2,
    left: 2,
    width: 10,
    height: 10,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#111827',
  },
  vintageCornerBR: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#111827',
  },
  artDecoOuter: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  artDecoTop: {
    position: 'absolute',
    top: 4,
    left: '20%',
    right: '20%',
    height: 4,
    backgroundColor: '#111827',
  },
  artDecoBottom: {
    position: 'absolute',
    bottom: 4,
    left: '20%',
    right: '20%',
    height: 4,
    backgroundColor: '#111827',
  },
  artDecoInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#111827',
  },
  ropeWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  ropeTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  ropeSegment: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
  },
  cautionWrap: {
    width: '100%',
    height: '100%',
    borderWidth: 2,
    borderColor: '#111827',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    padding: 4,
  },
  cautionStripes: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FBBF24',
    opacity: 0.35,
    transform: [{ rotate: '-18deg' }, { scale: 1.4 }],
    borderWidth: 6,
    borderColor: '#111827',
    borderStyle: 'dashed',
  },
  cautionInner: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#111827',
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  hazardWrap: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardDiamond: {
    width: '58%',
    height: '58%',
    borderWidth: 3,
    borderColor: '#111827',
    backgroundColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardText: {
    transform: [{ rotate: '-45deg' }],
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  warningWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
  },
  warningBar: {
    height: 10,
    marginHorizontal: 4,
    backgroundColor: '#111827',
    borderRadius: 2,
  },
  crosshair: {
    position: 'absolute',
    width: 12,
    height: 12,
  },
  crosshairTL: {
    top: 6,
    left: 6,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: '#111827',
  },
  crosshairTR: {
    top: 6,
    right: 6,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: '#111827',
  },
  crosshairBL: {
    bottom: 6,
    left: 6,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: '#111827',
  },
  crosshairBR: {
    bottom: 6,
    right: 6,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: '#111827',
  },
});
