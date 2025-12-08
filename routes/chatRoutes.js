import express from "express";
import {
  getOrCreateChat,
  sendMessage,
  getMessages,
  getChats,
  markMessagesAsRead,
  getChatStats,
} from "../controllers/chatControllers.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import chatUpload from "../middlewares/chatUploadMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: Chat system between doctors and patients
 */

/**
 * @swagger
 * /chat/get-or-create:
 *   post:
 *     summary: Get or create chat between doctor and patient
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - doctor_id
 *               - patient_id
 *             properties:
 *               doctor_id:
 *                 type: integer
 *               patient_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Chat found
 *       201:
 *         description: Chat created successfully
 *       400:
 *         description: Missing required fields
 *       403:
 *         description: Access denied
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /chat/message:
 *   post:
 *     summary: Send a chat message (text or file)
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               chat_id:
 *                 type: integer
 *               doctor_id:
 *                 type: integer
 *               patient_id:
 *                 type: integer
 *               message_text:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Message sent successfully
 *       400:
 *         description: Missing message content
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /chat/messages/{chatId}:
 *   get:
 *     summary: Get chat messages
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: chatId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Messages retrieved successfully
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /chat/chats:
 *   get:
 *     summary: Get all chats for the logged-in user
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Chats retrieved successfully
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /chat/messages/{chatId}/read:
 *   put:
 *     summary: Mark all messages as read in a chat
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: chatId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Messages marked as read
 *       403:
 *         description: Permission denied
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Server error
 */

// All routes require authentication
router.use(authMiddleware);

// Routes
router.post("/get-or-create", getOrCreateChat);
router.post("/message", chatUpload.single("file"), sendMessage);
router.get("/messages/:chatId", getMessages);
router.get("/chats", getChats);
router.get("/stats", getChatStats);
router.put("/messages/:chatId/read", markMessagesAsRead);

export default router;
