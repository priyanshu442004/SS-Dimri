import express from "express";
import { body, validationResult } from "express-validator";

import { verifyToken } from "../middleware/auth.js";
import pool from "../config/database.js";


const router = express.Router();

// Get User Settings
router.get('/:userId/settings', verifyToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Verify user can only access their own settings
    if (req.user.uid !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden'
      });
    }

    const result = await pool.query(
      `SELECT * FROM user_settings WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default settings
      await pool.query(
        `INSERT INTO user_settings (user_id, email_notifications, push_notifications, dark_mode)
         VALUES ($1, $2, $3, $4)`,
        [userId, true, true, false]
      );

      return res.json({
        success: true,
        settings: {
          email_notifications: true,
          push_notifications: true,
          dark_mode: false
        }
      });
    }

    res.json({
      success: true,
      settings: result.rows[0]
    });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get settings'
    });
  }
});

// Update User Settings
router.put('/:userId/settings', 
  verifyToken,
  [
    body('email_notifications').optional().isBoolean(),
    body('push_notifications').optional().isBoolean(),
    body('dark_mode').optional().isBoolean(),
    body('preferred_export_format').optional().isIn(['pdf', 'excel', 'json'])
  ],
  async (req, res) => {
    try {
      const { userId } = req.params;
      
      if (req.user.uid !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden'
        });
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { email_notifications, push_notifications, dark_mode, preferred_export_format } = req.body;

      // Check if settings exist
      const existing = await pool.query(
        `SELECT * FROM user_settings WHERE user_id = $1`,
        [userId]
      );

      if (existing.rows.length === 0) {
        // Create new settings
        await pool.query(
          `INSERT INTO user_settings 
           (user_id, email_notifications, push_notifications, dark_mode, preferred_export_format)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, email_notifications, push_notifications, dark_mode, preferred_export_format]
        );
      } else {
        // Update existing settings
        await pool.query(
          `UPDATE user_settings 
           SET email_notifications = COALESCE($1, email_notifications),
               push_notifications = COALESCE($2, push_notifications),
               dark_mode = COALESCE($3, dark_mode),
               preferred_export_format = COALESCE($4, preferred_export_format),
               updated_at = NOW()
           WHERE user_id = $5`,
          [email_notifications, push_notifications, dark_mode, preferred_export_format, userId]
        );
      }

      res.json({
        success: true,
        message: 'Settings updated successfully'
      });
    } catch (error) {
      console.error('Update settings error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update settings'
      });
    }
  }
);

export default router;


