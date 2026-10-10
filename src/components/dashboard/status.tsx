import { Badge } from "../ui";

const DEAL: Record<string, { label: string; tone: "neutral" | "blue" | "violet" | "green" | "red" | "amber" | "cyan" }> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "amber" },
  PAID: { label: "Paid · preparing", tone: "blue" },
  IN_TRANSFER: { label: "In transfer", tone: "blue" },
  BUYER_REVIEW: { label: "Buyer review", tone: "violet" },
  RELEASE_PENDING: { label: "Release pending", tone: "cyan" },
  COMPLETED: { label: "Completed", tone: "green" },
  DISPUTED: { label: "Disputed", tone: "red" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

const LISTING: Record<string, { label: string; tone: "neutral" | "blue" | "violet" | "green" | "red" | "amber" | "cyan" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_REVIEW: { label: "In review", tone: "amber" },
  ACTIVE: { label: "Live", tone: "green" },
  REJECTED: { label: "Needs changes", tone: "red" },
  PENDING_SALE: { label: "Sale pending", tone: "violet" },
  SOLD: { label: "Sold", tone: "blue" },
  EXPIRED: { label: "Ended", tone: "neutral" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
  REMOVED: { label: "Removed", tone: "red" },
};

export function DealStatusBadge({ status }: { status: string }) {
  const s = DEAL[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ListingStatusBadge({ status }: { status: string }) {
  const s = LISTING[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function GenericBadge({ status }: { status: string }) {
  const tone = /ACTIVE|APPROVED|ACCEPTED|SUCCEEDED|EARNED|GRANTED|RESOLVED/.test(status) ? "green" : /PENDING|REQUESTED|OPEN|REVIEW|PROCESSING/.test(status) ? "amber" : /REJECT|FAIL|DENIED|SUSPEND|REVERSED|CANCEL|EXPIRED|WITHDRAWN|REFUNDED|DISMISSED/.test(status) ? "neutral" : "blue";
  return <Badge tone={tone}>{status.replace(/_/g, " ").toLowerCase()}</Badge>;
}
