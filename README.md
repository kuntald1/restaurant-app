# CurryCloud Mobile — v1 scaffold

Expo SDK 56 + expo-router, matching your MediCloud RN app conventions
(`expo-router` only, never `@react-navigation/native` directly).

## Structure

```
app/
  _layout.tsx              root stack, auth-gated
  (auth)/login.tsx         staff login — see TODO inside, endpoint not documented yet
  (tabs)/_layout.tsx       bottom tabs, Settlement hidden for non-managers
  (tabs)/tables.tsx        New Order flow — order type + table grid
  (tabs)/running-orders.tsx
  (tabs)/kitchen.tsx       derived from running orders — see TODO inside
  (tabs)/settlement.tsx    manager-only, remove items + re-settle
  order/[orderId].tsx      the core POS screen: CRM search, menu, KOT, bill
src/
  api/client.ts            fetch wrapper -> https://currycloud.mooo.com
  api/endpoints.ts         one function per endpoint you shared
  api/types.ts             response shapes, kept 1:1 with your JSON
  context/AuthContext.tsx  session + role, persisted via AsyncStorage
  components/GenerateBillModal.tsx
  theme/colors.ts          matches your web app's table/status colors
```

## What's wired end-to-end
- Table grid → create order → POS screen → add items → Send to KOT →
  Generate Bill (cash/UPI/merchant/credit) → credit ledger log.
- CRM phone search + due-balance display.
- Promo code validation and application.
- Item quantity adjust (qty 0 removes, matches your `/quantity?quantity=0` pattern).
- Item notes.
- Running orders list.
- Settlement: remove items + re-settle (add-items UI is stubbed — the picker
  needs a menu dropdown, same data source as the order screen's menu grid).

## Known gaps — need your input before these are production-ready
1. **Auth endpoint** — you didn't share a login/staff-auth call in the log.
   `(auth)/login.tsx` stubs `POST /auth/login` returning `{user_id, name,
   role, company_unique_id}`. Point me at the real one and I'll wire it.
2. **Kitchen Display** — no "list all open KOTs" endpoint was in the log,
   so `kitchen.tsx` derives it from `/pos/orders/running/{id}`. Fine for
   now; a dedicated `GET /pos/kot/company/{id}?status=kot_open` would be
   more efficient once order volume grows.
3. **Settlement "Add items"** — removal is fully wired; add-item picker UI
   isn't built yet (same `settleBill` call supports it, payload just needs
   populated `adds[]`).
4. **KOT printing** — `printKot` exists in `endpoints.ts` but isn't hooked
   into any screen yet (no thermal-printer bridge in RN by default — same
   consideration you had for MediCloud's PDF sharing, may need
   `expo-print` or a Bluetooth ESC/POS library depending on your printers).

## Install
```
npm install
npx expo start
```
