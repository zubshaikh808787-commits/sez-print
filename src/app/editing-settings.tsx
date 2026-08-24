import { useRouter } from 'expo-router';

import {
  SettingsCard,
  SettingsNavRow,
  SettingsNote,
  SettingsScreenShell,
} from '@/components/settings-ui';

export default function EditingSettingsScreen() {
  const router = useRouter();

  return (
    <SettingsScreenShell title="Editing Settings">
      <SettingsCard>
        <SettingsNavRow label="Editor Settings" onPress={() => router.push('/editor-settings')} />
      </SettingsCard>
      <SettingsNote>
        By adjusting the various Settings of the editor, you can choose the editing method that
        meets your habits.
      </SettingsNote>

      <SettingsCard>
        <SettingsNavRow
          label="Default Property Settings"
          onPress={() => router.push('/default-property-settings')}
        />
      </SettingsCard>
      <SettingsNote>
        The default attribute refers to the default parameter used when creating or editing a
        label. By setting default properties, you can easily edit commonly used styles of labels.
      </SettingsNote>
    </SettingsScreenShell>
  );
}
