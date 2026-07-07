// src/components/NotificationBell.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { KitchenNotification, useNotifications } from "../context/NotificationContext";
import { colors } from "../theme/colors";

function timeAgo(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  return `${mins} min ago`;
}

function NotificationRow({
  item,
  onPress,
}: {
  item: KitchenNotification;
  onPress: () => void;
}) {
  const isReady = item.type === "ready";
  return (
    <Pressable
      style={[styles.row, !item.read && styles.rowUnread]}
      onPress={onPress}
    >
      <View style={[styles.rowIcon, isReady ? styles.rowIconReady : styles.rowIconCooking]}>
        <Ionicons name={isReady ? "checkmark" : "flame"} size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          {isReady ? "Ready to serve" : "Now cooking"}
        </Text>
        <Text style={styles.rowDetail}>
          {item.quantity}× {item.itemName}
        </Text>
        <Text style={styles.rowMeta}>
          Order #{item.orderNumber} · {item.orderContext} · {timeAgo(item.timestamp)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const goToOrder = (orderId: number) => {
    setOpen(false);
    router.push(`/order/${orderId}`);
  };

  return (
    <>
      <Pressable
        style={styles.bellButton}
        onPress={() => {
          setOpen(true);
          markAllRead();
        }}
        hitSlop={10}
      >
        <Ionicons name="notifications-outline" size={22} color={colors.text} />
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Kitchen updates</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {notifications.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="notifications-off-outline" size={28} color={colors.textMuted} />
                <Text style={styles.emptyText}>No kitchen updates yet</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                {notifications.map((n) => (
                  <NotificationRow key={n.id} item={n} onPress={() => goToOrder(n.orderId)} />
                ))}
              </ScrollView>
            )}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "flex-end",
  },
  panel: {
    marginTop: 60,
    marginRight: 12,
    width: 300,
    backgroundColor: "#fff",
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    overflow: "hidden",
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  panelTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  empty: { alignItems: "center", paddingVertical: 28, gap: 8 },
  emptyText: { fontSize: 13, color: colors.textMuted },
  row: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowUnread: { backgroundColor: colors.tableFree },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  rowIconReady: { backgroundColor: colors.primary },
  rowIconCooking: { backgroundColor: colors.warning },
  rowTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  rowDetail: { fontSize: 13, color: colors.text, marginTop: 1 },
  rowMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
