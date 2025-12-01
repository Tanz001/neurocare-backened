import express from "express";
import {
  getUsers,
  updateUserStatus,
  updateUser,
  deleteUser,
  getDoctors,
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  getDoctorDocuments,
  setDoctorDocumentStatus,
  getAppointmentsAdmin,
  getAppointmentOverview,
  updateAppointmentStatusAdmin,
  getTransactions,
  createTransaction,
  getDashboardOverview,
  getDashboardMetrics,
} from "../controllers/adminController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { isAdmin } from "../middlewares/roleMiddleware.js";

const router = express.Router();
const adminOnly = [authMiddleware, isAdmin];

// Dashboard routes
router.get("/dashboard/overview", adminOnly, getDashboardOverview);
router.get("/dashboard/metrics", adminOnly, getDashboardMetrics);

// User management routes
router.get("/users", adminOnly, getUsers);
router.patch("/users/:userId/status", adminOnly, updateUserStatus);
router.put("/users/:userId", adminOnly, updateUser);
router.delete("/users/:userId", adminOnly, deleteUser);

// Doctor management routes
router.get("/doctors", adminOnly, getDoctors);
router.get("/doctors/:doctorId", adminOnly, getDoctorById);
router.put("/doctors/:doctorId", adminOnly, updateDoctor);
router.delete("/doctors/:doctorId", adminOnly, deleteDoctor);

// Doctor documents routes
router.get("/doctor-documents", adminOnly, getDoctorDocuments);
router.patch("/doctor-documents/:documentId/status", adminOnly, setDoctorDocumentStatus);

// Appointment routes
router.get("/appointments", adminOnly, getAppointmentsAdmin);
router.get("/appointments/overview", adminOnly, getAppointmentOverview);
router.patch("/appointments/:appointmentId/status", adminOnly, updateAppointmentStatusAdmin);

// Transaction routes
router.get("/transactions", adminOnly, getTransactions);
router.post("/transactions", adminOnly, createTransaction);

export default router;

