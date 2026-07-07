// app/(tabs)/tables.tsx
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { createOrder, getRunningOrders, getTables } from "../../src/api/endpoints";
import { useAuth } from "../../src/context/AuthContext";
import { colors, statusColor } from "../../src/theme/colors";
import { Order, OrderType, Table } from "../../src/api/types";

const ORDER_TYPES: { key: OrderType; label: string }[] = [
  { key: "dine_in", label: "Dine In" },
  { key: "take_away", label: "Take Away" },
  { key: "delivery", label: "Delivery" },
];

const START_CARD_CONFIG: Record<
  Exclude<OrderType, "dine_in">,
  { icon: keyof typeof Ionicons.glyphMap; title: string; description: string; buttonLabel: string }
> = {
  take_away: {
    icon: "bag-handle-outline",
    title: "Take Away Order",
    description: "No table needed — start the order and add items.",
    buttonLabel: "Start Take Away Order",
  },
  delivery: {
    icon: "bicycle-outline",
    title: "Delivery Order",
    description: "No table needed — add customer & address on the next screen.",
    buttonLabel: "Start Delivery Order",
  },
};

export default function TablesScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyTableId, setBusyTableId] = useState<number | null>(null);

  const companyId = session?.company_unique_id ?? 1;

  const load = useCallback(async () => {
    try {
      const data = await getTables(companyId);
      setTables(data);
    } catch (e: any) {
      Alert.alert("Couldn't load tables", e.message);
    }
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

  const startNonDineInOrder = async (type: "take_away" | "delivery") => {
    if (!session) return;
    if (type === "delivery") {
      // Delivery needs customer + address first — collect those on a
      // dedicated screen before creating the order.
      router.push("/order/new-delivery");
      return;
    }
    try {
      const order = await createOrder({
        company_unique_id: companyId,
        order_type: type,
        covers: 1,
        created_by: session.user_id,
      });
      router.push(`/order/${order.order_id}`);
    } catch (e: any) {
      Alert.alert("Couldn't start order", e.message);
    }
  };

  const openOrderForTable = async (table: Table) => {
    if (!session) return;
    setBusyTableId(table.table_id);
    const surchargeParams = {
      surchargeAmount: table.surcharge_amount,
      surchargeLabel: table.surcharge_label ?? "Table Surcharge",
    };
    try {
      if (table.table_status === "free") {
        const order = await createOrder({
          company_unique_id: companyId,
          order_type: orderType,
          covers: 2,
          created_by: session.user_id,
          table_id: table.table_id,
        });
        router.push({ pathname: `/order/${order.order_id}`, params: surchargeParams });
        return;
      }

      // occupied — find the live order(s) tied to this table
      const running = await getRunningOrders(companyId);
      const matches = running.filter((o: Order) => o.table_id === table.table_id);
      if (matches.length === 0) {
        Alert.alert("No open order", "This table shows occupied but has no running order.");
      } else if (matches.length === 1) {
        router.push({ pathname: `/order/${matches[0].order_id}`, params: surchargeParams });
      } else {
        Alert.alert(
          "Multiple orders",
          `Table has ${matches.length} running orders. Open orders tab to pick one.`
        );
      }
    } catch (e: any) {
      Alert.alert("Something went wrong", e.message);
    } finally {
      setBusyTableId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.center} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <Text style={styles.heading}>New Order</Text>
      <Text style={styles.subheading}>Choose an order type — then pick a free table</Text>

      <View style={styles.typeRow}>
        {ORDER_TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.typeButton, orderType === t.key && styles.typeButtonActive]}
            onPress={() => setOrderType(t.key)}
          >
            <Text style={[styles.typeText, orderType === t.key && styles.typeTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {orderType === "dine_in" ? (
        <FlatList
          data={tables}
          keyExtractor={(item) => String(item.table_id)}
          numColumns={2}
          contentContainerStyle={{ paddingBottom: 24 }}
          columnWrapperStyle={{ gap: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => {
            const sc = statusColor[item.table_status];
            const surcharge = Number(item.surcharge_amount) > 0;
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: sc.bg, borderColor: sc.border }]}
                onPress={() => openOrderForTable(item)}
                disabled={busyTableId === item.table_id}
              >
                {busyTableId === item.table_id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <Text style={styles.tableName}>{item.table_name}</Text>
                    <Text style={styles.tableMeta}>
                      {item.seats} seats · {item.floor}
                    </Text>
                    {surcharge && (
                      <Text style={styles.surcharge}>
                        +₹{Number(item.surcharge_amount).toFixed(2)} {item.surcharge_label}
                      </Text>
                    )}
                    <View style={styles.statusPill}>
                      <Text style={styles.statusPillText}>
                        {item.table_status === "occupied"
                          ? `Occupied · ${item.active_order_count} order(s)`
                          : item.table_status[0].toUpperCase() + item.table_status.slice(1)}
                      </Text>
                    </View>
                  </>
                )}
              </TouchableOpacity>
            );
          }}
        />
      ) : (
        <View style={styles.startCard}>
          <Ionicons
            name={START_CARD_CONFIG[orderType].icon}
            size={56}
            color={colors.primary}
            style={{ marginBottom: 12 }}
          />
          <Text style={styles.startCardTitle}>{START_CARD_CONFIG[orderType].title}</Text>
          <Text style={styles.startCardDesc}>{START_CARD_CONFIG[orderType].description}</Text>
          <TouchableOpacity
            style={styles.startCardButton}
            onPress={() => startNonDineInOrder(orderType)}
          >
            <Text style={styles.startCardButtonText}>{START_CARD_CONFIG[orderType].buttonLabel}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 22, fontWeight: "700", color: colors.text },
  subheading: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  typeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  typeButtonActive: { backgroundColor: colors.tableFree, borderColor: colors.primary },
  typeText: { color: colors.textMuted, fontWeight: "600" },
  typeTextActive: { color: colors.primaryDark },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    minHeight: 110,
    justifyContent: "center",
  },
  tableName: { fontSize: 17, fontWeight: "700", color: colors.text },
  tableMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  surcharge: { fontSize: 11, color: colors.warning, marginTop: 4 },
  statusPill: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 11, fontWeight: "600", color: colors.text },
  startCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 32,
    marginBottom: 24,
  },
  startCardTitle: { fontSize: 18, fontWeight: "700", color: colors.text, marginBottom: 6 },
  startCardDesc: { fontSize: 13, color: colors.textMuted, textAlign: "center", marginBottom: 20 },
  startCardButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28 },
  startCardButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
