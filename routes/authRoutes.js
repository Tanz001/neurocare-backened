import express from "express";
import {
  signup,
  login,
  getProfile,
  updateProfilePicture,
} from "../controllers/authControllers.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import upload from "../middlewares/uploadMiddleware.js";

const router = express.Router();

// =========================
// AUTH ROUTES
// =========================

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - full_name
 *               - email
 *               - password
 *               - role
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               phone:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [patient, doctor, admin]
 *               gender:
 *                 type: string
 *               age:
 *                 type: integer
 *               education:
 *                 type: string
 *               speciality:
 *                 type: string
 *               experience_years:
 *                 type: integer
 *               fee:
 *                 type: number
 *     responses:
 *       201:
 *         description: User registered successfully
 */
router.post("/signup", signup);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Login a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", login);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     summary: Get logged-in user profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Returns user profile
 */
router.get("/profile", authMiddleware, getProfile);

/**
 * @swagger
 * /auth/profile/image:
 *   put:
 *     summary: Update profile picture
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile picture updated successfully
 */
router.put(
  "/profile/image",
  authMiddleware,
  upload.single("image"),
  updateProfilePicture
);

export default router;
