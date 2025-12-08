import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  createPaymentIntent,
  confirmPayment,
  stripeWebhook,
} from "../controllers/paymentController.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Payment
 *   description: Payment processing with Stripe
 */

/**
 * @swagger
 * /payment/create-intent:
 *   post:
 *     summary: Create Stripe payment intent
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointment_id
 *               - amount
 *             properties:
 *               appointment_id:
 *                 type: integer
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Payment intent created successfully
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Appointment not found
 */
router.post("/create-intent", authMiddleware, createPaymentIntent);

/**
 * @swagger
 * /payment/confirm:
 *   post:
 *     summary: Confirm payment
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payment_intent_id
 *               - appointment_id
 *             properties:
 *               payment_intent_id:
 *                 type: string
 *               appointment_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Payment confirmed successfully
 *       400:
 *         description: Invalid request
 */
router.post("/confirm", authMiddleware, confirmPayment);

/**
 * @swagger
 * /payment/webhook:
 *   post:
 *     summary: Stripe webhook endpoint
 *     tags: [Payment]
 *     responses:
 *       200:
 *         description: Webhook processed
 */
router.post("/webhook", express.raw({ type: "application/json" }), stripeWebhook);

export default router;


