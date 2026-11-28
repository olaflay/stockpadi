import { buildAccountingWorkbook, type AccountingExport } from "./accounting-workbook";

globalThis.onmessage = async (event: MessageEvent<AccountingExport>) => {
  try {
    globalThis.postMessage({ blob: await buildAccountingWorkbook(event.data) });
  } catch {
    globalThis.postMessage({ error: true });
  }
};
