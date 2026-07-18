import { eq } from "drizzle-orm";
import { db, sql } from "../db/client";
import { billingSubscriptions } from "../db/schema";
import { config } from "../lib/config";

if (!config.LEMONSQUEEZY_API_KEY) throw new Error("LEMONSQUEEZY_API_KEY is required");
const rows = await db.select().from(billingSubscriptions);
let updated = 0,
  failed = 0;
for (const row of rows) {
  if (!row.lemonSubscriptionId) continue;
  const response = await fetch(
    `https://api.lemonsqueezy.com/v1/subscriptions/${row.lemonSubscriptionId}`,
    {
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${config.LEMONSQUEEZY_API_KEY}`,
      },
    },
  );
  if (!response.ok) {
    failed += 1;
    continue;
  }
  const payload = (await response.json()) as { data: { attributes: Record<string, any> } },
    a = payload.data.attributes;
  const providerUpdatedAt = new Date(String(a.updated_at));
  if (!row.providerUpdatedAt || providerUpdatedAt > row.providerUpdatedAt) {
    await db
      .update(billingSubscriptions)
      .set({
        status: String(a.status),
        renewsAt: a.renews_at ? new Date(a.renews_at) : null,
        trialEndsAt: a.trial_ends_at ? new Date(a.trial_ends_at) : null,
        endsAt: a.ends_at ? new Date(a.ends_at) : null,
        providerUpdatedAt,
        portalUrl: a.urls?.customer_portal ?? null,
        updatePaymentUrl: a.urls?.update_payment_method ?? null,
        updatedAt: new Date(),
      })
      .where(eq(billingSubscriptions.userId, row.userId));
    updated += 1;
  }
}
console.info(JSON.stringify({ checked: rows.length, updated, failed }));
await sql.end();
