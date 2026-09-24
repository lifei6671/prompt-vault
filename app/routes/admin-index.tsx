import { redirect } from "react-router";

export function loader() {
  return redirect("/admin/prompts", { headers: { "Cache-Control": "no-store" } });
}

export default function AdminIndex() { return null; }
