import { redirect } from "next/navigation";

// The root "/" route just redirects to /login.
// Authenticated users will be bounced to /dashboard after the OAuth callback.
export default function RootPage() {
  redirect("/login");
}
