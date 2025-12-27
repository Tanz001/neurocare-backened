import path from "path";
import { query } from "../config/db.js";
import { unlockServicesAfterNeurology, calculateCommission } from "../services/productService.js";
import pool from "../config/db.js";

const dayFields = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const allowedAppointmentStatuses = ["pending", "accepted", "rejected", "completed", "cancelled"];
const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

const toPublicPath = (filePath) => {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, "/");
  const [_, relative] = normalized.split("/assets/");
  return relative ? `/assets/${relative}` : normalized;
};

// Convert 24-hour time (HH:MM) to 12-hour format with AM/PM
const convertTo12Hour = (time24) => {
  if (!time24 || typeof time24 !== 'string') return time24;
  
  const [hours, minutes] = time24.split(':');
  const hour24 = parseInt(hours, 10);
  
  if (isNaN(hour24)) return time24;
  
  const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  
  return `${hour12}:${minutes || '00'} ${ampm}`;
};

// Convert 12-hour time (HH:MM AM/PM) to 24-hour format
const convertTo24Hour = (time12) => {
  if (!time12 || typeof time12 !== 'string') return time12;
  
  const match = time12.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return time12; // Return as is if format doesn't match
  
  let hour = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3].toUpperCase();
  
  if (ampm === 'PM' && hour !== 12) {
    hour += 12;
  } else if (ampm === 'AM' && hour === 12) {
    hour = 0;
  }
  
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
};

const buildScheduleValues = (payload, fallbackRow = {}) => {
  let hasValue = false;
  const values = dayFields.map((day) => {
    if (payload[day] !== undefined) {
      hasValue = true;
      // If it's null or empty array, return null
      if (!payload[day] || (Array.isArray(payload[day]) && payload[day].length === 0)) {
        return null;
      }
      // If it's already a string, try to parse and convert
      if (typeof payload[day] === 'string') {
        try {
          const parsed = JSON.parse(payload[day]);
          if (Array.isArray(parsed)) {
            const converted = parsed.map(slot => ({
              start: convertTo12Hour(slot.start),
              end: convertTo12Hour(slot.end)
            }));
            return JSON.stringify(converted);
          }
          return payload[day];
        } catch {
          return payload[day];
        }
      }
      // If it's an array, convert times to 12-hour format
      if (Array.isArray(payload[day])) {
        const converted = payload[day].map(slot => ({
          start: convertTo12Hour(slot.start),
          end: convertTo12Hour(slot.end)
        }));
        return JSON.stringify(converted);
      }
      return JSON.stringify(payload[day]);
    }
    // For fallback, if it's already a string from DB, use it; if object, stringify it
    const fallbackValue = fallbackRow[day];
    if (fallbackValue === null || fallbackValue === undefined) {
      return null;
    }
    if (typeof fallbackValue === 'string') {
      return fallbackValue;
    }
    return JSON.stringify(fallbackValue);
  });

  return { hasValue, values };
};

const parseScheduleRow = (row) => {
  if (!row) return null;
  return dayFields.reduce((acc, day) => {
    const value = row[day];
    if (!value || value === null) {
      acc[day] = null;
    } else if (typeof value === 'string') {
      // Try to parse if it's a string
      try {
        const parsed = JSON.parse(value);
        // If parsed is an array, times are already in 12-hour format from DB
        acc[day] = Array.isArray(parsed) ? parsed : null;
      } catch (e) {
        // If parsing fails, it might be malformed - set to null
        console.warn(`Failed to parse schedule for ${day}:`, e.message);
        acc[day] = null;
      }
    } else if (Array.isArray(value) || typeof value === 'object') {
      // Already parsed (MySQL JSON type returns objects)
      // Times should already be in 12-hour format
      acc[day] = value;
    } else {
      acc[day] = null;
    }
    return acc;
  }, {});
};

