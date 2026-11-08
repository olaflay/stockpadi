// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("replaces an indefinite loading screen with recovery actions when local storage stalls or fails", async () => {
    resolveStartupDestination.mockRejectedValue(new Error("LOCAL_WORKSPACE_TIMEOUT"));
    render(<Home />);

    expect(await screen.findByText("Your saved workspace did not open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair and continue" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open recovery help" })).toBeInTheDocument();
  });

  it("performs recovery before rerouting instead of repeating the timeout loop", async () => {
    resolveStartupDestination.mockRejectedValueOnce(new Error("LOCAL_WORKSPACE_TIMEOUT")).mockResolvedValue("/dashboard");
    recoverStartupWorkspace.mockResolvedValue(true);
    render(<Home />);

    const repair = await screen.findByRole("button", { name: "Repair and continue" });
    fireEvent.click(repair);

    expect(recoverStartupWorkspace).toHaveBeenCalledOnce();
    await waitFor(() => expect(resolveStartupDestination.mock.calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows a terminal cross-tab instruction when repair cannot release the database", async () => {
    resolveStartupDestination.mockRejectedValue(new Error("LOCAL_WORKSPACE_TIMEOUT"));
    recoverStartupWorkspace.mockResolvedValue(false);
    render(<Home />);

    fireEvent.click(await screen.findByRole("button", { name: "Repair and continue" }));

    expect(await screen.findByText("Another app tab is still using saved data")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Repair and continue" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload after closing tabs" })).toBeInTheDocument();
  });
});
