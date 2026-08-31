import { useMemo } from 'react';

import {
  SettingsCard,
  SettingsScreenShell,
  SettingsSectionLabel,
  SettingsSegmentRow,
  SettingsStepperRow,
  SettingsToggleRow,
  SettingsValueRow,
} from '@/components/settings-ui';
import { BARCODE_MODES } from '@/lib/barcode-code128';
import { parseOrientation, type LabelOrientation } from '@/lib/label-document';
import { useSettingsStore } from '@/stores/settings-store';

const ORIENTATIONS = ['0°', '90°', '180°', '270°'] as const;
const PAPER_TYPES = ['Receipt', 'Label', 'Cardstock', 'Transparent', 'Black mark'] as const;
const WRAP_MODES = ['Close', 'Char', 'Word'] as const;
const QR_LEVELS = ['L', 'M', 'Q', 'H'] as const;
const QR_ZONES = ['0', '2', '4'] as const;
const COLOR_MODES = ['Original', 'B & W', 'Halftone'] as const;

export default function DefaultPropertySettingsScreen() {
  const defaults = useSettingsStore((s) => s.defaults);
  const patchDefaults = useSettingsStore((s) => s.patchDefaults);

  const orientation = `${defaults.orientation}°` as (typeof ORIENTATIONS)[number];
  const setOrientation = (value: (typeof ORIENTATIONS)[number]) =>
    patchDefaults({ orientation: parseOrientation(value) as LabelOrientation });
  const paperType = defaults.paperType;
  const setPaperType = (value: (typeof PAPER_TYPES)[number]) =>
    patchDefaults({ paperType: value });
  const autoFitFont = defaults.autoFitFont;
  const setAutoFitFont = (v: boolean) => patchDefaults({ autoFitFont: v });
  const autoFitSize = defaults.autoFitSize;
  const setAutoFitSize = (v: boolean) => patchDefaults({ autoFitSize: v });
  const autoWrap = defaults.autoWrap as (typeof WRAP_MODES)[number];
  const setAutoWrap = (v: (typeof WRAP_MODES)[number]) => patchDefaults({ autoWrap: v });
  const autoTextHeight = defaults.autoTextHeight;
  const setAutoTextHeight = (v: boolean) => patchDefaults({ autoTextHeight: v });
  const qrLevel = defaults.qrErrorLevel as (typeof QR_LEVELS)[number];
  const setQrLevel = (v: (typeof QR_LEVELS)[number]) => patchDefaults({ qrErrorLevel: v });
  const qrZone = defaults.qrZoneSize as (typeof QR_ZONES)[number];
  const setQrZone = (v: (typeof QR_ZONES)[number]) => patchDefaults({ qrZoneSize: v });
  const tileImage = defaults.tileImage;
  const setTileImage = (v: boolean) => patchDefaults({ tileImage: v });
  const colorMode = defaults.colorMode;
  const setColorMode = (v: (typeof COLOR_MODES)[number]) => patchDefaults({ colorMode: v });
  const grayThreshold = defaults.grayThreshold;
  const setGrayThreshold = (updater: (value: number) => number) =>
    patchDefaults({ grayThreshold: updater(grayThreshold) });

  const now = useMemo(() => new Date(), []);
  const dateDisplay = now.toISOString().slice(0, 10);
  const timeDisplay = now.toTimeString().slice(0, 8);

  return (
    <SettingsScreenShell title="Default Property Settings">
      <SettingsSectionLabel>LABEL</SettingsSectionLabel>
      <SettingsCard>
        <SettingsStepperRow
          label="Label Width"
          value={`${defaults.labelWidth.toFixed(0)} mm`}
          minusDisabled={defaults.labelWidth <= 10}
          onMinus={() => patchDefaults({ labelWidth: Math.max(10, defaults.labelWidth - 5) })}
          onPlus={() => patchDefaults({ labelWidth: Math.min(200, defaults.labelWidth + 5) })}
          showDivider
        />
        <SettingsStepperRow
          label="Label Height"
          value={`${defaults.labelHeight.toFixed(0)} mm`}
          minusDisabled={defaults.labelHeight <= 10}
          onMinus={() => patchDefaults({ labelHeight: Math.max(10, defaults.labelHeight - 5) })}
          onPlus={() => patchDefaults({ labelHeight: Math.min(200, defaults.labelHeight + 5) })}
          showDivider
        />
        <SettingsSegmentRow
          label="Orientation"
          options={ORIENTATIONS}
          selected={orientation}
          onSelect={setOrientation}
          showDivider
        />
        <SettingsSegmentRow
          label="Paper Type"
          options={PAPER_TYPES}
          selected={paperType}
          onSelect={setPaperType}
        />
      </SettingsCard>

      <SettingsSectionLabel>FONT</SettingsSectionLabel>
      <SettingsCard>
        <SettingsToggleRow
          label="Auto Fit Font"
          value={autoFitFont}
          onValueChange={setAutoFitFont}
          showDivider
        />
        <SettingsToggleRow
          label="Auto Fit Size"
          value={autoFitSize}
          onValueChange={setAutoFitSize}
        />
      </SettingsCard>

      <SettingsSectionLabel>TEXT</SettingsSectionLabel>
      <SettingsCard>
        <SettingsSegmentRow
          label="Auto Wrapping"
          options={WRAP_MODES}
          selected={autoWrap}
          onSelect={setAutoWrap}
          showDivider
        />
        <SettingsToggleRow
          label="Auto Text Height"
          value={autoTextHeight}
          onValueChange={setAutoTextHeight}
        />
      </SettingsCard>

      <SettingsSectionLabel>TIME</SettingsSectionLabel>
      <SettingsCard>
        <SettingsValueRow label="Date Display" value={dateDisplay} showDivider />
        <SettingsValueRow label="Time Display" value={timeDisplay} />
      </SettingsCard>

      <SettingsSectionLabel>BARCODE</SettingsSectionLabel>
      <SettingsCard>
        <SettingsSegmentRow
          label="Encode Mode"
          options={BARCODE_MODES}
          selected={defaults.barcodeEncodeMode as (typeof BARCODE_MODES)[number]}
          onSelect={(mode) => patchDefaults({ barcodeEncodeMode: mode })}
        />
      </SettingsCard>

      <SettingsSectionLabel>QRCODE</SettingsSectionLabel>
      <SettingsCard>
        <SettingsSegmentRow
          label="Error Level"
          options={QR_LEVELS}
          selected={qrLevel}
          onSelect={setQrLevel}
          showDivider
        />
        <SettingsSegmentRow
          label="Zone Size"
          options={QR_ZONES}
          selected={qrZone}
          onSelect={setQrZone}
        />
      </SettingsCard>

      <SettingsSectionLabel>IMAGE</SettingsSectionLabel>
      <SettingsCard>
        <SettingsToggleRow label="Tile" value={tileImage} onValueChange={setTileImage} showDivider />
        <SettingsSegmentRow
          label="Color Mode"
          options={COLOR_MODES}
          selected={colorMode}
          onSelect={setColorMode}
          showDivider
        />
        <SettingsStepperRow
          label="Gray Threshold"
          value={String(grayThreshold)}
          minusDisabled={grayThreshold <= 0}
          onMinus={() => setGrayThreshold((value) => Math.max(0, value - 1))}
          onPlus={() => setGrayThreshold((value) => Math.min(255, value + 1))}
        />
      </SettingsCard>
    </SettingsScreenShell>
  );
}
