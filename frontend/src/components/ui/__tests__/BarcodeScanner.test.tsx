// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarcodeScanner } from "../BarcodeScanner";

vi.mock("@zxing/library", () => ({
  BarcodeFormat: {
    EAN_13: "EAN_13", EAN_8: "EAN_8", UPC_A: "UPC_A", UPC_E: "UPC_E",
    CODE_128: "CODE_128", CODE_39: "CODE_39", ITF: "ITF", CODABAR: "CODABAR", QR_CODE: "QR_CODE",
  },
  BrowserMultiFormatReader: class {
    timeBetweenDecodingAttempts = 0;
    decodeFromConstraints() { return Promise.resolve(); }
    reset() {}
  },
  ChecksumException: class extends Error {},
  DecodeHintType: { POSSIBLE_FORMATS: "POSSIBLE_FORMATS" },
  FormatException: class extends Error {},
  NotFoundException: class extends Error {},
}));

describe("BarcodeScanner", () => {
  afterEach(cleanup);

  it("offers a visible, context-labelled back action that returns to the calling screen", () => {
    const onCancel = vi.fn();
    render(
      <BarcodeScanner
        onResult={vi.fn()}
        onCancel={onCancel}
        backLabel="Back to products"
      />
    );

    const backButton = screen.getByRole("button", { name: "Back to products" });
    expect(backButton).toHaveTextContent("Back to products");
    expect(backButton.closest(".fixed")?.parentElement).toBe(document.body);
    fireEvent.click(backButton);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("owns focus while open, handles Escape, and restores the scan trigger", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Scan";
    document.body.appendChild(trigger);
    trigger.focus();
    const onCancel = vi.fn();
    const { unmount } = render(<BarcodeScanner onResult={vi.fn()} onCancel={onCancel} />);
    const backButton = screen.getByRole("button", { name: "Back" });

    await waitFor(() => expect(backButton).toHaveFocus());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
