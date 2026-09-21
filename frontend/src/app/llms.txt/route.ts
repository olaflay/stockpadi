import { NextResponse } from "next/server";
import { getBrandingConfig } from "@/config/branding";

export async function GET() {
  const branding = getBrandingConfig();
  const siteUrl = branding.appUrl || process.env.NEXT_PUBLIC_SITE_URL || "";

  const content = `# ${branding.businessName} — Offline-First Retail Point of Sale & Inventory PWA

> ${branding.businessName} is an offline-first point of sale (POS) and inventory management web application built for retail businesses (groceries, pharmacies, electronics, and general retail stores).

## Key Features
- 100% Offline Point of Sale: Record sales, handle split payments, and calculate change without internet connection.
- Ledger-Based Inventory: Stock quantities and customer debt balances are calculated strictly from an append-only transaction ledger (stock_movements).
- Multi-Unit Support: Sell products by base unit or alt unit with automatic stock conversions.
- Customer Credit & Debt Ledger: Keep track of customer debt balances, partial repayments, and credit limits.
- Instant WhatsApp Receipts: Generate and share digital receipts with customers over WhatsApp with 1 tap.
- Wireless Bluetooth Printing: Direct ESC/POS printing for 58mm and 80mm thermal receipt printers.
- Multi-Tenant & Branch Support: Multi-tenant shared database architecture supporting 1 to 6 branches per business profile.

## Technology Stack
- Next.js (App Router PWA) + TypeScript + React
- Dexie.js (IndexedDB local offline storage)
- Workbox Service Worker (Background Sync)
- Supabase (PostgreSQL, Auth, Realtime, Row Level Security)
- Vercel Hosting

## Primary Target Audience
Retail shop owners, supermarkets, neighborhood grocers, pharmacies, and merchants operating on low-end mobile devices or weak network conditions across Nigeria and West Africa.

## Contact & Website
- Website: ${siteUrl || "Configured via NEXT_PUBLIC_SITE_URL"}
`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
