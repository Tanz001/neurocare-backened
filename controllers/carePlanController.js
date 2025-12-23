import { query } from "../config/db.js";
import pool from "../config/db.js";
import path from "path";
import fs from "fs";
 
/**
 * Crée un plan de soins après un rendez-vous complété
 */
export const createCarePlan = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const doctorId = req.user.id;
    const {
      appointment_id,
      clinical_summary,
      recommendations_notes,
      neurology_followup_required,
      neurology_followup_frequency,
      neurology_followup_custom_text,
      status = 'shared',
      services, // Array of { service_type, frequency, sessions_per_period, duration_weeks, custom_frequency_text, notes }
    } = req.body;

    // Validation
    if (!appointment_id || !clinical_summary) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "appointment_id and clinical_summary are required",
      });
    }

    // Vérifier que le rendez-vous existe et appartient au médecin
    const [appointment] = await query(
      `SELECT id, patient_id, doctor_id, status 
       FROM appointments 
       WHERE id = ? AND doctor_id = ? AND status = 'completed'`,
      [appointment_id, doctorId]
    );

    if (!appointment) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: "Appointment not found, not completed, or not assigned to you",
      });
    }

    // Vérifier si un plan de soins existe déjà pour ce rendez-vous
    const [existingPlan] = await query(
      `SELECT id FROM care_plans WHERE appointment_id = ?`,
      [appointment_id]
    );

    if (existingPlan) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "A care plan already exists for this appointment",
      });
    }

    // Créer le plan de soins
    const [result] = await connection.execute(
      `INSERT INTO care_plans
       (appointment_id, patient_id, doctor_id, clinical_summary, recommendations_notes,
        neurology_followup_required, neurology_followup_frequency, neurology_followup_custom_text, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        appointment_id,
        appointment.patient_id,
        appointment.doctor_id,
        clinical_summary,
        recommendations_notes || null,
        neurology_followup_required ? 1 : 0,
        neurology_followup_frequency || null,
        neurology_followup_custom_text || null,
        status,
      ]
    );

    const carePlanId = result.insertId;

    // Créer les services du plan si fournis
    if (services && Array.isArray(services)) {
      for (const service of services) {
        if (!service.service_type || !service.frequency) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: "Each service must have service_type and frequency",
          });
        }

        await connection.execute(
          `INSERT INTO care_plan_services
           (care_plan_id, service_type, frequency, sessions_per_period, duration_weeks, custom_frequency_text, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            carePlanId,
            service.service_type,
            service.frequency,
            service.sessions_per_period || 1,
            service.duration_weeks || null,
            service.custom_frequency_text || null,
            service.notes || null,
          ]
        );
      }
    }

    await connection.commit();
    connection.release();

    // Récupérer le plan créé avec ses services
    const [createdPlan] = await query(
      `SELECT * FROM care_plans WHERE id = ?`,
      [carePlanId]
    );

    const createdServices = await query(
      `SELECT * FROM care_plan_services WHERE care_plan_id = ?`,
      [carePlanId]
    );

    return res.status(201).json({
      success: true,
      message: "Care plan created successfully",
      care_plan: {
        ...createdPlan,
        services: createdServices,
      },
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("createCarePlan error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create care plan",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Récupère un plan de soins par ID (médecin ou patient)
 */
export const getCarePlanById = async (req, res) => {
  try {
    const carePlanId = parseInt(req.params.carePlanId, 10);
    const userId = req.user.id;
    const userRole = req.user.role;

    if (isNaN(carePlanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid care plan ID",
      });
    }

    // Récupérer le plan avec vérification d'accès
    let whereClause = "cp.id = ?";
    const params = [carePlanId];

    if (userRole === 'patient') {
      whereClause += " AND cp.patient_id = ?";
      params.push(userId);
    } else if (userRole === 'doctor') {
      whereClause += " AND cp.doctor_id = ?";
      params.push(userId);
    }

    const [carePlan] = await query(
      `SELECT 
        cp.*,
        a.appointment_date,
        a.appointment_time,
        a.appointment_for,
        d.full_name as doctor_name,
        d.speciality as doctor_speciality,
        p.full_name as patient_name
       FROM care_plans cp
       INNER JOIN appointments a ON cp.appointment_id = a.id
       INNER JOIN users d ON cp.doctor_id = d.id
       INNER JOIN users p ON cp.patient_id = p.id
       WHERE ${whereClause}`,
      params
    );

    if (!carePlan) {
      return res.status(404).json({
        success: false,
        message: "Care plan not found or access denied",
      });
    }

    // Récupérer les services
    const services = await query(
      `SELECT * FROM care_plan_services WHERE care_plan_id = ? ORDER BY service_type`,
      [carePlanId]
    );

    // Récupérer les pièces jointes
    const attachments = await query(
      `SELECT 
        cpa.*,
        u.full_name as uploaded_by_name
       FROM care_plan_attachments cpa
       INNER JOIN users u ON cpa.uploaded_by = u.id
       WHERE cpa.care_plan_id = ?
       ORDER BY cpa.uploaded_at DESC`,
      [carePlanId]
    );

    return res.status(200).json({
      success: true,
      care_plan: {
        ...carePlan,
        neurology_followup_required: carePlan.neurology_followup_required === 1 || carePlan.neurology_followup_required === true,
        services: services,
        attachments: attachments,
      },
    });
  } catch (error) {
    console.error("getCarePlanById error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch care plan",
    });
  }
};

/**
 * Récupère tous les plans de soins d'un patient
 */
export const getPatientCarePlans = async (req, res) => {
  try {
    const patientId = req.user.id;

    const carePlans = await query(
      `SELECT 
        cp.*,
        a.appointment_date,
        a.appointment_time,
        a.appointment_for,
        d.full_name as doctor_name,
        d.speciality as doctor_speciality,
        d.profile_image_url as doctor_image
       FROM care_plans cp
       INNER JOIN appointments a ON cp.appointment_id = a.id
       INNER JOIN users d ON cp.doctor_id = d.id
       WHERE cp.patient_id = ?
       ORDER BY cp.created_at DESC`,
      [patientId]
    );

    // Pour chaque plan, récupérer les services
    const plansWithServices = await Promise.all(
      carePlans.map(async (plan) => {
        const services = await query(
          `SELECT * FROM care_plan_services WHERE care_plan_id = ? ORDER BY service_type`,
          [plan.id]
        );

        return {
          ...plan,
          neurology_followup_required: plan.neurology_followup_required === 1 || plan.neurology_followup_required === true,
          services: services,
        };
      })
    );

    return res.status(200).json({
      success: true,
      care_plans: plansWithServices,
    });
  } catch (error) {
    console.error("getPatientCarePlans error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch care plans",
    });
  }
};

