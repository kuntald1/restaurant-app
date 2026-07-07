// app/(tabs)/running-orders.tsx
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getRunningOrders } from "../../src/api/endpoints";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";
import { Order } from "../../src/api/types";

type DisplayStatus = "kot_open" | "draft" | "hold";

const STATUS_META: Record<DisplayStatus, { label: string; bg: string; text: string }> = {
  kot_open: { label: "KOT Open", bg: "#FFF4D6", text: "#B8860B" },
  draft: { label: "Draft", bg: "#EDEBFB", text: "#6D28D9" },
  hold: { label: "Hold", bg: "#FDE8E8", text: "#B91C1C" },
};

const TYPE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  dine_in: "restaurant-outline",
  take_away: "bag-handle-outline",
  delivery: "bicycle-outline",
};

function displayStatusOf(order: Order): DisplayStatus {
  if (order.is_hold) return "hold";
  if (order.order_status === "kot_open") return "kot_open";
  return "draft";
}

export default function RunningOrdersScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | DisplayStatus>("all");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const companyId = session?.company_unique_id ?? 1;

  const load = useCallback(async () => {
    const data = await getRunningOrders(companyId);
    setOrders(data);
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const counts = useMemo(() => {
    const c = { kot_open: 0, draft: 0, hold: 0 };
    orders.forEach((o) => {
      c[displayStatusOf(o)]++;
    });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => displayStatusOf(o) === filter);
  }, [orders, filter]);

  const sections = useMemo(() => {
    const order: DisplayStatus[] = ["kot_open", "draft", "hold"];
    return order
      .map((status) => ({
        status,
        items: filtered.filter((o) => displayStatusOf(o) === status),
      }))
      .filter((s) => s.items.length > 0);
  }, [filtered]);

  const toggleSection = (status: string) => {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Running Orders</Text>

      <View style={styles.countRow}>
        {(["kot_open", "draft", "hold"] as DisplayStatus[]).map((s) => (
          <View key={s} style={[styles.countCard, { backgroundColor: STATUS_META[s].bg }]}>
            <Text style={[styles.countValue, { color: STATUS_META[s].text }]}>{counts[s]}</Text>
            <Text style={[styles.countLabel, { color: STATUS_META[s].text }]}>{STATUS_META[s].label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.filterRow}>
        {(["all", "kot_open", "draft", "hold"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === "all" ? "All" : STATUS_META[f].label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={sections}
        keyExtractor={(s) => s.status}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item: section }) => {
          const meta = STATUS_META[section.status];
          const isCollapsed = collapsed[section.status];
          return (
            <View style={{ marginBottom: 8 }}>
              <TouchableOpacity
                style={[styles.sectionHeader, { backgroundColor: meta.bg }]}
                onPress={() => toggleSection(section.status)}
                activeOpacity={0.7}
              >
                <Text style={[styles.sectionHeaderText, { color: meta.text }]}>
                  {meta.label} ({section.items.length})
                </Text>
                <Text style={[styles.sectionChevron, { color: meta.text }]}>
                  {isCollapsed ? "▾" : "▴"}
                </Text>
              </TouchableOpacity>

              {!isCollapsed &&
                section.items.map((item) => (
                  <TouchableOpacity
                    key={item.order_id}
                    style={styles.orderCard}
                    onPress={() => router.push(`/order/${item.order_id}`)}
                  >
                    <View style={styles.typeIconWrap}>
                      <Ionicons
                        name={TYPE_ICON[item.order_type] ?? "receipt-outline"}
                        size={18}
                        color={colors.primaryDark}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.orderNumber}>{item.order_number}</Text>
                      <Text style={styles.orderMeta}>
                        {new Date(item.order_placed_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {item.table_name
                          ? ` · ${item.table_name}`
                          : ` · ${item.order_type.replace("_", " ")}`}
                      </Text>
                    </View>
                    <Text style={styles.total}>₹{item.total_payable}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No running orders right now.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 20, fontWeight: "700", color: colors.text, marginBottom: 12 },
  countRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  countCard: { flex: 1, borderRadius: 12, padding: 10, alignItems: "center" },
  countValue: { fontSize: 20, fontWeight: "800" },
  countLabel: { fontSize: 11, fontWeight: "600", marginTop: 2 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  filterChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  sectionHeaderText: { fontSize: 13, fontWeight: "700" },
  sectionChevron: { fontSize: 14, fontWeight: "700" },
  orderCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  typeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tableFree,
    alignItems: "center",
    justifyContent: "center",
  },
  orderNumber: { fontSize: 14, fontWeight: "700", color: colors.text },
  orderMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1, textTransform: "capitalize" },
  total: { fontSize: 14, fontWeight: "700", color: colors.text },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
