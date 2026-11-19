import express from "express";
import { downloadFinancialStatements } from "../controllers/downloadFinancialStatements.js";

const router = express.Router();


router.get("/download-financials", downloadFinancialStatements);

export default router;
