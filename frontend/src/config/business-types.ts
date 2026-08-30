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
    id: "retail",
    label: "Retail",
    defaultCategories: ["Foodstuffs", "Beverages", "Household", "Snacks"],
    sampleProducts: [
      { name: "Rice 5kg Bag", sku: "RET-001", categoryName: "Foodstuffs", unitLabel: "bag", costPrice: 4500, sellPrice: 5500, lowStockThreshold: 5 },
      { name: "Indomie Super Pack", sku: "RET-002", categoryName: "Foodstuffs", unitLabel: "carton", costPrice: 10500, sellPrice: 12500, lowStockThreshold: 10 },
      { name: "Whole Milk 1L", sku: "RET-003", categoryName: "Beverages", unitLabel: "pack", costPrice: 1400, sellPrice: 1800, lowStockThreshold: 15 },
    ],
    expiryTracking: "optional",
    notes: "Provisions, supermarkets, drinks, and everyday store goods.",
  },
  {
    id: "fashion",
    label: "Fashion",
    defaultCategories: ["Clothing", "Footwear", "Bags", "Accessories"],
    sampleProducts: [
      { name: "Cotton T-Shirt", sku: "FASH-001", categoryName: "Clothing", unitLabel: "piece", costPrice: 4500, sellPrice: 8000, lowStockThreshold: 5 },
      { name: "Denim Jeans", sku: "FASH-002", categoryName: "Clothing", unitLabel: "piece", costPrice: 8000, sellPrice: 14000, lowStockThreshold: 5 },
      { name: "Leather Sneakers", sku: "FASH-003", categoryName: "Footwear", unitLabel: "pair", costPrice: 12000, sellPrice: 20000, lowStockThreshold: 3 },
    ],
    expiryTracking: "off",
    notes: "Clothes, bags, shoes, jewelry, fabrics, and accessories.",
  },
  {
    id: "health",
    label: "Health",
    defaultCategories: ["Medicines", "Supplements", "First Aid", "Personal Care"],
    sampleProducts: [
      { name: "Paracetamol 500mg", sku: "HLTH-001", categoryName: "Medicines", unitLabel: "pack", costPrice: 200, sellPrice: 350, lowStockThreshold: 20 },
      { name: "Vitamin C 1000mg", sku: "HLTH-002", categoryName: "Supplements", unitLabel: "bottle", costPrice: 1800, sellPrice: 2500, lowStockThreshold: 10 },
      { name: "Hand Sanitizer 500ml", sku: "HLTH-003", categoryName: "First Aid", unitLabel: "bottle", costPrice: 800, sellPrice: 1200, lowStockThreshold: 5 },
    ],
    expiryTracking: "mandatory",
    notes: "Pharmacies, chemists, patent medicine, and first aid.",
  },
  {
    id: "beauty",
    label: "Beauty",
    defaultCategories: ["Skincare", "Makeup", "Hair", "Fragrances"],
    sampleProducts: [
      { name: "Facial Cleanser", sku: "BEAU-001", categoryName: "Skincare", unitLabel: "bottle", costPrice: 4000, sellPrice: 6500, lowStockThreshold: 5 },
      { name: "Matte Liquid Lipstick", sku: "BEAU-002", categoryName: "Makeup", unitLabel: "piece", costPrice: 2200, sellPrice: 4000, lowStockThreshold: 10 },
      { name: "Body Mist 250ml", sku: "BEAU-003", categoryName: "Fragrances", unitLabel: "bottle", costPrice: 5000, sellPrice: 8000, lowStockThreshold: 5 },
    ],
    expiryTracking: "optional",
    notes: "Skincare, makeup, cosmetics, wigs, hair, and perfumes.",
  },
  {
    id: "gadgets",
    label: "Gadgets",
    defaultCategories: ["Phones", "Audio", "Accessories", "Parts"],
    sampleProducts: [
      { name: "20W Fast Charger", sku: "GDT-001", categoryName: "Accessories", unitLabel: "piece", costPrice: 3500, sellPrice: 6000, lowStockThreshold: 10 },
      { name: "Wireless Earbuds", sku: "GDT-002", categoryName: "Audio", unitLabel: "piece", costPrice: 7000, sellPrice: 12000, lowStockThreshold: 5 },
      { name: "Fast Type-C Cable", sku: "GDT-003", categoryName: "Accessories", unitLabel: "piece", costPrice: 1000, sellPrice: 2000, lowStockThreshold: 20 },
    ],
    expiryTracking: "off",
    notes: "Phones, chargers, audio, electronics, and device accessories.",
  },
  {
    id: "materials",
    label: "Materials",
    defaultCategories: ["Auto Parts", "Electricals", "Building", "Tools"],
    sampleProducts: [
      { name: "Brake Pads Set", sku: "MAT-001", categoryName: "Auto Parts", unitLabel: "set", costPrice: 8000, sellPrice: 12000, lowStockThreshold: 5 },
      { name: "2.5mm Cable Coil", sku: "MAT-002", categoryName: "Electricals", unitLabel: "roll", costPrice: 22000, sellPrice: 28000, lowStockThreshold: 3 },
      { name: "Portland Cement 50kg", sku: "MAT-003", categoryName: "Building", unitLabel: "bag", costPrice: 7500, sellPrice: 8500, lowStockThreshold: 20 },
    ],
    expiryTracking: "off",
    notes: "Building supplies, auto spare parts, electricals, and tools.",
  },
];

const LEGACY_ID_MAP: Record<string, string> = {
  grocery_supermarket: "retail",
  pharmacy_fmcg: "health",
  electronics_accessories: "gadgets",
  general_retail: "retail",
};

export function getBusinessTypeTemplate(id: string): BusinessTypeTemplate | undefined {
  const normalizedId = LEGACY_ID_MAP[id] || id;
  return BUSINESS_TYPE_TEMPLATES.find((template) => template.id === normalizedId);
}
