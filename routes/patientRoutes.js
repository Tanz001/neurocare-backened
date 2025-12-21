import express from "express";
import {
  getBestDoctorFromTriage,
  getAllDoctors,
  getDoctorById,
  createAppointment,
  getMyAppointments,
  getAppointmentDetails,
  cancelAppointment,
  submitReview,
  getDashboardMetrics,
  checkReviewExists,
} from "../controllers/patientController.js";
import {
  getMyPurchases,
  getMyWallet,
} from "../controllers/productController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { isPatient } from "../middlewares/roleMiddleware.js";

const router = express.Router();
const patientOnly = [authMiddleware, isPatient];

/**
 * @swagger
 * tags:
 *   name: Patients
 *   description: Patient-related API endpoints
 */

/**
 * @swagger
 * /noauth/triage/best-doctor:
 *   post:
 *     summary: Get best doctor based on triage answers (No Auth Required)
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - answers
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [physical, psychological, nutritional]
 *                 description: Array of answers from triage questions
 *     responses:
 *       200:
 *         description: Best doctor found successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: No doctor found for the speciality
 */
router.post("/noauth/triage/best-doctor", getBestDoctorFromTriage);

/**
 * @swagger
 * /noauth/doctors/{doctorId}:
 *   get:
 *     summary: Get doctor profile (No Auth Required)
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Doctor details fetched
 */
router.get("/noauth/doctors/:doctorId", getDoctorById);

/**
 * @swagger
 * /patient/doctors:
 *   get:
 *     summary: List active doctors
 *     tags: [Patients]
 *     parameters:
 *       - in: query
 *         name: speciality
 *         schema:
 *           type: string
 *         description: Optional speciality filter (exact match)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by doctor name or education
 *     responses:
 *       200:
 *         description: Doctors fetched successfully
 */
router.get("/doctors", patientOnly, getAllDoctors);

/**
 * @swagger
 * /patient/doctors/{doctorId}:
 *   get:
 *     summary: Get doctor profile with schedule, education, experience and reviews
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Doctor details fetched
 */
router.get("/doctors/:doctorId", patientOnly, getDoctorById);

/**
 * @swagger
 * /patient/appointments:
 *   post:
 *     summary: Create a new appointment request
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctor_id
 *               - appointment_date
 *               - appointment_time
 *               - appointment_for
 *             properties:
 *               doctor_id:
 *                 type: integer
 *               appointment_date:
 *                 type: string
 *                 format: date
 *               appointment_time:
 *                 type: string
 *                 example: "14:30"
 *               appointment_for:
 *                 type: string
 *               reason:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment submitted for approval
 */
router.post("/appointments", patientOnly, createAppointment);

/**
 * @swagger
 * /patient/appointments:
 *   get:
 *     summary: List patient appointments
 *     tags: [Patients]
 *     responses:
 *       200:
 *         description: Appointments retrieved
 */
router.get("/appointments", patientOnly, getMyAppointments);

/**
 * @swagger
 * /patient/appointments/{appointmentId}:
 *   get:
 *     summary: Get appointment detail with doctor info
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment detail retrieved
 */
router.get("/appointments/:appointmentId", patientOnly, getAppointmentDetails);

/**
 * @swagger
 * /patient/appointments/{appointmentId}/cancel:
 *   put:
 *     summary: Cancel a pending or accepted appointment
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment cancelled
 */
router.put("/appointments/:appointmentId/cancel", patientOnly, cancelAppointment);

/**
 * @swagger
 * /patient/reviews:
 *   post:
 *     summary: Submit a review for a completed appointment
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctor_id
 *               - appointment_id
 *               - rating
 *             properties:
 *               doctor_id:
 *                 type: integer
 *               appointment_id:
 *                 type: integer
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               comment:
 *                 type: string
 *     responses:
 *       201:
 *         description: Review submitted
 */
router.post("/reviews", patientOnly, submitReview);

/**
 * @swagger
 * /patient/dashboard/metrics:
 *   get:
 *     summary: Get patient dashboard metrics
 *     tags: [Patients]
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved
 */
router.get("/dashboard/metrics", patientOnly, getDashboardMetrics);

/**
 * @swagger
 * /patient/appointments/{appointmentId}/review:
 *   get:
 *     summary: Check if review exists for an appointment
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Review status retrieved
 */
router.get("/appointments/:appointmentId/review", patientOnly, checkReviewExists);

/**
 * @swagger
 * /patient/purchases:
 *   get:
 *     summary: Get patient's purchases
 *     tags: [Patients]
 *     responses:
 *       200:
 *         description: Purchases fetched successfully
 */
router.get("/purchases", patientOnly, getMyPurchases);

/**
 * @swagger
 * /patient/wallet:
 *   get:
 *     summary: Get patient's service wallet (available sessions)
 *     tags: [Patients]
 *     responses:
 *       200:
 *         description: Wallet fetched successfully
 */
router.get("/wallet", patientOnly, getMyWallet);

export default router;
