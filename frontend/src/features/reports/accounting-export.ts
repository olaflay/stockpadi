import type { AccountingExport } from "./accounting-workbook";

export async function exportAccountingWorkbook(input: AccountingExport): Promise<Blob> {
  if (typeof Worker === "undefined") {
    return (await import("./accounting-workbook")).buildAccountingWorkbook(input);
  }

  const worker = new Worker(new URL("./accounting-export.worker.ts", import.meta.url));
  try {
    return await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<{ blob?: Blob }>) => {
        if (data.blob) resolve(data.blob);
        else reject(new Error("Could not create the workbook"));
      };
      worker.onerror = () => reject(new Error("Could not start the workbook export"));
      worker.onmessageerror = () => reject(new Error("Could not read the workbook"));
      worker.postMessage(input);
    });
  } finally {
    worker.terminate();
  }
}
