import { createFileRoute } from "@tanstack/react-router";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/ebay/notifications")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const {
          ebayChallengeResponse,
          ebayNotificationEndpoint,
          ebayNotificationToken,
          PUBLIC_EBAY_NOTIFY_ENDPOINT,
        } = await import("@/lib/ebay-notifications");
        const url = new URL(request.url);
        const challenge = url.searchParams.get("challenge_code")?.trim() || "";
        const token = await ebayNotificationToken();
        const savedEndpoint = await ebayNotificationEndpoint();
        const endpoint = savedEndpoint || PUBLIC_EBAY_NOTIFY_ENDPOINT;
        if (!challenge) {
          return json({
            ok: true,
            topic: "MARKETPLACE_ACCOUNT_DELETION",
            delivery: "EVENT_NOTIFICATION",
            marketplace: "EBAY_GB",
            endpoint,
            configured: Boolean(token),
            tokenLength: token.length,
          });
        }
        if (!token) {
          return json({ error: "Save a 32–80 character verification token in Settings → eBay API." }, 500);
        }
        return json({ challengeResponse: ebayChallengeResponse(challenge, token, endpoint) });
      },
      POST: async ({ request }) => {
        const { parseDeletionNotice, recordEbayAccountDeletion } = await import("@/lib/ebay-notifications");
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          return json({ error: "Expected JSON" }, 400);
        }
        const note = parseDeletionNotice(body);
        if (!note) return json({ error: "Not a marketplace deletion notice" }, 400);
        await recordEbayAccountDeletion({ ...note, payload: body });
        return json({ ok: true });
      },
    },
  },
});
