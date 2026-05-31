import { describe, expect, it } from "vitest";

import { parseCsv, parseCsvRows } from "./csv";

describe("parseCsvRows", () => {
  it("splits simple rows and columns", () => {
    expect(parseCsvRows("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps commas inside quoted fields", () => {
    expect(parseCsvRows('a,b\n"x, y",z')).toEqual([
      ["a", "b"],
      ["x, y", "z"],
    ]);
  });

  it("handles escaped quotes and newlines inside quotes", () => {
    const out = parseCsvRows('h\n"line1\nline2 ""q"""');
    expect(out).toEqual([["h"], ['line1\nline2 "q"']]);
  });

  it("tolerates CRLF line endings", () => {
    expect(parseCsvRows("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("strips a leading UTF-8 BOM", () => {
    expect(parseCsvRows("﻿a,b\n1,2")[0]).toEqual(["a", "b"]);
  });
});

describe("parseCsv", () => {
  it("maps each data row to an object keyed by header", () => {
    const rows = parseCsv("Email,6B. DMs received\nA@B.com,7 DMs");
    expect(rows).toEqual([{ Email: "A@B.com", "6B. DMs received": "7 DMs" }]);
  });

  it("trims header names but not values", () => {
    const rows = parseCsv(" Email , Note \nx@y.com,  hi  ");
    expect(Object.keys(rows[0])).toEqual(["Email", "Note"]);
    expect(rows[0].Note).toBe("  hi  ");
  });

  it("skips fully blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n3,4")).toHaveLength(2);
  });

  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});
