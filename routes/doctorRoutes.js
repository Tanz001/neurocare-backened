import express from "express";
import {
  upsertSchedule,
  getSchedule,
  addEducation,
  getMyEducation,
  updateEducation,
  deleteEducation,
  addExperience,
  getMyExperience,
  updateExperience,
  deleteExperience,
  getDoctorPatients,
  getDoctorPatientDetail,
  getMyAppointments,
  getAppointmentDetails,
  acceptAppointment,
  updateAppointment,
  uploadAppointmentDocument,
  uploadDoctorDocument,
  getMyDocuments,
  deleteDoctorDocument,
  getDashboardMetrics,
  getAppointmentReview,
} from "../controllers/doctorController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { isDoctor } from "../middlewares/roleMiddleware.js";
import { documentUpload, doctorDocumentUpload } from "../middlewares/uploadMiddleware.js";

const router = express.Router();
const doctorOnly = [authMiddleware, isDoctor];

/**
 * @swagger
 * tags:
 *   name: Doctor
 *   description: Doctor related endpoints
 */

/**
 * ----------------------------
 * Schedule Routes
 * ----------------------------
 */

/**
 * @swagger
 * /doctor/schedule:
 *   post:
 *     summary: Create or update weekly schedule
 *     tags: [Doctor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   start:
 *                     type: string
 *                     example: "09:00"
 *                   end:
 *                     type: string
 *                     example: "12:00"
 *             description: Provide one or more weekday keys (monday ... sunday)
 *     responses:
 *       200:
 *         description: Schedule updated
 *       201:
 *         description: Schedule created
 */
router.post("/schedule", doctorOnly, upsertSchedule);

/**
 * @swagger
 * /doctor/schedule:
 *   get:
 *     summary: Get the logged-in doctor's schedule
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Schedule retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 schedule:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     monday:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                             example: "09:00"
 *                           end:
 *                             type: string
 *                             example: "17:00"
 *                     tuesday:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                     wednesday:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                     thursday:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                     friday:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                     saturday:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *                     sunday:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           start:
 *                             type: string
 *                           end:
 *                             type: string
 *       404:
 *         description: Schedule not found
 *       500:
 *         description: Server error
 */
router.get("/schedule", doctorOnly, getSchedule);


/**
 * ----------------------------
 * Education Routes
 * ----------------------------
 */

/**
 * @swagger
 * /doctor/education:
 *   post:
 *     summary: Add education entry
 *     tags: [Doctor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - degree_title
 *               - institution
 *             properties:
 *               degree_title:
 *                 type: string
 *               institution:
 *                 type: string
 *               start_year:
 *                 type: integer
 *               end_year:
 *                 type: integer
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Education added
 */
router.post("/education", doctorOnly, addEducation);

/**
 * @swagger
 * /doctor/education:
 *   get:
 *     summary: List education entries
 *     tags: [Doctor]
 *     responses:
 *       200:
 *         description: Education fetched
 */
router.get("/education", doctorOnly, getMyEducation);

/**
 * @swagger
 * /doctor/education/{educationId}:
 *   put:
 *     summary: Update education entry
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: educationId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Education updated
 */
router.put("/education/:educationId", doctorOnly, updateEducation);

/**
 * @swagger
 * /doctor/education/{educationId}:
 *   delete:
 *     summary: Delete education entry
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: educationId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Education deleted
 */
router.delete("/education/:educationId", doctorOnly, deleteEducation);

/**
 * ----------------------------
 * Experience Routes
 * ----------------------------
 */

/**
 * @swagger
 * /doctor/experience:
 *   post:
 *     summary: Add experience entry
 *     tags: [Doctor]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - job_title
 *               - organization
 *             properties:
 *               job_title:
 *                 type: string
 *               organization:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date
 *               end_date:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Experience added
 */
router.post("/experience", doctorOnly, addExperience);

