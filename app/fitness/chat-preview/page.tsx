import { redirect } from "next/navigation";

// Legacy preview URL: keep old links working by forwarding to the live member route.

export default function FitnessChatPreviewRedirect() {
  redirect("/fitness/chat");
}