export const upsertSchedule = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again.",
      });
    }

    const doctorId = req.user.id;
    
    // Validate schedule data format
    const scheduleData = req.body;
    if (!scheduleData || typeof scheduleData !== 'object') {
      return res.status(400).json({
        success: false,
        message: "Invalid schedule data format",
      });
    }

    // Validate each day's data if present
    for (const day of dayFields) {
      if (scheduleData[day] !== undefined && scheduleData[day] !== null) {
        if (!Array.isArray(scheduleData[day])) {
          return res.status(400).json({
            success: false,
            message: `${day} must be an array of time slots or null`,
          });
        }
        // Validate each time slot
        for (const slot of scheduleData[day]) {
          if (!slot.start || !slot.end) {
            return res.status(400).json({
              success: false,
              message: `Each time slot in ${day} must have start and end times`,
            });
          }
        }
      }
    }

    const existing = await query("SELECT * FROM doctor_schedules WHERE doctor_id = ?", [doctorId]);
    const { hasValue, values } = buildScheduleValues(scheduleData, existing[0] || {});

    if (!hasValue) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one day with availability",
      });
    }

    if (existing.length) {
      await query(
        `UPDATE doctor_schedules 
         SET ${dayFields.map((day) => `${day} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE doctor_id = ?`,
        [...values, doctorId]
      );
      return res.status(200).json({
        success: true,
        message: "Schedule updated successfully",
      });
    }

    await query(
      `INSERT INTO doctor_schedules (doctor_id, ${dayFields.join(", ")}) VALUES (?, ${dayFields
        .map(() => "?")
        .join(", ")})`,
      [doctorId, ...values]
    );

    return res.status(201).json({
      success: true,
      message: "Schedule created successfully",
    });
  } catch (error) {
    console.error("upsertSchedule error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to save schedule",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const getSchedule = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login again.",
      });
    }

    const doctorId = req.user.id;
    const [schedule] = await query("SELECT * FROM doctor_schedules WHERE doctor_id = ?", [doctorId]);

    return res.status(200).json({
      success: true,
      schedule: parseScheduleRow(schedule),
    });
  } catch (error) {
    console.error("getSchedule error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch schedule",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

export const addEducation = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { degree_title, institution, start_year, end_year, description } = req.body;

    if (!degree_title || !institution) {
      return res.status(400).json({
        success: false,
        message: "degree_title and institution are required",
      });
    }

    const insertResult = await query(
      `INSERT INTO doctor_education 
        (doctor_id, degree_title, institution, start_year, end_year, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [doctorId, degree_title, institution, start_year || null, end_year || null, description || null]
    );

    return res.status(201).json({
      success: true,
      message: "Education added successfully",
      education_id: insertResult.insertId,
    });
  } catch (error) {
    console.error("addEducation error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to add education",
    });
  }
};

export const getMyEducation = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const education = await query(
      `SELECT * FROM doctor_education 
       WHERE doctor_id = ?
       ORDER BY end_year IS NULL, end_year DESC, start_year DESC, created_at DESC`,
      [doctorId]
    );

    return res.status(200).json({
      success: true,
      education,
    });
  } catch (error) {
    console.error("getMyEducation error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch education",
    });
  }
};

export const updateEducation = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { educationId } = req.params;
    const { degree_title, institution, start_year, end_year, description } = req.body;

    const updates = [];
    const values = [];

    if (degree_title !== undefined) {
      updates.push("degree_title = ?");
      values.push(degree_title);
    }
    if (institution !== undefined) {
      updates.push("institution = ?");
      values.push(institution);
    }
    if (start_year !== undefined) {
      updates.push("start_year = ?");
      values.push(start_year || null);
    }
    if (end_year !== undefined) {
      updates.push("end_year = ?");
      values.push(end_year || null);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description || null);
    }

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update",
      });
    }

    values.push(educationId, doctorId);
    const result = await query(
      `UPDATE doctor_education SET ${updates.join(", ")} WHERE education_id = ? AND doctor_id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Education not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Education updated successfully",
    });
  } catch (error) {
    console.error("updateEducation error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update education",
    });
  }
};

export const deleteEducation = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { educationId } = req.params;

    const result = await query(`DELETE FROM doctor_education WHERE education_id = ? AND doctor_id = ?`, [
      educationId,
      doctorId,
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Education not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Education deleted successfully",
    });
  } catch (error) {
    console.error("deleteEducation error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete education",
    });
  }
};

export const addExperience = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { job_title, organization, start_date, end_date, description } = req.body;

    if (!job_title || !organization) {
      return res.status(400).json({
        success: false,
        message: "job_title and organization are required",
      });
    }

    const insertResult = await query(
      `INSERT INTO doctor_experience
        (doctor_id, job_title, organization, start_date, end_date, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [doctorId, job_title, organization, start_date || null, end_date || null, description || null]
    );

    return res.status(201).json({
      success: true,
      message: "Experience added successfully",
      experience_id: insertResult.insertId,
    });
  } catch (error) {
    console.error("addExperience error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to add experience",
    });
  }
};

