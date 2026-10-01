const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @zxing/library's CJS build uses extensionless requires (./core/BarcodeFormat).
// Metro cannot resolve those, so the dev client fails while loading any route
// that imports the package. Point the package at its single-file UMD build.
const zxingUmdPath = path.resolve(__dirname, 'node_modules/@zxing/library/umd/index.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@zxing/library' || moduleName.startsWith('@zxing/library/')) {
    return { type: 'sourceFile', filePath: zxingUmdPath };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Prevent Metro file watcher from watching transient native build and CMake directories
const blockListPatterns = [
  /.*[\/\\]\.cxx[\/\\].*/,
  /.*[\/\\]android[\/\\]build[\/\\].*/,
  /.*[\/\\]build[\/\\]intermediates[\/\\].*/,
  /.*[\/\\]build[\/\\]tmp[\/\\].*/,
];

if (Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList.push(...blockListPatterns);
} else if (config.resolver.blockList instanceof RegExp) {
  config.resolver.blockList = [config.resolver.blockList, ...blockListPatterns];
} else {
  config.resolver.blockList = blockListPatterns;
}

module.exports = config;
