// app/order/new-delivery.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { createOrder, findCustomerByPhone } from "../../src/api/endpoints";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";
import { Customer } from "../../src/api/types";

export default function NewDeliveryOrderScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const companyId = session?.company_unique_id ?? 1;

  const searchCustomer = async () => {
    if (!phone.trim()) return;
    setSearching(true);
    try {
      const found = await findCustomerByPhone(companyId, phone.trim());
      setCustomer(found);
      setName(found.name);
    } catch {
      setCustomer(null);
      Alert.alert("New customer", "No match found — enter their name and address below.");
    } finally {
      setSearching(false);
    }
  };

  const startOrder = async () => {
    if (!session) return;
    if (!phone.trim() || !address.trim()) {
      Alert.alert("Missing info", "Phone number and delivery address are required.");
      return;
    }
    setCreating(true);
    try {
      const order = await createOrder({
        company_unique_id: companyId,
        order_type: "delivery",
        covers: 1,
        created_by: session.user_id,
        customer_id: customer?.customer_id ?? null,
        customer_name: name.trim() || undefined,
        customer_phone: phone.trim(),
        delivery_address: address.trim(),
      });
      router.replace(`/order/${order.order_id}`);
    } catch (e: any) {
      Alert.alert("Couldn't start order", e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Delivery Order</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.label}>Customer Phone</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="10-digit phone number"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
        <TouchableOpacity style={styles.searchButton} onPress={searchCustomer} disabled={searching}>
          {searching ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.searchButtonText}>Search</Text>}
        </TouchableOpacity>
      </View>

      {customer && (
        <View style={styles.customerCard}>
          <Text style={styles.customerName}>{customer.name}</Text>
          <Text style={styles.customerMeta}>
            {customer.total_visits} visits · ₹{customer.total_spend} lifetime
          </Text>
        </View>
      )}

      <Text style={styles.label}>Customer Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Full name"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Delivery Address</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="House/flat no., street, area, landmark"
        multiline
        numberOfLines={4}
        value={address}
        onChangeText={setAddress}
      />

      <TouchableOpacity style={styles.startButton} onPress={startOrder} disabled={creating}>
        {creating ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.startButtonText}>Start Delivery Order</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  back: { color: colors.primary, fontSize: 16, fontWeight: "600" },
  title: { fontSize: 16, fontWeight: "700", color: colors.text },
  label: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 12 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  searchButton: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 18, justifyContent: "center" },
  searchButtonText: { color: "#fff", fontWeight: "600" },
  customerCard: { backgroundColor: colors.tableFree, borderRadius: 8, padding: 10, marginTop: 8 },
  customerName: { fontWeight: "700", color: colors.text },
  customerMeta: { fontSize: 12, color: colors.textMuted },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 28,
  },
  startButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