export const getMyExperience = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const experience = await query(
      `SELECT * FROM doctor_experience 
       WHERE doctor_id = ?
       ORDER BY end_date IS NULL, end_date DESC, start_date DESC, created_at DESC`,
      [doctorId]
    );

    return res.status(200).json({
      success: true,
      experience,
    });
  } catch (error) {
    console.error("getMyExperience error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch experience",
    });
  }
};

export const updateExperience = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { experienceId } = req.params;
    const { job_title, organization, start_date, end_date, description } = req.body;

    const updates = [];
    const values = [];

    if (job_title !== undefined) {
      updates.push("job_title = ?");
      values.push(job_title);
    }
    if (organization !== undefined) {
      updates.push("organization = ?");
      values.push(organization);
    }
    if (start_date !== undefined) {
      updates.push("start_date = ?");
      values.push(start_date || null);
    }
    if (end_date !== undefined) {
      updates.push("end_date = ?");
      values.push(end_date || null);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description || null);
    }

    if (!updates.length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one field to update",
      });
    }

    values.push(experienceId, doctorId);
    const result = await query(
      `UPDATE doctor_experience SET ${updates.join(", ")} WHERE experience_id = ? AND doctor_id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Experience not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Experience updated successfully",
    });
  } catch (error) {
    console.error("updateExperience error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update experience",
    });
  }
};

export const deleteExperience = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { experienceId } = req.params;

    const result = await query(
      `DELETE FROM doctor_experience WHERE experience_id = ? AND doctor_id = ?`,
      [experienceId, doctorId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Experience not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Experience deleted successfully",
    });
  } catch (error) {
    console.error("deleteExperience error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete experience",
    });
  }
};

export const getDoctorPatients = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const patients = await query(
      `SELECT 
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.gender,
        u.age,
        u.profile_image_url,
        COUNT(a.id) AS total_appointments,
        SUM(a.status IN ('pending','accepted')) AS active_appointments,
        MAX(a.appointment_date) AS last_appointment_date,
        MAX(a.appointment_time) AS last_appointment_time
      FROM appointments a
      INNER JOIN users u ON u.id = a.patient_id
      WHERE a.doctor_id = ?
      GROUP BY u.id
      ORDER BY last_appointment_date DESC, last_appointment_time DESC`,
      [doctorId]
    );

    return res.status(200).json({
      success: true,
      patients,
    });
  } catch (error) {
    console.error("getDoctorPatients error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch patients",
    });
  }
};

export const getDoctorPatientDetail = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { patientId } = req.params;

    const [patient] = await query(
      `SELECT DISTINCT
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.gender,
        u.age,
        u.profile_image_url,
        u.created_at
      FROM appointments a
      INNER JOIN users u ON u.id = a.patient_id
      WHERE a.doctor_id = ? AND a.patient_id = ?
      LIMIT 1`,
      [doctorId, patientId]
    );

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    const appointments = await query(
      `SELECT 
        id,
        appointment_date,
        appointment_time,
        appointment_for,
        fee,
        payment_method,
        status,
        reason,
        notes,
        created_at,
        updated_at
      FROM appointments
      WHERE doctor_id = ? AND patient_id = ?
      ORDER BY appointment_date DESC, appointment_time DESC`,
      [doctorId, patientId]
    );

    return res.status(200).json({
      success: true,
      patient: {
        ...patient,
        appointments,
      },
    });
  } catch (error) {
    console.error("getDoctorPatientDetail error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch patient details",
    });
  }
};

export const getMyAppointments = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { status } = req.query;
    const where = ["a.doctor_id = ?"];
    const params = [doctorId];

    if (status) {
      where.push("a.status = ?");
      params.push(status);
    }

    const appointments = await query(
      `SELECT 
        a.*,
        p.full_name AS patient_name,
        p.email AS patient_email,
        p.phone AS patient_phone,
        p.profile_image_url AS patient_profile_image
       FROM appointments a
       INNER JOIN users p ON p.id = a.patient_id
       WHERE ${where.join(" AND ")}
       ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      params
    );

    return res.status(200).json({
      success: true,
      appointments,
    });
  } catch (error) {
    console.error("getMyAppointments error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch appointments",
    });
  }
};

