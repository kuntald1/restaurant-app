// src/components/GenerateBillModal.tsx
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  createPaymentLink,
  generateBill,
  getActiveQr,
  getCompanies,
  getPaymentLinkStatus,
  logCreditSale,
  sendWhatsappBill,
  validatePromo,
  CompanyInfo,
} from "../api/endpoints";
import { useAuth } from "../context/AuthContext";
import { ApiPaymentMethod, Customer, Order, PaymentMethod } from "../api/types";
import { colors } from "../theme/colors";

interface Props {
  visible: boolean;
  onClose: () => void;
  order: Order;
  customer: Customer | null;
  createdBy: number;
  initialDiscount?: string;
  sgstRate?: number;
  cgstRate?: number;
  surchargeOverride?: number;
  surchargeLabelOverride?: string;
  onSettled: (billId: number) => void;
}

type MerchantSubMethod = "upi" | "card";
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 45; // ~3 minutes

export default function GenerateBillModal({
  visible,
  onClose,
  order,
  customer,
  createdBy,
  initialDiscount,
  sgstRate = 2.5,
  cgstRate = 2.5,
  surchargeOverride,
  surchargeLabelOverride,
  onSettled,
}: Props) {
  const { session } = useAuth();
  const [discount, setDiscount] = useState(initialDiscount ?? "0");
  const [promoCode, setPromoCode] = useState("");
  const [promoAmount, setPromoAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [merchantSub, setMerchantSub] = useState<MerchantSubMethod>("upi");
  const [amountReceived, setAmountReceived] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState(customer?.phone ?? "");
  const [transactionId, setTransactionId] = useState("");
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [validatingPromo, setValidatingPromo] = useState(false);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [paymentLink, setPaymentLink] = useState<{ id: string; url: string } | null>(null);
  const [waitingForPayment, setWaitingForPayment] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);

  const wasVisibleRef = React.useRef(false);

  // Safe to re-run whenever these change while the sheet is open.
  useEffect(() => {
    if (visible) {
      setDiscount(initialDiscount ?? "0");
      setWhatsappNumber(customer?.phone ?? "");
    }
  }, [visible, initialDiscount, customer]);

  // Only reset the in-flight payment-link state on a genuine open/close
  // transition — NOT whenever customer/discount happen to change while the
  // sheet is already open, which was silently wiping "Waiting for
  // payment…" right after it was set.
  useEffect(() => {
    const justOpened = visible && !wasVisibleRef.current;
    if (justOpened) {
      setTransactionId("");
      setPaymentLink(null);
      setWaitingForPayment(false);
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  const subtotal = Number(order.subtotal);
  const surcharge = Number(order.table_surcharge_amount ?? surchargeOverride ?? 0);
  const surchargeLabel = order.table_surcharge_label || surchargeLabelOverride || "Table Surcharge";
  const discountNum = Number(discount) || 0;

  const taxable = Math.max(subtotal + surcharge - discountNum - promoAmount, 0);
  const sgst = +(taxable * (sgstRate / 100)).toFixed(2);
  const cgst = +(taxable * (cgstRate / 100)).toFixed(2);
  const rawTotal = taxable + sgst + cgst;
  const total = Math.round(rawTotal);

  useEffect(() => {
    if (visible) setAmountReceived(total.toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, total]);

  // Fetch company directory info once (for the WhatsApp bill header: address/GSTIN).
  useEffect(() => {
    if (visible && !companyInfo) {
      getCompanies()
        .then((list) => {
          const match = list.find((c) => c.company_unique_id === order.company_unique_id);
          if (match) setCompanyInfo(match);
        })
        .catch(() => {
          // non-critical — WhatsApp message just omits address/GSTIN if this fails
        });
    }
  }, [visible, companyInfo, order.company_unique_id]);

  // Load the merchant's active payment QR once, when Personal UPI is picked.
  useEffect(() => {
    if (paymentMethod === "upi" && !qrImageUrl && !loadingQr) {
      setLoadingQr(true);
      getActiveQr(order.company_unique_id)
        .then((list) => {
          const active = list.find((q) => q.is_active);
          setQrImageUrl(active?.image_url ?? null);
        })
        .catch(() => setQrImageUrl(null))
        .finally(() => setLoadingQr(false));
    }
  }, [paymentMethod, order.company_unique_id]);

  // Poll a created payment link until it's paid (or we give up).
  useEffect(() => {
    if (!paymentLink || !waitingForPayment) return;
    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      attempts++;
      try {
        const status = await getPaymentLinkStatus(paymentLink.id, order.company_unique_id);
        if (status.status === "paid" || Number(status.amount_paid) >= total) {
          if (cancelled) return;
          setWaitingForPayment(false);
          await finalizeBill(paymentLink.id);
          return;
        }
      } catch {
        // keep polling — a single failed check isn't fatal
      }
      if (attempts < POLL_MAX_ATTEMPTS && !cancelled) {
        setTimeout(poll, POLL_INTERVAL_MS);
      } else if (!cancelled) {
        setWaitingForPayment(false);
        Alert.alert(
          "Still waiting",
          "Payment hasn't come through yet. You can check again or try a different method."
        );
      }
    };

    const timer = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentLink, waitingForPayment]);

  const applyPromo = async () => {
    if (!promoCode.trim()) return;
    setValidatingPromo(true);
    try {
      const result = await validatePromo(order.company_unique_id, promoCode.trim(), subtotal);
      if (result.valid) {
        setPromoAmount(Number(result.discount_amount));
      } else {
        Alert.alert("Invalid promo", "This code isn't valid for this bill.");
      }
    } catch (e: any) {
      Alert.alert("Promo check failed", e.message);
    } finally {
      setValidatingPromo(false);
    }
  };

  const apiPaymentMethod: ApiPaymentMethod =
    paymentMethod === "merchant" ? (merchantSub === "card" ? "card" : "upi") : paymentMethod;

  const finalizeBill = async (paymentReference?: string) => {
    setSubmitting(true);
    try {
      const bill = await generateBill({
        order_id: order.order_id,
        company_unique_id: order.company_unique_id,
        payment_method: apiPaymentMethod,
        amount_paid: Number(amountReceived) || total,
        discount_amount: discountNum,
        service_charge: surcharge,
        promo_code: promoAmount > 0 ? promoCode.trim() : null,
        promo_amount: promoAmount,
        sgst_amount: sgst,
        cgst_amount: cgst,
        customer_id: customer?.customer_id ?? null,
        created_by: createdBy,
        payment_reference:
          paymentReference ?? (paymentMethod === "upi" ? transactionId.trim() : undefined),
      });

      if (paymentMethod === "credit" && customer) {
        await logCreditSale({
          customer_id: customer.customer_id,
          order_id: order.order_id,
          order_number: order.order_number,
          bill_id: bill.bill_id,
          bill_number: bill.bill_number,
          amount: total,
          payment_status: "credit",
          notes: "Credit bill generated",
        });
      }

      onSettled(bill.bill_id);
    } catch (e: any) {
      Alert.alert("Bill generation failed", e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async () => {
    if (paymentMethod === "credit" && !customer) {
      Alert.alert(
        "Customer required",
        "Search and match the customer's phone number in CRM before using Credit payment."
      );
      return;
    }
    if (paymentMethod === "upi" && !transactionId.trim()) {
      Alert.alert(
        "Transaction ID required",
        "Enter the UTR / Transaction ID the customer received after paying via UPI."
      );
      return;
    }
    if (paymentMethod === "merchant" && !paymentLink) {
      const proceed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "No payment link yet",
          "You haven't created a payment link for this bill. Generate the bill anyway (e.g. if the customer already paid by another means)?",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Generate anyway", onPress: () => resolve(true) },
          ]
        );
      });
      if (!proceed) return;
    }
    await finalizeBill();
  };

  const buildBillMessage = () => {
    const now = new Date().toLocaleString("en-IN", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const lines: string[] = [];
    lines.push(`*${companyInfo?.name ?? session?.company_settings?.merchant_name ?? "Bill"}*`);
    if (companyInfo?.address1) lines.push(companyInfo.address1);
    if (companyInfo?.admin_phone) lines.push(`Ph: ${companyInfo.admin_phone}`);
    if (companyInfo?.gstin) lines.push(`GSTIN: ${companyInfo.gstin}`);
    lines.push("─────────────────────────");
    lines.push(`*Bill No:* (preview)`);
    lines.push(`*Order:*   #${order.order_number}`);
    lines.push(`*Type:*    ${order.order_type}`);
    lines.push(`*Date:*    ${now}`);
    lines.push(`*Payment:* ${paymentMethod}`);
    lines.push("─────────────────────────");
    lines.push("*ITEMS*");
    (order.items ?? [])
      .filter((i) => !i.is_cancelled)
      .forEach((i) => {
        lines.push(`• ${i.item_name}`);
        lines.push(`  ${i.quantity} x ₹${i.unit_price} = ₹${i.total_price}`);
      });
    lines.push("─────────────────────────");
    lines.push(`Subtotal          ₹${subtotal.toFixed(2)}`);
    if (surcharge > 0) lines.push(`${surchargeLabel}   +₹${surcharge.toFixed(2)}`);
    if (discountNum > 0) lines.push(`Discount          -₹${discountNum.toFixed(2)}`);
    lines.push(`SGST              +₹${sgst.toFixed(2)}`);
    lines.push(`CGST              +₹${cgst.toFixed(2)}`);
    lines.push("─────────────────────────");
    lines.push(`*TOTAL PAYABLE    ₹${total}*`);
    lines.push("─────────────────────────");
    if (paymentLink) {
      lines.push(`💳 *Click to Pay (Razorpay):*`);
      lines.push(paymentLink.url);
      lines.push("─────────────────────────");
    } else if (session?.company_settings?.upi_id) {
      lines.push(`💳 *Pay via UPI:* ${session.company_settings.upi_id}`);
      if (session.company_settings.upi_name) {
        lines.push(`   UPI Name: ${session.company_settings.upi_name}`);
      }
      lines.push("─────────────────────────");
    }
    lines.push("_Thank you for dining with us!_");
    lines.push("_Powered by Restaurant OS_");
    return lines.join("\n");
  };

  const buildPaymentRequestMessage = (linkUrl: string) => {
    const merchantName =
      companyInfo?.name ?? session?.company_settings?.merchant_name ?? "Restaurant";
    const lines: string[] = [];
    lines.push(`*${merchantName}*`);
    lines.push("─────────────────────────");
    lines.push(`Hi ${customer?.name ?? "Customer"}, your order is ready!`);
    lines.push("");
    lines.push(`*Order:* ##${order.order_number}`);
    lines.push("─────────────────────────");
    (order.items ?? [])
      .filter((i) => !i.is_cancelled)
      .forEach((i) => {
        lines.push(`• ${i.item_name}  ${i.quantity} x ₹${i.unit_price} = ₹${i.total_price}`);
      });
    lines.push("─────────────────────────");
    lines.push(`Subtotal          ₹${subtotal.toFixed(2)}`);
    if (discountNum > 0) lines.push(`Discount          -₹${discountNum.toFixed(2)}`);
    if (surcharge > 0) lines.push(`${surchargeLabel}   +₹${surcharge.toFixed(2)}`);
    lines.push(`SGST (${sgstRate}%)      +₹${sgst.toFixed(2)}`);
    lines.push(`CGST (${cgstRate}%)      +₹${cgst.toFixed(2)}`);
    lines.push("─────────────────────────");
    lines.push(`*AMOUNT TO PAY   ₹${total}*`);
    lines.push("─────────────────────────");
    lines.push(`💳 *Click to Pay (Razorpay):*`);
    lines.push(linkUrl);
    lines.push("─────────────────────────");
    lines.push("_Supports UPI, Card, NetBanking & Wallets_");
    lines.push("_Powered by Restaurant OS_");
    return lines.join("\n");
  };

  const sendBillWhatsapp = async () => {
    if (!whatsappNumber.trim()) return;
    setSendingWhatsapp(true);
    try {
      await sendWhatsappBill({
        company_id: order.company_unique_id,
        to_phone: whatsappNumber.trim(),
        message: buildBillMessage(),
        order_id: order.order_id,
        order_number: order.order_number,
        bill_number: "(preview)",
        message_type: "bill",
        sent_by: createdBy,
      });
      Alert.alert("Sent", "Bill sent via WhatsApp.");
    } catch (e: any) {
      Alert.alert("Couldn't send", e.message);
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const startMerchantPayment = async () => {
    const targetPhone = customer?.phone ?? whatsappNumber.trim();
    if (!targetPhone) {
      Alert.alert(
        "Phone number needed",
        "Search a customer or enter a WhatsApp number so we know where to send the payment link."
      );
      return;
    }
    setCreatingLink(true);
    try {
      const link = await createPaymentLink({
        company_id: order.company_unique_id,
        amount: total,
        customer_name: customer?.name ?? "Customer",
        customer_phone: targetPhone,
        order_number: order.order_number,
        description: `Bill for Order #${order.order_number} at ${
          companyInfo?.name ?? session?.company_settings?.merchant_name ?? "your restaurant"
        }`,
      });
      setPaymentLink({ id: link.payment_link_id, url: link.short_url });
      setWaitingForPayment(true);

      // Auto-send the payment link to the customer's WhatsApp — this used to
      // only be created and shown to staff, never actually delivered.
      try {
        await sendWhatsappBill({
          company_id: order.company_unique_id,
          to_phone: targetPhone,
          message: buildPaymentRequestMessage(link.short_url),
          order_id: order.order_id,
          order_number: order.order_number,
          bill_number: "(preview)",
          message_type: "payment_link",
          sent_by: createdBy,
        });
      } catch {
        // Link creation still succeeded even if the WhatsApp send failed —
        // staff can still tap "Send Bill" manually or share the link directly.
        Alert.alert(
          "Link created, WhatsApp send failed",
          "The payment link was created, but sending it via WhatsApp didn't go through. You can retry with the Send Bill button below."
        );
      }
    } catch (e: any) {
      Alert.alert("Couldn't create payment link", e.message);
    } finally {
      setCreatingLink(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Generate Bill</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.close}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled">
            <Row label="Subtotal" value={subtotal} />
            {surcharge > 0 && <Row label={surchargeLabel} value={surcharge} positive />}
            <View style={styles.inlineRow}>
              <Text style={styles.rowLabel}>Discount (₹)</Text>
              <TextInput
                style={styles.smallInput}
                keyboardType="numeric"
                value={discount}
                onChangeText={setDiscount}
              />
            </View>
            {promoAmount > 0 && <Row label={`Promo (${promoCode})`} value={-promoAmount} />}
            <Row label={`SGST (${sgstRate}%)`} value={sgst} positive />
            <Row label={`CGST (${cgstRate}%)`} value={cgst} positive />

            <View style={styles.divider} />
            <View style={styles.inlineRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{total.toFixed(2)}</Text>
            </View>

            <View style={styles.promoRow}>
              <TextInput
                style={[styles.smallInput, { flex: 1 }]}
                placeholder="ENTER PROMO CODE"
                autoCapitalize="characters"
                value={promoCode}
                onChangeText={setPromoCode}
              />
              <TouchableOpacity style={styles.applyButton} onPress={applyPromo} disabled={validatingPromo}>
                {validatingPromo ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.applyText}>Apply</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Payment Method</Text>
            <View style={styles.methodRow}>
              {(["cash", "upi", "merchant", "credit"] as PaymentMethod[]).map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.methodButton, paymentMethod === m && styles.methodButtonActive]}
                  onPress={() => setPaymentMethod(m)}
                >
                  <Text style={[styles.methodText, paymentMethod === m && styles.methodTextActive]}>
                    {m === "upi" ? "Personal UPI" : m[0].toUpperCase() + m.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ---- Cash ---- */}
            {paymentMethod === "cash" && (
              <View style={styles.methodPanel}>
                <Text style={styles.fieldLabel}>Amount Received (₹)</Text>
                <TextInput
                  style={styles.fieldInput}
                  keyboardType="numeric"
                  value={amountReceived}
                  onChangeText={setAmountReceived}
                />
              </View>
            )}

            {/* ---- Personal UPI ---- */}
            {paymentMethod === "upi" && (
              <View style={styles.methodPanel}>
                {loadingQr ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
                ) : qrImageUrl ? (
                  <View style={styles.qrCard}>
                    <Image source={{ uri: qrImageUrl }} style={styles.qrImage} resizeMode="contain" />
                    <Text style={styles.qrName}>{session?.company_settings?.upi_name ?? "—"}</Text>
                    <Text style={styles.qrId}>UPI ID: {session?.company_settings?.upi_id ?? "—"}</Text>
                    <Text style={styles.qrAmount}>₹{total.toFixed(2)}</Text>
                    <Text style={styles.qrHint}>Customer scans QR → pays → confirm below</Text>
                  </View>
                ) : (
                  <Text style={styles.fieldHint}>No active payment QR found for this company.</Text>
                )}

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                  UPI Transaction ID (after payment)
                </Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="Enter UTR / Transaction ID from customer"
                  value={transactionId}
                  onChangeText={setTransactionId}
                />
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    ✓ Once customer pays, enter Transaction ID above and click Generate Bill
                  </Text>
                </View>
              </View>
            )}

            {/* ---- Merchant (Razorpay payment link) ---- */}
            {paymentMethod === "merchant" && (
              <View style={styles.methodPanel}>
                <Text style={styles.fieldLabel}>Payment via</Text>
                <View style={styles.subToggleRow}>
                  <TouchableOpacity
                    style={[styles.subToggle, merchantSub === "upi" && styles.subToggleActive]}
                    onPress={() => setMerchantSub("upi")}
                  >
                    <Text style={[styles.subToggleText, merchantSub === "upi" && styles.subToggleTextActive]}>
                      UPI (Razorpay)
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.subToggle, merchantSub === "card" && styles.subToggleActive]}
                    onPress={() => setMerchantSub("card")}
                  >
                    <Text style={[styles.subToggleText, merchantSub === "card" && styles.subToggleTextActive]}>
                      Card
                    </Text>
                  </TouchableOpacity>
                </View>

                {waitingForPayment ? (
                  <View style={styles.waitingBox}>
                    <ActivityIndicator color={colors.primary} />
                    <Text style={styles.waitingText}>Waiting for customer payment…</Text>
                    {paymentLink && (
                      <TouchableOpacity onPress={() => Linking.openURL(paymentLink.url)}>
                        <Text style={styles.waitingUrl}>{paymentLink.url}</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.manualConfirmButton}
                      onPress={() =>
                        Alert.alert(
                          "Confirm payment received?",
                          "Only do this if the customer has actually paid — this will generate the bill immediately without waiting for automatic confirmation.",
                          [
                            { text: "Not yet", style: "cancel" },
                            {
                              text: "Yes, payment received",
                              onPress: () => {
                                setWaitingForPayment(false);
                                finalizeBill(paymentLink?.id);
                              },
                            },
                          ]
                        )
                      }
                    >
                      <Text style={styles.manualConfirmText}>I've confirmed payment manually</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.razorpayButton}
                    onPress={startMerchantPayment}
                    disabled={creatingLink}
                  >
                    {creatingLink ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.razorpayButtonText}>
                        Pay ₹{total.toFixed(2)} via {merchantSub === "upi" ? "UPI" : "Card"}
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ---- Credit ---- */}
            {paymentMethod === "credit" && !customer && (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  Customer phone number must be searched and matched in CRM before using Credit
                  payment. This amount will be added to the customer's due balance.
                </Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>WhatsApp Number for Bill</Text>
            <View style={styles.row8}>
              <TextInput
                style={[styles.fieldInput, { flex: 1 }]}
                placeholder="+91 XXXXXXXXXX"
                keyboardType="phone-pad"
                value={whatsappNumber}
                onChangeText={setWhatsappNumber}
              />
              <TouchableOpacity
                style={styles.sendBillButton}
                onPress={sendBillWhatsapp}
                disabled={sendingWhatsapp}
              >
                {sendingWhatsapp ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.sendBillText}>Send Bill</Text>
                )}
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldHint}>Leave blank to skip WhatsApp</Text>

            <TouchableOpacity style={styles.submitButton} onPress={submit} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>Generate Bill · ₹{total.toFixed(2)}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <View style={styles.inlineRow}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, positive && { color: colors.primaryDark }]}>
        {value < 0 ? "-" : positive ? "+" : ""}₹{Math.abs(value).toFixed(2)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "88%" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontSize: 18, fontWeight: "700", color: colors.text },
  close: { fontSize: 18, color: colors.textMuted },
  inlineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: "500" },
  smallInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 80,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 10 },
  totalLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  totalValue: { fontSize: 18, fontWeight: "700", color: colors.primaryDark },
  promoRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 16 },
  applyButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  applyText: { color: "#fff", fontWeight: "600" },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: 8 },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  methodButton: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 },
  methodButtonActive: { borderColor: colors.primary, backgroundColor: colors.tableFree },
  methodText: { color: colors.textMuted, fontWeight: "600" },
  methodTextActive: { color: colors.primaryDark },
  methodPanel: { marginTop: 12, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: colors.text, marginBottom: 6 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fieldHint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  row8: { flexDirection: "row", gap: 8 },
  qrCard: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  qrImage: { width: 230, height: 230, marginBottom: 8 },
  qrName: { fontSize: 14, fontWeight: "700", color: colors.text },
  qrId: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  qrAmount: { fontSize: 20, fontWeight: "800", color: colors.primaryDark, marginTop: 6 },
  qrHint: { fontSize: 11, color: colors.textMuted, marginTop: 6, textAlign: "center" },
  infoBox: { backgroundColor: colors.tableFree, borderRadius: 8, padding: 10, marginTop: 10 },
  infoText: { fontSize: 12, color: colors.primaryDark },
  subToggleRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  subToggle: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  subToggleActive: { borderColor: colors.primary, backgroundColor: colors.tableFree },
  subToggleText: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  subToggleTextActive: { color: colors.primaryDark },
  razorpayButton: { backgroundColor: "#5A2D9C", borderRadius: 10, paddingVertical: 13, alignItems: "center" },
  razorpayButtonText: { color: "#fff", fontWeight: "700" },
  waitingBox: { alignItems: "center", paddingVertical: 16, gap: 8 },
  waitingText: { fontSize: 14, fontWeight: "700", color: colors.text },
  waitingUrl: { fontSize: 12, color: colors.primary, textDecorationLine: "underline" },
  manualConfirmButton: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  manualConfirmText: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  warningBox: { backgroundColor: "#FDECEC", borderRadius: 8, padding: 10, marginTop: 12, marginBottom: 4 },
  warningText: { color: colors.danger, fontSize: 12 },
  sendBillButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  sendBillText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  submitButton: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 16, marginBottom: 8 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
