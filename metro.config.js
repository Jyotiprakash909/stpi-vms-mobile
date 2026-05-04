const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add support for .mp3 and other assets if needed
config.resolver.assetExts.push('mp3');

module.exports = config;
