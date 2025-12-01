import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import db from "./config/db.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import patientRoutes from "./routes/patientRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

// Swagger
import { swaggerDocs } from "./config/swagger.js"; // corrected import path

// Middleware
import { loggerMiddleware, errorLogger } from "./middlewares/loggerMiddleware.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ----------------------
// Middleware
// ----------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger middleware (after body parsers, before routes)
app.use(loggerMiddleware);

// Serve static files (profile images, documents)
app.use("/assets", express.static(path.join(__dirname, "assets")));

// Swagger Documentation
swaggerDocs(app); // setup Swagger using your swaggerDocs function

// ----------------------
// Routes
// ----------------------
app.use("/api/auth", authRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api/admin", adminRoutes);




// Root route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "🏥 NeuroCare Backend is running... Visit /api-docs for API documentation",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found. Please check the API endpoint.",
    path: req.originalUrl,
  });
});

// Error logger middleware
app.use(errorLogger);

// Global error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
});
