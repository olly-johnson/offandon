import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  FanbasisParseError,
  parseFanbasisPayment,
  verifyFanbasisSignature,
} from "./fanbasis";

const SECRET = "fb_secret_key";
function sign(body: string): string {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

describe("verifyFanbasisSignature", () => {
  it("accepts a correct HMAC of the raw body", () => {
    const body = '{"type":"payment.succeeded"}';
    expect(verifyFanbasisSignature(SECRET, body, sign(body))).toBe(true);
  });

  it("tolerates a sha256= prefix", () => {
    const body = '{"x":1}';
    expect(verifyFanbasisSignature(SECRET, body, `sha256=${sign(body)}`)).toBe(true);
  });

  it("rejects a wrong signature, wrong secret, or missing header", () => {
    const body = '{"x":1}';
    expect(verifyFanbasisSignature(SECRET, body, "deadbeef")).toBe(false);
    expect(verifyFanbasisSignature("other", body, sign(body))).toBe(false);
    expect(verifyFanbasisSignature(SECRET, body, null)).toBe(false);
  });
});

describe("parseFanbasisPayment", () => {
  const ok = JSON.stringify({
    type: "payment.succeeded",
    payment_id: "pay_123",
    amount: 290000,
    currency: "GBP",
    buyer: { email: "Client@Example.com", name: "Olly Johnson" },
  });

  it("maps a payment.succeeded to a PaymentEvent", () => {
    const e = parseFanbasisPayment(ok)!;
    expect(e.provider).toBe("fanbasis");
    expect(e.email).toBe("client@example.com");
    expect(e.name).toBe("Olly Johnson");
    expect(e.amountCents).toBe(290000);
    expect(e.currency).toBe("GBP");
    expect(e.externalId).toBe("pay_123");
  });

  it("returns null for non-payment events (route ignores them)", () => {
    expect(
      parseFanbasisPayment(JSON.stringify({ type: "subscription.cancelled" })),
    ).toBeNull();
  });

  it("throws on invalid JSON or a missing buyer email", () => {
    expect(() => parseFanbasisPayment("{bad")).toThrow(FanbasisParseError);
    expect(() =>
      parseFanbasisPayment(
        JSON.stringify({ type: "payment.succeeded", payment_id: "p", buyer: {} }),
      ),
    ).toThrow(FanbasisParseError);
  });
});