/**
 * Récupère tous les plans de soins créés par un médecin
 */
export const getDoctorCarePlans = async (req, res) => {
  try {
    const doctorId = req.user.id;

    const carePlans = await query(
      `SELECT 
        cp.*,
        a.appointment_date,
        a.appointment_time,
        a.appointment_for,
        p.full_name as patient_name,
        p.profile_image_url as patient_image
       FROM care_plans cp
       INNER JOIN appointments a ON cp.appointment_id = a.id
       INNER JOIN users p ON cp.patient_id = p.id
       WHERE cp.doctor_id = ?
       ORDER BY cp.created_at DESC`,
      [doctorId]
    );

    // Pour chaque plan, récupérer les services
    const plansWithServices = await Promise.all(
      carePlans.map(async (plan) => {
        const services = await query(
          `SELECT * FROM care_plan_services WHERE care_plan_id = ? ORDER BY service_type`,
          [plan.id]
        );

        return {
          ...plan,
          neurology_followup_required: plan.neurology_followup_required === 1 || plan.neurology_followup_required === true,
          services: services,
        };
      })
    );

    return res.status(200).json({
      success: true,
      care_plans: plansWithServices,
    });
  } catch (error) {
    console.error("getDoctorCarePlans error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch care plans",
    });
  }
};

/**
 * Met à jour un plan de soins
 */
