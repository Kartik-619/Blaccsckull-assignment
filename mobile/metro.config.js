const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// withNativeWind is what teaches Metro to read `src/global.css` and emit the
// style sheet NativeWind consumes. Without it every `className` resolves to
// nothing and the screen renders unstyled.
module.exports = withNativeWind(config, { input: './src/global.css' });
