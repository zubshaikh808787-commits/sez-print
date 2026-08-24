import { useSettingsStore } from '@/stores/settings-store';

/**
 * Lightweight i18n: a strings table keyed by language code.
 * English, Hindi, Bengali, and Tamil ship translated; other languages fall
 * back to English until their tables are filled in.
 */
export type TranslationKey =
  | 'tab.home'
  | 'tab.template'
  | 'tab.setting'
  | 'tab.help'
  | 'setting.title'
  | 'setting.languageSwitch'
  | 'setting.font'
  | 'setting.clipart'
  | 'setting.border'
  | 'setting.dataFile'
  | 'setting.printingHistory'
  | 'setting.advancedSettings'
  | 'setting.appPermissions'
  | 'setting.feedback'
  | 'setting.aboutUs'
  | 'print.print'
  | 'print.copies'
  | 'common.cancel'
  | 'common.confirm';

type StringsTable = Record<TranslationKey, string>;

const en: StringsTable = {
  'tab.home': 'Home',
  'tab.template': 'Template',
  'tab.setting': 'Setting',
  'tab.help': 'Help',
  'setting.title': 'Setting',
  'setting.languageSwitch': 'Language Switch',
  'setting.font': 'Font',
  'setting.clipart': 'Clipart',
  'setting.border': 'Border',
  'setting.dataFile': 'Data File',
  'setting.printingHistory': 'Printing History',
  'setting.advancedSettings': 'Advanced Settings',
  'setting.appPermissions': 'App Permissions',
  'setting.feedback': 'Evaluation & Feedback',
  'setting.aboutUs': 'About Us',
  'print.print': 'Print',
  'print.copies': 'Number of Copies',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
};

const hi: StringsTable = {
  'tab.home': 'होम',
  'tab.template': 'टेम्पलेट',
  'tab.setting': 'सेटिंग',
  'tab.help': 'सहायता',
  'setting.title': 'सेटिंग',
  'setting.languageSwitch': 'भाषा बदलें',
  'setting.font': 'फ़ॉन्ट',
  'setting.clipart': 'क्लिपआर्ट',
  'setting.border': 'बॉर्डर',
  'setting.dataFile': 'डेटा फ़ाइल',
  'setting.printingHistory': 'प्रिंट इतिहास',
  'setting.advancedSettings': 'उन्नत सेटिंग्स',
  'setting.appPermissions': 'ऐप अनुमतियाँ',
  'setting.feedback': 'मूल्यांकन और प्रतिक्रिया',
  'setting.aboutUs': 'हमारे बारे में',
  'print.print': 'प्रिंट करें',
  'print.copies': 'प्रतियों की संख्या',
  'common.cancel': 'रद्द करें',
  'common.confirm': 'पुष्टि करें',
};

const bn: StringsTable = {
  'tab.home': 'হোম',
  'tab.template': 'টেমপ্লেট',
  'tab.setting': 'সেটিং',
  'tab.help': 'সাহায্য',
  'setting.title': 'সেটিং',
  'setting.languageSwitch': 'ভাষা পরিবর্তন',
  'setting.font': 'ফন্ট',
  'setting.clipart': 'ক্লিপআর্ট',
  'setting.border': 'বর্ডার',
  'setting.dataFile': 'ডেটা ফাইল',
  'setting.printingHistory': 'প্রিন্ট ইতিহাস',
  'setting.advancedSettings': 'উন্নত সেটিংস',
  'setting.appPermissions': 'অ্যাপ অনুমতি',
  'setting.feedback': 'মূল্যায়ন ও মতামত',
  'setting.aboutUs': 'আমাদের সম্পর্কে',
  'print.print': 'প্রিন্ট করুন',
  'print.copies': 'কপির সংখ্যা',
  'common.cancel': 'বাতিল',
  'common.confirm': 'নিশ্চিত করুন',
};

const ta: StringsTable = {
  'tab.home': 'முகப்பு',
  'tab.template': 'வார்ப்புரு',
  'tab.setting': 'அமைப்பு',
  'tab.help': 'உதவி',
  'setting.title': 'அமைப்பு',
  'setting.languageSwitch': 'மொழி மாற்றம்',
  'setting.font': 'எழுத்துரு',
  'setting.clipart': 'கிளிப்ஆர்ட்',
  'setting.border': 'எல்லை',
  'setting.dataFile': 'தரவு கோப்பு',
  'setting.printingHistory': 'அச்சு வரலாறு',
  'setting.advancedSettings': 'மேம்பட்ட அமைப்புகள்',
  'setting.appPermissions': 'செயலி அனுமதிகள்',
  'setting.feedback': 'மதிப்பீடு & கருத்து',
  'setting.aboutUs': 'எங்களைப் பற்றி',
  'print.print': 'அச்சிடு',
  'print.copies': 'நகல்களின் எண்ணிக்கை',
  'common.cancel': 'ரத்து',
  'common.confirm': 'உறுதிப்படுத்து',
};

/** Add new languages here; missing codes fall back to English. */
const TABLES: Record<string, Partial<StringsTable>> = { en, hi, bn, ta };

export function translate(languageCode: string, key: TranslationKey): string {
  return TABLES[languageCode]?.[key] ?? en[key];
}

/** Reactive translation hook; re-renders when the language setting changes. */
export function useTranslation() {
  const language = useSettingsStore((s) => s.language);
  return {
    language,
    t: (key: TranslationKey) => translate(language, key),
  };
}
