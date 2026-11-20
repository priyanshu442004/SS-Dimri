import { redirect } from "next/navigation";

// The separate "360° dashboard" was folded into the dashboard itself (client feedback, 20 Nov 2026).
export default function Dashboard360() {
  redirect("/app/admin");
}
