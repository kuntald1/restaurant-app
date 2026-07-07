// index.js
// This file — not app/_layout.tsx — is the actual JS entry point (see
// package.json's "main" field). Polyfills MUST be imported here, before
// expo-router/entry runs, or code that needs crypto.getRandomValues()
// during route/module initialization can execute before the polyfill
// installs itself on the global object.
import "react-native-get-random-values";
import "expo-router/entry";
