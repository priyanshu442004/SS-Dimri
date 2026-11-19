import express from 'express';
import admin from 'firebase-admin';


const router = express.Router();

// Verify token endpoint (for testing)
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token required'
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    
    res.json({
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token'
    });
  }
});

export default router;


