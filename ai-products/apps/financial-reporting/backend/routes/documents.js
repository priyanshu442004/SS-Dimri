import express from "express";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";

import { verifyToken } from "../middleware/auth.js";
import pool from "../config/database.js";
import {
  uploadToS3,
  getSignedUrl,
  deleteFromS3,
} from "../config/s3.js";
import { processDocument } from "../services/documentProcessor.js";


const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/csv',
      'image/jpeg',
      'image/png'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: PDF, Excel, Word (DOC/DOCX), CSV, JPG, PNG'));
    }
  }
});

// Upload Document
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const { document_type } = req.body;
    const userId = req.user.uid;
    const documentId = uuidv4();
    
    // Generate S3 key
    const fileExtension = req.file.originalname.split('.').pop();
    const s3Key = `uploads/${userId}/${documentId}/original.${fileExtension}`;

    // Upload to S3
    const uploadResult = await uploadToS3(req.file, s3Key, req.file.mimetype);

    // Save to database
    const result = await pool.query(
      `INSERT INTO documents (
        document_id, user_id, original_filename, file_type, 
        file_size, storage_path, document_type, processing_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        documentId,
        userId,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        s3Key,
        document_type || 'unknown',
        'pending'
      ]
    );

    // Queue processing job (async)
    processDocument(documentId).catch(console.error);

    res.status(201).json({
      success: true,
      document: {
        document_id: documentId,
        filename: req.file.originalname,
        file_size: req.file.size,
        status: 'pending',
        uploaded_at: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload document'
    });
  }
});

// Get Document Status
router.get('/:documentId/status', verifyToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.uid;

    const result = await pool.query(
      `SELECT 
        document_id, processing_status, 
        processing_started_at, processing_completed_at,
        error_message, created_at
      FROM documents 
      WHERE document_id = $1 AND user_id = $2`,
      [documentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    const doc = result.rows[0];
    
    // Calculate progress (mock - replace with actual progress tracking)
    let progress = 0;
    let currentStep = 'Waiting';
    
    if (doc.processing_status === 'completed') {
      progress = 100;
      currentStep = 'Completed';
    } else if (doc.processing_status === 'processing') {
      progress = 50; // Mock progress
      currentStep = 'Processing';
    }

    res.json({
      success: true,
      document_id: documentId,
      status: doc.processing_status,
      progress,
      current_step: currentStep,
      uploaded_at: doc.created_at
    });
  } catch (error) {
    console.error('Status error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get document status'
    });
  }
});

// Get Document Results
router.get('/:documentId/results', verifyToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.uid;

    // Get document
    const docResult = await pool.query(
      `SELECT * FROM documents 
      WHERE document_id = $1 AND user_id = $2`,
      [documentId, userId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    const doc = docResult.rows[0];

    if (doc.processing_status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Document processing not completed'
      });
    }

    // Get processing results
    const resultsResult = await pool.query(
      `SELECT * FROM processing_results 
      WHERE document_id = $1`,
      [documentId]
    );

    if (resultsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Processing results not found'
      });
    }

    const results = resultsResult.rows[0];

    // Generate signed URLs for output files
    const outputFiles = {};
    if (results.output_files) {
      const files = JSON.parse(results.output_files);
      for (const [format, key] of Object.entries(files)) {
        outputFiles[format] = await getSignedUrl(key, 3600); // 1 hour expiry
      }
    }

    res.json({
      success: true,
      document_id: documentId,
      extracted_data: results.extracted_data ? JSON.parse(results.extracted_data) : null,
      insights: results.insights ? JSON.parse(results.insights) : null,
      summary_stats: results.summary_stats ? JSON.parse(results.summary_stats) : null,
      anomalies: results.anomalies ? JSON.parse(results.anomalies) : null,
      output_files: outputFiles,
      processed_at: results.created_at
    });
  } catch (error) {
    console.error('Results error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get document results'
    });
  }
});

// Get User Documents (History)
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (page - 1) * limit;

    let query = `SELECT 
      document_id, original_filename, file_type, file_size,
      document_type, processing_status, created_at, processing_completed_at
    FROM documents 
    WHERE user_id = $1`;
    const params = [userId];
    let paramCount = 1;

    if (status) {
      paramCount++;
      query += ` AND processing_status = $${paramCount}`;
      params.push(status);
    }

    if (search) {
      paramCount++;
      query += ` AND original_filename ILIKE $${paramCount}`;
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM documents WHERE user_id = $1`,
      [userId]
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      documents: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        total_pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get document history'
    });
  }
});

// Download Document
router.get('/:documentId/download', verifyToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const { format = 'pdf' } = req.query;
    const userId = req.user.uid;

    // Verify document ownership
    const docResult = await pool.query(
      `SELECT * FROM documents WHERE document_id = $1 AND user_id = $2`,
      [documentId, userId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    // Get processing results
    const resultsResult = await pool.query(
      `SELECT output_files FROM processing_results WHERE document_id = $1`,
      [documentId]
    );

    if (resultsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Output files not found'
      });
    }

    const outputFiles = JSON.parse(resultsResult.rows[0].output_files);
    const fileKey = outputFiles[format];

    if (!fileKey) {
      return res.status(400).json({
        success: false,
        error: `Format ${format} not available`
      });
    }

    // Generate signed URL
    const signedUrl = await getSignedUrl(fileKey, 3600);

    res.json({
      success: true,
      download_url: signedUrl,
      expires_in: 3600
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate download URL'
    });
  }
});

// Delete Document
router.delete('/:documentId', verifyToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const userId = req.user.uid;

    // Get document
    const docResult = await pool.query(
      `SELECT storage_path FROM documents 
      WHERE document_id = $1 AND user_id = $2`,
      [documentId, userId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    const storagePath = docResult.rows[0].storage_path;

    // Delete from S3
    await deleteFromS3(storagePath);

    // Delete from database (cascade will handle related records)
    await pool.query(
      `DELETE FROM documents WHERE document_id = $1 AND user_id = $2`,
      [documentId, userId]
    );

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete document'
    });
  }
});

export default router;


