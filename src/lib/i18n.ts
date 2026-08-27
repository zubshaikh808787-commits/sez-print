import { useSettingsStore } from '@/stores/settings-store';
import { INDIAN_LANGUAGES } from '@/constants/indian-languages';

/**
 * Lightweight i18n: strings keyed by language code.
 * Every language in INDIAN_LANGUAGES has a table so switching always applies.
 */
export type TranslationKey =
  | 'tab.home'
  | 'tab.template'
  | 'tab.setting'
  | 'tab.help'
  | 'setting.title'
  | 'setting.connectBluetoothPrinter'
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
  | 'common.confirm'
  | 'common.open'
  | 'common.save'
  | 'common.saveAs'
  | 'editor.newLabel'
  | 'editor.labelName'
  | 'editor.columns'
  | 'editor.columnSpacing'
  | 'editor.batchEdit'
  | 'template.industry'
  | 'template.local'
  | 'template.cloud';

type StringsTable = Partial<Record<TranslationKey, string>>;

const en: Record<TranslationKey, string> = {
  'tab.home': 'Home',
  'tab.template': 'Template',
  'tab.setting': 'Setting',
  'tab.help': 'Help',
  'setting.title': 'Setting',
  'setting.connectBluetoothPrinter': 'Connect Bluetooth Printer',
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
  'common.open': 'Open',
  'common.save': 'Save',
  'common.saveAs': 'Save As',
  'editor.newLabel': 'New Label',
  'editor.labelName': 'Set label name',
  'editor.columns': 'Columns',
  'editor.columnSpacing': 'Column spacing mm',
  'editor.batchEdit': 'Batch Edit',
  'template.industry': 'Industry',
  'template.local': 'Local',
  'template.cloud': 'Cloud',
};

const hi: StringsTable = {
  'tab.home': 'होम',
  'tab.template': 'टेम्पलेट',
  'tab.setting': 'सेटिंग',
  'tab.help': 'सहायता',
  'setting.title': 'सेटिंग',
  'setting.connectBluetoothPrinter': 'ब्लूटूथ प्रिंटर कनेक्ट करें',
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
  'common.open': 'खोलें',
  'common.save': 'सहेजें',
  'common.saveAs': 'इस रूप में सहेजें',
  'editor.newLabel': 'नया लेबल',
  'editor.labelName': 'लेबल का नाम सेट करें',
  'editor.columns': 'कॉलम',
  'editor.columnSpacing': 'कॉलम स्पेसिंग मिमी',
  'editor.batchEdit': 'बैच संपादन',
  'template.industry': 'उद्योग',
  'template.local': 'स्थानीय',
  'template.cloud': 'क्लाउड',
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
  'common.open': 'খুলুন',
  'common.save': 'সংরক্ষণ',
  'common.saveAs': 'নতুন নামে সংরক্ষণ',
  'editor.newLabel': 'নতুন লেবেল',
  'editor.labelName': 'লেবেলের নাম সেট করুন',
  'editor.columns': 'কলাম',
  'editor.columnSpacing': 'কলাম ফাঁক মিমি',
  'editor.batchEdit': 'ব্যাচ সম্পাদনা',
  'template.industry': 'শিল্প',
  'template.local': 'স্থানীয়',
  'template.cloud': 'ক্লাউড',
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
  'common.open': 'திற',
  'common.save': 'சேமி',
  'common.saveAs': 'வேறு பெயரில் சேமி',
  'editor.newLabel': 'புதிய லேபிள்',
  'editor.labelName': 'லேபிள் பெயரை அமை',
  'editor.columns': 'நெடுவரிசைகள்',
  'editor.columnSpacing': 'நெடுவரிசை இடைவெளி மிமீ',
  'editor.batchEdit': 'தொகுப்பு திருத்தம்',
  'template.industry': 'தொழில்',
  'template.local': 'உள்ளூர்',
  'template.cloud': 'மேகம்',
};

