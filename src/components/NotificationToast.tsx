// src/components/NotificationToast.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useNotifications } from "../context/NotificationContext";
import { colors } from "../theme/colors";

export default function NotificationToast() {
  const { currentToast, dismissToast } = useNotifications();
  const router = useRouter();
  const translateY = useRef(new Animated.Value(-120)).current;

  useEffect(() => {
    if (currentToast) {
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 16 }).start();
    } else {
      Animated.timing(translateY, { toValue: -120, duration: 220, useNativeDriver: true }).start();
    }
  }, [currentToast, translateY]);

  if (!currentToast) return null;

  const isReady = currentToast.type === "ready";

  return (
    <Animated.View
      style={[styles.wrap, { transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[styles.card, isReady ? styles.cardReady : styles.cardCooking]}
        onPress={() => {
          dismissToast();
          router.push(`/order/${currentToast.orderId}`);
        }}
      >
        <View style={styles.titleRow}>
          <Ionicons
            name={isReady ? "checkmark-circle" : "flame"}
            size={16}
            color="#fff"
          />
          <Text style={styles.title}>{isReady ? "Ready to serve" : "Now cooking"}</Text>
          <Pressable onPress={dismissToast} hitSlop={10} style={styles.closeButton}>
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.85)" />
          </Pressable>
        </View>
        <Text style={styles.item}>
          {currentToast.quantity}× {currentToast.itemName}
        </Text>
        <Text style={styles.context}>
          Order #{currentToast.orderNumber} — {currentToast.orderContext}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingHorizontal: 12,
    zIndex: 100,
  },
  card: {
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  cardReady: { backgroundColor: colors.primaryDark },
  cardCooking: { backgroundColor: "#B8860B" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { color: "#fff", fontWeight: "700", fontSize: 14, flex: 1 },
  closeButton: { padding: 2 },
  item: { color: "#fff", fontSize: 13, fontWeight: "600", marginTop: 6 },
  context: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
});
