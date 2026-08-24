import {
  SettingsCard,
  SettingsScreenShell,
  SettingsToggleGroup,
  SettingsToggleRow,
} from '@/components/settings-ui';
import { useSettingsStore } from '@/stores/settings-store';

export default function PrintingSettingsScreen() {
  const { recordHistory, autoPages, returnPrevious } = useSettingsStore((s) => s.printing);
  const patchPrinting = useSettingsStore((s) => s.patchPrinting);
  const setRecordHistory = (value: boolean) => patchPrinting({ recordHistory: value });
  const setAutoPages = (value: boolean) => patchPrinting({ autoPages: value });
  const setReturnPrevious = (value: boolean) => patchPrinting({ returnPrevious: value });

  return (
    <SettingsScreenShell title="Printing Settings">
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
    </SettingsScreenShell>
  );
}
