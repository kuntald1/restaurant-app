// src/api/types.ts
// Mirrors currycloud.mooo.com response shapes exactly — keep in sync with backend.

export type OrderType = "dine_in" | "take_away" | "delivery";
export type OrderStatus = "draft" | "kot_open" | "billed" | "cancelled";
export type TableStatus = "free" | "occupied" | "reserved";
export type PaymentMethod = "cash" | "upi" | "merchant" | "credit";
// The backend's actual /pos/bill enum — "merchant" above is only a UI
// grouping (Razorpay via UPI or Card); it must be translated to one of
// these before hitting the API.
export type ApiPaymentMethod = "cash" | "upi" | "card" | "split" | "complimentary" | "credit";
export type Role = "waiter" | "manager" | "staff";

export interface MenuItem {
  userrolemapping_id: number;
  userrole_id: number;
  menu_id: number;
  company_unique_id: number;
  is_active: boolean;
  menuname: string;
  menudesc: string;
  menuurl: string;
  menuicon: string;
  parentmenuid: number | null;
}

export interface CompanySettings {
  is_merchant_enabled: boolean;
  merchant_name: string;
  razorpay_key_id: string | null;
  is_sms_enabled: boolean;
  whatsapp_enabled: boolean;
  is_upi_enabled: boolean;
  sgst: number;
  cgst: number;
  upi_id: string | null;
  upi_name: string | null;
  upi_qr_image_url: string | null;
}

export interface UserSession {
  user_id: number;
  username: string;
  first_name: string;
  last_name: string;
  role_id: number;
  is_admin: boolean;
  is_super_admin: boolean;
  company_unique_id: number;
  menus: MenuItem[];
  company_settings: CompanySettings;
}

export interface Table {
  table_id: number;
  company_unique_id: number;
  table_name: string;
  seats: number;
  table_status: TableStatus;
  floor: string;
  section: string;
  is_active: boolean;
  active_order_count: number;
  occupied_seats: number;
  section_type: "ac" | "non_ac";
  surcharge_type: "flat" | "percent" | null;
  surcharge_amount: string;
  surcharge_label: string | null;
  created_at: string;
  updated_at: string;
}

export interface FoodCategory {
  food_category_id: number;
  category_code: string;
  company_unique_id: number;
  category_name: string;
  icon_url: string;
  is_active: boolean;
  display_order: number;
  color_code: string;
}

export interface FoodMenuItem {
  food_menu_id: number;
  company_unique_id: number;
  category_id: number;
  name: string;
  code: string;
  image_url: string;
  IsActive: boolean;
  description: string;
  sale_price: number;
  display_order: number;
  is_available: boolean;
  is_veg: boolean;
}

export interface OrderItem {
  order_item_id: number;
  order_id: number;
  food_menu_id: number;
  item_name: string;
  item_code: string;
  category_name: string;
  unit_price: string | number;
  quantity: number;
  total_price: number;
  kot_item_status: string;
  kot_id: number | null;
  is_veg: boolean;
  notes: string | null;
  is_cancelled: boolean;
}

export interface Order {
  order_id: number;
  order_number: string;
  company_unique_id: number;
  order_type: OrderType;
  order_status: OrderStatus;
  table_id: number | null;
  table_name: string | null;
  covers: number;
  customer_name: string | null;
  customer_phone: string | null;
  delivery_address: string | null;
  subtotal: string | number;
  discount_amount: string | number;
  service_charge: string | number;
  tax_amount: string | number;
  total_payable: string | number;
  promo_code: string | null;
  promo_amount: string | number;
  customer_id: number | null;
  is_hold: boolean;
  notes: string | null;
  order_placed_at: string;
  billed_at: string | null;
  items: OrderItem[];
  table_surcharge_amount?: string | number;
  table_surcharge_label?: string | null;
}

export interface Customer {
  customer_id: number;
  company_unique_id: number;
  name: string;
  phone: string;
  email: string | null;
  date_of_birth: string | null;
  anniversary_date: string | null;
  address: string | null;
  notes: string | null;
  total_visits: number;
  total_spend: string;
  loyalty_points: number;
  due_amount: string;
  is_active: boolean;
  created_at: string;
}

export interface KotItem {
  kot_item_id: number;
  kot_id: number;
  order_item_id: number;
  item_name: string;
  quantity: number;
  is_veg: boolean;
  notes: string | null;
  kot_item_status: string;
  started_at: string | null;
  ready_at: string | null;
}

export interface Kot {
  kot_id: number;
  kot_number: string;
  order_id: number;
  company_unique_id: number;
  kot_status: string;
  table_name: string | null;
  sent_to_kitchen_at: string;
  kitchen_started_at: string | null;
  ready_at: string | null;
  print_count: number;
  last_printed_at: string;
  notes: string | null;
  kot_items: KotItem[];
}

export interface PromoValidation {
  valid: boolean;
  promo_id: number;
  code: string;
  discount_type: "flat" | "percent";
  discount_value: string;
  discount_amount: string;
  description: string;
}

export interface Bill {
  bill_id: number;
  bill_number: string;
  order_id: number;
  company_unique_id: number;
  subtotal: string | number;
  discount_amount: string | number;
  service_charge: string | number;
  tax_amount: string | number;
  sgst_amount: string | number;
  cgst_amount: string | number;
  total_payable: string | number;
  amount_paid: string | number;
  payment_method: ApiPaymentMethod;
  payment_reference: string | null;
  promo_code: string | null;
  promo_amount: string | number;
  customer_id: number | null;
  is_paid: boolean;
  paid_at: string;
  order_type: OrderType;
  table_name: string | null;
  customer_name: string | null;
  item_count: number;
  print_count: number;
  created_at: string;
  order?: Order;
}

export interface CreateBillPayload {
  order_id: number;
  company_unique_id: number;
  payment_method: ApiPaymentMethod;
  amount_paid: number;
  discount_amount: number;
  service_charge: number;
  promo_code: string | null;
  promo_amount: number;
  sgst_amount: number;
  cgst_amount: number;
  customer_id: number | null;
  created_by: number;
  payment_reference?: string;
}

export interface AddItemPayload {
  food_menu_id: number;
  item_name: string;
  item_code: string;
  category_id?: number;
  category_name: string;
  unit_price: number;
  quantity: number;
  is_veg: boolean;
  modifiers?: unknown[];
  notes?: string | null;
}
