// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // `eslint-plugin-import`'s import/* rules re-parse an imported file with a
    // parser they resolve themselves, and they default to a JS-only one. That
    // makes them report "Parse errors in imported module" for any `.tsx` a file
    // imports, which is a false positive — tsc parses the same file fine.
    // Pointing them at the parser already installed here fixes the false
    // positive without adding a dependency.
    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
    },
  }
]);
