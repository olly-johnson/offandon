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
  // Real payment.succeeded is FLAT with no top-level "type".
  // Real Fanbasis shape: event_type (not type), status "succeeded" (not
  // "paid"), total_price (not amount).
  const ok = JSON.stringify({
    payment_id: "pay_123",
    total_price: 290000,
    currency: "GBP",
    status: "succeeded",
    event_type: "payment.succeeded",
    buyer: { email: "Client@Example.com", name: "Olly Johnson" },
  });

  it("maps a real Fanbasis payment.succeeded to a PaymentEvent", () => {
    const e = parseFanbasisPayment(ok)!;
    expect(e.provider).toBe("fanbasis");
    expect(e.email).toBe("client@example.com");
    expect(e.name).toBe("Olly Johnson");
    expect(e.amountCents).toBe(290000); // from total_price
    expect(e.currency).toBe("GBP");
    expect(e.externalId).toBe("pay_123");
  });

  it("accepts the docs' legacy shape (amount + status paid)", () => {
    const e = parseFanbasisPayment(
      JSON.stringify({ payment_id: "p1", amount: 5000, status: "paid", buyer: { email: "a@b.com" } }),
    )!;
    expect(e.amountCents).toBe(5000);
  });

  it("accepts an enveloped payment, reading fields from data", () => {
    const e = parseFanbasisPayment(
      JSON.stringify({
        id: "evt_1",
        type: "payment.succeeded",
        data: { payment_id: "p3", status: "succeeded", buyer: { email: "e@f.com" }, total_price: 5000 },
      }),
    )!;
    expect(e.externalId).toBe("p3");
    expect(e.email).toBe("e@f.com");
    expect(e.amountCents).toBe(5000);
  });

  it("coerces a numeric payment_id / falls back to id", () => {
    expect(
      parseFanbasisPayment(
        JSON.stringify({ payment_id: 9876, status: "succeeded", buyer: { email: "g@h.com" } }),
      )!.externalId,
    ).toBe("9876");
    expect(
      parseFanbasisPayment(
        JSON.stringify({ id: "txn_9", status: "succeeded", buyer: { email: "g@h.com" } }),
      )!.externalId,
    ).toBe("txn_9");
  });

  it("ignores non-payment events (event_type or type)", () => {
    expect(
      parseFanbasisPayment(JSON.stringify({ event_type: "subscription.cancelled", buyer: { email: "a@b.com" } })),
    ).toBeNull();
    expect(
      parseFanbasisPayment(JSON.stringify({ id: "e", type: "dispute.created", data: {} })),
    ).toBeNull();
  });

  it("ignores a failed payment (status != succeeded/paid)", () => {
    expect(
      parseFanbasisPayment(
        JSON.stringify({ event_type: "payment.succeeded", payment_id: "p", status: "failed", buyer: { email: "a@b.com" } }),
      ),
    ).toBeNull();
  });

  it("throws on invalid JSON or a missing buyer email", () => {
    expect(() => parseFanbasisPayment("{bad")).toThrow(FanbasisParseError);
    expect(() =>
      parseFanbasisPayment(JSON.stringify({ payment_id: "p", status: "paid", buyer: {} })),
    ).toThrow(FanbasisParseError);
  });
});
