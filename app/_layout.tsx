// app/_layout.tsx
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { NotificationProvider } from "../src/context/NotificationContext";
import NotificationBell from "../src/components/NotificationBell";
import NotificationToast from "../src/components/NotificationToast";

const HERO_DEEP = "#6D28D9";
const HERO_LIGHT = "#8B5CF6";

function LoadingScreen() {
  return (
    <LinearGradient colors={[HERO_DEEP, HERO_LIGHT]} style={styles.loadingRoot}>
      <Image
        source={require("../assets/loading-icon.gif")}
        style={styles.iconImage}
        contentFit="contain"
        autoplay
      />
      <Text style={styles.loadingTitle}>CurryCloud</Text>
    </LinearGradient>
  );
}

function RootNavigation() {
  const { session, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (session && inAuthGroup) {
      router.replace("/(tabs)/tables");
    }
  }, [session, isLoading, segments]);

  if (isLoading) return <LoadingScreen />;

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {session && (
        <>
          <View style={styles.bellOverlay} pointerEvents="box-none">
            <NotificationBell />
          </View>
          <NotificationToast />
        </>
      )}
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <RootNavigation />
      </NotificationProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  bellOverlay: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 90,
  },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconImage: {
    width: 84,
    height: 84,
    marginBottom: 14,
  },
  loadingTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
});
