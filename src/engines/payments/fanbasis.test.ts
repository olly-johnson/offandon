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