export const getAppointmentDetails = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { appointmentId } = req.params;
    const [appointment] = await query(
      `SELECT 
        a.*,
        p.full_name AS patient_name,
        p.email AS patient_email,
        p.phone AS patient_phone,
        p.profile_image_url AS patient_profile_image
       FROM appointments a
       INNER JOIN users p ON p.id = a.patient_id
       WHERE a.id = ? AND a.doctor_id = ?`,
      [appointmentId, doctorId]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const documents = await query(
      `SELECT id, file_url, description, uploaded_at, uploaded_by
       FROM appointment_documents
       WHERE appointment_id = ?
       ORDER BY uploaded_at DESC`,
      [appointmentId]
    );

    return res.status(200).json({
      success: true,
      appointment: {
        ...appointment,
        documents,
      },
    });
  } catch (error) {
    console.error("getAppointmentDetails error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch appointment details",
    });
  }
};

export const acceptAppointment = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { appointmentId } = req.params;

    const result = await query(
      `UPDATE appointments
       SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND doctor_id = ? AND status = 'pending'`,
      [appointmentId, doctorId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or already processed",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment accepted",
    });
  } catch (error) {
    console.error("acceptAppointment error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to accept appointment",
    });
  }
};

export const updateAppointment = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { appointmentId } = req.params;
    const { status, notes } = req.body;

    if (!status && !notes) {
      return res.status(400).json({
        success: false,
        message: "Provide status or notes to update",
      });
    }

    if (status && !allowedAppointmentStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of ${allowedAppointmentStatuses.join(", ")}`,
      });
    }

    const updates = [];
    const values = [];

    if (status) {
      updates.push("status = ?");
      values.push(status);
    }

    if (notes !== undefined) {
      updates.push("notes = ?");
      values.push(notes || null);
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    values.push(appointmentId, doctorId);

    const result = await query(
      `UPDATE appointments SET ${updates.join(", ")} WHERE id = ? AND doctor_id = ?`,
      values
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Si le rendez-vous est marqué comme complété
    if (status === 'completed') {
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();
        
        // Get appointment details with doctor speciality
        const [appointmentRows] = await connection.execute(
          `SELECT 
            a.patient_id, 
            a.doctor_id, 
            a.service_type, 
            a.purchase_id, 
            a.product_id,
            a.consumed_from_plan,
            a.fee,
            a.visit_type,
            u.speciality as doctor_speciality
           FROM appointments a
           INNER JOIN users u ON a.doctor_id = u.id
           WHERE a.id = ?`,
          [appointmentId]
        );

        if (appointmentRows && appointmentRows.length > 0) {
          const appointment = appointmentRows[0];
          
          // Check if this is a neurology appointment (by service_type OR doctor speciality)
          const isNeurologyAppointment = 
            appointment.service_type === 'neurology' || 
            appointment.doctor_speciality?.toLowerCase() === 'neurologist';
          
          console.log(`🔍 Appointment ${appointmentId} completion check: service_type=${appointment.service_type}, doctor_speciality=${appointment.doctor_speciality}, isNeurology=${isNeurologyAppointment}`);
          
          // 1. Unlock services if neurology appointment is completed
          if (isNeurologyAppointment) {
            try {
              if (appointment.purchase_id) {
                // Unlock services in wallet that require neurology completion
                await unlockServicesAfterNeurology(appointment.patient_id, appointment.purchase_id);
                console.log(`✅ Services unlocked after neurology appointment ${appointmentId} (via unlockServicesAfterNeurology)`);
              }
              
              // Also unlock all other services in wallet for this patient (regardless of purchase_id)
              // This ensures all services unlock after neurology completion
              const [unlockAllResult] = await connection.execute(
                `UPDATE patient_service_wallet psw
                 SET psw.is_locked = 0
                 WHERE psw.patient_id = ?
                   AND psw.service_type != 'neurology'
                   AND psw.is_locked = 1`,
                [appointment.patient_id]
              );
              
              if (unlockAllResult.affectedRows > 0) {
                console.log(`✅ Unlocked ${unlockAllResult.affectedRows} additional services after neurology appointment ${appointmentId}`);
              } else {
                console.log(`ℹ️ No services found to unlock for patient ${appointment.patient_id} (may already be unlocked)`);
              }
            } catch (unlockError) {
              console.error("❌ Error unlocking services after neurology completion:", unlockError);
              // Don't fail if unlock fails
            }
          } else {
            console.log(`ℹ️ Appointment ${appointmentId} is not a neurology appointment, skipping unlock`);
          }

          // 2. Create transaction and update doctor balance
          // Check if transaction already exists for this appointment
          const [existingTx] = await connection.execute(
            `SELECT id FROM transactions WHERE appointment_id = ?`,
            [appointmentId]
          );

          if (!existingTx || existingTx.length === 0) {
            let commission = { platformFee: 0, professionalEarning: 0 };
            const appointmentFee = parseFloat(appointment.fee || 0);

            if (appointment.consumed_from_plan === 1 && appointment.purchase_id && appointment.product_id) {
              // Plan-based appointment: use plan commission rates
              try {
                commission = await calculateCommission(appointment.product_id, appointment.visit_type || 'followup', 0);
              } catch (error) {
                console.error("Error calculating commission for plan appointment:", error);
                // Use default if calculation fails
                commission = { platformFee: 0, professionalEarning: 0 };
              }

              // Create transaction for plan appointment
              await connection.execute(
                `INSERT INTO transactions
                 (transaction_type, appointment_id, patient_id, doctor_id, amount, payment_method, status,
                  product_id, purchase_id, platform_fee, professional_earning)
                 VALUES ('followup_appointment', ?, ?, ?, ?, 'card', 'paid', ?, ?, ?, ?)`,
                [
                  appointmentId,
                  appointment.patient_id,
                  appointment.doctor_id,
                  0, // amount = 0 for plan appointments
                  appointment.product_id,
                  appointment.purchase_id,
                  commission.platformFee || 0,
                  commission.professionalEarning || 0,
                ]
              );

              // Update doctor balance with professional earning from plan
              if (commission.professionalEarning > 0) {
                await connection.execute(
                  `UPDATE users SET balance = balance + ? WHERE id = ? AND role = 'doctor'`,
                  [commission.professionalEarning, appointment.doctor_id]
                );
                console.log(`✅ Updated doctor ${appointment.doctor_id} balance from plan: +${commission.professionalEarning}`);
              }
            } else if (appointmentFee > 0) {
              // Follow-up paid appointment: 80% doctor, 20% platform
              const platformFee = appointmentFee * 0.20; // 20%
              const professionalEarning = appointmentFee * 0.80; // 80%

              // Create transaction for paid follow-up appointment
              await connection.execute(
                `INSERT INTO transactions
                 (transaction_type, appointment_id, patient_id, doctor_id, amount, payment_method, status,
                  platform_fee, professional_earning)
                 VALUES ('followup_appointment', ?, ?, ?, ?, 'card', 'paid', ?, ?)`,
                [
                  appointmentId,
                  appointment.patient_id,
                  appointment.doctor_id,
                  appointmentFee,
                  platformFee,
                  professionalEarning,
                ]
              );

              // Update doctor balance (80% of appointment fee)
              await connection.execute(
                `UPDATE users SET balance = balance + ? WHERE id = ? AND role = 'doctor'`,
                [professionalEarning, appointment.doctor_id]
              );
              console.log(`✅ Updated doctor ${appointment.doctor_id} balance from follow-up appointment: +${professionalEarning}`);
            }
          } else {
            console.log(`ℹ️ Transaction already exists for appointment ${appointmentId}`);
          }
        }

        await connection.commit();
      } catch (txError) {
        await connection.rollback();
        console.error("Error processing appointment completion:", txError);
        // Don't fail the appointment update if transaction creation fails
      } finally {
        connection.release();
      }
    }

    return res.status(200).json({
      success: true,
      message: "Appointment updated successfully",
    });
  } catch (error) {
    console.error("updateAppointment error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update appointment",
    });
  }
};

export const uploadAppointmentDocument = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { appointmentId } = req.params;
    const { description, document_type } = req.body;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    if (!document_type) {
      return res.status(400).json({
        success: false,
        message: "document_type is required",
      });
    }

    const [appointment] = await query(
      `SELECT id FROM appointments WHERE id = ? AND doctor_id = ?`,
      [appointmentId, doctorId]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const fileUrl = toPublicPath(req.file.path);
    const docDescription = description || null;
    
    // Store document_type in description field if document_type column doesn't exist
    // Format: "document_type: Prescription | description text"
    const fullDescription = document_type 
      ? (docDescription ? `${document_type}: ${docDescription}` : document_type)
      : docDescription;

    await query(
      `INSERT INTO appointment_documents (appointment_id, uploaded_by, file_url, description)
       VALUES (?, ?, ?, ?)`,
      [appointmentId, doctorId, fileUrl, fullDescription]
    );

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully",
      file: {
        file_name: req.file.originalname,
        file_type: imageExtensions.includes(fileExtension) ? "image" : "document",
        file_url: fileUrl,
        document_type: document_type,
      },
    });
  } catch (error) {
    console.error("uploadAppointmentDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to upload document",
    });
  }
};

export const uploadDoctorDocument = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { document_type } = req.body;

    if (!document_type) {
      return res.status(400).json({
        success: false,
        message: "document_type is required",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
      });
    }

    const fileUrl = toPublicPath(req.file.path);

    const insertResult = await query(
      `INSERT INTO doctor_documents (doctor_id, document_type, file_url, status)
       VALUES (?, ?, ?, 'pending')`,
      [doctorId, document_type, fileUrl]
    );

    return res.status(201).json({
      success: true,
      message: "Document uploaded successfully. Awaiting admin review.",
      document_id: insertResult.insertId,
    });
  } catch (error) {
    console.error("uploadDoctorDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to upload document",
    });
  }
};

export const getMyDocuments = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const documents = await query(
      `SELECT id, document_type, file_url, status, uploaded_at 
       FROM doctor_documents
       WHERE doctor_id = ?
       ORDER BY uploaded_at DESC`,
      [doctorId]
    );

    return res.status(200).json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error("getMyDocuments error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch documents",
    });
  }
};

export const deleteDoctorDocument = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { documentId } = req.params;

    const result = await query(
      `DELETE FROM doctor_documents WHERE id = ? AND doctor_id = ? AND status != 'approved'`,
      [documentId, doctorId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Document not found or already approved",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("deleteDoctorDocument error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete document",
    });
  }
};

export const getAppointmentReview = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const { appointmentId } = req.params;

    const [review] = await query(
      `SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        u.full_name AS patient_name
       FROM reviews r
       INNER JOIN appointments a ON r.appointment_id = a.id
       INNER JOIN users u ON r.patient_id = u.id
       WHERE r.appointment_id = ? AND a.doctor_id = ?`,
      [appointmentId, doctorId]
    );

    return res.status(200).json({
      success: true,
      hasReview: !!review,
      review: review || null,
    });
  } catch (error) {
    console.error("getAppointmentReview error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch review",
    });
  }
};

export const getDashboardMetrics = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get start of current week (Monday)
    const startOfWeek = new Date(today);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStartStr = startOfWeek.toISOString().split('T')[0];

    // Total patients (unique patient count)
    const [totalPatientsResult] = await query(
      `SELECT COUNT(DISTINCT patient_id) as count 
       FROM appointments 
       WHERE doctor_id = ?`,
      [doctorId]
    );

    // Total appointments
    const [totalAppointmentsResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE doctor_id = ?`,
      [doctorId]
    );

    // Total earnings (sum of fees from completed appointments)
    const [totalEarningsResult] = await query(
      `SELECT COALESCE(SUM(fee), 0) as total 
       FROM appointments 
       WHERE doctor_id = ? AND status = 'completed'`,
      [doctorId]
    );

    // Get doctor's balance from users table
    const [balanceResult] = await query(
      `SELECT COALESCE(balance, 0) as balance 
       FROM users 
       WHERE id = ? AND role = 'doctor'`,
      [doctorId]
    );

    // Pending appointments
    const [pendingAppointmentsResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE doctor_id = ? AND status = 'pending'`,
      [doctorId]
    );

    // Weekly appointments and revenue (last 7 days)
    const weeklyData = await query(
      `SELECT 
    DATE(appointment_date) AS date,
    DAYNAME(appointment_date) AS day_name,
    COUNT(*) AS appointments,
    COALESCE(SUM(CASE WHEN status = 'completed' THEN fee ELSE 0 END), 0) AS revenue
FROM appointments
WHERE doctor_id = ?  
  AND appointment_date >= ?
GROUP BY DATE(appointment_date), DAYNAME(appointment_date)
ORDER BY DATE(appointment_date) ASC;`,
      [doctorId, weekStartStr]
    );

    // Appointment breakdown by status for pie chart
    const statusBreakdown = await query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM appointments
       WHERE doctor_id = ?
       GROUP BY status`,
      [doctorId]
    );

    // Upcoming consultations (accepted appointments with future dates or today)
    const upcomingConsultations = await query(
      `SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.appointment_for,
        u.full_name AS patient_name,
        u.profile_image_url AS patient_profile_image
      FROM appointments a
      INNER JOIN users u ON a.patient_id = u.id
      WHERE a.doctor_id = ? 
        AND a.status = 'accepted' 
        AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= TIME(NOW())))
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT 5`,
      [doctorId, todayStr, todayStr]
    );

    // Format weekly data with day names
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const dayAbbr = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weeklyChartData = dayNames.map((dayName, index) => {
      const dayData = weeklyData.find(d => d.day_name === dayName);
      return {
        day: dayAbbr[index],
        appointments: dayData ? parseInt(dayData.appointments) : 0,
        revenue: dayData ? parseFloat(dayData.revenue) : 0,
      };
    });

    // Format status breakdown for pie chart
    const pieChartData = statusBreakdown.map(item => ({
      name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
      value: parseInt(item.count),
      status: item.status,
    }));

    return res.status(200).json({
      success: true,
      metrics: {
        total_patients: parseInt(totalPatientsResult.count) || 0,
        total_appointments: parseInt(totalAppointmentsResult.count) || 0,
        total_earnings: parseFloat(totalEarningsResult.total) || 0,
        balance: parseFloat(balanceResult.balance) || 0,
        pending_appointments: parseInt(pendingAppointmentsResult.count) || 0,
        weekly_appointments_revenue: weeklyChartData,
        pie_chart_data: pieChartData,
        upcoming_consultations: upcomingConsultations,
      },
    });
  } catch (error) {
    console.error("getDashboardMetrics error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard metrics",
    });
  }
};