const te: StringsTable = {
  'tab.home': 'హోమ్',
  'tab.template': 'టెంప్లేట్',
  'tab.setting': 'సెట్టింగ్',
  'tab.help': 'సహాయం',
  'setting.title': 'సెట్టింగ్',
  'setting.languageSwitch': 'భాష మార్చు',
  'setting.font': 'ఫాంట్',
  'setting.clipart': 'క్లిప్‌ఆర్ట్',
  'setting.border': 'బోర్డర్',
  'setting.dataFile': 'డేటా ఫైల్',
  'setting.printingHistory': 'ప్రింట్ చరిత్ర',
  'setting.advancedSettings': 'అధునాతన సెట్టింగ్‌లు',
  'setting.appPermissions': 'యాప్ అనుమతులు',
  'setting.feedback': 'అభిప్రాయం',
  'setting.aboutUs': 'మా గురించి',
  'print.print': 'ప్రింట్',
  'print.copies': 'కాపీల సంఖ్య',
  'common.cancel': 'రద్దు',
  'common.confirm': 'నిర్ధారించు',
  'common.open': 'తెరువు',
  'common.save': 'సేవ్',
  'common.saveAs': 'కొత్త పేరుతో సేవ్',
  'editor.newLabel': 'కొత్త లేబుల్',
  'editor.labelName': 'లేబుల్ పేరు సెట్ చేయి',
  'editor.columns': 'కాలమ్‌లు',
  'editor.columnSpacing': 'కాలమ్ స్పేసింగ్ మిమీ',
  'editor.batchEdit': 'బ్యాచ్ ఎడిట్',
  'template.industry': 'ఇండస్ట్రీ',
  'template.local': 'లోకల్',
  'template.cloud': 'క్లౌడ్',
};

const mr: StringsTable = {
  ...hi,
  'tab.home': 'मुख्यपृष्ठ',
  'tab.template': 'टेम्प्लेट',
  'tab.setting': 'सेटिंग',
  'tab.help': 'मदत',
  'setting.languageSwitch': 'भाषा बदला',
  'common.cancel': 'रद्द',
  'common.confirm': 'पुष्टी',
  'common.open': 'उघडा',
  'common.save': 'जतन',
  'editor.newLabel': 'नवीन लेबल',
  'template.industry': 'उद्योग',
  'template.local': 'स्थानिक',
};

const gu: StringsTable = {
  'tab.home': 'હોમ',
  'tab.template': 'ટેમ્પલેટ',
  'tab.setting': 'સેટિંગ',
  'tab.help': 'મદદ',
  'setting.title': 'સેટિંગ',
  'setting.languageSwitch': 'ભાષા બદલો',
  'setting.font': 'ફોન્ટ',
  'setting.clipart': 'ક્લિપઆર્ટ',
  'setting.border': 'બોર્ડર',
  'setting.dataFile': 'ડેટા ફાઇલ',
  'setting.printingHistory': 'પ્રિન્ટ ઇતિહાસ',
  'setting.advancedSettings': 'અદ્યતન સેટિંગ્સ',
  'setting.appPermissions': 'એપ પરવાનગીઓ',
  'setting.feedback': 'પ્રતિસાદ',
  'setting.aboutUs': 'અમારા વિશે',
  'print.print': 'પ્રિન્ટ',
  'print.copies': 'કૉપીની સંખ્યા',
  'common.cancel': 'રદ કરો',
  'common.confirm': 'પુષ્ટિ',
  'common.open': 'ખોલો',
  'common.save': 'સાચવો',
  'common.saveAs': 'આ રીતે સાચવો',
  'editor.newLabel': 'નવું લેબલ',
  'editor.labelName': 'લેબલ નામ સેટ કરો',
  'editor.columns': 'કૉલમ',
  'editor.columnSpacing': 'કૉલમ અંતર મીમી',
  'editor.batchEdit': 'બેચ સંપાદન',
  'template.industry': 'ઉદ્યોગ',
  'template.local': 'સ્થાનિક',
  'template.cloud': 'ક્લાઉડ',
};

const kn: StringsTable = {
  'tab.home': 'ಮುಖಪುಟ',
  'tab.template': 'ಟೆಂಪ್ಲೇಟ್',
  'tab.setting': 'ಸೆಟ್ಟಿಂಗ್',
  'tab.help': 'ಸಹಾಯ',
  'setting.title': 'ಸೆಟ್ಟಿಂಗ್',
  'setting.languageSwitch': 'ಭಾಷೆ ಬದಲಾಯಿಸಿ',
  'setting.font': 'ಫಾಂಟ್',
  'setting.clipart': 'ಕ್ಲಿಪ್‌ಆರ್ಟ್',
  'setting.border': 'ಬಾರ್ಡರ್',
  'setting.dataFile': 'ಡೇಟಾ ಫೈಲ್',
  'setting.printingHistory': 'ಮುದ್ರಣ ಇತಿಹಾಸ',
  'setting.advancedSettings': 'ಸುಧಾರಿತ ಸೆಟ್ಟಿಂಗ್‌ಗಳು',
  'setting.appPermissions': 'ಅಪ್ಲಿಕೇಶನ್ ಅನುಮತಿಗಳು',
  'setting.feedback': 'ಪ್ರತಿಕ್ರಿಯೆ',
  'setting.aboutUs': 'ನಮ್ಮ ಬಗ್ಗೆ',
  'print.print': 'ಮುದ್ರಿಸಿ',
  'print.copies': 'ಪ್ರತಿಗಳ ಸಂಖ್ಯೆ',
  'common.cancel': 'ರದ್ದು',
  'common.confirm': 'ದೃಢೀಕರಿಸಿ',
  'common.open': 'ತೆರೆಯಿರಿ',
  'common.save': 'ಉಳಿಸಿ',
  'common.saveAs': 'ಹೊಸ ಹೆಸರಿನಲ್ಲಿ ಉಳಿಸಿ',
  'editor.newLabel': 'ಹೊಸ ಲೇಬಲ್',
  'editor.labelName': 'ಲೇಬಲ್ ಹೆಸರು ಹೊಂದಿಸಿ',
  'editor.columns': 'ಕಾಲಮ್‌ಗಳು',
  'editor.columnSpacing': 'ಕಾಲಮ್ ಅಂತರ ಮಿಮೀ',
  'editor.batchEdit': 'ಬ್ಯಾಚ್ ಸಂಪಾದನೆ',
  'template.industry': 'ಉದ್ಯಮ',
  'template.local': 'ಸ್ಥಳೀಯ',
  'template.cloud': 'ಕ್ಲೌಡ್',
};

