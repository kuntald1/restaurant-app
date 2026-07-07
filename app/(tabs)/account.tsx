// app/(tabs)/account.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";

// Menu items from /users/login use web routes (e.g. "/dine-in"). Map the
// ones we've built mobile screens for; anything else shows a "coming soon"
// toast instead of a dead link.
const ROUTE_MAP: Record<string, string> = {
  "/dine-in": "/(tabs)/tables",
  "/bill-settlement": "/(tabs)/settlement",
};

const MENU_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  "/dine-in": "restaurant-outline",
  "/bill-settlement": "receipt-outline",
};

export default function AccountScreen() {
  const { session, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert("Log out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const openMenu = (menuurl: string) => {
    const target = ROUTE_MAP[menuurl];
    if (target) {
      router.push(target as any);
    } else {
      Alert.alert("Coming soon", "This section isn't in the mobile app yet.");
    }
  };

  if (!session) return null;

  return (
    <View style={styles.container}>
      <View style={styles.companyCard}>
        <Text style={styles.companyName}>{session.company_settings.merchant_name}</Text>
        <Text style={styles.companySub}>Management Suite</Text>
      </View>

      <Text style={styles.sectionLabel}>Menu</Text>
      <FlatList
        data={session.menus.filter((m) => m.is_active)}
        keyExtractor={(item) => String(item.menu_id)}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.menuCard} onPress={() => openMenu(item.menuurl)}>
            <View style={styles.menuIconWrap}>
              <Ionicons
                name={MENU_ICON[item.menuurl] ?? "apps-outline"}
                size={20}
                color={colors.primaryDark}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.menuName}>{item.menuname}</Text>
              <Text style={styles.menuDesc}>{item.menudesc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{session.first_name?.[0]?.toUpperCase() ?? "?"}</Text>
          </View>
          <View>
            <Text style={styles.userName}>{session.first_name} {session.last_name}</Text>
            <Text style={styles.userRole}>{session.is_admin ? "Admin" : "Staff"}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="power" size={20} color={colors.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  companyCard: { marginBottom: 20 },
  companyName: { fontSize: 20, fontWeight: "700", color: colors.text },
  companySub: { fontSize: 12, color: colors.primaryDark, fontWeight: "600", marginTop: 2 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.textMuted, marginBottom: 8 },
  menuCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.tableFree,
    alignItems: "center",
    justifyContent: "center",
  },
  menuName: { fontSize: 15, fontWeight: "700", color: colors.text },
  menuDesc: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 16,
    marginTop: 16,
  },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.tableFree,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "700", color: colors.primaryDark },
  userName: { fontSize: 14, fontWeight: "700", color: colors.text },
  userRole: { fontSize: 12, color: colors.textMuted },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
});
