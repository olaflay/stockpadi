import { expect, test } from "@playwright/test";
import { Workbook } from "exceljs";
import { readFile } from "node:fs/promises";
import { seedLocalOwner } from "./local-owner";

test("downloads real Excel workbooks with intact identifiers and recorded sales amounts", async ({ page }, testInfo) => {
  await seedLocalOwner(page);
  await page.goto("/settings/data");
  await expect(page.getByLabel("Export format")).toHaveValue("xlsx");
  const productsDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Products", exact: true }).click();
  const productsFile = await productsDownload;
  expect(productsFile.suggestedFilename()).toMatch(/^products-.*\.xlsx$/);
  const products = new Workbook();
  await products.xlsx.readFile((await productsFile.path())!);
  const catalog = products.getWorksheet("Products")!;
  expect(catalog.getCell("D2").value).toBe("000012345678901234");
  expect(catalog.getCell("F2").value).toBe(150);
  expect(catalog.views[0].state).toBe("frozen");

  const salesDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sales this month" }).click();
  const salesFile = await salesDownload;
  expect(salesFile.suggestedFilename()).toMatch(/^sales-.*\.xlsx$/);
  const sales = new Workbook();
  await sales.xlsx.readFile((await salesFile.path())!);
  const register = sales.getWorksheet("Sales")!;
  const lines = sales.getWorksheet("Sale items")!;
  expect(register.getCell("A2").value).toBe("fixture-sale");
  expect(register.getCell("B2").value).toBeInstanceOf(Date);
  expect(register.getCell("G2").value).toBe(250);
  expect(register.getCell("H2").value).toBe(250);
  expect(lines.getCell("C2").value).toBe("Sale-time item name");
  expect(lines.getCell("J2").value).toBe(250);
  await salesFile.saveAs(testInfo.outputPath("sales.xlsx"));
});

test("downloads portrait PDF and image receipts and uses one back button", async ({ page }, testInfo) => {
  await seedLocalOwner(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "share", { value: undefined, configurable: true }));
  await page.goto("/sales/fixture-sale/share");
  const back = page.getByRole("button", { name: "Go back" });
  await expect(back).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Share receipt" })).toHaveCount(1);
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share PDF" }).click();
  const pdfFile = await pdfDownload;
  const pdf = await readFile((await pdfFile.path())!, "latin1");
  const dimensions = /\/MediaBox\s*\[0\s+0\s+([\d.]+)\s+([\d.]+)\]/.exec(pdf);
  expect(dimensions).not.toBeNull();
  expect(Number(dimensions![1])).toBeCloseTo(226.77, 1);
  expect(Number(dimensions![2])).toBeGreaterThan(Number(dimensions![1]));
  await pdfFile.saveAs(testInfo.outputPath("receipt.pdf"));

  const imageDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share image" }).click();
  const imageFile = await imageDownload;
  const bytes = await readFile((await imageFile.path())!);
  const ratio = await page.evaluate(async (data) => {
    const image = await createImageBitmap(new Blob([Uint8Array.from(data)], { type: "image/jpeg" }));
    return image.height / image.width;
  }, [...bytes]);
  expect(ratio).toBeGreaterThan(1);

  await back.click();
  await expect(page).toHaveURL(/\/sales\/fixture-sale$/);
});