/**
 * @swagger
 * /doctor/experience:
 *   get:
 *     summary: List experience entries
 *     tags: [Doctor]
 *     responses:
 *       200:
 *         description: Experience fetched
 */
router.get("/experience", doctorOnly, getMyExperience);

/**
 * @swagger
 * /doctor/experience/{experienceId}:
 *   put:
 *     summary: Update experience entry
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: experienceId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Experience updated
 */
router.put("/experience/:experienceId", doctorOnly, updateExperience);

/**
 * @swagger
 * /doctor/experience/{experienceId}:
 *   delete:
 *     summary: Delete experience entry
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: experienceId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Experience deleted
 */
router.delete("/experience/:experienceId", doctorOnly, deleteExperience);

/**
 * ----------------------------
 * Patients Routes
 * ----------------------------
 */

router.get("/patients", doctorOnly, getDoctorPatients);
router.get("/patients/:patientId", doctorOnly, getDoctorPatientDetail);

/**
 * ----------------------------
 * Appointment Routes
 * ----------------------------
 */

/**
 * @swagger
 * /doctor/appointments:
 *   get:
 *     summary: List doctor's appointments
 *     tags: [Doctor]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, accepted, rejected, completed, cancelled]
 *     responses:
 *       200:
 *         description: Appointments retrieved
 */
router.get("/appointments", doctorOnly, getMyAppointments);

/**
 * @swagger
 * /doctor/appointments/{appointmentId}:
 *   get:
 *     summary: Get appointment detail and patient profile
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment detail returned
 */
router.get("/appointments/:appointmentId", doctorOnly, getAppointmentDetails);

/**
 * @swagger
 * /doctor/appointments/{appointmentId}/review:
 *   get:
 *     summary: Get review for an appointment
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Review retrieved
 */
router.get("/appointments/:appointmentId/review", doctorOnly, getAppointmentReview);

/**
 * @swagger
 * /doctor/appointments/{appointmentId}/accept:
 *   put:
 *     summary: Accept a pending appointment
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Appointment accepted
 */
router.put("/appointments/:appointmentId/accept", doctorOnly, acceptAppointment);

/**
 * @swagger
 * /doctor/appointments/{appointmentId}:
 *   put:
 *     summary: Update appointment status or notes
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, accepted, rejected, completed, cancelled]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment updated
 */
router.put("/appointments/:appointmentId", doctorOnly, updateAppointment);

/**
 * @swagger
 * /doctor/appointments/{appointmentId}/documents:
 *   post:
 *     summary: Upload an appointment document
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Document uploaded
 */
router.post(
  "/appointments/:appointmentId/documents",
  doctorOnly,
  documentUpload.single("file"),
  uploadAppointmentDocument
);

/**
 * ----------------------------
 * Verification Documents
 * ----------------------------
 */

/**
 * @swagger
 * /doctor/documents:
 *   post:
 *     summary: Upload verification document
 *     tags: [Doctor]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document_type
 *               - file
 *             properties:
 *               document_type:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Document uploaded for review
 */
router.post("/documents", doctorOnly, doctorDocumentUpload.single("file"), uploadDoctorDocument);

/**
 * @swagger
 * /doctor/documents:
 *   get:
 *     summary: List submitted verification documents
 *     tags: [Doctor]
 *     responses:
 *       200:
 *         description: Documents retrieved
 */
router.get("/documents", doctorOnly, getMyDocuments);

/**
 * @swagger
 * /doctor/documents/{documentId}:
 *   delete:
 *     summary: Delete a pending verification document
 *     tags: [Doctor]
 *     parameters:
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Document deleted
 */
router.delete("/documents/:documentId", doctorOnly, deleteDoctorDocument);

/**
 * @swagger
 * /doctor/dashboard/metrics:
 *   get:
 *     summary: Get doctor dashboard metrics
 *     tags: [Doctor]
 *     responses:
 *       200:
 *         description: Dashboard metrics retrieved
 */
router.get("/dashboard/metrics", doctorOnly, getDashboardMetrics);

export default router;
