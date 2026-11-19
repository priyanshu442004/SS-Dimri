import express from "express";
import { verifyToken } from "../middleware/auth.js";
import pool from "../config/database.js";


const router = express.Router();

// Get User Analytics
router.get('/:userId', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.uid !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }

    // Total documents
    const totalDocsResult = await pool.query(
      `SELECT COUNT(*) FROM documents WHERE user_id = $1`,
      [userId]
    );
    const totalDocuments = parseInt(totalDocsResult.rows[0].count);

    // Today's files
    const todayResult = await pool.query(
      `SELECT COUNT(*) FROM documents 
       WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE`,
      [userId]
    );
    const todayFiles = parseInt(todayResult.rows[0].count);

    // Average processing time
    const avgTimeResult = await pool.query(
      `SELECT AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at))) as avg_time
       FROM documents 
       WHERE user_id = $1 AND processing_status = 'completed'`,
      [userId]
    );
    const avgProcessingTime = parseFloat(avgTimeResult.rows[0]?.avg_time || 0) / 1000; // Convert to seconds

    // Success rate
    const successRateResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE processing_status = 'completed') as completed,
        COUNT(*) as total
       FROM documents 
       WHERE user_id = $1`,
      [userId]
    );
    const successRate = successRateResult.rows[0].total > 0
      ? (successRateResult.rows[0].completed / successRateResult.rows[0].total * 100).toFixed(1)
      : 0;

    // Documents by type
    const byTypeResult = await pool.query(
      `SELECT document_type, COUNT(*) as count
       FROM documents 
       WHERE user_id = $1
       GROUP BY document_type`,
      [userId]
    );
    const documentsByType = {};
    byTypeResult.rows.forEach(row => {
      documentsByType[row.document_type] = parseInt(row.count);
    });

    // Recent activity
    const recentResult = await pool.query(
      `SELECT document_id, original_filename, processing_status, created_at
       FROM documents 
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      analytics: {
        total_documents: totalDocuments,
        today_files: todayFiles,
        avg_processing_time: avgProcessingTime,
        success_rate: parseFloat(successRate),
        documents_by_type: documentsByType,
        recent_activity: recentResult.rows
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get analytics'
    });
  }
});

export default router;


