const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

/**
 * Expo Config Plugin to resolve native library (.so) conflicts between multiple
 * printer SDKs (e.g. Tez PrintSDK and LabelX LuckPrinter SDK both packaging libPrinterNative.so).
 */
function withAndroidPackaging(config) {
  // 1. Ensure pickFirst is added to android.packagingOptions in app/build.gradle
  config = withAppBuildGradle(config, (configProps) => {
    let buildGradle = configProps.modResults.contents;
    if (!buildGradle.includes('libPrinterNative.so')) {
      buildGradle = buildGradle.replace(
        /android\s*\{/,
        `android {
    packagingOptions {
        pickFirst '**/libPrinterNative.so'
        pickFirst 'lib/**/libPrinterNative.so'
        pickFirst '**/libc++_shared.so'
    }`
      );
      configProps.modResults.contents = buildGradle;
    }
    return configProps;
  });

  // 2. Also inject into gradle.properties for Expo's template packagingOptions reader
  config = withGradleProperties(config, (configProps) => {
    const properties = configProps.modResults;
    const existing = properties.find(
      (p) => p.type === 'property' && p.key === 'android.packagingOptions.pickFirsts'
    );
    const pickValue = '**/libPrinterNative.so,lib/**/libPrinterNative.so,**/libc++_shared.so';
    if (existing) {
      const current = existing.value.split(',').map((s) => s.trim());
      const combined = Array.from(new Set([...current, ...pickValue.split(',')])).join(',');
      existing.value = combined;
    } else {
      properties.push({
        type: 'property',
        key: 'android.packagingOptions.pickFirsts',
        value: pickValue,
      });
    }
    return configProps;
  });

  return config;
}

module.exports = withAndroidPackaging;
