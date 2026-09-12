import { createServerFn } from "@tanstack/react-start";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";

const APP_NAME = "GBblox";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 8_000, refetchOnWindowFocus: false, retry: 1 },
  },
});

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionUser } = await import("@/lib/auth/verify.server");
  const { envLoginConfigured } = await import("@/lib/env-login");
  const u = await getSessionUser();
  return {
    user: u ? { id: u.id, email: u.email } : null,
    passwordLogin: envLoginConfigured(),
  };
});

export const Route = createRootRoute({
  beforeLoad: async () => {
    const session = await fetchSessionUser();
    return { sessionUser: session.user, passwordLogin: session.passwordLogin };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0f2942" },
      {
        name: "description",
        content: "Inventory LEGO sets for sale, pull used market prices, and list them on eBay.",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <Outlet />
            <Toaster />
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
