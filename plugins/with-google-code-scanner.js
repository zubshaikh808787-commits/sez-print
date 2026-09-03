const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to ensure Google Play Services downloads the Code Scanner
 * ('barcode_ui'), Barcode Scanning ('barcode'), and Text Recognition ('ocr')
 * modules at app install/runtime.
 *
 * This prevents the GmsBarcodeScanning error:
 * "Scanning failed: Failed to scan code." in expo-dev-launcher and expo-camera.
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

    const requiredModules = ['barcode_ui', 'barcode', 'ocr'];

    if (!existing) {
      mainApplication['meta-data'].push({
        $: {
          'android:name': depName,
          'android:value': requiredModules.join(','),
        },
      });
    } else {
      const current = (existing.$['android:value'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const combined = Array.from(new Set([...current, ...requiredModules]));
      existing.$['android:value'] = combined.join(',');
    }

    return config;
  });
}

module.exports = withGoogleCodeScanner;
