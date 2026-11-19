import fs from "fs";
import  {processExcelFiles} from '../services/excelProcessor.js';
import { dataStore } from "../services/dataStore.js";

export const processFiles = async (req, res) => {
  try {
    const files = req.files;

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    const rows = await processExcelFiles(files);

    for (const file of files) {
      fs.unlink(file.path, err => {
        if (err) console.error("Failed to delete:", file.path, err);
      });
    }

     if (rows.length === 0) {
      return res.json({ extracted: false });
    }

    dataStore.extracted = [];
    dataStore.extracted = rows;
    return res.json({
      extracted: true,
      records: rows.length
    });
  } catch (error) {
    console.error(error);
    return res.json({ extracted: false });
  }
};