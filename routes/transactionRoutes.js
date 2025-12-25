import express from "express";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { getTransactions, getTransactionById } from "../controllers/transactionController.js";

const router = express.Router();

// All transaction routes require authentication
router.get("/", authMiddleware, getTransactions);
router.get("/:id", authMiddleware, getTransactionById);

export default router;















