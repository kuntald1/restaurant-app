// src/context/NotificationContext.tsx
import { createAudioPlayer } from "expo-audio";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getRunningOrders } from "../api/endpoints";
import { Order } from "../api/types";
import { classifyKotStatus } from "../utils/kotStatus";
import { useAuth } from "./AuthContext";

const POLL_MS = 7000;
const MAX_NOTIFICATIONS = 30;
const TOAST_DURATION_MS = 4500;

export type KitchenEventType = "cooking" | "ready";

export interface KitchenNotification {
  id: string;
  type: KitchenEventType;
  itemName: string;
  quantity: number;
  orderId: number;
  orderNumber: string;
  orderContext: string; // table name, or "Take Away" / "Delivery"
  timestamp: number;
  read: boolean;
}

interface NotificationContextValue {
  notifications: KitchenNotification[];
  unreadCount: number;
  currentToast: KitchenNotification | null;
  markAllRead: () => void;
  dismissToast: () => void;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

function contextLabel(order: Order): string {
  if (order.order_type === "dine_in") return order.table_name ?? "Dine In";
  if (order.order_type === "take_away") return "Take Away";
  return "Delivery";
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const companyId = session?.company_unique_id;

  const [notifications, setNotifications] = useState<KitchenNotification[]>([]);
  const [currentToast, setCurrentToast] = useState<KitchenNotification | null>(null);

  // order_item_id -> last-seen kot_item_status. Kept across polls, not in
  // React state, since it's a comparison cache and shouldn't trigger renders.
  const prevStatusRef = useRef<Map<number, string>>(new Map());
  // Skip firing anything on the very first successful poll — that's just
  // establishing a baseline, not a real transition.
  const initializedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const player = useRef(createAudioPlayer(require("../../assets/notification.wav"))).current;

  const playSound = useCallback(() => {
    try {
      player.seekTo(0);
      player.play();
    } catch {
      // non-critical — a failed chime shouldn't break the notification flow
    }
  }, [player]);

  const pushNotification = useCallback(
    (n: KitchenNotification) => {
      setNotifications((prev) => [n, ...prev].slice(0, MAX_NOTIFICATIONS));
      setCurrentToast(n);
      playSound();

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setCurrentToast((cur) => (cur?.id === n.id ? null : cur));
      }, TOAST_DURATION_MS);
    },
    [playSound]
  );

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const orders = await getRunningOrders(companyId);
        if (cancelled) return;

        const prev = prevStatusRef.current;
        const next = new Map<number, string>();
        const firstRun = !initializedRef.current;

        for (const order of orders) {
          for (const item of order.items ?? []) {
            if (item.is_cancelled) continue;
            next.set(item.order_item_id, item.kot_item_status);

            if (firstRun) continue;

            const prevStatus = prev.get(item.order_item_id);
            const prevClass = prevStatus !== undefined ? classifyKotStatus(prevStatus) : undefined;
            const currentClass = classifyKotStatus(item.kot_item_status);
            const justChanged = prevStatus !== undefined && prevStatus !== item.kot_item_status;
            const isNewReady =
              currentClass === "ready" &&
              (justChanged || prevStatus === undefined) &&
              prevClass !== "ready"; // never re-alert once already ready

            if (isNewReady) {
              pushNotification({
                id: `${item.order_item_id}-${item.kot_item_status}-${Date.now()}`,
                type: "ready",
                itemName: item.item_name,
                quantity: item.quantity,
                orderId: order.order_id,
                orderNumber: order.order_number,
                orderContext: contextLabel(order),
                timestamp: Date.now(),
                read: false,
              });
            }
          }
        }

        prevStatusRef.current = next;
        initializedRef.current = true;
      } catch {
        // a single failed poll isn't worth surfacing — just try again next tick
      }
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [companyId, pushNotification]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setCurrentToast(null);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, currentToast, markAllRead, dismissToast }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
