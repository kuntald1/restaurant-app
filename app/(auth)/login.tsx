// app/(auth)/login.tsx
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import CryptoJS from "crypto-js";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loginUser } from "../../src/api/endpoints";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";

// Passphrase the web app's login form uses with CryptoJS.AES.encrypt(...).
// The backend decrypts it with CRYPTO_SECRET_KEY, so both must stay identical.
const AES_SECRET = "MyRestaurant@SecretKey123";

// Brand name shown on this screen — change here only.
const BRAND = "Vorpet POS";

// Same two colour families as the web app: purple for the brand area, green for actions.
const PURPLE_DEEP = "#2A1257";
const PURPLE_MID = "#43206E";
const PURPLE_SOFT = "#5F3189";
const GOLD = "#D8B48A";
const GREEN_DEEP = "#166534";
const GREEN = "#15803D";
const PAPER = "#F5F3F0";
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "serif" });

const RINGS = [172, 240, 308];

// Small gold line icons drifting around the logo (percent positions inside the hero).
const ORBIT: { name: React.ComponentProps<typeof Ionicons>["name"]; top: `${number}%`; left?: `${number}%`; right?: `${number}%` }[] = [
  { name: "timer-outline", top: "24%", left: "9%" },
  { name: "receipt-outline", top: "20%", right: "9%" },
  { name: "stats-chart-outline", top: "58%", left: "6%" },
  { name: "business-outline", top: "56%", right: "7%" },
];

function encryptPassword(plain: string): string {
  return CryptoJS.AES.encrypt(plain, AES_SECRET).toString();
}

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"user" | "pass" | null>(null);
  const passRef = useRef<TextInput>(null);

  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () =>
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert("Missing info", "Enter username and password");
      return;
    }
    setLoading(true);
    try {
      const encrypted = encryptPassword(password);
      const data = await loginUser(username, encrypted);
      const u = data.user_details;
      await login({
        user_id: u.user_id,
        username: u.username,
        first_name: u.first_name,
        last_name: u.last_name,
        role_id: u.role_id,
        is_admin: u.is_admin,
        is_super_admin: u.is_super_admin,
        company_unique_id: u.company_unique_id,
        menus: data.menus,
        company_settings: data.company_settings,
      });
    } catch (e: any) {
      Alert.alert("Login failed", e.message ?? "Please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Brand area ── */}
        <LinearGradient
          colors={[PURPLE_DEEP, PURPLE_MID, PURPLE_SOFT]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 36 }]}
        >
          {ORBIT.map((o) => (
            <View
              key={o.name}
              pointerEvents="none"
              style={{ position: "absolute", top: o.top, left: o.left, right: o.right, opacity: 0.55 }}
            >
              <Ionicons name={o.name} size={26} color={GOLD} />
            </View>
          ))}

          <View style={styles.logoStage}>
            {RINGS.map((d, i) => (
              <View
                key={d}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: -(d - LOGO) / 2,
                  left: -(d - LOGO) / 2,
                  width: d,
                  height: d,
                  borderRadius: d / 2,
                  borderWidth: 1,
                  borderColor: GOLD,
                  opacity: 0.34 - i * 0.09,
                }}
              />
            ))}
            <View style={styles.logo}>
              <MaterialCommunityIcons name="noodles" size={42} color="#FBBF24" />
            </View>
          </View>

          <Text style={styles.brand}>{BRAND}</Text>
        </LinearGradient>

        {/* ── Sign-in card ── */}
        <View style={styles.card}>
          <View>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.sub}>Sign in to start your shift</Text>

            <Text style={styles.label}>Username</Text>
            <View style={[styles.inputRow, focusedField === "user" && styles.inputRowFocused]}>
              <Ionicons name="person-outline" size={19} color={colors.textMuted} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                value={username}
                onChangeText={setUsername}
                onFocus={() => setFocusedField("user")}
                onBlur={() => setFocusedField(null)}
                onSubmitEditing={() => passRef.current?.focus()}
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={[styles.inputRow, focusedField === "pass" && styles.inputRowFocused]}>
              <Ionicons name="lock-closed-outline" size={19} color={colors.textMuted} />
              <TextInput
                ref={passRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry={!showPass}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedField("pass")}
                onBlur={() => setFocusedField(null)}
                onSubmitEditing={handleLogin}
              />
              <TouchableWithoutFeedback
                onPress={() => setShowPass((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel={showPass ? "Hide password" : "Show password"}
              >
                <View hitSlop={10}>
                  <Ionicons
                    name={showPass ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={colors.textMuted}
                  />
                </View>
              </TouchableWithoutFeedback>
            </View>

            <TouchableWithoutFeedback
              onPress={handleLogin}
              onPressIn={pressIn}
              onPressOut={pressOut}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading }}
            >
              <Animated.View style={[styles.buttonWrap, { transform: [{ scale }] }]}>
                <LinearGradient
                  colors={[GREEN_DEEP, GREEN]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.button}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Text style={styles.buttonText}>Log in</Text>
                      <Ionicons name="arrow-forward" size={19} color="#fff" />
                    </>
                  )}
                </LinearGradient>
              </Animated.View>
            </TouchableWithoutFeedback>
          </View>

          <Text style={[styles.footer, { paddingBottom: insets.bottom + 6 }]}>
            {BRAND} v{Constants.expoConfig?.version ?? "1.0.0"}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const LOGO = 88;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PURPLE_MID },
  scroll: { flexGrow: 1 },

  hero: {
    alignItems: "center",
    paddingBottom: 58,
    overflow: "hidden",
  },
  logoStage: { width: LOGO, height: LOGO, alignItems: "center", justifyContent: "center" },
  logo: {
    width: LOGO,
    height: LOGO,
    borderRadius: LOGO / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PURPLE_DEEP,
    borderWidth: 2,
    borderColor: GOLD,
  },
  brand: {
    marginTop: 22,
    fontFamily: SERIF,
    fontSize: 34,
    color: "#F1DFC4",
    letterSpacing: 0.3,
  },

  card: {
    flex: 1,
    marginTop: -30,
    backgroundColor: PAPER,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 26,
    paddingTop: 32,
    justifyContent: "space-between",
  },
  title: { fontFamily: SERIF, fontSize: 30, color: GREEN_DEEP },
  sub: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: 26 },
  label: { fontSize: 13, fontWeight: "600", color: "#3A342E", marginBottom: 8 },

  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 54,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E2DED8",
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 18,
    ...Platform.select({
      ios: { shadowColor: "#7A7268", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 2 },
    }),
  },
  inputRowFocused: { borderColor: GREEN },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 0 },

  buttonWrap: {
    marginTop: 8,
    borderRadius: 16,
    ...Platform.select({
      ios: { shadowColor: GREEN_DEEP, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      android: { elevation: 6 },
    }),
  },
  button: {
    height: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },

  footer: { textAlign: "center", fontSize: 12, color: "#9A918A", paddingTop: 24 },
});
