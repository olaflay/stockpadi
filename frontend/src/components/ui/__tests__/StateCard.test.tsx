// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NoResultsState } from "../NoResultsState";
import { EmptyState } from "../EmptyState";
import { ErrorState } from "../ErrorState";
import { PermissionDenied } from "../PermissionDenied";
import { Package } from "lucide-react";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  usePathname: () => "/products",
}));

afterEach(() => {
  cleanup();
});

describe("StateCard standardisation", () => {
  // .agents/rules/design-system.md locks one shared layout for every state
  // view: max-w-sm container, 56px tonal icon circle, title-lg heading,
  // body description, and standardised primary/secondary actions.
  const EXPECTED_CONTAINER = "max-w-sm";
  const EXPECTED_ICON_CIRCLE = "h-14 w-14";
  const EXPECTED_TITLE = "text-[length:var(--font-size-title-lg)]";
  const EXPECTED_BODY = "text-[length:var(--font-size-body)]";

  function expectSharedLayout(container: HTMLElement) {
    expect(container.className).toContain(EXPECTED_CONTAINER);
    // The 56px tonal icon circle is a child of the card, not the card itself.
    const iconCircle = container.querySelector("div[class*='rounded-full']");
    expect(iconCircle?.className).toContain(EXPECTED_ICON_CIRCLE);
    // The heading and body are children of the card too.
    const heading = container.querySelector("p[class*='font-size-title-lg']");
    expect(heading?.className).toContain(EXPECTED_TITLE);
    const body = container.querySelector("div[class*='font-size-body']");
    expect(body?.className).toContain(EXPECTED_BODY);
  }

  it("gives NoResultsState the shared layout and status role", () => {
    const { container } = render(<NoResultsState query="mango" />);
    const card = container.firstElementChild as HTMLElement;
    expectSharedLayout(card);
    expect(card.getAttribute("role")).toBe("status");
  });

  it("gives EmptyState the shared layout and status role", () => {
    const { container } = render(
      <EmptyState icon={Package} title="Add your first product" description="Start tracking stock." />
    );
    const card = container.firstElementChild as HTMLElement;
    expectSharedLayout(card);
    expect(card.getAttribute("role")).toBe("status");
  });

  it("gives ErrorState the shared layout and an alert role", () => {
    const { container } = render(
      <ErrorState message="Could not load products." onRetry={() => {}} />
    );
    const card = container.firstElementChild as HTMLElement;
    expectSharedLayout(card);
    expect(card.getAttribute("role")).toBe("alert");
  });

  it("gives PermissionDenied the shared layout and status role", () => {
    const { container } = render(
      <PermissionDenied requiredCapabilities={["MANAGE_PRODUCTS"]} />
    );
    const card = container.firstElementChild as HTMLElement;
    expectSharedLayout(card);
    expect(card.getAttribute("role")).toBe("status");
  });
});

describe("StateCard action and role propagation", () => {
  afterEach(() => {
    cleanup();
  });

  it("propagates href action as RippleLink with id and secondaryAction with href", () => {
    render(
      <EmptyState
        title="No items"
        description="Add one to get started."
        action={{ label: "Add product", href: "/products/new", id: "add-prod-btn" }}
      />
    );
    const primaryLink = screen.getByRole("link", { name: "Add product" });
    expect(primaryLink).toHaveAttribute("href", "/products/new");
    expect(primaryLink).toHaveAttribute("id", "add-prod-btn");
  });

  it("propagates onClick action as RippleButton", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="No items"
        description="Add one to get started."
        action={{ label: "Retry", onClick }}
      />
    );
    const button = screen.getByRole("button", { name: "Retry" });
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("ErrorState invokes onRetry and links to dashboard", () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Failed to load" onRetry={onRetry} />);

    const retryBtn = screen.getByRole("button", { name: /try again/i });
    retryBtn.click();
    expect(onRetry).toHaveBeenCalledTimes(1);

    const dashboardLink = screen.getByRole("link", { name: /return to dashboard/i });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  it("PermissionDenied formats required capabilities and navigates to dashboard on click", async () => {
    mockPush.mockClear();
    render(<PermissionDenied requiredCapabilities={["MANAGE_PRODUCTS", "VIEW_PRODUCTS"]} />);

    expect(screen.getByText(/manage products or view products/i)).toBeInTheDocument();

    const dashboardBtn = screen.getByRole("button", { name: /go to dashboard/i });
    dashboardBtn.click();
    expect(mockPush).toHaveBeenCalledWith("/dashboard");

    const switchAccountLink = screen.getByRole("link", { name: /switch account/i });
    expect(switchAccountLink).toHaveAttribute("href", "/login");
  });

  it("PermissionDenied formats required account type and multiple account types", () => {
    const { unmount } = render(<PermissionDenied requiredAccountType="BUSINESS_OWNER" />);
    expect(screen.getByText("Business Owner")).toBeInTheDocument();
    unmount();

    render(<PermissionDenied requiredAccountTypes={["ADMIN", "BUSINESS_OWNER"]} />);
    expect(screen.getByText(/Admin or Business Owner/i)).toBeInTheDocument();
  });
});

describe("NoResultsState create action", () => {
  afterEach(() => {
    cleanup();
  });

  // Regression: the card used to hardcode a "Create <query>" product CTA on
  // every screen that used it, so Contacts offered to create a product.
  it("renders no create action when the caller does not supply one", () => {
    render(<NoResultsState query="mango" />);
    expect(screen.queryByRole("button", { name: /create/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /create/i })).not.toBeInTheDocument();
  });

  it("renders the caller's create action with the caller's label", () => {
    render(
      <NoResultsState
        query="mango"
        entityLabel="contacts"
        action={{ label: "Add contact", onClick: () => {} }}
      />
    );
    expect(screen.getByRole("button", { name: "Add contact" })).toBeInTheDocument();
    expect(screen.queryByText(/create/i)).not.toBeInTheDocument();
  });

  it("names the searched entity in the description", () => {
    render(<NoResultsState query="mango" entityLabel="contacts" />);
    expect(screen.getByText(/all contacts/i)).toBeInTheDocument();
  });

  it("offers a clear-filter action only when the caller supplies one", () => {
    const { unmount } = render(<NoResultsState query="mango" />);
    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
    unmount();

    const onClear = vi.fn();
    render(<NoResultsState query="mango" onClear={onClear} />);
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
  });
});
