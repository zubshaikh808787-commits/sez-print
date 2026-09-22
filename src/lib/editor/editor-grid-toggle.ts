import type { EditorSettings } from '@/stores/settings-store';

export const EDITOR_GRID_DISCLAIMER =
  'Design grid is editor-only and is not included when you print.';

type GridPatch = Partial<Pick<EditorSettings, 'editorGrid'>>;

export function requestEditorGridToggle(
  enable: boolean,
  patchEditor: (updates: GridPatch) => void,
) {
  patchEditor({ editorGrid: enable });
}
