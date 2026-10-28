/**
 * Formats an integer amount as Indonesian Rupiah (IDR).
 */
export function formatIDR(amount: number): string {
  if (isNaN(amount)) return "Rp 0";
  return "Rp " + amount.toLocaleString("id-ID");
}

/**
 * Formats an ISO date string into readable Indonesian date (e.g. 28 Okt 2026).
 */
export function formatDate(isoString: string): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Formats an ISO date string into readable date and time.
 */
export function formatDateTime(isoString: string): string {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Returns human-readable relative time (e.g., "just now", "5m ago", "2h ago", "3d ago", "Never").
 * Sourced from standard time-ago algorithms.
 * An optional `referenceDate` parameter allows deterministic unit testing.
 */
export function timeAgo(
  isoString: string | null | undefined,
  referenceDate: Date = new Date()
): string {
  if (!isoString) return "Never";

  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "Never";

  const diffMs = referenceDate.getTime() - d.getTime();
  if (diffMs < 0) return "just now";

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}
