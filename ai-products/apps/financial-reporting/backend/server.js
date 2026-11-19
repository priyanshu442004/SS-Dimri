import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.js";
import documentRoutes from "./routes/documents.js";
import userRoutes from "./routes/users.js";
import analyticsRoutes from "./routes/analytics.js";
import supportRoutes from "./routes/support.js";
import trialBalanceRoutes from "./routes/trialBalance.routes.js";
import notesRoutes from "./routes/notesRoutes.js";
import morgan from "morgan"
import downloadRoutes from "./routes/download.route.js";


import uploadRoutes from "./routes/upload.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import mailRoutes from "./routes/mail.routes.js";
import { activityMiddleware, activitySummary } from "./services/activity.js";



dotenv.config();
const app = express();
// Behind nginx: trust the first proxy so rate-limit/IP logging see the real client IP
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
app.use(morgan('dev'))

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['http://localhost:5173','http://localhost:5174','http://98.88.32.88',"https://salesmis.analytx4t.com","https://aiproducts.analytx4t.com","https://officeerp.analytx4t.com","http://localhost:3000","http://localhost:8088"],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});



// Routes
app.use(activityMiddleware);
app.get('/api/activity', (req, res) => res.json(activitySummary()));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/support', supportRoutes);

app.use('/api/v1/upload', uploadRoutes);

app.use('/api/trial-balance', trialBalanceRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/download', downloadRoutes);
app.use('/api/ai', aiRoutes);
app.use("/api/mail", mailRoutes);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

app.listen(PORT, process.env.HOST || "0.0.0.0", () => {
  console.log(`🚀 Trial Balance API running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;


