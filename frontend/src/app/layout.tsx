import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getBrandingConfig } from "@/config/branding";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/features/settings/ThemeProvider";
import "./globals.css";

// Runs before hydration so a pinned light/dark choice applies on first
// paint instead of flashing the OS-preference theme for a frame.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("stockpadi-theme");
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  }
} catch (e) {}
`;

const UUID_POLYFILL_SCRIPT = `
if (typeof window !== "undefined" && typeof window.crypto !== "undefined" && !window.crypto.randomUUID) {
  window.crypto.randomUUID = function() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
}
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const branding = getBrandingConfig();

export const metadata: Metadata = {
  metadataBase: new URL(branding.appUrl),
  title: {
    default: `${branding.businessName} | Free Offline POS & Inventory App`,
    template: `%s | ${branding.businessName}`,
  },
  description:
    "StockPadi is the free, offline-first point of sale and inventory management app for retail stores. Track sales, record customer debts, manage stock, and share WhatsApp receipts with zero internet required.",
  keywords: [
    "StockPadi",
    "offline POS app",
    "inventory management",
    "point of sale software",
    "retail POS Nigeria",
    "customer credit book",
    "shop ledger",
    "free POS software",
    "store inventory tracker",
  ],
  authors: [{ name: "StockPadi" }],
  applicationName: branding.businessName,
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: branding.logoUrl ?? "/icon.svg", type: "image/svg+xml" }],
    shortcut: [{ url: branding.logoUrl ?? "/icon.svg" }],
    apple: [{ url: branding.logoUrl ?? "/icon.svg" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: branding.businessName,
  },
  openGraph: {
    title: `${branding.businessName} | Free Offline POS & Inventory App`,
    description:
      "Run your retail shop with zero internet. Fast sales, accurate stock tracking, customer debt ledger, and instant WhatsApp receipts.",
    siteName: branding.businessName,
    images: [{ url: branding.logoUrl ?? "/icon.svg", width: 512, height: 512, alt: branding.businessName }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${branding.businessName} | Free Offline POS & Inventory App`,
    description:
      "Run your retail shop with zero internet. Fast sales, accurate stock tracking, and instant WhatsApp receipts.",
    images: [branding.logoUrl ?? "/icon.svg"],
  },
};

export const viewport = {
  themeColor: branding.accentColor,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

const JSON_LD_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: branding.businessName,
  applicationCategory: "BusinessApplication",
  operatingSystem: "All",
  browserRequirements: "Requires JavaScript. Requires HTML5.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "NGN",
  },
  description: "Offline-first point of sale and inventory management software for retail businesses.",
  featureList: [
    "100% Offline Point of Sale",
    "Multi-Unit Stock & Inventory Tracking",
    "Customer Credit & Debt Book",
    "Daily Cash Drawer & Transfer Balancing",
    "1-Tap WhatsApp Receipts & Reminders",
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ "--color-brand-accent": branding.accentColor } as React.CSSProperties}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: UUID_POLYFILL_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SCHEMA) }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
