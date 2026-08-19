/**
 * Business-type templates: PRD Section 7.1. Sets sensible onboarding
 * defaults, not hard restrictions — an owner can change any of these after
 * setup. Adding a new vertical means adding an entry here, never a new
 * `if (businessType === 'x')` branch in feature code.
 * See .agents/skills/add-business-type-template.md before editing this file.
 */

import type { ExpiryTrackingMode } from "@/types/product";

export interface SampleProductDef {
  name: string;
  sku: string;
  categoryName: string;
  unitLabel: string;
  costPrice: number;
  sellPrice: number;
  lowStockThreshold: number;
}

export interface BusinessTypeTemplate {
  id: string;
  label: string;
  defaultCategories: string[];
  sampleProducts: SampleProductDef[];
  expiryTracking: ExpiryTrackingMode;
  notes: string;
}

export const BUSINESS_TYPE_TEMPLATES: BusinessTypeTemplate[] = [
  {
    id: "grocery_supermarket",
    label: "Grocery / Supermarket",
    defaultCategories: ["Food", "Household", "Beverages"],
    sampleProducts: [
      { name: "Rice (5kg)", sku: "GROC-001", categoryName: "Food", unitLabel: "bag", costPrice: 4000, sellPrice: 4500, lowStockThreshold: 5 },
      { name: "Whole Milk (1L)", sku: "GROC-002", categoryName: "Beverages", unitLabel: "carton", costPrice: 1200, sellPrice: 1500, lowStockThreshold: 10 },
      { name: "Detergent (1kg)", sku: "GROC-003", categoryName: "Household", unitLabel: "pack", costPrice: 800, sellPrice: 1000, lowStockThreshold: 15 },
    ],
    expiryTracking: "optional",
    notes: "High SKU count expected.",
  },
  {
    id: "pharmacy_fmcg",
    label: "Pharmacy / FMCG",
    defaultCategories: ["Medicine", "Personal Care"],
    sampleProducts: [
      { name: "Paracetamol 500mg", sku: "PHAR-001", categoryName: "Medicine", unitLabel: "pack", costPrice: 200, sellPrice: 300, lowStockThreshold: 20 },
      { name: "Vitamin C 1000mg", sku: "PHAR-002", categoryName: "Medicine", unitLabel: "bottle", costPrice: 1500, sellPrice: 2000, lowStockThreshold: 10 },
      { name: "Hand Sanitizer (500ml)", sku: "PHAR-003", categoryName: "Personal Care", unitLabel: "bottle", costPrice: 800, sellPrice: 1200, lowStockThreshold: 5 },
    ],
    expiryTracking: "mandatory",
    notes: "Regulatory pressure around expired stock; expiry date required per batch.",
  },
  {
    id: "electronics_accessories",
    label: "Electronics / Accessories",
    defaultCategories: ["Devices", "Accessories", "Parts"],
    sampleProducts: [
      { name: "Wireless Earbuds", sku: "ELEC-001", categoryName: "Accessories", unitLabel: "piece", costPrice: 8000, sellPrice: 12000, lowStockThreshold: 5 },
      { name: "USB-C Fast Charger", sku: "ELEC-002", categoryName: "Accessories", unitLabel: "piece", costPrice: 2500, sellPrice: 4000, lowStockThreshold: 15 },
      { name: "Screen Protector", sku: "ELEC-003", categoryName: "Parts", unitLabel: "piece", costPrice: 500, sellPrice: 1500, lowStockThreshold: 30 },
    ],
    expiryTracking: "off",
    notes: "Serial number field is more relevant than batch/expiry.",
  },
  {
    id: "general_retail",
    label: "General Retail",
    defaultCategories: ["General"],
    sampleProducts: [
      { name: "Notebook A5", sku: "GEN-001", categoryName: "General", unitLabel: "piece", costPrice: 400, sellPrice: 600, lowStockThreshold: 20 },
      { name: "Ballpoint Pen (Blue)", sku: "GEN-002", categoryName: "General", unitLabel: "piece", costPrice: 50, sellPrice: 100, lowStockThreshold: 50 },
      { name: "Packing Tape", sku: "GEN-003", categoryName: "General", unitLabel: "roll", costPrice: 300, sellPrice: 500, lowStockThreshold: 10 },
    ],
    expiryTracking: "off",
    notes: "Fallback for anything not matching the other templates; owner defines categories.",
  },
];

export function getBusinessTypeTemplate(id: string): BusinessTypeTemplate | undefined {
  return BUSINESS_TYPE_TEMPLATES.find((template) => template.id === id);
}
