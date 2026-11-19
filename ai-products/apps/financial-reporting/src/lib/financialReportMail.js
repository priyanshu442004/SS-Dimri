// After a trial balance is uploaded, generate the Balance Sheet and the Profit &
// Loss (the same workbooks as their "Download Excel" buttons) and send them in
// ONE email. Runs in the background; never blocks or breaks the user's flow.
// The server de-duplicates per trial-balance file.
import axios from "axios";
import { apiUrl } from "./apiPath";
import { buildInfraBSWorkbook, buildInfraPLWorkbook } from "../formats/infraStatements";
import { exportSohnaBSToExcel, exportSohnaPLToExcel } from "../utils/sohnaExportUtils";

let inFlight = null;

export function mailFinancialReport() {
  // one run at a time (an upload page may call this twice in StrictMode)
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const [bs, pl] = await Promise.all([
        axios.post(apiUrl("/api/trial-balance/process/BalanceSheet")),
        axios.post(apiUrl("/api/trial-balance/process/PL")),
      ]);
      const sohna = bs.data?.companyType === "SOHNA";
      const [bsFile, plFile] = sohna
        ? await Promise.all([
            exportSohnaBSToExcel(bs.data.data, { download: false }),
            exportSohnaPLToExcel(pl.data.data, { download: false }),
          ])
        : [buildInfraBSWorkbook(bs.data), buildInfraPLWorkbook(pl.data?.data?.dates)];

      const fd = new FormData();
      fd.append("balanceSheet", bsFile.blob, bsFile.fileName);
      fd.append("profitLoss", plFile.blob, plFile.fileName);
      await axios.post(apiUrl("/api/mail/financial-report"), fd);
    } catch (e) {
      console.warn("Financial report email not sent:", e?.response?.data?.message || e.message);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
