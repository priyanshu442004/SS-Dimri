import XLSX from "xlsx-js-style";
import { generateBSData, generatePLData, generateTBsummary } from "./financialServiceDownload.js";
import fs from "fs";
import path from "path";
import axios from "axios";

/**
 * Generates a comprehensive financial workbook and sends it to the RAG webhook.
 * Includes: TB, TB Summary, Notes to Accounts, BS, and PL.
 */
export const processAndSendSummary = async () => {
    try {
        const uploadPath = path.join(process.cwd(), "uploads");
        const files = fs.readdirSync(uploadPath);

        if (!files.length) {
            throw new Error("No files found in uploads folder to process.");
        }

        // Get the latest file uploaded for the AI module
        const latestFile = files
            .map(file => ({
                name: file,
                time: fs.statSync(path.join(uploadPath, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time)[0].name;

        const filePath = path.join(uploadPath, latestFile);

        // Generate data using the robust financial services
        const plData = await generatePLData(filePath);
        const bsData = await generateBSData(filePath);
        const tbData = await generateTBsummary(filePath);

        const workbook = XLSX.utils.book_new();

        // 1. TRIAL BALANCE SHEET (Raw classified accounts)
        const tbSheet = XLSX.utils.json_to_sheet(tbData.tb || []);
        XLSX.utils.book_append_sheet(workbook, tbSheet, "Trial Balance");

        // 2. TB SUMMARY SHEET
        // High-level summary of classifications
        const summaryMap = {};
        (tbData.tb || []).forEach(row => {
            const head = row.balanceSheetHead || "Other";
            if (!summaryMap[head]) summaryMap[head] = { Head: head, Opening: 0, Closing: 0 };
            summaryMap[head].Opening += Number(row.netOpeningBalance) || 0;
            summaryMap[head].Closing += Number(row.netClsBalance) || 0;
        });
        const summarySheet = XLSX.utils.json_to_sheet(Object.values(summaryMap));
        XLSX.utils.book_append_sheet(workbook, summarySheet, "TB Summary");

        // 3. BALANCE SHEET SHEET
        // Extract meaningful data from BS service
        const bsRows = Object.entries(bsData.notes || {}).map(([note, data]) => ({
            Note: note,
            Title: data.title,
            Opening: data.totalOpening || 0,
            Closing: data.totalClosing || 0
        }));
        const bsSheet = XLSX.utils.json_to_sheet(bsRows);
        XLSX.utils.book_append_sheet(workbook, bsSheet, "Balance Sheet");

        // 4. PROFIT & LOSS SHEET
        const plRows = Object.entries(plData.notes || {}).map(([note, data]) => ({
            Note: note,
            Title: data.title || `Note ${note}`,
            Opening: data.opening || 0,
            Closing: data.closing || 0
        }));
        const plSheet = XLSX.utils.json_to_sheet(plRows);
        XLSX.utils.book_append_sheet(workbook, plSheet, "Profit and Loss");

        // 5. NOTES TO ACCOUNTS (Consolidated)
        // We'll combine BS notes and PL notes into a single descriptive sheet for the AI
        const allNotes = [];
        Object.entries(bsData.notes || {}).forEach(([note, data]) => {
            allNotes.push({ Note: `BS-${note}`, Description: data.title, Opening: data.totalOpening, Closing: data.totalClosing });
        });
        Object.entries(plData.notes || {}).forEach(([note, data]) => {
            allNotes.push({ Note: `PL-${note}`, Description: data.title || `Note ${note}`, Opening: data.opening, Closing: data.closing });
        });
        const notesSheet = XLSX.utils.json_to_sheet(allNotes);
        XLSX.utils.book_append_sheet(workbook, notesSheet, "Notes to Accounts");

        // Write to buffer
        const buffer = XLSX.write(workbook, {
            type: "buffer",
            bookType: "xlsx",
        });

        // Send to RAG Webhook
        const formData = new FormData();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        formData.append('file', blob, 'Comprehensive_Financial_Report.xlsx');

        const response = await axios.post("https://n8n.srv982383.hstgr.cloud/webhook/ai-eldeco-rag-process", formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        return { success: true, webhookResponse: response.data };
    } catch (error) {
        console.error("AI Service Error:", error);
        throw error;
    }
};
