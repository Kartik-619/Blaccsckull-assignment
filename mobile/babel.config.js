module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: [
      // `jsxImportSource: 'nativewind'` is what rewrites JSX into the
      // `cssInterop`/`remapProps` calls NativeWind needs at runtime. Dropping it
      // leaves classes in the tree that React Native silently ignores.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
