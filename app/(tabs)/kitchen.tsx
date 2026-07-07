// app/(tabs)/kitchen.tsx
//
// Groups running orders' items into per-KOT cards with status counts and
// collapsible sections, mirroring the web app's Kitchen Display board.
//
// LIMITATION: there's no GET /pos/kot list endpoint documented yet — this
// screen derives everything from GET /pos/orders/running/{company_id},
// grouping items by kot_id. That means "sent X mins ago" uses the parent
// order's order_placed_at as a proxy (not the KOT's own sent_to_kitchen_at,
// which we don't have access to here), and there's no status-advance action
// since no PATCH-status-by-item endpoint was documented. Once a dedicated
// GET /pos/kot/company/{id} endpoint exists, swap this screen over to it
// for real per-KOT timestamps and status transitions.

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
import { Order, OrderItem } from "../../src/api/types";

type KotStatus = "pending" | "cooking" | "ready" | "other";

interface KotGroup {
  kot_id: number;
  order_number: string;
  table_name: string | null;
  order_placed_at: string;
  status: KotStatus;
  items: OrderItem[];
}

const STATUS_META: Record<KotStatus, { label: string; bg: string; text: string }> = {
  pending: { label: "Pending", bg: "#FFF4D6", text: "#B8860B" },
  cooking: { label: "Cooking", bg: "#DCEBFF", text: "#1D4ED8" },
  ready: { label: "Ready", bg: "#D8F5E3", text: "#15803D" },
  other: { label: "Other", bg: colors.surface, text: colors.textMuted },
};

function mapItemStatusToKot(status: string): KotStatus {
  const s = (status || "").toLowerCase();
  if (s.includes("ready") || s.includes("serve") || s.includes("complete")) return "ready";
  if (s.includes("open") || s.includes("pending") || s.includes("draft") || s.includes("new")) {
    return "pending";
  }
  // Anything else (cooking, started, in_kitchen, preparing, wip, etc.) — if
  // it has a kot_id it's already past the "just sent" stage, so treat any
  // status we don't explicitly recognize as "cooking" rather than dumping
  // it in a catch-all "Other" bucket that doesn't map to the web's board.
  return "cooking";
}

export default function KitchenScreen() {
  const { session } = useAuth();
  const [groups, setGroups] = useState<KotGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"active" | KotStatus | "all">("active");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const companyId = session?.company_unique_id ?? 1;

  const load = useCallback(async () => {
    const orders = await getRunningOrders(companyId);
    const byKot = new Map<number, KotGroup>();

    orders.forEach((o: Order) => {
      (o.items ?? []).forEach((item) => {
        if (item.kot_id === null || item.is_cancelled) return;
        const status = mapItemStatusToKot(item.kot_item_status);
        const existing = byKot.get(item.kot_id);
        if (existing) {
          existing.items.push(item);
        } else {
          byKot.set(item.kot_id, {
            kot_id: item.kot_id,
            order_number: o.order_number,
            table_name: o.table_name,
            order_placed_at: o.order_placed_at,
            status,
            items: [item],
          });
        }
      });
    });

    setGroups(Array.from(byKot.values()));
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
    const c = { pending: 0, cooking: 0, ready: 0 };
    groups.forEach((g) => {
      if (g.status === "pending") c.pending++;
      else if (g.status === "cooking") c.cooking++;
      else if (g.status === "ready") c.ready++;
    });
    return c;
  }, [groups]);

  const filteredGroups = useMemo(() => {
    if (filter === "all") return groups;
    if (filter === "active") return groups.filter((g) => g.status !== "ready");
    return groups.filter((g) => g.status === filter);
  }, [groups, filter]);

  // Group the filtered list into collapsible sections by status, in a
  // fixed display order.
  const sections = useMemo(() => {
    const order: KotStatus[] = ["pending", "cooking", "ready", "other"];
    return order
      .map((status) => ({
        status,
        items: filteredGroups.filter((g) => g.status === status),
      }))
      .filter((s) => s.items.length > 0);
  }, [filteredGroups]);

  const toggleSection = (status: string) => {
    setCollapsed((prev) => ({ ...prev, [status]: !prev[status] }));
  };

  const minutesAgo = (dateStr: string) =>
    Math.max(0, Math.round((Date.now() - new Date(dateStr).getTime()) / 60000));

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Kitchen Display</Text>
      <Text style={styles.subheading}>Live KOT status board</Text>

      <View style={styles.countRow}>
        <View style={[styles.countCard, { backgroundColor: STATUS_META.pending.bg }]}>
          <Text style={[styles.countValue, { color: STATUS_META.pending.text }]}>{counts.pending}</Text>
          <Text style={[styles.countLabel, { color: STATUS_META.pending.text }]}>Pending</Text>
        </View>
        <View style={[styles.countCard, { backgroundColor: STATUS_META.cooking.bg }]}>
          <Text style={[styles.countValue, { color: STATUS_META.cooking.text }]}>{counts.cooking}</Text>
          <Text style={[styles.countLabel, { color: STATUS_META.cooking.text }]}>Cooking</Text>
        </View>
        <View style={[styles.countCard, { backgroundColor: STATUS_META.ready.bg }]}>
          <Text style={[styles.countValue, { color: STATUS_META.ready.text }]}>{counts.ready}</Text>
          <Text style={[styles.countLabel, { color: STATUS_META.ready.text }]}>Ready</Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {(["active", "pending", "cooking", "ready", "all"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f[0].toUpperCase() + f.slice(1)}
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
                section.items.map((g) => (
                  <View key={g.kot_id} style={[styles.kotCard, { borderColor: meta.text }]}>
                    <View style={styles.kotHeaderRow}>
                      <Text style={styles.kotTitle}>
                        {g.table_name ? `${g.table_name} · ` : ""}Order {g.order_number}
                      </Text>
                      <Text style={styles.kotWaiting}>{minutesAgo(g.order_placed_at)} min ago</Text>
                    </View>
                    {g.items.map((item) => (
                      <View key={item.order_item_id} style={styles.kotItemRow}>
                        <View
                          style={[
                            styles.vegDot,
                            { backgroundColor: item.is_veg ? colors.veg : colors.nonVeg },
                          ]}
                        />
                        <Text style={styles.kotItemName}>
                          {item.item_name} x{item.quantity}
                        </Text>
                        {item.notes && <Text style={styles.kotItemNote}>📝 {item.notes}</Text>}
                      </View>
                    ))}
                  </View>
                ))}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>Kitchen queue is clear.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 20, fontWeight: "700", color: colors.text },
  subheading: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
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
  kotCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  kotHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  kotTitle: { fontSize: 13, fontWeight: "700", color: colors.text },
  kotWaiting: { fontSize: 11, color: colors.textMuted },
  kotItemRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  kotItemName: { fontSize: 13, color: colors.text, fontWeight: "600" },
  kotItemNote: { fontSize: 11, color: colors.warning, marginLeft: 4 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
});
