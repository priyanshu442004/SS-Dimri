import { redirect } from "next/navigation";

// Quick registration of clients is done by the firm from the portal (Clients → Register a client).
export default function QuickRegistrationPage() {
  redirect("/register");
}
