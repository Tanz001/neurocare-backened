import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

// Routes
import authRoutes from "./routes/authRoutes.js";
import patientRoutes from "./routes/patientRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import productRoutes from "./routes/productRoutes.js";

// Stripe webhook controller
import { stripeWebhook } from "./controllers/paymentController.js";

// Swagger
import { swaggerDocs } from "./config/swagger.js";

// Middleware
import { loggerMiddleware, errorLogger } from "./middlewares/loggerMiddleware.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* =====================================================
   STRIPE WEBHOOK (RAW BODY - MUST BE FIRST)
===================================================== */
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

/* =====================================================
   GLOBAL MIDDLEWARE
===================================================== */
app.use(cors());
app.use(express.json()); // SAFE now
app.use(express.urlencoded({ extended: true }));

// Logger
app.use(loggerMiddleware);

// Static files
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Swagger
swaggerDocs(app);

/* =====================================================
   ROUTES
===================================================== */
app.use("/api/auth", authRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api", productRoutes);

/* =====================================================
   ROOT
===================================================== */
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🏥 NeuroCare Backend is running... Visit /api-docs for API documentation",
  });
});

/* =====================================================
   404 HANDLER
===================================================== */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found. Please check the API endpoint.",
    path: req.originalUrl,
  });
});

// Error logger
app.use(errorLogger);

// Global error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

/* =====================================================
   START SERVER
===================================================== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
});
