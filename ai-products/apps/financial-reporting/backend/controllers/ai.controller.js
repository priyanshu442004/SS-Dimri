import { processAndSendSummary } from "../services/aiService.js";
import fs from "fs";
import path from "path";

export const checkUploadStatus = async (req, res) => {
    try {
        const uploadPath = path.join(process.cwd(), "uploads");
        if (!fs.existsSync(uploadPath)) {
            return res.status(200).json({ exists: false });
        }
        const files = fs.readdirSync(uploadPath);
        res.status(200).json({ exists: files.length > 0 });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const uploadTrialBalance = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: "No file uploaded" });
        }
        res.status(200).json({ 
            success: true, 
            message: "File uploaded successfully for AI analysis.",
            filename: req.file.filename 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const handleSummaryReport = async (req, res) => {


    try {
        const result = await processAndSendSummary();
        res.status(200).json({
            success: true,
            message: "Summary report processed and sent to AI engine.",
            data: result.webhookResponse
        });
    } catch (error) {
        console.error("AI Controller Error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to process summary report.",
            error: error.message
        });
    }
};
