import { useOutletContext } from "react-router";
import type { Locale } from "../lib/localization";
import { uiCopy } from "../lib/ui-copy";

export default function AdminIndex() {
  const locale = useOutletContext<Locale>();
  const t = uiCopy(locale);
  return (
    <section aria-labelledby="admin-title">
      <h1 id="admin-title" className="text-3xl font-semibold">{t.adminTitle}</h1>
      <p className="mt-4 text-muted-foreground">{t.adminReady}</p>
    </section>
  );
}
