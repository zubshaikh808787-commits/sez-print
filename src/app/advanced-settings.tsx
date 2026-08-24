import { useRouter } from 'expo-router';
import { Alert } from 'react-native';

import {
  SettingsActionCard,
  SettingsCard,
  SettingsNavRow,
  SettingsScreenShell,
} from '@/components/settings-ui';
import { useSettingsStore } from '@/stores/settings-store';

export default function AdvancedSettingsScreen() {
  const router = useRouter();
  const setTutorialSeen = useSettingsStore((s) => s.setTutorialSeen);

  return (
    <SettingsScreenShell title="Advanced Settings">
      <SettingsCard>
        <SettingsNavRow
          label="Printing Settings"
          onPress={() => router.push('/printing-settings')}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsNavRow
          label="Editing Settings"
          onPress={() => router.push('/editing-settings')}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsNavRow label="Cache Settings" onPress={() => router.push('/cache-settings')} />
      </SettingsCard>

      <SettingsActionCard
        label="Restore the tutorial status"
        danger
        onPress={() => {
          setTutorialSeen(false);
          Alert.alert('Tutorial Restored', 'Tutorial status has been reset.');
        }}
      />
    </SettingsScreenShell>
  );
}
