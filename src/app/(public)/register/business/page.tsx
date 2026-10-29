import { redirect } from "next/navigation";

// Clients are registered by their firm from the admin portal (Clients → New client).
export default function BusinessRegistrationPage() {
  redirect("/register");
}
