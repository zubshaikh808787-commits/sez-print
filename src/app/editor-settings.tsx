import { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';

import {
  SettingsActionCard,
  SettingsCard,
  SettingsColorRow,
  SettingsScreenShell,
  SettingsSegmentRow,
  SettingsToggleGroup,
  SettingsToggleRow,
} from '@/components/settings-ui';
import { clampGridSpacingMm, GRID_SPACING_MAX_MM, GRID_SPACING_MIN_MM } from '@/lib/editor/canvas-grid';
import { requestEditorGridToggle } from '@/lib/editor/editor-grid-toggle';
import {
  GRID_CUSTOM_LABEL,
  GRID_PRINT_DISCLAIMER,
  GRID_SPACING_OPTIONS,
  isPresetGridSpacing,
  spacingOptionForMm,
} from '@/lib/editor/grid-settings-ui';
import {
  DEFAULT_EDITOR_SETTINGS,
  useSettingsStore,
} from '@/stores/settings-store';

export default function EditorSettingsScreen() {
  const {
    showColumnName,
    highlightColumnName,
    pictureAdsorption,
    editorGrid,
    editorGridSpacingMm,
    showNudgePad,
    borderColorIndex,
    tableColorIndex,
  } = useSettingsStore((s) => s.editor);
  const patchEditor = useSettingsStore((s) => s.patchEditor);
  const restoreEditorDefaults = useSettingsStore((s) => s.restoreEditorDefaults);

  const gridSpacingMm =
    editorGridSpacingMm ?? DEFAULT_EDITOR_SETTINGS.editorGridSpacingMm ?? 5;
  const [customOpen, setCustomOpen] = useState(() => !isPresetGridSpacing(gridSpacingMm));
  const [customDraft, setCustomDraft] = useState(() => String(clampGridSpacingMm(gridSpacingMm)));

  const setShowColumnName = (v: boolean) => patchEditor({ showColumnName: v });
  const setHighlightColumnName = (v: boolean) => patchEditor({ highlightColumnName: v });
  const setPictureAdsorption = (v: boolean) => patchEditor({ pictureAdsorption: v });
  const setShowNudgePad = (v: boolean) => patchEditor({ showNudgePad: v });
  const setBorderColorIndex = (v: number) => patchEditor({ borderColorIndex: v });
  const setTableColorIndex = (v: number) => patchEditor({ tableColorIndex: v });
  const setEditorGrid = (v: boolean) => requestEditorGridToggle(v, patchEditor);

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

      <SettingsToggleGroup
        label="Editor Grid"
        value={editorGrid}
        onValueChange={setEditorGrid}
        description={GRID_PRINT_DISCLAIMER}
      />

      {editorGrid ? (
        <SettingsCard>
          <SettingsSegmentRow
            label="Grid spacing"
            options={GRID_SPACING_OPTIONS}
            selected={customOpen ? GRID_CUSTOM_LABEL : spacingOptionForMm(gridSpacingMm)}
            onSelect={(label) => {
              if (label === GRID_CUSTOM_LABEL) {
                setCustomOpen(true);
                setCustomDraft(String(clampGridSpacingMm(gridSpacingMm)));
                return;
              }
              const mm = Number.parseFloat(label);
              if (!Number.isFinite(mm)) return;
              setCustomOpen(false);
              patchEditor({ editorGridSpacingMm: clampGridSpacingMm(mm) });
            }}
            showDivider={customOpen}
          />
          {customOpen ? (
            <>
              <TextInput
                value={customDraft}
                onChangeText={setCustomDraft}
                onEndEditing={() => {
                  const mm = Number.parseFloat(customDraft.replace(',', '.'));
                  if (!Number.isFinite(mm)) return;
                  const clamped = clampGridSpacingMm(mm);
                  setCustomDraft(String(clamped));
                  patchEditor({ editorGridSpacingMm: clamped });
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
                selectTextOnFocus
                placeholder={`${GRID_SPACING_MIN_MM}–${GRID_SPACING_MAX_MM} mm`}
                style={styles.customInput}
                accessibilityLabel="Custom grid spacing in millimetres"
              />
            </>
          ) : null}
        </SettingsCard>
      ) : null}

      <SettingsCard>
        <SettingsToggleRow
          label="Touch Control Pad"
          value={showNudgePad}
          onValueChange={setShowNudgePad}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsColorRow
          label="Color of The Selected Border"
          colors={['#FCA5A5', '#EF4444', '#991B1B']}
          selectedIndex={borderColorIndex}
          onSelect={setBorderColorIndex}
          showDivider
        />
        <SettingsColorRow
          label="Color of The Selected Table Cell"
          colors={['#FFFFFF', '#17A6B8', '#214668']}
          selectedIndex={tableColorIndex}
          onSelect={setTableColorIndex}
        />
      </SettingsCard>

      <SettingsActionCard label="Restore Defaults" danger onPress={restoreDefaults} />
    </SettingsScreenShell>
  );
}

const styles = StyleSheet.create({
  customInput: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
});
