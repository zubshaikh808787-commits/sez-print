import { Alert } from 'react-native';

import {
  SettingsActionCard,
  SettingsCard,
  SettingsColorRow,
  SettingsScreenShell,
  SettingsToggleGroup,
  SettingsToggleRow,
} from '@/components/settings-ui';
import { useSettingsStore } from '@/stores/settings-store';

const BORDER_COLORS = ['#FCA5A5', '#EF4444', '#991B1B'];
const TABLE_COLORS = ['#FFFFFF', '#17A6B8', '#214668'];

export default function EditorSettingsScreen() {
  const {
    showColumnName,
    highlightColumnName,
    pictureAdsorption,
    editorGrid,
    borderColorIndex,
    tableColorIndex,
  } = useSettingsStore((s) => s.editor);
  const patchEditor = useSettingsStore((s) => s.patchEditor);
  const restoreEditorDefaults = useSettingsStore((s) => s.restoreEditorDefaults);

  const setShowColumnName = (v: boolean) => patchEditor({ showColumnName: v });
  const setHighlightColumnName = (v: boolean) => patchEditor({ highlightColumnName: v });
  const setPictureAdsorption = (v: boolean) => patchEditor({ pictureAdsorption: v });
  const setEditorGrid = (v: boolean) => patchEditor({ editorGrid: v });
  const setBorderColorIndex = (v: number) => patchEditor({ borderColorIndex: v });
  const setTableColorIndex = (v: number) => patchEditor({ tableColorIndex: v });

  const restoreDefaults = () => {
    restoreEditorDefaults();
    Alert.alert('Defaults Restored', 'Editor settings have been reset.');
  };

  return (
    <SettingsScreenShell title="Editor Settings">
      <SettingsCard>
        <SettingsToggleRow
          label="Display Data Column Name"
          value={showColumnName}
          onValueChange={setShowColumnName}
          showDivider
        />
        <SettingsToggleRow
          label="Highlight Data Column Name"
          value={highlightColumnName}
          onValueChange={setHighlightColumnName}
        />
      </SettingsCard>

      <SettingsToggleGroup
        label="Picture Adsorption"
        value={pictureAdsorption}
        onValueChange={setPictureAdsorption}
        description="Place a Image or Logo close to the QR code and it will automatically be displayed in the center of the QR code."
      />

      <SettingsCard>
        <SettingsToggleRow
          label="Editor Grid"
          value={editorGrid}
          onValueChange={setEditorGrid}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsColorRow
          label="Color of The Selected Border"
          colors={BORDER_COLORS}
          selectedIndex={borderColorIndex}
          onSelect={setBorderColorIndex}
          showDivider
        />
        <SettingsColorRow
          label="Color of The Selected Table Cell"
          colors={TABLE_COLORS}
          selectedIndex={tableColorIndex}
          onSelect={setTableColorIndex}
        />
      </SettingsCard>

      <SettingsActionCard label="Restore Defaults" danger onPress={restoreDefaults} />
    </SettingsScreenShell>
  );
}