const ml: StringsTable = {
  'tab.home': 'ഹോം',
  'tab.template': 'ടെംപ്ലേറ്റ്',
  'tab.setting': 'സെറ്റിംഗ്',
  'tab.help': 'സഹായം',
  'setting.title': 'സെറ്റിംഗ്',
  'setting.languageSwitch': 'ഭാഷ മാറ്റുക',
  'setting.font': 'ഫോണ്ട്',
  'setting.clipart': 'ക്ലിപ്പാർട്ട്',
  'setting.border': 'ബോർഡർ',
  'setting.dataFile': 'ഡാറ്റ ഫയൽ',
  'setting.printingHistory': 'പ്രിന്റ് ചരിത്രം',
  'setting.advancedSettings': 'അധിക സെറ്റിംഗുകൾ',
  'setting.appPermissions': 'അപ്ലിക്കേഷൻ അനുമതികൾ',
  'setting.feedback': 'അഭിപ്രായം',
  'setting.aboutUs': 'ഞങ്ങളെക്കുറിച്ച്',
  'print.print': 'പ്രിന്റ്',
  'print.copies': 'കോപ്പികളുടെ എണ്ണം',
  'common.cancel': 'റദ്ദാക്കുക',
  'common.confirm': 'സ്ഥിരീകരിക്കുക',
  'common.open': 'തുറക്കുക',
  'common.save': 'സേവ്',
  'common.saveAs': 'പുതിയ പേരിൽ സേവ്',
  'editor.newLabel': 'പുതിയ ലേബൽ',
  'editor.labelName': 'ലേബൽ പേര് സജ്ജമാക്കുക',
  'editor.columns': 'കോളങ്ങൾ',
  'editor.columnSpacing': 'കോളം ഇടം മിമി',
  'editor.batchEdit': 'ബാച്ച് എഡിറ്റ്',
  'template.industry': 'ഇൻഡസ്ട്രി',
  'template.local': 'ലോക്കൽ',
  'template.cloud': 'ക്ലൗഡ്',
};

const pa: StringsTable = {
  'tab.home': 'ਘਰ',
  'tab.template': 'ਟੈਂਪਲੇਟ',
  'tab.setting': 'ਸੈਟਿੰਗ',
  'tab.help': 'ਮਦਦ',
  'setting.title': 'ਸੈਟਿੰਗ',
  'setting.languageSwitch': 'ਭਾਸ਼ਾ ਬਦਲੋ',
  'setting.font': 'ਫੌਂਟ',
  'setting.clipart': 'ਕਲਿੱਪਆਰਟ',
  'setting.border': 'ਬਾਰਡਰ',
  'setting.dataFile': 'ਡਾਟਾ ਫਾਈਲ',
  'setting.printingHistory': 'ਪ੍ਰਿੰਟ ਇਤਿਹਾਸ',
  'setting.advancedSettings': 'ਉੱਨਤ ਸੈਟਿੰਗਾਂ',
  'setting.appPermissions': 'ਐਪ ਇਜਾਜ਼ਤਾਂ',
  'setting.feedback': 'ਫੀਡਬੈਕ',
  'setting.aboutUs': 'ਸਾਡੇ ਬਾਰੇ',
  'print.print': 'ਪ੍ਰਿੰਟ',
  'print.copies': 'ਕਾਪੀਆਂ ਦੀ ਗਿਣਤੀ',
  'common.cancel': 'ਰੱਦ ਕਰੋ',
  'common.confirm': 'ਪੁਸ਼ਟੀ',
  'common.open': 'ਖੋਲ੍ਹੋ',
  'common.save': 'ਸੇਵ',
  'common.saveAs': 'ਇਸ ਤਰ੍ਹਾਂ ਸੇਵ',
  'editor.newLabel': 'ਨਵਾਂ ਲੇਬਲ',
  'editor.labelName': 'ਲੇਬਲ ਨਾਮ ਸੈੱਟ ਕਰੋ',
  'editor.columns': 'ਕਾਲਮ',
  'editor.columnSpacing': 'ਕਾਲਮ ਸਪੇਸਿੰਗ ਮਿਮੀ',
  'editor.batchEdit': 'ਬੈਚ ਐਡਿਟ',
  'template.industry': 'ਉਦਯੋਗ',
  'template.local': 'ਸਥਾਨਕ',
  'template.cloud': 'ਕਲਾਉਡ',
};

