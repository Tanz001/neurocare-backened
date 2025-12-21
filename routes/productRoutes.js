import express from "express";
import {
  getProducts,
  getProductById,
  purchaseProduct,
  getPlans,
  cancelMyPlan,
} from "../controllers/productController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { isPatient } from "../middlewares/roleMiddleware.js";

const router = express.Router();
const patientOnly = [authMiddleware, isPatient];

/**
 * @swagger
 * tags:
 *   name: Products
 *   description: Product and purchase management endpoints
 */

/**
 * @swagger
 * /noauth/plans:
 *   get:
 *     summary: Get all available subscription plans (No Auth Required)
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Plans fetched successfully
 */
router.get("/noauth/plans", getPlans);

/**
 * @swagger
 * /patient/plans:
 *   get:
 *     summary: Get all available subscription plans
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Plans fetched successfully
 */
router.get("/plans", patientOnly, getPlans);

/**
 * @swagger
 * /noauth/products:
 *   get:
 *     summary: Get all active products (No Auth Required)
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: product_type
 *         schema:
 *           type: string
 *           enum: [subscription_plan, single_service, package, group_session]
 *       - in: query
 *         name: service_category
 *         schema:
 *           type: string
 *           enum: [neurology, physiotherapy, psychology, nutrition, multidisciplinary, group]
 *     responses:
 *       200:
 *         description: Products fetched successfully
 */
router.get("/noauth/products", getProducts);

/**
 * @swagger
 * /noauth/products/{productId}:
 *   get:
 *     summary: Get product by ID (No Auth Required)
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product fetched successfully
 */
router.get("/noauth/products/:productId", getProductById);

/**
 * @swagger
 * /patient/products:
 *   get:
 *     summary: Get all active products
 *     tags: [Products]
 *     responses:
 *       200:
 *         description: Products fetched successfully
 */
router.get("/products", patientOnly, getProducts);

/**
 * @swagger
 * /patient/products/{productId}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Product fetched successfully
 */
router.get("/products/:productId", patientOnly, getProductById);

/**
 * @swagger
 * /patient/purchases:
 *   post:
 *     summary: Purchase a product (plan, service, package)
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *             properties:
 *               product_id:
 *                 type: integer
 *               payment_method:
 *                 type: string
 *                 enum: [card, easypaisa, jazzcash, bank, cash, stripe, paypal]
 *     responses:
 *       201:
 *         description: Product purchased successfully
 */
router.post("/purchases", patientOnly, purchaseProduct);
router.post("/cancel-plan", patientOnly, cancelMyPlan);

export default router;

