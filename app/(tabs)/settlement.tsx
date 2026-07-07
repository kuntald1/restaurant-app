// app/(tabs)/settlement.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { getBill, getBillsForCompany, getFoodMenu, settleBill } from "../../src/api/endpoints";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";
import { Bill, FoodMenuItem, OrderItem } from "../../src/api/types";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface AddedItem {
  key: string;
  food_menu_id: number;
  item_name: string;
  item_code: string;
  category_id: number;
  unit_price: number;
  quantity: number;
  is_veg: boolean;
}

export default function SettlementScreen() {
  const { session } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [menu, setMenu] = useState<FoodMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [billDetail, setBillDetail] = useState<Bill | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [removedIds, setRemovedIds] = useState<number[]>([]);
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const companyId = session?.company_unique_id ?? 1;

  const load = useCallback(async () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 7);
    const [billData, menuData] = await Promise.all([
      getBillsForCompany(companyId, isoDate(from), isoDate(to)),
      getFoodMenu(companyId),
    ]);
    setBills(billData);
    setMenu(menuData);
  }, [companyId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const openSettle = async (bill: Bill) => {
    setRemovedIds([]);
    setAddedItems([]);
    setSelectedBill(bill);
    setBillDetail(null);
    setLoadingDetail(true);
    try {
      const detail = await getBill(bill.bill_id);
      setBillDetail(detail);
    } catch (e: any) {
      Alert.alert("Couldn't load bill details", e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const toggleRemove = (orderItemId: number) => {
    setRemovedIds((prev) =>
      prev.includes(orderItemId) ? prev.filter((id) => id !== orderItemId) : [...prev, orderItemId]
    );
  };

  const addMenuItem = (item: FoodMenuItem) => {
    setAddedItems((prev) => [
      ...prev,
      {
        key: `${item.food_menu_id}-${Date.now()}`,
        food_menu_id: item.food_menu_id,
        item_name: item.name,
        item_code: item.code,
        category_id: item.category_id,
        unit_price: item.sale_price,
        quantity: 1,
        is_veg: item.is_veg,
      },
    ]);
    setPickerOpen(false);
  };

  const removeAddedItem = (key: string) => {
    setAddedItems((prev) => prev.filter((a) => a.key !== key));
  };

  const currentItems: OrderItem[] = useMemo(
    () => (billDetail?.order?.order_items ?? []).filter((i) => !i.is_cancelled),
    [billDetail]
  );

  const newSubtotal = useMemo(() => {
    const keptTotal = currentItems
      .filter((i) => !removedIds.includes(i.order_item_id))
      .reduce((sum, i) => sum + Number(i.total_price), 0);
    const addedTotal = addedItems.reduce((sum, a) => sum + a.unit_price * a.quantity, 0);
    return keptTotal + addedTotal;
  }, [currentItems, removedIds, addedItems]);

  const confirmSettle = async () => {
    if (!selectedBill || !session) return;
    setSaving(true);
    try {
      await settleBill(selectedBill.bill_id, {
        company_id: companyId,
        settled_by: session.user_id,
        adds: addedItems.map((a) => ({
          food_menu_id: a.food_menu_id,
          item_name: a.item_name,
          item_code: a.item_code,
          category_id: a.category_id,
          category_name: "",
          unit_price: a.unit_price,
          quantity: a.quantity,
          is_veg: a.is_veg,
          notes: null,
        })),
        removes: removedIds.map((id) => ({ order_item_id: id, reason: "Removed during settlement" })),
      });
      Alert.alert("Settled", `${selectedBill.bill_number} updated.`);
      setSelectedBill(null);
      load();
    } catch (e: any) {
      Alert.alert("Settlement failed", e.message);
    } finally {
      setSaving(false);
    }
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
      <Text style={styles.heading}>Bill Settlement</Text>
      <Text style={styles.subheading}>Edit a billed order — add or remove items and re-settle dues</Text>

      <FlatList
        data={bills}
        keyExtractor={(item) => String(item.bill_id)}
        renderItem={({ item }) => (
          <View style={styles.billCard}>
            <View style={styles.billIconWrap}>
              <Ionicons name="receipt-outline" size={18} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.billNumber}>{item.bill_number}</Text>
              <Text style={styles.billMeta}>
                {item.order_number} · {item.table_name ?? item.order_type} ·{" "}
                {item.payment_method.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.total}>₹{item.total_payable}</Text>
            <TouchableOpacity style={styles.editButton} onPress={() => openSettle(item)}>
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No bills in the last 7 days.</Text>}
      />

      <Modal visible={!!selectedBill} animationType="slide" transparent onRequestClose={() => setSelectedBill(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            {selectedBill && (
              <>
                <View style={styles.sheetHeaderRow}>
                  <Text style={styles.sheetTitle}>Settle {selectedBill.bill_number}</Text>
                  <TouchableOpacity onPress={() => setSelectedBill(null)}>
                    <Text style={styles.close}>✕</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sheetMeta}>
                  Order: {selectedBill.order_number} · Current total: ₹{selectedBill.total_payable}
                </Text>

                {loadingDetail ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 30 }} />
                ) : (
                  <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
                    <Text style={styles.sectionLabel}>Current Items</Text>
                    {currentItems.length === 0 && (
                      <Text style={styles.emptyDetailText}>No items on this bill.</Text>
                    )}
                    {currentItems.map((item) => {
                      const marked = removedIds.includes(item.order_item_id);
                      return (
                        <View key={item.order_item_id} style={[styles.itemRow, marked && styles.itemRowRemoved]}>
                          <View
                            style={[styles.vegDot, { backgroundColor: item.is_veg ? colors.veg : colors.nonVeg }]}
                          />
                          <Text style={[styles.itemName, marked && styles.strike]}>
                            {item.item_name} x{item.quantity}
                          </Text>
                          <Text style={[styles.itemLine, marked && styles.strike]}>₹{item.total_price}</Text>
                          <TouchableOpacity onPress={() => toggleRemove(item.order_item_id)}>
                            <Text style={marked ? styles.undoText : styles.removeText}>
                              {marked ? "Undo" : "Remove"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}

                    {addedItems.length > 0 && (
                      <>
                        <Text style={[styles.sectionLabel, { marginTop: 12 }]}>New Items</Text>
                        {addedItems.map((a) => (
                          <View key={a.key} style={styles.itemRow}>
                            <View style={[styles.vegDot, { backgroundColor: a.is_veg ? colors.veg : colors.nonVeg }]} />
                            <Text style={styles.itemName}>
                              {a.item_name} x{a.quantity}
                            </Text>
                            <Text style={styles.itemLine}>₹{a.unit_price * a.quantity}</Text>
                            <TouchableOpacity onPress={() => removeAddedItem(a.key)}>
                              <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </>
                    )}

                    <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Add Items</Text>
                    <TouchableOpacity style={styles.addItemPicker} onPress={() => setPickerOpen(true)}>
                      <Text style={styles.addItemPickerText}>Select an item to add…</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </ScrollView>
                )}

                <View style={styles.subtotalRow}>
                  <Text style={styles.subtotalLabel}>New subtotal</Text>
                  <Text style={styles.subtotalValue}>₹{newSubtotal.toFixed(2)}</Text>
                </View>
                <Text style={styles.subtotalHint}>SGST/CGST & final total recomputed on save</Text>

                <View style={styles.sheetFooter}>
                  <TouchableOpacity style={styles.cancelButton} onPress={() => setSelectedBill(null)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmButton} onPress={confirmSettle} disabled={saving}>
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.confirmText}>Settle bill</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Item picker for "Add Items" */}
      <Modal visible={pickerOpen} animationType="fade" transparent onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.sheetTitle}>Select an item</Text>
            <FlatList
              data={menu}
              keyExtractor={(m) => String(m.food_menu_id)}
              style={{ maxHeight: 400, marginTop: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.pickerRow} onPress={() => addMenuItem(item)}>
                  <View style={[styles.vegDot, { backgroundColor: item.is_veg ? colors.veg : colors.nonVeg }]} />
                  <Text style={styles.pickerRowText}>{item.name}</Text>
                  <Text style={styles.pickerRowPrice}>₹{item.sale_price}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  heading: { fontSize: 20, fontWeight: "700", color: colors.text },
  subheading: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  billCard: {
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
  billIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tableFree,
    alignItems: "center",
    justifyContent: "center",
  },
  billNumber: { fontSize: 14, fontWeight: "700", color: colors.text },
  billMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  total: { fontSize: 14, fontWeight: "700", color: colors.text },
  editButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  editButtonText: { color: colors.primaryDark, fontWeight: "600", fontSize: 12 },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
  emptyDetailText: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "88%" },
  sheetHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  close: { fontSize: 18, color: colors.textMuted },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  sheetMeta: { fontSize: 12, color: colors.textMuted, marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 6, textTransform: "uppercase" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemRowRemoved: { opacity: 0.5 },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  itemName: { flex: 1, fontSize: 13, color: colors.text },
  itemLine: { fontSize: 13, color: colors.text, minWidth: 60, textAlign: "right" },
  strike: { textDecorationLine: "line-through" },
  removeText: { color: colors.danger, fontWeight: "600", fontSize: 12 },
  undoText: { color: colors.primaryDark, fontWeight: "600", fontSize: 12 },
  addItemPicker: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  addItemPickerText: { color: colors.textMuted, fontSize: 13 },
  subtotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  subtotalLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  subtotalValue: { fontSize: 15, fontWeight: "700", color: colors.primaryDark },
  subtotalHint: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  sheetFooter: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cancelText: { color: colors.textMuted, fontWeight: "600" },
  confirmButton: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  confirmText: { color: "#fff", fontWeight: "700" },
  pickerBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  pickerSheet: { backgroundColor: "#fff", borderRadius: 16, padding: 16, maxHeight: "70%" },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerRowText: { flex: 1, fontSize: 14, color: colors.text },
  pickerRowPrice: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },
});
