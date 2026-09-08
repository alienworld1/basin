import type { Metadata } from "next";

import { InvitationReview } from "@/src/ui/payment-access/invitation-review";

export const metadata: Metadata = {
  title: "Payment access invitation",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PaymentOperatorInvitationPage() {
  return <InvitationReview />;
}
