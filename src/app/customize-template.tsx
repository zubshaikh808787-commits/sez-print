import { router } from 'expo-router';

import { TemplateChoiceSheet } from '@/components/template-choice-sheet';

export default function CustomizeTemplateScreen() {
  return (
    <TemplateChoiceSheet
      title="Customize"
      subtitle="Create a new template or open one you already saved."
      createDetail="Blank canvas — set size and layout from scratch"
      onCreate={() =>
        router.replace({ pathname: '/new-label-setup', params: { focusSize: '1' } })
      }
    />
  );
}
