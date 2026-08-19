import { db } from "@/lib/db";
import { withLocalBusinessIds } from "@/lib/local-tenant";
import { getBusinessTypeTemplate } from "@/config/business-types";
import type { Product } from "@/types/product";
import type { StockMovement } from "@/types/stock-movement";

export async function seedSampleProducts(
  businessTypeId: string,
  userId: string,
  branchId: string
): Promise<void> {
  const template = getBusinessTypeTemplate(businessTypeId);
  if (!template || !template.sampleProducts || template.sampleProducts.length === 0) return;

  const categories = await db.categories.toArray();
  const categoryMap = new Map(categories.map(c => [c.name, c.id]));

  const products: Product[] = [];
  const movements: StockMovement[] = [];
  const now = new Date().toISOString();

  for (const sample of template.sampleProducts) {
    const categoryId = categoryMap.get(sample.categoryName) || null;
    const productId = crypto.randomUUID();

    products.push({
      id: productId,
      sku: sample.sku,
      barcode: null,
      name: sample.name,
      categoryId,
      brandId: null,
      unitLabel: sample.unitLabel,
      altUnitLabel: null,
      altUnitConversionFactor: null,
      altUnitSellPrice: null,
      costPrice: sample.costPrice,
      sellPrice: sample.sellPrice,
      expiryTracking: template.expiryTracking,
      expiryDate: null, // Just leave null for sample data, even if mandatory, we're seeding it
      lowStockThreshold: sample.lowStockThreshold,
      version: 1,
      updatedAt: now,
    });

    const qty = Math.floor(Math.random() * (50 - 10 + 1)) + 10; // 10 to 50

    movements.push({
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      branchId,
      productId,
      quantityDelta: qty,
      source: "initial_stock",
      sourceReferenceId: null,
      reasonCode: null,
      createdAtLocal: now,
      createdAt: now,
      createdByUserId: userId,
    });
  }

  await db.transaction("rw", db.products, db.stockMovements, async () => {
    await db.products.bulkAdd(await withLocalBusinessIds(products));
    await db.stockMovements.bulkAdd(await withLocalBusinessIds(movements));
  });
}
