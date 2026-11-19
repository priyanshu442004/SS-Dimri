import express from "express";
import multer from "multer";
import { processFiles } from "../controllers/upload.controller.js";
import { processData } from "../controllers/process.controller.js";

const router = express.Router();

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});

const upload = multer({ storage });

router.post("/upload", upload.array("files"), processFiles);

router.post("/process", processData);

export default router;
