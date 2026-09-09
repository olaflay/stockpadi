import { describe, expect, it, vi } from "vitest";
import { isPasswordPwned, pwnedPasswordCount } from "@/lib/pwned-passwords";

async function sha1Hex(input: string): Promise<string> {
  const digest = await (globalThis.crypto as Crypto).subtle.digest(
    "SHA-1",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

describe("pwnedPasswordCount", () => {
  it("queries the k-anonymity endpoint and returns the breach count", async () => {
    const fullHash = await sha1Hex("password");
    const prefix = fullHash.slice(0, 5);
    const suffix = fullHash.slice(5);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `AAABBAJ2X7:5\n${suffix}:9876543\nZZZZZZZ1:2\n`,
    });
    vi.stubGlobal("fetch", fetchMock);

    const count = await pwnedPasswordCount("password");

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      expect.objectContaining({
        headers: expect.objectContaining({ "Add-Padding": "true" }),
      })
    );
    expect(count).toBe(9876543);
  });

  it("returns 0 when the suffix is not in the response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "AAAAAAAAAAA:1\nBBBBBBBBBBB:2\n",
      })
    );

    const count = await pwnedPasswordCount("not-in-breaches");

    expect(count).toBe(0);
  });

  it("throws on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 })
    );

    await expect(pwnedPasswordCount("password")).rejects.toThrow("429");
  });
});

describe("isPasswordPwned", () => {
  it("returns true when the password has been breached", async () => {
    const suffix = (await sha1Hex("password")).slice(5);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `${suffix}:128\n`,
      })
    );

    await expect(isPasswordPwned("password")).resolves.toBe(true);
  });

  it("returns false when the password is not breached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: async () => "AAAAAAAAA:1\n" })
    );

    await expect(isPasswordPwned("safe-password")).resolves.toBe(false);
  });

  it("returns false on network errors instead of blocking signup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(isPasswordPwned("password")).resolves.toBe(false);
  });
});