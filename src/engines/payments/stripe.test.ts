import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  parseStripeCheckout,
  StripeParseError,
  verifyStripeSignature,
} from "./stripe";

const SECRET = "whsec_test";
const NOW_MS = 1_780_000_000_000;
const T = Math.floor(NOW_MS / 1000);

function header(body: string, t = T): string {
  const sig = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

describe("verifyStripeSignature", () => {
  const body = '{"id":"evt_1"}';

  it("accepts a valid signature within tolerance", () => {
    expect(
      verifyStripeSignature({ secret: SECRET, rawBody: body, header: header(body), nowMs: NOW_MS }),
    ).toBe(true);
  });

  it("rejects a stale timestamp (replay guard)", () => {
    const old = header(body, T - 10_000);
    expect(
      verifyStripeSignature({ secret: SECRET, rawBody: body, header: old, nowMs: NOW_MS }),
    ).toBe(false);
  });

  it("rejects a tampered body, wrong secret, or missing header", () => {
    expect(
      verifyStripeSignature({ secret: SECRET, rawBody: '{"id":"evt_2"}', header: header(body), nowMs: NOW_MS }),
    ).toBe(false);
    expect(
      verifyStripeSignature({ secret: "nope", rawBody: body, header: header(body), nowMs: NOW_MS }),
    ).toBe(false);
    expect(
      verifyStripeSignature({ secret: SECRET, rawBody: body, header: null, nowMs: NOW_MS }),
    ).toBe(false);
  });
});

describe("parseStripeCheckout", () => {
  const ok = JSON.stringify({
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        amount_total: 290000,
        currency: "gbp",
        customer_details: { email: "Client@Example.com", name: "Olly Johnson" },
      },
    },
  });

  it("maps a completed checkout to a PaymentEvent", () => {
    const e = parseStripeCheckout(ok)!;
    expect(e.provider).toBe("stripe");
    expect(e.email).toBe("client@example.com");
    expect(e.name).toBe("Olly Johnson");
    expect(e.amountCents).toBe(290000);
    expect(e.currency).toBe("GBP");
    expect(e.externalId).toBe("cs_test_123");
  });

  it("returns null for unrelated event types", () => {
    expect(
      parseStripeCheckout(JSON.stringify({ type: "payment_intent.created", data: { object: {} } })),
    ).toBeNull();
  });

  it("throws when the checkout session has no email", () => {
    expect(() =>
      parseStripeCheckout(
        JSON.stringify({
          id: "evt",
          type: "checkout.session.completed",
          data: { object: { id: "cs_1", customer_details: {} } },
        }),
      ),
    ).toThrow(StripeParseError);
  });
});
