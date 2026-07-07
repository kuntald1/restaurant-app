// src/api/endpoints.ts
// One function per documented endpoint. Keep names close to the REST path so
// they're easy to grep against the web app's network tab.
import { api } from "./client";
import {
  AddItemPayload,
  Bill,
  CompanySettings,
  CreateBillPayload,
  Customer,
  FoodCategory,
  FoodMenuItem,
  Kot,
  MenuItem,
  Order,
  PromoValidation,
  Table,
} from "./types";

// ---- Auth ----
export interface LoginResponse {
  message: string;
  user_details: {
    company_unique_id: number;
    user_id: number;
    username: string;
    first_name: string;
    last_name: string;
    role_id: number;
    is_admin: boolean;
    is_super_admin: boolean;
    is_active: boolean;
  };
  menus: MenuItem[];
  company_settings: CompanySettings;
}

// `password` must already be AES-encrypted (CryptoJS) the same way the web
// app does it before calling this — see loginRequestPassword() in client.ts's
// caller (login screen) for where that happens.
export const loginUser = (username: string, encryptedPassword: string) =>
  api.post<LoginResponse>(`/users/login`, { username, password: encryptedPassword });

// ---- Tables ----
export const getTables = (companyId: number) =>
  api.get<Table[]>(`/pos/tables/${companyId}`);

// ---- Menu ----
export const getFoodMenu = (companyId: number) =>
  api.get<FoodMenuItem[]>(`/company/getallfoodmenu/${companyId}`);

export const getFoodCategories = (companyId: number) =>
  api.get<FoodCategory[]>(`/company/getallfoodcategory/${companyId}`);

// ---- Orders ----
export const createOrder = (payload: {
  company_unique_id: number;
  order_type: "dine_in" | "take_away" | "delivery";
  covers: number;
  created_by: number;
  table_id?: number;
  customer_id?: number | null;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string;
}) => api.post<Order>(`/pos/orders`, payload);

export const getOrder = (orderId: number) =>
  api.get<Order>(`/pos/orders/${orderId}`);

export const getRunningOrders = (companyId: number) =>
  api.get<Order[]>(`/pos/orders/running/${companyId}`);

export const addOrderItem = (
  orderId: number,
  companyId: number,
  item: AddItemPayload
) => api.post<Order>(`/pos/orders/${orderId}/items?company_id=${companyId}`, item);

export const setOrderItemQuantity = (
  orderId: number,
  orderItemId: number,
  quantity: number
) =>
  api.patch<Order>(
    `/pos/orders/${orderId}/items/${orderItemId}/quantity?quantity=${quantity}`
  );

export const setOrderItemNotes = (
  orderId: number,
  orderItemId: number,
  notes: string
) =>
  api.patch<{ order_item_id: number; notes: string; message: string }>(
    `/pos/orders/${orderId}/items/${orderItemId}/notes?notes=${encodeURIComponent(
      notes
    )}`
  );

export const holdOrder = (orderId: number, hold: boolean) =>
  api.patch<Order>(`/pos/orders/${orderId}/hold?hold=${hold}`);

export const cancelOrder = (orderId: number) =>
  api.patch<Order>(`/pos/orders/${orderId}/cancel`);

// ---- KOT ----
export const sendKot = (payload: {
  order_id: number;
  company_unique_id: number;
  item_ids: number[];
  created_by: number;
}) => api.post<Kot>(`/pos/kot`, payload);

export const printKot = (kotId: number) =>
  api.patch<Kot>(`/pos/kot/${kotId}/print`);

// ---- CRM ----
export const findCustomerByPhone = (companyId: number, phone: string) =>
  api.get<Customer>(`/crm/customer/phone/${companyId}/${phone}`);

export const validatePromo = (
  companyId: number,
  code: string,
  billAmount: number
) =>
  api.post<PromoValidation>(
    `/crm/promos/validate?company_id=${companyId}&code=${encodeURIComponent(
      code
    )}&bill_amount=${billAmount.toFixed(2)}`
  );

export const logCreditSale = (payload: {
  customer_id: number;
  order_id: number;
  order_number: string;
  bill_id: number;
  bill_number: string;
  amount: number;
  payment_status: "credit";
  notes: string;
}) =>
  api.post<{ log_id: number; due_amount: string }>(
    `/crm/customers/${payload.customer_id}/credit-log`,
    payload
  );

// ---- Billing ----
export const generateBill = (payload: CreateBillPayload) =>
  api.post<Bill>(`/pos/bill`, payload);

export const getBill = (billId: number) => api.get<Bill>(`/pos/bill/${billId}`);

export const getBillsForCompany = (
  companyId: number,
  fromDate: string,
  toDate: string
) =>
  api.get<Bill[]>(
    `/pos/bill/company/${companyId}?from_date=${fromDate}&to_date=${toDate}`
  );

// ---- CRM: WhatsApp & Payment Links ----
export const sendWhatsappBill = (payload: {
  company_id: number;
  to_phone: string;
  message: string;
  order_id: number;
  order_number: string;
  bill_number: string;
  message_type: "bill" | "payment_link";
  sent_by: number;
}) => api.post<{ success: boolean; sid: string; status: string }>(`/crm/whatsapp/send`, payload);

export const createPaymentLink = (payload: {
  company_id: number;
  amount: number;
  customer_name: string;
  customer_phone: string;
  order_number: string;
  description: string;
}) =>
  api.post<{ payment_link_id: string; short_url: string; status: string }>(
    `/crm/payment-link/create`,
    payload
  );

export const getPaymentLinkStatus = (paymentLinkId: string, companyId: number) =>
  api.get<{ payment_link_id: string; status: string; amount_paid: number; payments: unknown[] }>(
    `/crm/payment-link/${paymentLinkId}/status?company_id=${companyId}`
  );

// ---- Company directory (for bill-header details: address, phone, GSTIN) ----
export interface CompanyInfo {
  company_unique_id: number;
  name: string;
  address1: string;
  address2: string;
  admin_phone: string;
  gstin: string | null;
  fssai: string | null;
}

export const getCompanies = () => api.get<CompanyInfo[]>(`/company/`);
export const getActiveQr = (companyId: number) =>
  api.get<
    { company_payment_qr_id: number; image_url: string; type: string; is_active: boolean }[]
  >(`/company/${companyId}/qr/active`);

// ---- Settlement ----
export const settleBill = (
  billId: number,
  payload: {
    company_id: number;
    settled_by: number;
    adds: AddItemPayload[];
    removes: { order_item_id: number; reason: string }[];
  }
) => api.put<Bill>(`/settlement/bill/${billId}/settle`, payload);
