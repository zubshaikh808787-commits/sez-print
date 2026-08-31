import { router } from 'expo-router';
import {
  SettingsCard,
  SettingsNavRow,
  SettingsScreenShell,
  SettingsSegmentRow,
  SettingsToggleGroup,
  SettingsToggleRow,
} from '@/components/settings-ui';
import { useSettingsStore } from '@/stores/settings-store';

export default function PrintingSettingsScreen() {
  const { recordHistory, autoPages, returnPrevious, printerDpi, printerAlignment, printheadWidthMm } =
    useSettingsStore((s) => s.printing);
  const patchPrinting = useSettingsStore((s) => s.patchPrinting);
  const setRecordHistory = (value: boolean) => patchPrinting({ recordHistory: value });
  const setAutoPages = (value: boolean) => patchPrinting({ autoPages: value });
  const setReturnPrevious = (value: boolean) => patchPrinting({ returnPrevious: value });

  const dpiLabel = printerDpi === 203 ? '203 DPI' : printerDpi === 300 ? '300 DPI' : '304 DPI';
  const alignmentLabel = printerAlignment === 'left' ? 'Left' : 'Center';
  const widthLabel = `${printheadWidthMm} mm`;

  return (
    <SettingsScreenShell title="Printing Settings">
      <SettingsCard>
        <SettingsSegmentRow
          label="Printer Resolution (DPI)"
          options={['304 DPI', '300 DPI', '203 DPI'] as const}
          selected={dpiLabel}
          onSelect={(val) => {
            const dpi = val === '203 DPI' ? 203 : val === '300 DPI' ? 300 : 304;
            patchPrinting({ printerDpi: dpi });
          }}
          showDivider
        />
        <SettingsSegmentRow
          label="Printhead Media Alignment"
          options={['Center', 'Left'] as const}
          selected={alignmentLabel}
          onSelect={(val) => {
            patchPrinting({ printerAlignment: val.toLowerCase() as 'center' | 'left' });
          }}
          showDivider
        />
        <SettingsSegmentRow
          label="Printhead Max Width"
          options={['108 mm', '104 mm', '80 mm'] as const}
          selected={widthLabel as any}
          onSelect={(val) => {
            const w = parseInt(val, 10) || 108;
            patchPrinting({ printheadWidthMm: w });
          }}
        />
      </SettingsCard>

      <SettingsToggleGroup
        label="Recording Printing Histories"
        value={recordHistory}
        onValueChange={setRecordHistory}
        description="The record of the print history is generated locally after each print. Print history can be printed again, but not edited."
      />

      <SettingsToggleGroup
        label="Automatically Calculates Pages"
        value={autoPages}
        onValueChange={setAutoPages}
        description="When you print Excel or a data source, you can calculate the number of remaining pages based on the current page number and the total number of pages. If turned off, only one page is printed at a time by default."
      />

      <SettingsCard>
        <SettingsToggleRow
          label="Return to The Previous Interface"
          value={returnPrevious}
          onValueChange={setReturnPrevious}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsNavRow
          label="Print Calibration Grid"
          onPress={() => router.push('/calibration-print')}
        />
      </SettingsCard>
    </SettingsScreenShell>
  );
}
