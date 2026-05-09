import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger, timed } from "./logger";

let logSpy: ReturnType<typeof vi.spyOn>;
let errSpy: ReturnType<typeof vi.spyOn>;

function lastLog(): Record<string, unknown> {
  const last = logSpy.mock.calls.at(-1)?.[0] as string;
  return JSON.parse(last);
}

function lastErr(): Record<string, unknown> {
  const last = errSpy.mock.calls.at(-1)?.[0] as string;
  return JSON.parse(last);
}

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  delete process.env.LOG_LEVEL;
});

afterEach(() => {
  logSpy.mockRestore();
  errSpy.mockRestore();
});

describe("createLogger", () => {
  it("emits a JSON record with ts, level, ns, msg", () => {
    const log = createLogger("test");
    log.info("hello");
    const r = lastLog();
    expect(r.ns).toBe("test");
    expect(r.level).toBe("info");
    expect(r.msg).toBe("hello");
    expect(typeof r.ts).toBe("string");
  });

  it("redacts sensitive field names regardless of value", () => {
    const log = createLogger("test");
    log.info("auth", {
      user_id: "u1",
      api_key: "sk-xxx",
      anon_key: "eyJabc",
      access_token: "t",
      password: "hunter2",
      authorization: "Bearer x",
      cookie: "session=...",
    });
    const r = lastLog();
    expect(r.user_id).toBe("u1");
    expect(r.api_key).toBe("[redacted]");
    expect(r.anon_key).toBe("[redacted]");
    expect(r.access_token).toBe("[redacted]");
    expect(r.password).toBe("[redacted]");
    expect(r.authorization).toBe("[redacted]");
    expect(r.cookie).toBe("[redacted]");
  });

  it("truncates long strings with a marker", () => {
    const log = createLogger("test");
    const longText = "x".repeat(500);
    log.info("prompt", { body: longText });
    const r = lastLog();
    expect(typeof r.body).toBe("string");
    expect((r.body as string).length).toBeLessThan(longText.length);
    expect(r.body).toMatch(/truncated, 500 chars/);
  });

  it("redacts nested sensitive keys", () => {
    const log = createLogger("test");
    log.info("nested", { request: { headers: { authorization: "Bearer abc" } } });
    const r = lastLog();
    expect((r.request as { headers: { authorization: string } }).headers.authorization).toBe("[redacted]");
  });

  it("serialises Error instances with name + message + stack", () => {
    const log = createLogger("test");
    log.error("boom", { error: new Error("kaboom") });
    const r = lastErr();
    const err = r.error as { name: string; message: string; stack: string };
    expect(err.name).toBe("Error");
    expect(err.message).toBe("kaboom");
    expect(err.stack).toMatch(/Error: kaboom/);
  });

  it("sends warn and error to stderr", () => {
    const log = createLogger("test");
    log.warn("careful");
    log.error("bad");
    expect(errSpy).toHaveBeenCalledTimes(2);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("respects LOG_LEVEL=warn and drops debug/info", () => {
    process.env.LOG_LEVEL = "warn";
    const log = createLogger("test");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    expect(logSpy).not.toHaveBeenCalled();
    expect(errSpy).toHaveBeenCalledTimes(2);
  });

  it("child appends to namespace with a dot separator", () => {
    const log = createLogger("voice").child("rpc");
    log.info("call");
    expect(lastLog().ns).toBe("voice.rpc");
  });
});

describe("timed", () => {
  it("logs ok with duration_ms on success", async () => {
    const log = createLogger("test");
    const result = await timed(log, "do_work", async () => 42, { user_id: "u1" });
    expect(result).toBe(42);
    const r = lastLog();
    expect(r.msg).toBe("do_work ok");
    expect(typeof r.duration_ms).toBe("number");
    expect(r.user_id).toBe("u1");
  });

  it("logs error and rethrows on failure", async () => {
    const log = createLogger("test");
    await expect(
      timed(log, "do_work", async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow(/nope/);
    const r = lastErr();
    expect(r.msg).toBe("do_work failed");
    expect((r.error as { message: string }).message).toBe("nope");
  });
});
