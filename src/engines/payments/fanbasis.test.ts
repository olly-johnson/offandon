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
  const ok = JSON.stringify({
    payment_id: "pay_123",
    amount: 290000,
    currency: "GBP",
    status: "paid",
    buyer: { email: "Client@Example.com", name: "Olly Johnson" },
  });

  it("maps a flat successful payment to a PaymentEvent", () => {
    const e = parseFanbasisPayment(ok)!;
    expect(e.provider).toBe("fanbasis");
    expect(e.email).toBe("client@example.com");
    expect(e.name).toBe("Olly Johnson");
    expect(e.amountCents).toBe(290000);
    expect(e.currency).toBe("GBP");
    expect(e.externalId).toBe("pay_123");
  });

  it("accepts a flat payment with no status field", () => {
    const e = parseFanbasisPayment(
      JSON.stringify({ payment_id: "p1", buyer: { email: "a@b.com" } }),
    )!;
    expect(e.email).toBe("a@b.com");
  });

  it("accepts a flat payment that also carries a payment.* type", () => {
    const e = parseFanbasisPayment(
      JSON.stringify({
        type: "payment.succeeded",
        payment_id: "p2",
        status: "paid",
        buyer: { email: "c@d.com" },
      }),
    )!;
    expect(e.externalId).toBe("p2");
    expect(e.email).toBe("c@d.com");
  });

  it("accepts an enveloped payment, reading fields from data", () => {
    const e = parseFanbasisPayment(
      JSON.stringify({
        id: "evt_1",
        type: "payment.succeeded",
        data: { payment_id: "p3", status: "paid", buyer: { email: "e@f.com" }, amount: 5000 },
      }),
    )!;
    expect(e.externalId).toBe("p3");
    expect(e.email).toBe("e@f.com");
    expect(e.amountCents).toBe(5000);
  });

  it("falls back to `id` when payment_id is absent", () => {
    const e = parseFanbasisPayment(
      JSON.stringify({ id: "txn_9", status: "paid", buyer: { email: "g@h.com" } }),
    )!;
    expect(e.externalId).toBe("txn_9");
  });

  it("ignores enveloped events (they carry a top-level type)", () => {
    expect(
      parseFanbasisPayment(JSON.stringify({ id: "evt", type: "dispute.created", data: {} })),
    ).toBeNull();
  });

  it("ignores a failed payment (status != paid)", () => {
    expect(
      parseFanbasisPayment(
        JSON.stringify({ payment_id: "p", status: "failed", buyer: { email: "a@b.com" } }),
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
