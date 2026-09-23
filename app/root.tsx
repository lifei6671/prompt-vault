import {
  data,
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
  useMatches,
  type UIMatch,
} from "react-router";

import type { Route } from "./+types/root";
import type { loader as promptDetailLoader } from "./routes/prompt-detail";
import { readUiLocale, uiLocaleCookie } from "./lib/explore";
import type { Locale } from "./lib/localization";
import { uiCopy } from "./lib/ui-copy";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
];

export function loader({ request }: Route.LoaderArgs) {
  const locale = readUiLocale(request);
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  const cookie = uiLocaleCookie(request, locale);
  if (cookie) headers.set("Set-Cookie", cookie);
  return data({ locale }, { headers });
}

export function documentLanguage(matches: Pick<UIMatch, "id" | "loaderData">[], locale: Locale): Locale {
  const detail = matches.find((match) => match.id === "routes/prompt-detail")?.loaderData as
    Awaited<ReturnType<typeof promptDetailLoader>> | undefined;
  return detail?.prompt.contentLanguage ?? locale;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const locale = useRouteLoaderData<typeof loader>("root")?.locale ?? "zh-CN";
  const matches = useMatches();
  return (
    <html lang={documentLanguage(matches, locale)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const locale = useRouteLoaderData<typeof loader>("root")?.locale ?? "zh-CN";
  const t = uiCopy(locale);
  let message: string = t.errorTitle;
  let details: string = t.errorDescription;
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : message;
    details = error.status === 404
      ? t.notFound
      : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">{message}</h1>
      <p className="mt-3 text-muted-foreground">{details}</p>
      {stack && (
        <pre className="mt-6 w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
