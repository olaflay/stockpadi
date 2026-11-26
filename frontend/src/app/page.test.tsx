// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";

const replace = vi.fn();
const resolveStartupDestination = vi.fn();
const recoverStartupWorkspace = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/features/auth/startup-route", () => ({
  resolveStartupDestination: () => resolveStartupDestination(),
  recoverStartupWorkspace: () => recoverStartupWorkspace(),
  withStartupTimeout: <T,>(operation: Promise<T>) => operation,
  openStartupDestination: (destination: string, replace: (href: string) => void) => replace(destination),
}));

describe("startup recovery screen", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    replace.mockReset();
    resolveStartupDestination.mockReset();
    recoverStartupWorkspace.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    consoleError.mockRestore();
  });

  it("automatically repairs local startup without asking the operator to retry", async () => {
    resolveStartupDestination.mockRejectedValue(new Error("LOCAL_WORKSPACE_TIMEOUT"));
    recoverStartupWorkspace.mockResolvedValue(false);
    render(<Home />);

    await waitFor(() => expect(recoverStartupWorkspace).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Repair and continue" })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("ships a recovery link in the document even before React startup completes", () => {
    resolveStartupDestination.mockReturnValue(new Promise(() => undefined));
    render(<Home />);

    expect(screen.getByText("Recovery help", { selector: "a" })).toHaveAttribute("href", "/offline.html");
    expect(screen.getByText("Try again", { selector: "a" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("status")).toHaveTextContent(/Opening/);
  });

  it("opens the destination once when React replays startup effects", async () => {
    resolveStartupDestination.mockResolvedValue("/dashboard");
    render(<StrictMode><Home /></StrictMode>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
    expect(replace).toHaveBeenCalledOnce();
    expect(resolveStartupDestination).toHaveBeenCalledOnce();
  });

  it("performs recovery before rerouting instead of repeating the timeout loop", async () => {
    resolveStartupDestination.mockRejectedValueOnce(new Error("LOCAL_WORKSPACE_TIMEOUT")).mockResolvedValue("/dashboard");
    recoverStartupWorkspace.mockResolvedValue(true);
    render(<Home />);

    await waitFor(() => expect(recoverStartupWorkspace).toHaveBeenCalledOnce());
    await waitFor(() => expect(resolveStartupDestination.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows a terminal cross-tab instruction when repair cannot release the database", async () => {
    resolveStartupDestination.mockRejectedValue(new Error("LOCAL_WORKSPACE_TIMEOUT"));
    recoverStartupWorkspace.mockResolvedValue(false);
    render(<Home />);

    expect(await screen.findByText("If the app is open elsewhere on this device, close it there and try again.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repair and continue" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

});
