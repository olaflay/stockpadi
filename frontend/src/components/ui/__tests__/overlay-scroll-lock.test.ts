// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { acquireOverlayScrollLock } from "../overlay-scroll-lock";

describe("overlay scroll locking", () => {
  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("preserves the previous body overflow value", () => {
    document.body.style.overflow = "scroll";
    const release = acquireOverlayScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    release();
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("does not unlock while a nested overlay remains active", () => {
    const releaseFirst = acquireOverlayScrollLock();
    const releaseSecond = acquireOverlayScrollLock();
    releaseFirst();
    expect(document.body.style.overflow).toBe("hidden");
    releaseSecond();
    expect(document.body.style.overflow).toBe("");
  });
});
