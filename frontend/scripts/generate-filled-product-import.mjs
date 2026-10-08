import ExcelJS from "exceljs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve(process.cwd(), "../docs/products-import-filled.xlsx");
const headers = ["name", "sku", "barcode", "costPrice", "sellPrice", "unitLabel", "lowStockThreshold", "expiryTracking", "expiryDate", "initialStock"];
const products = [
  ["Rice 5kg", "RICE-5KG", "6900001000001", 3800, 4500, "bag", 10, "off", "", 25],
  ["Tomato Paste 210g", "TOMATO-210G", "6900001000002", 120, 180, "tin", 12, "off", "", 40],
  ["Vegetable Oil 1L", "OIL-1L", "6900001000003", 1800, 2200, "bottle", 8, "off", "", 20],
  ["Spaghetti 500g", "SPAG-500G", "6900001000004", 750, 950, "pack", 10, "off", "", 30],
  ["Instant Noodles Chicken 120g", "NOODLE-CHICKEN", "6900001000005", 110, 150, "pack", 20, "off", "", 60],
  ["Sugar 1kg", "SUGAR-1KG", "6900001000006", 1400, 1700, "bag", 10, "off", "", 25],
  ["Salt 1kg", "SALT-1KG", "6900001000007", 500, 700, "bag", 8, "off", "", 20],
  ["Flour 2kg", "FLOUR-2KG", "6900001000008", 2200, 2600, "bag", 6, "off", "", 15],
  ["Beans 1kg", "BEANS-1KG", "6900001000009", 1800, 2300, "bag", 10, "off", "", 18],
  ["Garri 1kg", "GARRI-1KG", "6900001000010", 1200, 1500, "bag", 10, "off", "", 22],
  ["Milk Powder 400g", "MILK-400G", "6900001000011", 2600, 3200, "pack", 5, "off", "", 12],
  ["Tea 25 Bags", "TEA-25BAG", "6900001000012", 1800, 2300, "box", 4, "off", "", 10],
  ["Milo 500g", "MILO-500G", "6900001000013", 4800, 5500, "tin", 4, "off", "", 8],
  ["Corn Flakes 500g", "CORNFLAKE-500G", "6900001000014", 3500, 4200, "box", 4, "off", "", 10],
  ["Sardines 155g", "SARDINE-155G", "6900001000015", 1100, 1400, "tin", 8, "off", "", 15],
  ["Custard 500g", "CUSTARD-500G", "6900001000016", 1900, 2400, "pack", 5, "off", "", 12],
  ["Detergent Powder 1kg", "DETERGENT-1KG", "6900001000017", 2800, 3400, "pack", 6, "off", "", 14],
  ["Bath Soap 90g", "BATHSOAP-90G", "6900001000018", 450, 650, "bar", 12, "off", "", 36],
  ["Toothpaste 140g", "TOOTHPASTE-140G", "6900001000019", 1300, 1650, "tube", 6, "off", "", 15],
  ["Toilet Tissue 4 Roll", "TISSUE-4ROLL", "6900001000020", 1600, 2000, "pack", 6, "off", "", 18],
  ["Dishwashing Liquid 750ml", "DISHWASH-750ML", "6900001000021", 1800, 2300, "bottle", 5, "off", "", 10],
  ["Bottled Water 75cl", "WATER-75CL", "6900001000022", 180, 250, "bottle", 24, "off", "", 96],
  ["Soft Drink Cola 50cl", "COLA-50CL", "6900001000023", 400, 550, "bottle", 24, "off", "", 72],
  ["Biscuits 100g", "BISCUIT-100G", "6900001000024", 350, 500, "pack", 12, "off", "", 40],
  ["USB-C Phone Charger", "CHARGER-USBC", "6900001000025", 4500, 6000, "piece", 2, "off", "", 6],
];

function styleHeader(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0A6E4D" } };
    cell.alignment = { vertical: "middle" };
  });
}

const workbook = new ExcelJS.Workbook();
workbook.creator = "StockPadi";
const productsSheet = workbook.addWorksheet("Products");
styleHeader(productsSheet.addRow(headers));
products.forEach((product) => productsSheet.addRow(product));
productsSheet.columns = [
  { width: 28 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 },
  { width: 14 }, { width: 20 }, { width: 18 }, { width: 16 }, { width: 16 },
];
productsSheet.views = [{ state: "frozen", ySplit: 1 }];
productsSheet.autoFilter = { from: "A1", to: "J1" };
for (let row = 2; row <= products.length + 1; row += 1) {
  productsSheet.getCell(`D${row}`).numFmt = "#,##0.00";
  productsSheet.getCell(`E${row}`).numFmt = "#,##0.00";
  productsSheet.getCell(`G${row}`).numFmt = "0";
  productsSheet.getCell(`J${row}`).numFmt = "0";
}

const totalUnits = products.reduce((sum, product) => sum + product[9], 0);
const totalCostValue = products.reduce((sum, product) => sum + product[3] * product[9], 0);
const totalRetailValue = products.reduce((sum, product) => sum + product[4] * product[9], 0);
const totalsSheet = workbook.addWorksheet("Totals");
styleHeader(totalsSheet.addRow(["metric", "value"]));
totalsSheet.addRows([
  ["products", products.length],
  ["opening stock units", totalUnits],
  ["opening stock cost value", totalCostValue],
  ["opening stock retail value", totalRetailValue],
  ["potential gross profit", totalRetailValue - totalCostValue],
]);
totalsSheet.columns = [{ width: 30 }, { width: 24 }];
totalsSheet.getColumn(2).numFmt = "#,##0.00";
totalsSheet.getCell("B2").numFmt = "0";
totalsSheet.getCell("B3").numFmt = "0";
totalsSheet.getCell("A8").value = "Upload note";
totalsSheet.getCell("B8").value = "The app imports the Products sheet. Totals are for checking only.";

await mkdir(path.dirname(outputPath), { recursive: true });
await workbook.xlsx.writeFile(outputPath);
console.log(JSON.stringify({ outputPath, products: products.length, totalUnits, totalCostValue, totalRetailValue, potentialGrossProfit: totalRetailValue - totalCostValue }));
