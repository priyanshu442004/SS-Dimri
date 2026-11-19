import express from "express";
import multer from "multer";
import { processNotes } from "../controllers/notes.controller.js";
import { uploadtwo } from "../middleware/upload.js";

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

router.post(
  "/notesToProcess",
uploadtwo.single("file"),
  processNotes
);

export default router;