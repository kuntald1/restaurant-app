// app/index.tsx
import { Redirect } from "expo-router";

// expo-router needs a real route at "/" or a fresh cold launch (as in a
// standalone APK, unlike Expo Go's dev environment) shows its built-in
// "Unmatched Route" screen before the auth-redirect logic in _layout.tsx's
// useEffect ever gets a chance to run. This makes "/" always resolve
// immediately to the login screen; RootNavigation's existing effect then
// takes over from there and redirects further to /(tabs)/tables if a
// session is already saved.
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
