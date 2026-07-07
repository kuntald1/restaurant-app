// app/order/[orderId].tsx
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  addOrderItem,
  cancelOrder,
  findCustomerByPhone,
  getFoodCategories,
  getFoodMenu,
  getOrder,
  getTables,
  holdOrder,
  sendKot,
  setOrderItemNotes,
  setOrderItemQuantity,
} from "../../src/api/endpoints";
import GenerateBillModal from "../../src/components/GenerateBillModal";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";
import { classifyKotStatus } from "../../src/utils/kotStatus";
import { Customer, FoodCategory, FoodMenuItem, Order } from "../../src/api/types";

export default function OrderScreen() {
  const { orderId, surchargeAmount, surchargeLabel } = useLocalSearchParams<{
    orderId: string;
    surchargeAmount?: string;
    surchargeLabel?: string;
  }>();
  const router = useRouter();
  const { session } = useAuth();

  const [order, setOrder] = useState<Order | null>(null);
  const [menu, setMenu] = useState<FoodMenuItem[]>([]);
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | "all">("all");
  const [vegFilter, setVegFilter] = useState<"all" | "veg" | "nonveg">("all");
  const [phone, setPhone] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerExpanded, setCustomerExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [billModalOpen, setBillModalOpen] = useState(false);
  const [discount, setDiscount] = useState("0");
  const [actionBusy, setActionBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [itemsExpanded, setItemsExpanded] = useState(true);
  const [menuExpanded, setMenuExpanded] = useState(true);
  const [breakdownExpanded, setBreakdownExpanded] = useState(true);
  const [tableSurcharge, setTableSurcharge] = useState<{ amount: number; label: string } | null>(null);
  const [noteEditor, setNoteEditor] = useState<{ orderItemId: number; text: string } | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const companyId = session?.company_unique_id ?? 1;
  const numericOrderId = Number(orderId);

  useEffect(() => {
    if (Number.isNaN(numericOrderId)) {
      Alert.alert("Invalid order", "This order link is malformed.", [
        { text: "Go back", onPress: () => router.back() },
      ]);
    }
  }, [numericOrderId]);

  const load = useCallback(async () => {
    const [o, m, c] = await Promise.all([
      getOrder(numericOrderId),
      getFoodMenu(companyId),
      getFoodCategories(companyId),
    ]);
    setOrder(o);
    setMenu(m);
    setCategories(c);

    if (o.table_id) {
      try {
        const allTables = await getTables(companyId);
        const t = allTables.find((tbl) => tbl.table_id === o.table_id);
        if (t && Number(t.surcharge_amount) > 0) {
          setTableSurcharge({
            amount: Number(t.surcharge_amount),
            label: t.surcharge_label || "Table Surcharge",
          });
        } else {
          setTableSurcharge(null);
        }
      } catch {
        // non-critical — surcharge will just show as 0 if this lookup fails
      }
    } else {
      setTableSurcharge(null);
    }
  }, [numericOrderId, companyId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => {
      setLoading(false);
      setLastSyncedAt(Date.now());
    });
  }, [load]);

  // Keep the kitchen-status banner live — otherwise it's stuck on whatever
  // it showed at the last manual reload, even as items move through
  // Cooking/Ready in the kitchen.
  useEffect(() => {
    if (!order || order.order_status !== "kot_open" || order.billed_at) return;
    const interval = setInterval(() => {
      load().then(() => setLastSyncedAt(Date.now()));
    }, 3000);
    return () => clearInterval(interval);
  }, [order?.order_status, order?.billed_at, load]);

  // Re-render every second purely so "synced Xs ago" ticks forward visibly —
  // proof the polling loop is actually alive, not a static label.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const filteredMenu = useMemo(() => {
    return menu.filter((item) => {
      if (activeCategory !== "all" && item.category_id !== activeCategory) return false;
      if (vegFilter === "veg" && !item.is_veg) return false;
      if (vegFilter === "nonveg" && item.is_veg) return false;
      if (itemSearch.trim() && !item.name.toLowerCase().includes(itemSearch.trim().toLowerCase()))
        return false;
      return true;
    });
  }, [menu, activeCategory, vegFilter, itemSearch]);

  // Cross-reference menu items so we can show a thumbnail on each order-item
  // row even though the order-items API response itself has no image field.
  const menuImageByFoodId = useMemo(() => {
    const map = new Map<number, string>();
    menu.forEach((m) => map.set(m.food_menu_id, m.image_url));
    return map;
  }, [menu]);

  const searchCustomer = async () => {
    if (!phone.trim()) return;
    setSearching(true);
    try {
      const found = await findCustomerByPhone(companyId, phone.trim());
      setCustomer(found);
      setCustomerExpanded(false);
    } catch {
      Alert.alert("Not found", "No customer matches that phone number.");
      setCustomer(null);
    } finally {
      setSearching(false);
    }
  };

  const addItem = async (item: FoodMenuItem) => {
    if (!order) return;
    try {
      await addOrderItem(numericOrderId, companyId, {
        food_menu_id: item.food_menu_id,
        item_name: item.name,
        item_code: item.code,
        category_id: item.category_id,
        category_name: "",
        unit_price: item.sale_price,
        quantity: 1,
        is_veg: item.is_veg,
        modifiers: [],
      });
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't add item", e.message);
    }
  };

  const changeQuantity = async (orderItemId: number, quantity: number) => {
    if (!order) return;
    try {
      await setOrderItemQuantity(numericOrderId, orderItemId, quantity);
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't update quantity", e.message);
    }
  };

  const editNotes = (orderItemId: number, currentNotes: string | null) => {
    setNoteEditor({ orderItemId, text: currentNotes ?? "" });
  };

  const saveNote = async () => {
    if (!noteEditor) return;
    setSavingNote(true);
    try {
      await setOrderItemNotes(numericOrderId, noteEditor.orderItemId, noteEditor.text);
      setNoteEditor(null);
      await load();
    } catch (e: any) {
      Alert.alert("Couldn't save note", e.message);
    } finally {
      setSavingNote(false);
    }
  };

  const sendToKot = async () => {
    if (!order || !session) return;
    const pendingIds = (order.items ?? [])
      .filter((i) => i.kot_item_status === "draft" || i.kot_id === null)
      .map((i) => i.order_item_id);
    if (pendingIds.length === 0) {
      Alert.alert("Nothing to send", "All items are already in the kitchen.");
      return;
    }
    try {
      await sendKot({
        order_id: numericOrderId,
        company_unique_id: companyId,
        item_ids: pendingIds,
        created_by: session.user_id,
      });
      Alert.alert("Sent", "KOT sent to kitchen.");
      load();
    } catch (e: any) {
      Alert.alert("KOT failed", e.message);
    }
  };

  const handleCancel = () => {
    Alert.alert("Cancel order", "Are you sure you want to cancel this order?", [
      { text: "No", style: "cancel" },
      {
        text: "Yes, cancel",
        style: "destructive",
        onPress: async () => {
          setActionBusy(true);
          try {
            await cancelOrder(numericOrderId);
            router.replace("/(tabs)/tables");
          } catch (e: any) {
            Alert.alert("Couldn't cancel", e.message);
          } finally {
            setActionBusy(false);
          }
        },
      },
    ]);
  };

  const handleHold = async () => {
    setActionBusy(true);
    try {
      await holdOrder(numericOrderId, true);
      router.replace("/(tabs)/tables");
    } catch (e: any) {
      Alert.alert("Couldn't hold order", e.message);
    } finally {
      setActionBusy(false);
    }
  };

  const sgstRate = session?.company_settings?.sgst ?? 2.5;
  const cgstRate = session?.company_settings?.cgst ?? 2.5;
  const subtotal = Number(order?.subtotal ?? 0);
  const surcharge = Number(
    order?.table_surcharge_amount ?? tableSurcharge?.amount ?? surchargeAmount ?? 0
  );
  const surchargeLabelText =
    order?.table_surcharge_label || tableSurcharge?.label || surchargeLabel || "Table Surcharge";
  const discountNum = Number(discount) || 0;
  const taxableAmount = Math.max(subtotal + surcharge - discountNum, 0);
  const sgstAmount = (taxableAmount * sgstRate) / 100;
  const cgstAmount = (taxableAmount * cgstRate) / 100;
  const totalPayable = taxableAmount + sgstAmount + cgstAmount;

  if (loading || !order) {
    return (
      <SafeAreaView style={styles.center} edges={["top", "left", "right"]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  const activeItems = (order.items ?? []).filter((i) => !i.is_cancelled);
  const isPending = order.order_status === "kot_open" && !order.billed_at;
  const itemStatuses = activeItems.map((i) => classifyKotStatus(i.kot_item_status));
  const cookingCount = itemStatuses.filter((s) => s === "cooking").length;
  const readyCount = itemStatuses.filter((s) => s === "ready").length;
  const pendingCount = itemStatuses.filter((s) => s === "pending").length;
  const allReady = isPending && activeItems.length > 0 && readyCount === activeItems.length;
  // Three visual states for the banner. Priority matters here: if even one
  // item hasn't started yet (still "pending"), the banner must stay amber —
  // that's what the customer is actually still waiting on — even if other
  // items from the same order are already cooking or fully ready (e.g. an
  // item added later, after the first round was already served). Only once
  // NOTHING is pending anymore does it make sense to show "cooking", and
  // only once everything is ready does it turn green.
  const kitchenState: "pending" | "cooking" | "ready" = allReady
    ? "ready"
    : pendingCount > 0
    ? "pending"
    : cookingCount > 0
    ? "cooking"
    : "pending";
  const minutesAgo = Math.max(
    0,
    Math.round((Date.now() - new Date(order.order_placed_at).getTime()) / 60000)
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={10}>
          <Ionicons name="chevron-back" size={20} color={colors.primary} />
          <Text style={styles.back}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.orderNumber}>Order {order.order_number}</Text>
        <View style={{ width: 60 }} />
      </View>

      {isPending && (
        <View
          style={[
            styles.pendingBanner,
            kitchenState === "cooking" && styles.pendingBannerCooking,
            kitchenState === "ready" && styles.pendingBannerReady,
          ]}
        >
          <View
            style={[
              styles.pendingIconWrap,
              kitchenState === "cooking" && styles.pendingIconWrapCooking,
              kitchenState === "ready" && styles.pendingIconWrapReady,
            ]}
          >
            <Ionicons
              name={kitchenState === "ready" ? "checkmark" : "flame"}
              size={22}
              color="#fff"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pendingTitle}>
              {kitchenState === "ready"
                ? "Ready to serve"
                : kitchenState === "cooking"
                ? "Cooking in Kitchen"
                : "Preparing in Kitchen"}
            </Text>
            <Text style={styles.pendingSubtitle}>
              {kitchenState === "ready"
                ? `All ${activeItems.length} item${activeItems.length === 1 ? "" : "s"} ready`
                : [
                    pendingCount > 0 ? `${pendingCount} pending` : null,
                    cookingCount > 0 ? `${cookingCount} cooking` : null,
                    readyCount > 0 ? `${readyCount} ready` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || `sent ${minutesAgo === 0 ? "just now" : `${minutesAgo} min ago`}`}
            </Text>
            {lastSyncedAt && (
              <Text style={styles.syncLabel}>
                ● live · synced {Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago
              </Text>
            )}
          </View>
          <View
            style={[
              styles.pendingDot,
              kitchenState === "cooking" && styles.pendingDotCooking,
              kitchenState === "ready" && styles.pendingDotReady,
            ]}
          />
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.customerRow}>
          <TextInput
            style={styles.phoneInput}
            placeholder="Search customer phone"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TouchableOpacity style={styles.searchButton} onPress={searchCustomer} disabled={searching}>
            {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchButtonText}>Search</Text>}
          </TouchableOpacity>
        </View>
        {customer && (
          <TouchableOpacity
            style={styles.customerCard}
            onPress={() => setCustomerExpanded((v) => !v)}
            activeOpacity={0.8}
          >
            <View style={styles.customerCollapsedRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.customerName}>{customer.name}</Text>
                {!customerExpanded && Number(customer.due_amount) > 0 && (
                  <Text style={styles.dueTextInline}>Due: ₹{customer.due_amount}</Text>
                )}
              </View>
              <Ionicons
                name={customerExpanded ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.textMuted}
              />
            </View>
            {customerExpanded && (
              <>
                <Text style={styles.customerMeta}>
                  {customer.total_visits} visits · ₹{customer.total_spend} lifetime
                </Text>
                {Number(customer.due_amount) > 0 && (
                  <Text style={styles.dueText}>Due: ₹{customer.due_amount}</Text>
                )}
              </>
            )}
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.sectionHeaderRow}
          onPress={() => setMenuExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionTitle}>Browse Menu</Text>
          <Ionicons
            name={menuExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {menuExpanded && (
          <>
            <View style={styles.itemSearchRow}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                style={styles.itemSearchInput}
                placeholder="Search menu items..."
                value={itemSearch}
                onChangeText={setItemSearch}
              />
              {itemSearch.length > 0 && (
                <TouchableOpacity onPress={() => setItemSearch("")}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.chip, activeCategory === "all" && styles.chipActive]}
                onPress={() => setActiveCategory("all")}
              >
                <Text style={[styles.chipText, activeCategory === "all" && styles.chipTextActive]}>All</Text>
              </TouchableOpacity>
              {categories.map((c) => (
                <TouchableOpacity
                  key={c.food_category_id}
                  style={[styles.chip, activeCategory === c.food_category_id && styles.chipActive]}
                  onPress={() => setActiveCategory(c.food_category_id)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      activeCategory === c.food_category_id && styles.chipTextActive,
                    ]}
                  >
                    {c.category_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 8, paddingHorizontal: 2 }}
            >
              {filteredMenu.map((item) => (
                <TouchableOpacity
                  key={item.food_menu_id}
                  style={[styles.menuCard, !item.is_available && styles.menuCardDisabled]}
                  activeOpacity={0.7}
                  onPress={() => item.is_available && addItem(item)}
                  disabled={!item.is_available}
                >
                  <View style={styles.menuImageWrap}>
                    <Image source={{ uri: item.image_url }} style={styles.menuImage} />
                    <View style={[styles.vegBadge, { borderColor: item.is_veg ? colors.veg : colors.nonVeg }]}>
                      <View style={[styles.vegBadgeDot, { backgroundColor: item.is_veg ? colors.veg : colors.nonVeg }]} />
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.menuName}>
                    {item.name}
                  </Text>
                  <View style={styles.menuFooterRow}>
                    <Text style={styles.menuPrice}>₹{item.sale_price}</Text>
                    <View style={[styles.addButton, !item.is_available && styles.addButtonDisabled]}>
                      <Text style={styles.addButtonText}>{item.is_available ? "+ Add" : "N/A"}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        <TouchableOpacity
          style={styles.sectionHeaderRow}
          onPress={() => setItemsExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.sectionTitle}>
            Order Items {activeItems.length ? `(${activeItems.length})` : ""}
          </Text>
          <Ionicons
            name={itemsExpanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {itemsExpanded &&
          (activeItems.length === 0 ? (
            <Text style={styles.emptyText}>No items yet — tap a menu item above.</Text>
          ) : (
            activeItems.map((item) => (
              <View key={item.order_item_id} style={styles.itemCardCompact}>
                <View
                  style={[styles.vegDot, { backgroundColor: item.is_veg ? colors.veg : colors.nonVeg }]}
                />
                {menuImageByFoodId.get(item.food_menu_id) && (
                  <Image
                    source={{ uri: menuImageByFoodId.get(item.food_menu_id) }}
                    style={styles.itemThumb}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.item_name}
                  </Text>
                  <Text style={styles.itemUnitPrice}>₹{item.unit_price} each</Text>
                  <TouchableOpacity onPress={() => editNotes(item.order_item_id, item.notes)}>
                    <Text style={styles.itemNoteCompact} numberOfLines={1}>
                      {item.notes ? `📝 ${item.notes}` : "Add note ✎"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.qtyStepper}>
                  <TouchableOpacity
                    style={styles.qtyButtonWrap}
                    onPress={() => changeQuantity(item.order_item_id, item.quantity - 1)}
                  >
                    <Text style={styles.qtyButton}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.qtyValue}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={styles.qtyButtonWrap}
                    onPress={() => changeQuantity(item.order_item_id, item.quantity + 1)}
                  >
                    <Text style={styles.qtyButton}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.itemTotalCompact}>₹{item.total_price}</Text>
                <TouchableOpacity
                  style={styles.trashButton}
                  onPress={() => changeQuantity(item.order_item_id, 0)}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.breakdownToggleRow}
          onPress={() => setBreakdownExpanded((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.footerLabel}>
            {breakdownExpanded ? "Bill Breakdown" : `Subtotal (${activeItems.length} items) · Discount ₹${discountNum}`}
          </Text>
          <Ionicons
            name={breakdownExpanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.textMuted}
          />
        </TouchableOpacity>

        {breakdownExpanded && (
          <>
            <View style={styles.footerRow}>
              <Text style={styles.footerLabel}>Subtotal ({activeItems.length} items)</Text>
              <Text style={styles.footerValue}>₹{subtotal.toFixed(2)}</Text>
            </View>
            {surcharge > 0 && (
              <View style={styles.footerRow}>
                <Text style={styles.footerLabelSurcharge}>⚡ {surchargeLabelText}</Text>
                <Text style={styles.footerValueSurcharge}>+₹{surcharge.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.footerRow}>
              <Text style={styles.footerLabel}>Discount (₹)</Text>
              <TextInput
                style={styles.discountInput}
                keyboardType="numeric"
                value={discount}
                onChangeText={setDiscount}
              />
            </View>
            <View style={styles.footerRow}>
              <Text style={styles.footerLabelTax}>SGST ({sgstRate}%)</Text>
              <Text style={styles.footerValueTax}>+₹{sgstAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.footerRow}>
              <Text style={styles.footerLabelTax}>CGST ({cgstRate}%)</Text>
              <Text style={styles.footerValueTax}>+₹{cgstAmount.toFixed(2)}</Text>
            </View>
            <View style={styles.divider} />
          </>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.totalLabel}>Total Payable</Text>
          <Text style={styles.totalValue}>₹{totalPayable.toFixed(2)}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel} disabled={actionBusy}>
            <Text style={styles.cancelButtonText}>✕ Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.holdButton} onPress={handleHold} disabled={actionBusy}>
            <Text style={styles.holdButtonText}>⏸ Hold</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.billButton}
          onPress={() => setBillModalOpen(true)}
        >
          <Text style={styles.billButtonText}>Generate Bill · ₹{totalPayable.toFixed(2)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.kotButton} onPress={sendToKot}>
          <Text style={styles.kotButtonText}>Send to Kitchen (KOT)</Text>
        </TouchableOpacity>
      </View>

      <GenerateBillModal
        visible={billModalOpen}
        onClose={() => setBillModalOpen(false)}
        order={order}
        customer={customer}
        createdBy={session?.user_id ?? 0}
        initialDiscount={discount}
        sgstRate={sgstRate}
        cgstRate={cgstRate}
        surchargeOverride={surcharge}
        surchargeLabelOverride={surchargeLabelText}
        onSettled={() => {
          setBillModalOpen(false);
          router.replace("/(tabs)/tables");
        }}
      />

      <Modal
        visible={!!noteEditor}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteEditor(null)}
      >
        <View style={styles.noteBackdrop}>
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Item note</Text>
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. less spicy, no onion"
              placeholderTextColor={colors.textMuted}
              value={noteEditor?.text ?? ""}
              onChangeText={(text) =>
                setNoteEditor((cur) => (cur ? { ...cur, text } : cur))
              }
              multiline
              autoFocus
            />
            <View style={styles.noteButtonRow}>
              <TouchableOpacity
                style={styles.noteCancelButton}
                onPress={() => setNoteEditor(null)}
                disabled={savingNote}
              >
                <Text style={styles.noteCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.noteSaveButton}
                onPress={saveNote}
                disabled={savingNote}
              >
                {savingNote ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.noteSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  backButton: { flexDirection: "row", alignItems: "center", width: 70 },
  back: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  orderNumber: { fontSize: 16, fontWeight: "700", color: colors.text },
  pendingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF4E5",
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  pendingIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  pendingSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  syncLabel: { fontSize: 10, color: colors.textMuted, marginTop: 3, opacity: 0.7 },
  pendingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.warning },
  pendingBannerCooking: { backgroundColor: "#E9F1FE", borderColor: "#3B82F6" },
  pendingIconWrapCooking: { backgroundColor: "#3B82F6" },
  pendingDotCooking: { backgroundColor: "#3B82F6" },
  pendingBannerReady: { backgroundColor: colors.tableFree, borderColor: colors.primary },
  pendingIconWrapReady: { backgroundColor: colors.primary },
  pendingDotReady: { backgroundColor: colors.primary },
  customerRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  phoneInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  searchButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  searchButtonText: { color: "#fff", fontWeight: "600" },
  customerCollapsedRow: { flexDirection: "row", alignItems: "center" },
  dueTextInline: { fontSize: 11, color: colors.danger, fontWeight: "600", marginTop: 1 },
  customerCard: { backgroundColor: colors.tableFree, borderRadius: 8, padding: 10, marginBottom: 10 },
  customerName: { fontWeight: "700", color: colors.text },
  customerMeta: { fontSize: 12, color: colors.textMuted },
  dueText: { fontSize: 12, color: colors.danger, fontWeight: "600", marginTop: 2 },
  itemSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    backgroundColor: "#fff",
  },
  itemSearchInput: { flex: 1, fontSize: 14, color: colors.text },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingVertical: 6,
  },
  itemUnitPrice: { fontSize: 11, color: colors.textMuted },
  qtyStepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  trashButton: { padding: 6 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted },
  chipTextActive: { color: "#fff" },
  menuCard: {
    width: 132,
    borderRadius: 16,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    paddingBottom: 10,
    overflow: "hidden",
  },
  menuCardDisabled: { opacity: 0.5 },
  menuImageWrap: { position: "relative" },
  menuImage: { width: "100%", height: 88, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  vegBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  vegBadgeDot: { width: 8, height: 8, borderRadius: 4 },
  menuName: { fontSize: 12, fontWeight: "700", color: colors.text, marginTop: 8, marginHorizontal: 8 },
  menuFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginHorizontal: 8,
  },
  menuPrice: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addButtonDisabled: { backgroundColor: colors.border },
  addButtonText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  itemCardCompact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  itemThumb: { width: 40, height: 40, borderRadius: 8 },
  vegDot: { width: 8, height: 8, borderRadius: 4 },
  itemName: { fontSize: 13, fontWeight: "700", color: colors.text },
  itemNoteCompact: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  qtyButtonWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButton: { fontSize: 14, color: colors.primary, fontWeight: "700", lineHeight: 16 },
  qtyValue: { fontSize: 13, fontWeight: "700", minWidth: 18, textAlign: "center" },
  itemTotalCompact: { fontSize: 13, fontWeight: "700", color: colors.text, minWidth: 50, textAlign: "right" },
  emptyText: { textAlign: "center", color: colors.textMuted, marginTop: 16, marginBottom: 8 },
  footer: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  breakdownToggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  footerLabel: { color: colors.textMuted },
  footerValue: { fontWeight: "700", color: colors.text },
  footerLabelTax: { color: colors.primaryDark, fontSize: 13 },
  footerValueTax: { color: colors.primaryDark, fontSize: 13, fontWeight: "600" },
  footerLabelSurcharge: { color: colors.warning, fontSize: 13, fontWeight: "600" },
  footerValueSurcharge: { color: colors.warning, fontSize: 13, fontWeight: "700" },
  discountInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 80,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
  totalLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  totalValue: { fontSize: 18, fontWeight: "700", color: colors.primaryDark },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 4, marginBottom: 8 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: colors.danger, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  cancelButtonText: { color: colors.danger, fontWeight: "700" },
  holdButton: { flex: 1, borderWidth: 1, borderColor: colors.warning, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  holdButtonText: { color: colors.warning, fontWeight: "700" },
  kotButton: { borderWidth: 1, borderColor: colors.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginBottom: 8 },
  kotButtonText: { color: colors.primaryDark, fontWeight: "700" },
  billButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  billButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  noteBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  noteCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
  },
  noteTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: "top",
  },
  noteButtonRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  noteCancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  noteCancelText: { color: colors.textMuted, fontWeight: "600" },
  noteSaveButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  noteSaveText: { color: "#fff", fontWeight: "700" },
});
