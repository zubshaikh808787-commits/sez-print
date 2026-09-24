import { Alert } from 'react-native';
import { useEffect } from 'react';

import {
  SettingsActionCard,
  SettingsCard,
  SettingsColorRow,
  SettingsScreenShell,
  SettingsToggleGroup,
  SettingsToggleRow,
} from '@/components/settings-ui';
import { requestEditorGridToggle } from '@/lib/editor/editor-grid-toggle';
import {
  EDITOR_BORDER_SELECTION_COLORS,
  EDITOR_TABLE_SELECTION_COLORS,
  useSettingsStore,
} from '@/stores/settings-store';

export default function EditorSettingsScreen() {
  const {
    showColumnName,
    highlightColumnName,
    pictureAdsorption,
    editorGrid,
    borderColorIndex: storedBorderColorIndex,
    tableColorIndex: storedTableColorIndex,
  } = useSettingsStore((s) => s.editor);
  const borderColorIndex = Math.max(
    0,
    Math.min(EDITOR_BORDER_SELECTION_COLORS.length - 1, storedBorderColorIndex),
  );
  const tableColorIndex = Math.max(
    0,
    Math.min(EDITOR_TABLE_SELECTION_COLORS.length - 1, storedTableColorIndex),
  );
  const patchEditor = useSettingsStore((s) => s.patchEditor);
  const restoreEditorDefaults = useSettingsStore((s) => s.restoreEditorDefaults);

  const setShowColumnName = (v: boolean) => patchEditor({ showColumnName: v });
  const setHighlightColumnName = (v: boolean) => patchEditor({ highlightColumnName: v });
  const setPictureAdsorption = (v: boolean) => patchEditor({ pictureAdsorption: v });
  const setBorderColorIndex = (v: number) =>
    patchEditor({ borderColorIndex: Math.max(0, Math.min(EDITOR_BORDER_SELECTION_COLORS.length - 1, v)) });
  const setTableColorIndex = (v: number) =>
    patchEditor({ tableColorIndex: Math.max(0, Math.min(EDITOR_TABLE_SELECTION_COLORS.length - 1, v)) });
  const setEditorGrid = (v: boolean) => requestEditorGridToggle(v, patchEditor);

  useEffect(() => {
    if (storedBorderColorIndex !== borderColorIndex || storedTableColorIndex !== tableColorIndex) {
      patchEditor({
        ...(storedBorderColorIndex !== borderColorIndex ? { borderColorIndex } : {}),
        ...(storedTableColorIndex !== tableColorIndex ? { tableColorIndex } : {}),
      });
    }
  }, [storedBorderColorIndex, storedTableColorIndex, borderColorIndex, tableColorIndex, patchEditor]);

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

      <SettingsToggleGroup label="Editor Grid" value={editorGrid} onValueChange={setEditorGrid} />

      <SettingsCard>
        <SettingsColorRow
          label="Color of The Selected Border"
          colors={[...EDITOR_BORDER_SELECTION_COLORS]}
          selectedIndex={borderColorIndex}
          onSelect={setBorderColorIndex}
          showDivider
        />
        <SettingsColorRow
          label="Color of The Selected Table Cell"
          colors={[...EDITOR_TABLE_SELECTION_COLORS]}
          selectedIndex={tableColorIndex}
          onSelect={setTableColorIndex}
        />
      </SettingsCard>

      <SettingsActionCard label="Restore Defaults" danger onPress={restoreDefaults} />
    </SettingsScreenShell>
  );
}
