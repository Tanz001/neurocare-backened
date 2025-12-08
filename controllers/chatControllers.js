import { query } from "../config/db.js";
import pool from "../config/db.js";
import path from "path";

/**
 * Obtenir ou créer un chat entre un médecin et un patient
 */
export const getOrCreateChat = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const userRole = req.user.role?.toLowerCase();
    const { doctor_id, patient_id } = req.body;

    // Validation des champs requis
    if (!doctor_id || !patient_id) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID and Patient ID are required",
      });
    }

    const doctorIdInt = parseInt(doctor_id);
    const patientIdInt = parseInt(patient_id);

    // Validation des IDs
    if (isNaN(doctorIdInt) || isNaN(patientIdInt) || isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    // Vérification des permissions
    if (userRole === "doctor") {
      if (userId !== doctorIdInt) {
        return res.status(403).json({
          success: false,
          message: "You can only access chats where you are the doctor",
        });
      }
    } else if (userRole === "patient") {
      if (userId !== patientIdInt) {
        return res.status(403).json({
          success: false,
          message: "You can only access chats where you are the patient",
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Only doctors and patients can access chats",
      });
    }

    // Vérifier si le chat existe déjà
    const existingChats = await query(
      `SELECT chat_id, doctor_id, patient_id, last_message_at, created_at
       FROM chats
       WHERE doctor_id = ? AND patient_id = ?
       LIMIT 1`,
      [doctorIdInt, patientIdInt]
    );

    if (existingChats.length > 0) {
      return res.json({
        success: true,
        message: "Chat found",
        chat: existingChats[0],
      });
    }

    // Créer un nouveau chat
    const [insertResult] = await pool.execute(
      `INSERT INTO chats (doctor_id, patient_id)
       VALUES (?, ?)`,
      [doctorIdInt, patientIdInt]
    );

    const newChat = await query(
      `SELECT chat_id, doctor_id, patient_id, last_message_at, created_at
       FROM chats
       WHERE chat_id = ?`,
      [insertResult.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Chat created successfully",
      chat: newChat[0],
    });
  } catch (error) {
    console.error("Error in getOrCreateChat:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Envoyer un message (texte ou fichier)
 */
export const sendMessage = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const userRole = req.user.role?.toLowerCase();
    const { chat_id, message_text, doctor_id, patient_id } = req.body;
    const file = req.file;

    // Validation de l'ID utilisateur
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    let chatId = chat_id ? parseInt(chat_id) : null;
    
    // Validation de chatId si fourni
    if (chatId !== null && isNaN(chatId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid chat ID format",
      });
    }

    // Si pas de chat_id, créer ou trouver le chat
    if (!chatId) {
      if (!doctor_id || !patient_id) {
        return res.status(400).json({
          success: false,
          message: "Either chat_id or (doctor_id and patient_id) is required",
        });
      }

      const doctorIdInt = parseInt(doctor_id);
      const patientIdInt = parseInt(patient_id);

      // Validation des IDs
      if (isNaN(doctorIdInt) || isNaN(patientIdInt)) {
        return res.status(400).json({
          success: false,
          message: "Invalid doctor_id or patient_id format",
        });
      }

      // Vérifier les permissions
      if (userRole === "doctor" && userId !== doctorIdInt) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to send messages in this chat",
        });
      }
      if (userRole === "patient" && userId !== patientIdInt) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to send messages in this chat",
        });
      }

      // Chercher ou créer le chat
      const existingChats = await query(
        `SELECT chat_id FROM chats WHERE doctor_id = ? AND patient_id = ?`,
        [doctorIdInt, patientIdInt]
      );

      if (existingChats.length > 0) {
        chatId = existingChats[0].chat_id;
      } else {
        const [insertResult] = await pool.execute(
          `INSERT INTO chats (doctor_id, patient_id) VALUES (?, ?)`,
          [doctorIdInt, patientIdInt]
        );
        chatId = insertResult.insertId;
      }
    }

    // Vérifier que le chat existe et que l'utilisateur a la permission
    const chatResults = await query(
      `SELECT doctor_id, patient_id FROM chats WHERE chat_id = ?`,
      [chatId]
    );

    if (chatResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    const chat = chatResults[0];

    // Vérifier les permissions
    if (
      (userRole === "doctor" && userId !== parseInt(chat.doctor_id)) ||
      (userRole === "patient" && userId !== parseInt(chat.patient_id))
    ) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to send messages in this chat",
      });
    }

    // Déterminer le type de message
    let messageType = "text";
    let fileUrl = null;
    let fileName = null;
    let fileType = null;
    let fileSize = null;

    if (file) {
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

      if (imageExtensions.includes(fileExtension)) {
        messageType = "image";
      } else {
        messageType = "file";
      }

      fileUrl = `/assets/chat_files/${file.filename}`;
      fileName = file.originalname;
      fileType = file.mimetype;
      fileSize = parseInt(file.size) || null;
    }

    // Validation: doit avoir soit du texte soit un fichier
    if (!message_text && !file) {
      return res.status(400).json({
        success: false,
        message: "Either message text or file is required",
      });
    }

    // Insérer le message
    const [insertResult] = await pool.execute(
      `INSERT INTO messages (
        chat_id,
        sender_id,
        sender_role,
        message_type,
        message_text,
        file_url,
        file_name,
        file_type,
        file_size
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chatId,
        userId,
        userRole,
        messageType,
        message_text || null,
        fileUrl || null,
        fileName || null,
        fileType || null,
        fileSize || null,
      ]
    );

    // Mettre à jour le timestamp du dernier message
    await pool.execute(
      `UPDATE chats SET last_message_at = NOW() WHERE chat_id = ?`,
      [chatId]
    );

    // Récupérer le message créé
    const messageResults = await query(
      `SELECT 
        message_id,
        chat_id,
        sender_id,
        sender_role,
        message_type,
        message_text,
        file_url,
        file_name,
        file_type,
        file_size,
        is_read,
        read_at,
        created_at
      FROM messages 
      WHERE message_id = ?`,
      [insertResult.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      message_data: messageResults[0],
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Get chat messages
 */
export const getMessages = async (req, res) => {
    try {
      const userId = parseInt(req.user.id);
      const userRole = req.user.role?.toLowerCase();
      const chatId = parseInt(req.params.chatId);
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
  
      // Validate IDs
      if (isNaN(userId) || isNaN(chatId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID format",
        });
      }
  
      // Check if chat exists and user has access
      const chatResults = await query(
        `SELECT doctor_id, patient_id FROM chats WHERE chat_id = ?`,
        [chatId]
      );
  
      if (chatResults.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }
  
      const chat = chatResults[0];
  
      // Permission check
      if (
        (userRole === "doctor" && userId !== parseInt(chat.doctor_id)) ||
        (userRole === "patient" && userId !== parseInt(chat.patient_id))
      ) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to view this chat",
        });
      }
  
      // Retrieve messages (LIMIT/OFFSET injected directly)
      const messages = await query(
        `SELECT 
          message_id,
          chat_id,
          sender_id,
          sender_role,
          message_type,
          message_text,
          file_url,
          file_name,
          file_type,
          file_size,
          is_read,
          read_at,
          created_at
        FROM messages
        WHERE chat_id = ?
        ORDER BY created_at ASC
        LIMIT ${limit} OFFSET ${offset}`,
        [chatId]
      );
  
      // Count total messages
      const totalResult = await query(
        `SELECT COUNT(*) as total FROM messages WHERE chat_id = ?`,
        [chatId]
      );
  
      res.json({
        success: true,
        message: "Messages retrieved successfully",
        messages: messages,
        total: totalResult[0].total,
        limit,
        offset,
      });
    } catch (error) {
      console.error("Error in getMessages:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  };
  

/**
 * Obtenir tous les chats de l'utilisateur connecté
 */
export const getChats = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const userRole = req.user.role?.toLowerCase();

    if (userRole !== "doctor" && userRole !== "patient") {
      return res.status(403).json({
        success: false,
        message: "Only doctors and patients can access chats",
      });
    }

    // Récupérer les chats de base selon le rôle
    let chats;
    if (userRole === "doctor") {
      chats = await query(
        `SELECT 
          c.chat_id,
          c.doctor_id,
          c.patient_id,
          c.last_message_at,
          c.created_at,
          d.full_name AS doctor_name,
          d.profile_image_url AS doctor_profile,
          p.full_name AS patient_name,
          p.profile_image_url AS patient_profile
        FROM chats c
        JOIN users d ON c.doctor_id = d.id
        JOIN users p ON c.patient_id = p.id
        WHERE c.doctor_id = ?
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.created_at DESC`,
        [userId]
      );
    } else {
      chats = await query(
        `SELECT 
          c.chat_id,
          c.doctor_id,
          c.patient_id,
          c.last_message_at,
          c.created_at,
          d.full_name AS doctor_name,
          d.profile_image_url AS doctor_profile,
          p.full_name AS patient_name,
          p.profile_image_url AS patient_profile
        FROM chats c
        JOIN users d ON c.doctor_id = d.id
        JOIN users p ON c.patient_id = p.id
        WHERE c.patient_id = ?
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.created_at DESC`,
        [userId]
      );
    }

    // Enrichir chaque chat avec les informations de messages
    const enrichedChats = await Promise.all(
      chats.map(async (chat) => {
        // Compter les messages non lus
        const unreadResult = await query(
          `SELECT COUNT(*) as unread_count
           FROM messages
           WHERE chat_id = ? AND sender_id != ? AND is_read = FALSE`,
          [chat.chat_id, userId]
        );

        // Récupérer le dernier message
        const lastMessageResult = await query(
          `SELECT message_text, message_type, created_at
           FROM messages
           WHERE chat_id = ?
           ORDER BY created_at DESC
           LIMIT 1`,
          [chat.chat_id]
        );

        const unreadResultFirst = unreadResult[0] || {};
        const lastMessage = lastMessageResult[0] || null;

        return {
          ...chat,
          unread_count: parseInt(unreadResultFirst.unread_count || 0),
          last_message_text: lastMessage?.message_text || null,
          last_message_type: lastMessage?.message_type || null,
          last_message_time: lastMessage?.created_at || null,
        };
      })
    );

    res.json({
      success: true,
      message: "Chats retrieved successfully",
      chats: enrichedChats || [],
    });
  } catch (error) {
    console.error("Error in getChats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Marquer les messages comme lus
 */
export const markMessagesAsRead = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const userRole = req.user.role?.toLowerCase();
    const chatId = parseInt(req.params.chatId);

    // Validation des IDs
    if (isNaN(userId) || isNaN(chatId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    // Vérifier que le chat existe et que l'utilisateur a la permission
    const chatResults = await query(
      `SELECT doctor_id, patient_id FROM chats WHERE chat_id = ?`,
      [chatId]
    );

    if (chatResults.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    const chat = chatResults[0];

    // Vérifier les permissions
    if (
      (userRole === "doctor" && userId !== parseInt(chat.doctor_id)) ||
      (userRole === "patient" && userId !== parseInt(chat.patient_id))
    ) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to mark messages in this chat",
      });
    }

    // Marquer tous les messages de l'autre utilisateur comme lus
    const [updateResult] = await pool.execute(
      `UPDATE messages
       SET is_read = TRUE, read_at = NOW()
       WHERE chat_id = ?
       AND sender_id != ?
       AND is_read = FALSE`,
      [chatId, userId]
    );

    res.json({
      success: true,
      message: "Messages marked as read",
      updated_count: updateResult.affectedRows,
    });
  } catch (error) {
    console.error("Error in markMessagesAsRead:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

/**
 * Obtenir les statistiques de chat pour l'utilisateur
 */
export const getChatStats = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const userRole = req.user.role?.toLowerCase();

    // Validation de l'ID utilisateur
    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (userRole !== "doctor" && userRole !== "patient") {
      return res.status(403).json({
        success: false,
        message: "Only doctors and patients can access chat stats",
      });
    }

    // Compter le nombre total de chats
    let totalChatsResult;
    if (userRole === "doctor") {
      totalChatsResult = await query(
        `SELECT COUNT(*) as total
         FROM chats
         WHERE doctor_id = ?`,
        [userId]
      );
    } else {
      totalChatsResult = await query(
        `SELECT COUNT(*) as total
         FROM chats
         WHERE patient_id = ?`,
        [userId]
      );
    }

    // Compter le nombre total de messages non lus
    let unreadMessagesResult;
    if (userRole === "doctor") {
      unreadMessagesResult = await query(
        `SELECT COUNT(*) as total
         FROM messages m
         INNER JOIN chats c ON m.chat_id = c.chat_id
         WHERE c.doctor_id = ?
         AND m.sender_id != ?
         AND m.is_read = FALSE`,
        [userId, userId]
      );
    } else {
      unreadMessagesResult = await query(
        `SELECT COUNT(*) as total
         FROM messages m
         INNER JOIN chats c ON m.chat_id = c.chat_id
         WHERE c.patient_id = ?
         AND m.sender_id != ?
         AND m.is_read = FALSE`,
        [userId, userId]
      );
    }

    res.json({
      success: true,
      stats: {
        total_chats: totalChatsResult[0].total,
        unread_messages: unreadMessagesResult[0].total,
      },
    });
  } catch (error) {
    console.error("Error in getChatStats:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

