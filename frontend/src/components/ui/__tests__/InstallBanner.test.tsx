// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { act, cleanup, render, screen, fireEvent } from "@testing-library/react";
import { InstallBanner } from "../InstallBanner";
import { OPEN_INSTALL_MODAL_EVENT } from "@/lib/pwa-install";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

describe("InstallBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not render before any install event on desktop/android", () => {
    render(<InstallBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders install button when beforeinstallprompt fires on Android/Desktop", () => {
    render(<InstallBanner />);

    act(() => {
      const event = new Event("beforeinstallprompt");
      (event as unknown as { prompt: () => Promise<void> }).prompt = vi.fn().mockResolvedValue(undefined);
      (event as unknown as { userChoice: Promise<{ outcome: string }> }).userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(event);
    });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^install$/i })).toBeInTheDocument();
  });

  it("renders iOS instructions when running on iOS Safari in browser mode", () => {
    // Mock userAgent to iPhone
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    render(<InstallBanner />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/tap/i)).toBeInTheDocument();
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
    // Does not render the programmatic native Install button on iOS
    expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
    // Renders the Instructions button
    expect(screen.getByRole("button", { name: /instructions/i })).toBeInTheDocument();
  });

  it("opens the iOS modal when Instructions button is clicked", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    render(<InstallBanner />);
    const instructionsBtn = screen.getByRole("button", { name: /instructions/i });
    fireEvent.click(instructionsBtn);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Install on your iPhone in 3 simple steps/i)).toBeInTheDocument();
  });

  it("dismisses the banner and remembers the dismissal in localStorage", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    render(<InstallBanner />);
    const dismissBtn = screen.getByRole("button", { name: /dismiss install prompt/i });
    fireEvent.click(dismissBtn);

    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem("stockpadi-install-dismissed-v3")).toBeTruthy();

    // Re-rendering does not show the banner anymore
    cleanup();
    render(<InstallBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("opens the install modal on custom event even if previously dismissed", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );

    render(<InstallBanner />);
    const dismissBtn = screen.getByRole("button", { name: /dismiss install prompt/i });
    fireEvent.click(dismissBtn);
    expect(screen.queryByRole("status")).toBeNull();

    // Programmatically open via custom event
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_INSTALL_MODAL_EVENT));
    });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Install on your iPhone in 3 simple steps/i)).toBeInTheDocument();
  });

  it("does not render on iOS if app is already running in standalone mode", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
    // Mock standalone
    (window.navigator as unknown as { standalone?: boolean }).standalone = true;

    render(<InstallBanner />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
