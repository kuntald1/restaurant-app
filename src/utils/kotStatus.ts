// src/utils/kotStatus.ts
export type SimpleKotStatus = "pending" | "cooking" | "ready";

/**
 * Classifies a raw kot_item_status string into one of our three simple
 * buckets. Deliberately substring-based rather than exact-match — the
 * backend has more status values than the UI needs to distinguish (e.g.
 * "kot_inprocess" for cooking, not literally "cooking"), and new variants
 * showing up shouldn't silently fall through to the wrong bucket the way
 * a strict `=== "cooking"` check would.
 */
export function classifyKotStatus(status: string | null | undefined): SimpleKotStatus {
  const s = (status || "").toLowerCase();
  if (s.includes("ready") || s.includes("serve") || s.includes("complete")) return "ready";
  if (s.includes("open") || s.includes("pending") || s.includes("draft") || s.includes("new")) {
    return "pending";
  }
  // Anything else (kot_inprocess, cooking, started, in_kitchen, preparing,
  // wip, etc.) — if it's past the "just sent" stage and not ready, it's
  // being worked on.
  return "cooking";
}
