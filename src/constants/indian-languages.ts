export interface IndianLanguage {
  code: string;
  name: string;
  native: string;
  region: string;
}

/** All 22 scheduled Indian languages plus English and widely used variants. */
export const INDIAN_LANGUAGES: IndianLanguage[] = [
  { code: 'en', name: 'English', native: 'English', region: 'Pan-India' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', region: 'North & Central India' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', region: 'West Bengal, Tripura' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', region: 'Andhra Pradesh, Telangana' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', region: 'Maharashtra' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', region: 'Tamil Nadu, Puducherry' },
  { code: 'ur', name: 'Urdu', native: 'اردو', region: 'Jammu & Kashmir, UP, Telangana' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', region: 'Gujarat' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', region: 'Karnataka' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', region: 'Odisha' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', region: 'Kerala' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', region: 'Punjab' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', region: 'Assam' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', region: 'Bihar, Jharkhand' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', region: 'Jharkhand, Odisha, WB' },
  { code: 'ks', name: 'Kashmiri', native: 'कॉशुर', region: 'Jammu & Kashmir' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', region: 'Sikkim, Darjeeling' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', region: 'Gujarat, Rajasthan' },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', region: 'Goa, Karnataka' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', region: 'Jammu & Kashmir' },
  { code: 'mni', name: 'Manipuri', native: 'ꯃꯩꯇꯩꯂꯣꯟ', region: 'Manipur' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', region: 'Assam' },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', region: 'Classical / Pan-India' },
];

export const DEFAULT_LANGUAGE_CODE = 'en';
