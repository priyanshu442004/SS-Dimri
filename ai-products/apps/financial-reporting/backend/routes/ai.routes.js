import express from "express";
import multer from "multer";
import { handleSummaryReport, checkUploadStatus, uploadTrialBalance } from "../controllers/ai.controller.js";

import { ask, summary } from "../services/assistant.js";

const router = express.Router();

// AI summary report for the dashboard (cached per trial balance; ?refresh=1 regenerates)
router.get("/summary", async (req, res) => {
  try {
    res.json(await summary({ refresh: req.query.refresh === "1" }));
  } catch (e) {
    if (e.message === "NO_TB") return res.json({ empty: true, message: "Upload a trial balance to generate the AI summary report." });
    console.error("summary:", e.response?.data || e.message);
    res.status(502).json({ error: "The AI summary couldn't be generated right now. Please try again." });
  }
});

// Q&A over the current trial balance's statements (DeepSeek)
router.post("/assistant", express.json({ limit: "1mb" }), async (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Ask a question." });
  try {
    const reply = await ask(question.slice(0, 4000), Array.isArray(req.body?.history) ? req.body.history : []);
    res.json({ reply: reply || "I couldn't produce an answer — please rephrase the question." });
  } catch (e) {
    if (e.message === "NO_TB") return res.status(409).json({ error: "Upload a trial balance first — the assistant answers from the statements generated from it." });
    console.error("assistant:", e.response?.data || e.message);
    res.status(502).json({ error: "The AI service didn't respond. Please try again." });
  }
});

const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});
const upload = multer({ storage });

router.get("/status", checkUploadStatus);
router.post("/upload", upload.single("file"), uploadTrialBalance);
router.post("/send-summary", handleSummaryReport);



export default router;
