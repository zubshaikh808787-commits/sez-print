const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to ensure Google Play Services downloads the Code Scanner
 * ('barcode_ui') module at app install/runtime.
 *
 * This prevents the GmsBarcodeScanning error:
 * "Scanning failed: Failed to scan code." in expo-dev-launcher.
 */
function withGoogleCodeScanner(config) {
  return withAndroidManifest(config, (config) => {
    const mainApplication = config.modResults.manifest.application[0];
    if (!mainApplication['meta-data']) {
      mainApplication['meta-data'] = [];
    }

    const depName = 'com.google.mlkit.vision.DEPENDENCIES';
    const existing = mainApplication['meta-data'].find(
      (item) => item.$ && item.$['android:name'] === depName,
    );

    if (!existing) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': depName,
          'android:value': 'barcode_ui',
        },
      });
    } else {
      const current = existing.$['android:value'] || '';
      if (!current.includes('barcode_ui')) {
        existing.$['android:value'] = current ? `${current},barcode_ui` : 'barcode_ui';
      }
    }

    return config;
  });
}

module.exports = withGoogleCodeScanner;