const ur: StringsTable = {
  'tab.home': 'ہوم',
  'tab.template': 'ٹیمپلیٹ',
  'tab.setting': 'سیٹنگ',
  'tab.help': 'مدد',
  'setting.title': 'سیٹنگ',
  'setting.languageSwitch': 'زبان تبدیل کریں',
  'setting.font': 'فونٹ',
  'setting.clipart': 'کلپ آرٹ',
  'setting.border': 'بارڈر',
  'setting.dataFile': 'ڈیٹا فائل',
  'setting.printingHistory': 'پرنٹ تاریخ',
  'setting.advancedSettings': 'اعلیٰ سیٹنگز',
  'setting.appPermissions': 'ایپ اجازتیں',
  'setting.feedback': 'رائے',
  'setting.aboutUs': 'ہمارے بارے میں',
  'print.print': 'پرنٹ',
  'print.copies': 'کاپیوں کی تعداد',
  'common.cancel': 'منسوخ',
  'common.confirm': 'تصدیق',
  'common.open': 'کھولیں',
  'common.save': 'محفوظ',
  'common.saveAs': 'نئے نام سے محفوظ',
  'editor.newLabel': 'نیا لیبل',
  'editor.labelName': 'لیبل کا نام سیٹ کریں',
  'editor.columns': 'کالم',
  'editor.columnSpacing': 'کالم فاصلہ ملی میٹر',
  'editor.batchEdit': 'بیچ ایڈٹ',
  'template.industry': 'انڈسٹری',
  'template.local': 'مقامی',
  'template.cloud': 'کلاؤڈ',
};

const or: StringsTable = {
  ...hi,
  'tab.home': 'ହୋମ୍',
  'tab.template': 'ଟେମ୍ପଲେଟ୍',
  'tab.setting': 'ସେଟିଂ',
  'tab.help': 'ସହାୟତା',
  'setting.languageSwitch': 'ଭାଷା ବଦଳାନ୍ତୁ',
  'common.cancel': 'ବାତିଲ୍',
  'common.confirm': 'ନିଶ୍ଚିତ',
  'common.open': 'ଖୋଲନ୍ତୁ',
  'common.save': 'ସେଭ୍',
  'editor.newLabel': 'ନୂଆ ଲେବଲ୍',
  'template.industry': 'ଉଦ୍ୟୋଗ',
  'template.local': 'ସ୍ଥାନୀୟ',
};

const as: StringsTable = {
  ...bn,
  'tab.home': 'হোম',
  'tab.template': 'টেমপ্লেট',
  'setting.languageSwitch': 'ভাষা সলনি কৰক',
  'common.cancel': 'বাতিল',
  'common.confirm': 'নিশ্চিত',
  'editor.newLabel': 'নতুন লেবেল',
};

/** Devanagari-family languages share the Hindi UI strings (script-compatible). */
const TABLES: Record<string, StringsTable> = {
  en,
  hi,
  bn,
  ta,
  te,
  mr,
  gu,
  kn,
  ml,
  pa,
  ur,
  or,
  as,
  mai: { ...hi, 'setting.languageSwitch': 'भाषा बदलू' },
  ne: { ...hi, 'tab.home': 'गृह', 'setting.languageSwitch': 'भाषा परिवर्तन' },
  kok: { ...hi, 'setting.languageSwitch': 'भास बदलात' },
  doi: { ...hi },
  brx: { ...hi },
  sa: { ...hi, 'tab.home': 'गृहम्', 'setting.title': 'व्यवस्था' },
  ks: { ...hi },
  sd: { ...ur },
  sat: { ...hi },
  mni: { ...hi, 'setting.languageSwitch': 'ꯂꯣꯟ ꯍꯣꯡꯗꯣꯛ' },
};

// Ensure every picker language resolves to a full table.
for (const lang of INDIAN_LANGUAGES) {
  if (!TABLES[lang.code]) {
    TABLES[lang.code] = { ...en };
  }
}

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
