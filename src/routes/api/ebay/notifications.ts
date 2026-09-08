import { createFileRoute } from "@tanstack/react-router";
import {
  ebayChallengeResponse,
  ebayNotificationEndpoint,
  ebayNotificationToken,
  parseDeletionNotice,
  recordEbayAccountDeletion,
} from "@/lib/ebay-notifications";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleGet({ request }: { request: Request }) {
  const url = new URL(request.url);
  const challenge = url.searchParams.get("challenge_code")?.trim() || "";
  const token = ebayNotificationToken();
  const endpoint = ebayNotificationEndpoint() || `${url.origin}/api/ebay/notifications`;
  if (!challenge) {
    return json({
      ok: true,
      topic: "MARKETPLACE_ACCOUNT_DELETION",
      delivery: "EVENT_NOTIFICATION",
      marketplace: "EBAY_GB",
      endpoint,
      configured: Boolean(token),
    });
  }
  if (!token) {
    return json({ error: "Set EBAY_NOTIFICATION_VERIFICATION_TOKEN." }, 500);
  }
  return json({ challengeResponse: ebayChallengeResponse(challenge, token, endpoint) });
}

async function handlePost({ request }: { request: Request }) {
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
}

export const Route = createFileRoute("/api/ebay/notifications")({
  server: {
    handlers: {
      GET: handleGet,
      POST: handlePost,
    },
  },
});
