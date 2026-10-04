import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import { getBrandingConfig } from "@/config/branding";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/features/settings/ThemeProvider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { PwaReadiness } from "@/components/pwa/PwaReadiness";
import "./globals.css";

// Runs before hydration so a pinned light/dark choice applies on first
// paint instead of flashing the OS-preference theme for a frame.
const THEME_INIT_SCRIPT = `
try {
  var t = localStorage.getItem("stockpadi-theme");
  if (t === "light" || t === "dark") {
    document.documentElement.setAttribute("data-theme", t);
  } else {
    document.documentElement.removeAttribute("data-theme");
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

const googleSansFlex = localFont({
  src: "./fonts/google-sans-flex-latin.woff2",
  variable: "--font-google-sans-flex",
  display: "swap",
  adjustFontFallback: "Arial",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const branding = getBrandingConfig();

// Guard against an empty / malformed NEXT_PUBLIC_APP_URL during `next build`.
// new URL('') throws TypeError: Invalid URL which breaks /_not-found config
// collection. The localhost fallback mirrors what getAppUrl() already documents
// as its own build-time safety net.
function safeMetadataBase(url: string): URL {
  try {
    return new URL(url);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: safeMetadataBase(branding.appUrl),
  title: {
    default: `${branding.businessName} | Free Offline POS & Inventory App`,
    template: `%s | ${branding.businessName}`,
  },
  description:
    `${branding.businessName} is the free, offline-first point of sale and inventory management app for retail stores. Track sales, record customer debts, manage stock, and share WhatsApp receipts with zero internet required.`,
  keywords: [
    branding.businessName,
    "offline POS app",
    "inventory management",
    "point of sale software",
    "retail POS Nigeria",
    "customer credit book",
    "shop ledger",
    "free POS software",
    "store inventory tracker",
  ],
  authors: [{ name: branding.businessName }],
  applicationName: branding.businessName,
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: branding.logoUrl ?? "/icon.svg", type: "image/svg+xml" },
      { url: branding.logoUrl ?? "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: branding.logoUrl ?? "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: branding.logoUrl ?? "/icon.svg" }],
    apple: [{ url: branding.logoUrl ?? "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121516" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  // Virtual keyboard resizes content so form input fields and modals
  // remain cleanly within the field of view instead of being covered or obstructed.
  interactiveWidget: "resizes-content",
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
      className={`${googleSansFlex.variable} ${geistMono.variable} h-full antialiased`}
      style={{
        "--color-brand-accent": branding.accentColor,
        "--brand-accent-configured": branding.accentColor,
      } as React.CSSProperties}
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
      <body className="min-h-full flex flex-col bg-surface text-on-surface">
        <ThemeProvider>
          <ServiceWorkerRegister />
          <PwaReadiness />
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
