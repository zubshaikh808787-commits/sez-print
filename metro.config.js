const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

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
