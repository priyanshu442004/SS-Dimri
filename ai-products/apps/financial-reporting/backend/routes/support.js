import express from "express";
import { v4 as uuidv4 } from "uuid";
import { body, validationResult } from "express-validator";

import { verifyToken } from "../middleware/auth.js";
import pool from "../config/database.js";


const router = express.Router();

// Create Support Ticket
router.post('/contact',
  verifyToken,
  [
    body('subject').notEmpty().withMessage('Subject is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('document_id').optional().isUUID()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { subject, message, document_id } = req.body;
      const userId = req.user.uid;
      const ticketId = uuidv4();

      // Save ticket to database
      await pool.query(
        `INSERT INTO support_tickets 
         (ticket_id, user_id, subject, message, document_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ticketId, userId, subject, message, document_id || null, 'open']
      );

      // TODO: Send email notification to support team
      // TODO: Send confirmation email to user

      res.status(201).json({
        success: true,
        ticket_id: ticketId,
        message: 'Support ticket created successfully'
      });
    } catch (error) {
      console.error('Support ticket error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create support ticket'
      });
    }
  }
);

export default router;