export const updateCarePlan = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const carePlanId = parseInt(req.params.carePlanId, 10);
    const doctorId = req.user.id;
    const {
      clinical_summary,
      recommendations_notes,
      neurology_followup_required,
      neurology_followup_frequency,
      neurology_followup_custom_text,
      status,
      services,
    } = req.body;

    if (isNaN(carePlanId)) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "Invalid care plan ID",
      });
    }

    // Vérifier que le plan existe et appartient au médecin
    const [existingPlan] = await query(
      `SELECT id FROM care_plans WHERE id = ? AND doctor_id = ?`,
      [carePlanId, doctorId]
    );

    if (!existingPlan) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: "Care plan not found or access denied",
      });
    }

    // Mettre à jour le plan
    const updateFields = [];
    const updateValues = [];

    if (clinical_summary !== undefined) {
      updateFields.push('clinical_summary = ?');
      updateValues.push(clinical_summary);
    }
    if (recommendations_notes !== undefined) {
      updateFields.push('recommendations_notes = ?');
      updateValues.push(recommendations_notes);
    }
    if (neurology_followup_required !== undefined) {
      updateFields.push('neurology_followup_required = ?');
      updateValues.push(neurology_followup_required ? 1 : 0);
    }
    if (neurology_followup_frequency !== undefined) {
      updateFields.push('neurology_followup_frequency = ?');
      updateValues.push(neurology_followup_frequency || null);
    }
    if (neurology_followup_custom_text !== undefined) {
      updateFields.push('neurology_followup_custom_text = ?');
      updateValues.push(neurology_followup_custom_text || null);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }

    if (updateFields.length > 0) {
      updateValues.push(carePlanId);
      await connection.execute(
        `UPDATE care_plans SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Mettre à jour les services si fournis
    if (services && Array.isArray(services)) {
      // Supprimer les services existants
      await connection.execute(
        `DELETE FROM care_plan_services WHERE care_plan_id = ?`,
        [carePlanId]
      );

      // Créer les nouveaux services
      for (const service of services) {
        if (!service.service_type || !service.frequency) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: "Each service must have service_type and frequency",
          });
        }

        await connection.execute(
          `INSERT INTO care_plan_services
           (care_plan_id, service_type, frequency, sessions_per_period, duration_weeks, custom_frequency_text, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            carePlanId,
            service.service_type,
            service.frequency,
            service.sessions_per_period || 1,
            service.duration_weeks || null,
            service.custom_frequency_text || null,
            service.notes || null,
          ]
        );
      }
    }

    await connection.commit();
    connection.release();

    // Récupérer le plan mis à jour
    const [updatedPlan] = await query(
      `SELECT * FROM care_plans WHERE id = ?`,
      [carePlanId]
    );

    const updatedServices = await query(
      `SELECT * FROM care_plan_services WHERE care_plan_id = ?`,
      [carePlanId]
    );

    return res.status(200).json({
      success: true,
      message: "Care plan updated successfully",
      care_plan: {
        ...updatedPlan,
        neurology_followup_required: updatedPlan.neurology_followup_required === 1 || updatedPlan.neurology_followup_required === true,
        services: updatedServices,
      },
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("updateCarePlan error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update care plan",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Vérifie si un plan de soins existe pour un rendez-vous
 */
export const checkCarePlanExists = async (req, res) => {
  try {
    const appointmentId = parseInt(req.params.appointmentId, 10);

    if (isNaN(appointmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const [carePlan] = await query(
      `SELECT id FROM care_plans WHERE appointment_id = ?`,
      [appointmentId]
    );

    return res.status(200).json({
      success: true,
      exists: !!carePlan,
      care_plan_id: carePlan?.id || null,
    });
  } catch (error) {
    console.error("checkCarePlanExists error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to check care plan",
    });
  }
};

// Helper function to convert file path to public URL
const toPublicPath = (filePath) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (normalizedPath.startsWith('assets/')) {
    return `/${normalizedPath}`;
  }
  const assetsIndex = normalizedPath.indexOf('assets/');
  if (assetsIndex !== -1) {
    return `/${normalizedPath.substring(assetsIndex)}`;
  }
  return `/${normalizedPath}`;
};

/**
 * Upload un document pour un plan de soins
 */
export const uploadCarePlanDocument = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const carePlanId = parseInt(req.params.carePlanId, 10);

    if (isNaN(carePlanId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid care plan ID",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    // Vérifier que le plan de soins existe et appartient au médecin
    const [carePlan] = await query(
      `SELECT id FROM care_plans WHERE id = ? AND doctor_id = ?`,
      [carePlanId, doctorId]
    );

    if (!carePlan) {
      return res.status(404).json({
        success: false,
        message: "Care plan not found or access denied",
      });
    }

    const fileUrl = toPublicPath(req.file.path);
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    // Déterminer le type de fichier
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileType = imageExtensions.includes(fileExtension) ? 'image' : 'document';

    const result = await query(
      `INSERT INTO care_plan_attachments
       (care_plan_id, file_name, file_path, file_type, file_size, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        carePlanId,
        req.file.originalname,
        fileUrl,
        fileType,
        req.file.size,
        doctorId,
      ]
    );
    

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      attachment: {
        id: result.insertId,
        file_name: req.file.originalname,
        file_path: fileUrl,
        file_type: fileType,
        file_size: req.file.size,
        uploaded_by: doctorId,
      },
    });
  } catch (error) {
    console.error("uploadCarePlanDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to upload document",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Supprime un document d'un plan de soins
 */
export const deleteCarePlanDocument = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const attachmentId = parseInt(req.params.attachmentId, 10);

    if (isNaN(attachmentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid attachment ID",
      });
    }

    // Vérifier que le document existe et appartient à un plan de soins du médecin
    const [attachment] = await query(
      `SELECT cpa.*, cp.doctor_id
       FROM care_plan_attachments cpa
       INNER JOIN care_plans cp ON cpa.care_plan_id = cp.id
       WHERE cpa.id = ? AND cp.doctor_id = ?`,
      [attachmentId, doctorId]
    );

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: "Document not found or access denied",
      });
    }

    // Supprimer le fichier du système de fichiers
    try {
      const filePath = path.join(process.cwd(), attachment.file_path.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.warn("Error deleting file from filesystem:", fileError);
      // Continuer même si la suppression du fichier échoue
    }

    // Supprimer l'enregistrement de la base de données
    await query(
      `DELETE FROM care_plan_attachments WHERE id = ?`,
      [attachmentId]
    );

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("deleteCarePlanDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete document",
    });
  }
};

