import { describe, expect, it } from "vitest";
import { escapeCsvField, buildProductsCsv, buildSalesCsv } from "../csv-export";
import type { Product } from "@/types/product";
import type { Sale } from "@/types/sale";

describe("escapeCsvField", () => {
  it("returns empty string for null and undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("returns plain numbers and strings unchanged", () => {
    expect(escapeCsvField(123)).toBe("123");
    expect(escapeCsvField("Rice")).toBe("Rice");
  });

  it("escapes fields with commas, quotes, and newlines in double quotes", () => {
    expect(escapeCsvField("Sugar, 1kg")).toBe('"Sugar, 1kg"');
    expect(escapeCsvField('Beans "Oloyin"')).toBe('"Beans ""Oloyin"""');
    expect(escapeCsvField("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
  });
});

describe("buildProductsCsv", () => {
  it("builds a valid CSV with headers and product rows", () => {
    const products: Product[] = [
      {
        id: "prod-1",
        name: "Mama Gold Rice, 50kg",
        sku: "RICE-50",
        barcode: "1234567890",
        costPrice: 40000,
        sellPrice: 45000,
        unitLabel: "bag",
        categoryId: "cat-1",
        brandId: null,
        altUnitLabel: null,
        altUnitConversionFactor: null,
        altUnitSellPrice: null,
        expiryDate: null,
        expiryTracking: "off",
        lowStockThreshold: 5,
        version: 1,
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "prod-2",
        name: 'Salt "Dangote"',
        sku: "SALT-1",
        barcode: null,
        costPrice: 200,
        sellPrice: 300,
        unitLabel: "sachet",
        categoryId: null,
        brandId: null,
        altUnitLabel: null,
        altUnitConversionFactor: null,
        altUnitSellPrice: null,
        expiryDate: null,
        expiryTracking: "optional",
        lowStockThreshold: null,
        version: 1,
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
    ];

    const csv = buildProductsCsv(products);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("ID,Name,SKU,Barcode,Cost Price,Sell Price,Unit,Category ID,Expiry Tracking,Low Stock Threshold");
    expect(lines[1]).toContain('"Mama Gold Rice, 50kg"');
    expect(lines[1]).toContain("RICE-50");
    expect(lines[1]).toContain("45000");
    expect(lines[2]).toContain('"Salt ""Dangote"""');
  });
});

describe("buildSalesCsv", () => {
  const products: Product[] = [
    {
      id: "prod-1",
      name: "Milk",
      sku: "MILK-1",
      barcode: null,
      costPrice: 500,
      sellPrice: 700,
      unitLabel: "tin",
      categoryId: null,
      brandId: null,
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      expiryDate: null,
      expiryTracking: "off",
      lowStockThreshold: null,
      version: 1,
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ];

  it("exports sales with computed net totals and skips voided sales", () => {
    const sales: Sale[] = [
      {
        id: "sale-valid",
        clientId: "cli-valid",
        branchId: "branch-1",
        customerId: "cust-1",
        createdAtLocal: "2026-10-01T10:00:00.000Z",
        createdAt: "2026-10-01T10:00:00.000Z",
        createdByUserId: "user-1",
        subtotal: 1400,
        discount: 200,
        total: 1200,
        voidedAt: null,
        payments: [
          { method: "cash", amount: 1000 },
          { method: "transfer", amount: 200 },
        ],
        items: [
          {
            productId: "prod-1",
            quantity: 2,
            unitPrice: 700,
            discount: 100,
            unitLabel: "tin",
            conversionFactor: 1,
            movementClientId: "mov-1",
          },
        ],
      },
      {
        id: "sale-voided",
        clientId: "cli-voided",
        branchId: "branch-1",
        customerId: null,
        createdAtLocal: "2026-10-01T11:00:00.000Z",
        createdAt: "2026-10-01T11:00:00.000Z",
        createdByUserId: "user-1",
        subtotal: 700,
        discount: 0,
        total: 700,
        voidedAt: "2026-10-01T11:30:00.000Z",
        payments: [{ method: "cash", amount: 700 }],
        items: [
          {
            productId: "prod-1",
            quantity: 1,
            unitPrice: 700,
            discount: 0,
            unitLabel: "tin",
            conversionFactor: 1,
            movementClientId: "mov-2",
          },
        ],
      },
    ];

    const csv = buildSalesCsv(sales, products);
    const lines = csv.split("\n");

    expect(lines).toHaveLength(2); // Header + 1 active sale item (voided sale skipped)
    expect(lines[0]).toBe("Sale ID,Date,Branch ID,Customer ID,Payment Methods,Product Name,SKU,Quantity,Unit Price,Discount,Total");
    
    // Check line content
    const row = lines[1];
    expect(row).toContain("sale-valid");
    expect(row).toContain("cash; transfer");
    expect(row).toContain("Milk");
    expect(row).toContain("1200"); // (700 - 100) * 2 = 1200
    expect(csv).not.toContain("sale-voided");
  });

  it("handles sales with unknown/deleted products gracefully", () => {
    const sales: Sale[] = [
      {
        id: "sale-unknown-prod",
        clientId: "cli-unknown",
        branchId: "branch-1",
        customerId: null,
        createdAtLocal: "2026-10-01T12:00:00.000Z",
        createdAt: "2026-10-01T12:00:00.000Z",
        createdByUserId: "user-1",
        subtotal: 1000,
        discount: 0,
        total: 1000,
        voidedAt: null,
        payments: [{ method: "cash", amount: 1000 }],
        items: [
          {
            productId: "deleted-prod-id",
            quantity: 1,
            unitPrice: 1000,
            discount: 0,
            unitLabel: "item",
            conversionFactor: 1,
            movementClientId: "mov-3",
          },
        ],
      },
    ];

    const csv = buildSalesCsv(sales, []); // Empty products catalog
    expect(csv).toContain("Unknown Product");
    expect(csv).toContain("1000");
  });
});
