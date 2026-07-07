// app/(auth)/login.tsx
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import CryptoJS from "crypto-js";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { loginUser } from "../../src/api/endpoints";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";

// TODO(Kuntal): confirm the exact passphrase your web app's login form uses
// with CryptoJS.AES.encrypt(password, SECRET).toString() — grep the web
// repo for "CryptoJS.AES.encrypt" to find it, then paste it in below.
// Using the wrong secret will still POST successfully but the backend will
// reject it as invalid credentials (it decrypts server-side to compare).
const AES_SECRET = "MyRestaurant@SecretKey123";

const HERO_DEEP = "#6D28D9";
const HERO_LIGHT = "#8B5CF6";
const CREAM = "#FFFDF8";
const SAFFRON = "#F5A623";

function encryptPassword(plain: string): string {
  return CryptoJS.AES.encrypt(plain, AES_SECRET).toString();
}

function ScallopEdge() {
  const dots = Array.from({ length: 12 });
  return (
    <View style={styles.scallopRow} pointerEvents="none">
      {dots.map((_, i) => (
        <View key={i} style={styles.scallopDot} />
      ))}
    </View>
  );
}

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"user" | "pass" | null>(null);

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
    <View style={styles.container}>
      <LinearGradient colors={[HERO_DEEP, HERO_LIGHT]} style={styles.hero}>
        <View style={styles.ringLarge} />
        <View style={styles.ringSmall} />

        <Image
          source={require("../../assets/loading-icon.gif")}
          style={styles.heroIcon}
          contentFit="contain"
          autoplay
        />
      </LinearGradient>

      <View style={styles.card}>
        <ScallopEdge />
        <View style={styles.cardInner}>
          <View style={styles.wordmarkRow}>
            <Text style={styles.wordmark}>CurryCloud</Text>
            <View style={styles.wordmarkUnderline} />
          </View>
          <Text style={styles.tagline}>Sign in to start your shift</Text>

          <View
            style={[
              styles.inputRow,
              focusedField === "user" && styles.inputRowFocused,
            ]}
          >
            <Ionicons name="person-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
              onFocus={() => setFocusedField("user")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          <View
            style={[
              styles.inputRow,
              focusedField === "pass" && styles.inputRowFocused,
            ]}
          >
            <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              onFocus={() => setFocusedField("pass")}
              onBlur={() => setFocusedField(null)}
            />
          </View>

          <TouchableWithoutFeedback
            onPress={handleLogin}
            onPressIn={pressIn}
            onPressOut={pressOut}
            disabled={loading}
          >
            <Animated.View style={{ transform: [{ scale }] }}>
              <LinearGradient
                colors={[colors.primary, HERO_DEEP]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.button}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Log in</Text>
                )}
              </LinearGradient>
            </Animated.View>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CREAM },
  hero: {
    height: 260,
    overflow: "hidden",
    justifyContent: "center",
  },
  ringLarge: {
    position: "absolute",
    top: -70,
    right: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  ringSmall: {
    position: "absolute",
    bottom: -40,
    left: -30,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroIcon: {
    alignSelf: "center",
    width: 96,
    height: 96,
  },
  card: { flex: 1, marginTop: -22 },
  scallopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: -7,
  },
  scallopDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: HERO_LIGHT,
  },
  cardInner: {
    flex: 1,
    backgroundColor: CREAM,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 26,
    paddingTop: 34,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
      },
      android: { elevation: 6 },
    }),
  },
  wordmarkRow: { alignItems: "center", marginBottom: 4 },
  wordmark: { fontSize: 26, fontWeight: "700", color: colors.text, letterSpacing: 0.2 },
  wordmarkUnderline: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: SAFFRON,
    marginTop: 6,
  },
  tagline: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 28,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 13 : 8,
    marginBottom: 14,
  },
  inputRowFocused: { borderColor: colors.primary },
  input: { flex: 1, fontSize: 15, color: colors.text },
  button: {
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
