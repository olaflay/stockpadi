import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GeistMono } from "geist/font/mono";
import { getBrandingConfig } from "@/config/branding";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/features/settings/ThemeProvider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { PwaReadiness } from "@/components/pwa/PwaReadiness";
import { InstallBanner } from "@/components/ui/InstallBanner";
import { SplashScreen } from "@/components/pwa/SplashScreen";
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
try {
  if (typeof window !== "undefined" && typeof window.crypto !== "undefined" && !window.crypto.randomUUID) {
    window.crypto.randomUUID = function() {
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
        var r = (Math.random() * 16) | 0;
        var v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    };
  }
} catch (e) {}
`;

const SPLASH_STYLE = `
  html, body {
    background-color: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    html, body {
      background-color: #121516;
    }
  }
  :root[data-theme="dark"], :root[data-theme="dark"] body {
    background-color: #121516;
  }
  #splash{
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:var(--splash-bg,transparent);
    opacity:1;transition:opacity .35s cubic-bezier(.4,0,.2,1);
  }
  #splash.is-leaving{opacity:0;pointer-events:none}
  #splash svg{width:min(52vw,200px);height:auto;overflow:visible}
  #splash svg *{transform-box:fill-box;transform-origin:center}

  #splash .tile{animation:splash-tile .7s cubic-bezier(.16,1,.3,1) both}
  #splash .loop{stroke-dasharray:100;animation:splash-draw 1s .3s cubic-bezier(.65,0,.35,1) both}
  #splash .arc{stroke-dasharray:100;animation:splash-draw .6s .9s cubic-bezier(.65,0,.35,1) both}
  #splash .node{animation:splash-in .5s 1.15s cubic-bezier(.16,1,.3,1) both}
  #splash .sun{animation:splash-in .55s 1.3s cubic-bezier(.16,1,.3,1) both}
  #splash .sun-core{animation:splash-in .45s 1.4s cubic-bezier(.16,1,.3,1) both}

  @keyframes splash-tile{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:none}}
  @keyframes splash-draw{from{stroke-dashoffset:100;opacity:0}1%{opacity:1}to{stroke-dashoffset:0;opacity:1}}
  @keyframes splash-in{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:none}}

  @media (prefers-reduced-motion:reduce){
    #splash *{animation:none!important}
    #splash{transition-duration:.01s}
  }
`;

const SPLASH_FAILSAFE_SCRIPT = `setTimeout(function(){var s=document.getElementById('splash');if(s)s.remove()},10000);`;

const googleSansFlex = localFont({
  src: "./fonts/google-sans-flex-latin.woff2",
  variable: "--font-google-sans-flex",
  display: "swap",
  adjustFontFallback: "Arial",
});

// GeistMono from 'geist/font/mono' is a pre-instantiated NextFontWithVariable —
// the font files are bundled locally in the package, so no network call is made
// at build time. This fixes the /_not-found CI build failure caused by the
// Google Fonts TCP connection being reset in the GitHub Actions runner.
const geistMono = GeistMono;

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
    startupImage: [
      {
        url: "/apple-splash-1170x2532.png",
        media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/apple-splash-1290x2796.png",
        media: "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/apple-splash-1179x2556.png",
        media: "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)",
      },
      {
        url: "/apple-splash-750x1334.png",
        media: "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)",
      },
      {
        url: "/apple-splash.png",
      },
    ],
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
        <style dangerouslySetInnerHTML={{ __html: SPLASH_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: UUID_POLYFILL_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD_SCHEMA) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-surface text-on-surface">
        <div id="splash" role="status" aria-label="Loading">
          <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="sp-bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#0b7a55"/><stop offset="100%" stopColor="#044730"/></linearGradient>
              <linearGradient id="sp-lp" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#ffffff"/><stop offset="100%" stopColor="#d1fae5"/></linearGradient>
              <linearGradient id="sp-ac" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#f59e0b"/></linearGradient>
            </defs>
            <g className="tile">
              <rect width="512" height="512" rx="112" fill="url(#sp-bg)"/>
              <rect x="24" y="24" width="464" height="464" rx="88" stroke="#fff" strokeOpacity={0.14} strokeWidth="4"/>
            </g>
            <path className="loop" pathLength={100} d="M256 148C194.144 148 144 198.144 144 260C144 321.856 194.144 372 256 372C317.856 372 368 321.856 368 260C368 227.156 353.844 197.62 331.258 177.2" stroke="url(#sp-lp)" strokeWidth="42" strokeLinecap="round"/>
            <path className="arc" pathLength={100} d="M208 260C208 233.49 229.49 212 256 212C282.51 212 304 233.49 304 260C304 286.51 282.51 308 256 308" stroke="#fff" strokeOpacity={0.4} strokeWidth="18" strokeLinecap="round"/>
            <circle className="node" cx="256" cy="260" r="22" fill="#fff"/>
            <circle className="sun" cx="348" cy="154" r="24" fill="url(#sp-ac)"/>
            <circle className="sun-core" cx="348" cy="154" r="10" fill="#fff"/>
          </svg>
        </div>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_FAILSAFE_SCRIPT }} />
        <ThemeProvider>
          <SplashScreen />
          <ServiceWorkerRegister />
          <PwaReadiness />
          <InstallBanner />
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
