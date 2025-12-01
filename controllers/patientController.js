import { query } from "../config/db.js";

const parseSchedule = (scheduleRow) => {
  if (!scheduleRow) return null;
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const parsed = {};

  days.forEach((day) => {
    const value = scheduleRow[day];
    if (!value && value !== 0) {
      parsed[day] = null;
      return;
    }

    if (typeof value === "string") {
      try {
        parsed[day] = JSON.parse(value);
      } catch (error) {
        console.warn(`parseSchedule: failed to parse ${day} for doctor ${scheduleRow.doctor_id}:`, error.message);
        parsed[day] = null;
      }
      return;
    }

    if (typeof value === "object") {
      parsed[day] = value;
      return;
    }

    parsed[day] = null;
  });

  return parsed;
};

export const getBestDoctorFromTriage = async (req, res) => {
  try {
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Answers array is required",
      });
    }

    // Calculate scores
    const scores = { physical: 0, psychological: 0, nutritional: 0 };
    answers.forEach((answer) => {
      if (answer === "physical") scores.physical++;
      else if (answer === "psychological") scores.psychological++;
      else if (answer === "nutritional") scores.nutritional++;
    });

    // Determine result (default = physical)
    let result = "physical";
    if (scores.psychological > scores.physical && scores.psychological > scores.nutritional) {
      result = "psychological";
    } else if (scores.nutritional > scores.physical && scores.nutritional > scores.psychological) {
      result = "nutritional";
    }

    // Map result to speciality
    let speciality;
    if (result === "physical") {
      speciality = "physiotherapist";
    } else if (result === "psychological") {
      speciality = "psychologist";
    } else {
      speciality = "nutritionist";
    }

    console.log("Triage request:", { answers, scores, result, speciality });

    // Get top-rated doctor for this speciality (case-insensitive match)
    // Handle NULL speciality values
    const searchSpeciality = speciality.trim().toLowerCase();
    console.log("Searching for speciality:", searchSpeciality);
    
    const doctors = await query(
      `
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.phone,
          u.speciality,
          u.experience_years,
          u.fee,
          u.education,
          u.profile_image_url,
          u.active,
          u.bio,
          ROUND(COALESCE(AVG(r.rating), 0), 2) as average_rating,
          COUNT(r.id) as total_reviews
        FROM users u
        LEFT JOIN reviews r ON r.doctor_id = u.id
        WHERE u.role = 'doctor' 
          AND u.active = 1 
          AND u.speciality IS NOT NULL
          AND LOWER(u.speciality) = ?
        GROUP BY u.id
        ORDER BY average_rating DESC, total_reviews DESC, u.full_name ASC
        LIMIT 1
      `,
      [searchSpeciality]
    );
    
    console.log("Query result:", doctors.length, "doctors found");

    if (doctors.length === 0) {
      // Try to find any doctor with similar speciality (fallback)
      const fallbackSpeciality1 = `%${searchSpeciality}%`;
      const fallbackSpeciality2 = `%${searchSpeciality.slice(0, 5)}%`;
      const fallbackDoctors = await query(
        `
          SELECT 
            u.id,
            u.full_name,
            u.email,
            u.phone,
            u.speciality,
            u.experience_years,
            u.fee,
            u.education,
            u.profile_image_url,
            u.active,
            u.bio,
            ROUND(COALESCE(AVG(r.rating), 0), 2) as average_rating,
            COUNT(r.id) as total_reviews
          FROM users u
          LEFT JOIN reviews r ON r.doctor_id = u.id
          WHERE u.role = 'doctor' 
            AND u.active = 1 
            AND u.speciality IS NOT NULL
            AND (LOWER(u.speciality) LIKE ? OR LOWER(u.speciality) LIKE ?)
          GROUP BY u.id
          ORDER BY average_rating DESC, total_reviews DESC, u.full_name ASC
          LIMIT 1
        `,
        [fallbackSpeciality1, fallbackSpeciality2]
      );

      if (fallbackDoctors.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No ${speciality} found`,
          result,
          speciality,
        });
      }

      // Use fallback doctor
      return res.status(200).json({
        success: true,
        doctor: fallbackDoctors[0],
        result,
        speciality: fallbackDoctors[0].speciality,
      });
    }

    return res.status(200).json({
      success: true,
      doctor: doctors[0],
      result,
      speciality,
    });
  } catch (error) {
    console.error("getBestDoctorFromTriage error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      answers: req.body?.answers,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to find best doctor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const getAllDoctors = async (req, res) => {
  try {
    const { speciality, search } = req.query;

    const where = ["u.role = 'doctor'", "u.active = 1"];
    const params = [];

    if (speciality) {
      where.push("u.speciality = ?");
      params.push(speciality);
    }

    if (search) {
      where.push("(u.full_name LIKE ? OR u.education LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const doctors = await query(
      `
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.phone,
          u.speciality,
          u.experience_years,
          u.fee,
          u.education,
          u.profile_image_url,
          u.active,
          ROUND(COALESCE(AVG(r.rating), 0), 2) as average_rating,
          COUNT(r.id) as total_reviews
        FROM users u
        LEFT JOIN reviews r ON r.doctor_id = u.id
        WHERE ${where.join(" AND ")}
        GROUP BY u.id
        ORDER BY average_rating DESC, u.full_name ASC
      `,
      params
    );

    return res.status(200).json({
      success: true,
      doctors,
    });
  } catch (error) {
    console.error("getAllDoctors error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch doctors",
    });
  }
};

export const getDoctorById = async (req, res) => {
  try {
    const doctorId = parseInt(req.params.doctorId, 10);
    if (isNaN(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID" });
    }

    const [doctor] = await query(
      `SELECT * FROM users WHERE id = ? AND role = 'doctor' AND active = 1`,
      [doctorId]
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    const [scheduleRow] = await query(`SELECT * FROM doctor_schedules WHERE doctor_id = ?`, [doctorId]);
    const parsedSchedule = scheduleRow ? parseSchedule(scheduleRow) : {};

    const doctor_education = await query(
      `SELECT * FROM doctor_education 
       WHERE doctor_id = ? 
       ORDER BY end_year IS NULL, end_year DESC, start_year DESC`,
      [doctorId]
    ).catch(() => []);

    const experience = await query(
      `SELECT * FROM doctor_experience 
       WHERE doctor_id = ? 
       ORDER BY end_date IS NULL, end_date DESC, start_date DESC`,
      [doctorId]
    ).catch(() => []);

    const documents = await query(
      `SELECT id, document_type, file_url, status, uploaded_at 
       FROM doctor_documents 
       WHERE doctor_id = ?`,
      [doctorId]
    ).catch(() => []);

    const reviews = await query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS patient_name
       FROM reviews r
       INNER JOIN users u ON r.patient_id = u.id
       WHERE r.doctor_id = ?
       ORDER BY r.created_at DESC`,
      [doctorId]
    ).catch(() => []);

    return res.status(200).json({
      success: true,
      doctor: {
        ...doctor,
        schedule: parsedSchedule,
        experience,
        doctor_education,
        documents,
        reviews,
      },
    });
  } catch (error) {
    console.error("getDoctorById error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch doctor details",
    });
  }
};


export const createAppointment = async (req, res) => {
  try {
    const patientId = req.user.id;
    const {
      doctor_id,
      appointment_date,
      appointment_time,
      appointment_for,
      reason,
      notes,
      payment_method,
    } = req.body;

    if (!doctor_id || !appointment_date || !appointment_time || !appointment_for) {
      return res.status(400).json({
        success: false,
        message: "doctor_id, appointment_date, appointment_time and appointment_for are required",
      });
    }

    if (!payment_method) {
      return res.status(400).json({
        success: false,
        message: "payment_method is required",
      });
    }

    // Parse appointment_time - handle both "HH:MM" and "HH:MM - HH:MM" formats
    let timeToStore = appointment_time;
    if (appointment_time.includes(' - ')) {
      // Extract start time from range (e.g., "20:00 - 22:00" -> "20:00")
      timeToStore = appointment_time.split(' - ')[0].trim();
    }
    
    // Validate time format (HH:MM or HH:MM:SS)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9](:([0-5][0-9]))?$/;
    if (!timeRegex.test(timeToStore)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment_time format. Expected HH:MM format (e.g., 20:00)",
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(appointment_date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment_date format. Expected YYYY-MM-DD format",
      });
    }

    // Check if date is in the past
    const appointmentDate = new Date(appointment_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (appointmentDate < today) {
      return res.status(400).json({
        success: false,
        message: "Appointment date cannot be in the past",
      });
    }

    const [doctor] = await query(
      `SELECT id, fee FROM users WHERE id = ? AND role = 'doctor' AND active = 1`,
      [doctor_id]
    );

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found or inactive",
      });
    }

    // Check for duplicate appointments
    const existing = await query(
      `SELECT id FROM appointments 
       WHERE patient_id = ? AND doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status NOT IN ('cancelled', 'rejected')`,
      [patientId, doctor_id, appointment_date, timeToStore]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "You already have an appointment scheduled at this date and time",
      });
    }

    const insertResult = await query(
      `INSERT INTO appointments 
        (patient_id, doctor_id, appointment_date, appointment_time, appointment_for, fee, payment_method, reason, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        patientId,
        doctor_id,
        appointment_date,
        timeToStore,
        appointment_for,
        doctor.fee ?? null,
        payment_method,
        reason || null,
        notes || null,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Appointment request submitted successfully",
      appointment_id: insertResult.insertId,
      fee: doctor.fee,
    });
  } catch (error) {
    console.error("createAppointment error:", error);
    
    // Provide more specific error messages
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: "An appointment already exists at this date and time",
      });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor_id or patient_id",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to create appointment. Please try again later.",
    });
  }
};

export const getMyAppointments = async (req, res) => {
  try {
    const patientId = req.user.id;
    const appointments = await query(
      `SELECT 
        a.*,
        d.full_name AS doctor_name,
        d.speciality AS doctor_speciality,
        d.profile_image_url AS doctor_profile_image,
        d.fee AS doctor_fee
      FROM appointments a
      INNER JOIN users d ON a.doctor_id = d.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [patientId]
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
    const patientId = req.user.id;
    const { appointmentId } = req.params;

    const [appointment] = await query(
      `SELECT 
        a.*,
        d.full_name AS doctor_name,
        d.speciality AS doctor_speciality,
        d.profile_image_url AS doctor_profile_image
      FROM appointments a
      INNER JOIN users d ON a.doctor_id = d.id
      WHERE a.id = ? AND a.patient_id = ?`,
      [appointmentId, patientId]
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

export const cancelAppointment = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { appointmentId } = req.params;

    const result = await query(
      `UPDATE appointments 
       SET status = 'cancelled'
       WHERE id = ? AND patient_id = ? AND status IN ('pending', 'accepted')`,
      [appointmentId, patientId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or cannot be cancelled anymore",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment cancelled",
    });
  } catch (error) {
    console.error("cancelAppointment error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to cancel appointment",
    });
  }
};

export const submitReview = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { doctor_id, appointment_id, rating, comment } = req.body;

    if (!doctor_id || !appointment_id || !rating) {
      return res.status(400).json({
        success: false,
        message: "doctor_id, appointment_id and rating are required",
      });
    }

    if (Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        success: false,
        message: "rating must be between 1 and 5",
      });
    }

    const [appointment] = await query(
      `SELECT id, status FROM appointments 
       WHERE id = ? AND patient_id = ? AND doctor_id = ?`,
      [appointment_id, patientId, doctor_id]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (!["completed", "accepted"].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: "You can only review completed or accepted appointments",
      });
    }

    const existing = await query(
      `SELECT id FROM reviews WHERE appointment_id = ? AND patient_id = ?`,
      [appointment_id, patientId]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this appointment",
      });
    }

    const insertResult = await query(
      `INSERT INTO reviews (doctor_id, patient_id, appointment_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [doctor_id, patientId, appointment_id, rating, comment || null]
    );

    return res.status(201).json({
      success: true,
      message: "Review submitted",
      review_id: insertResult.insertId,
    });
  } catch (error) {
    console.error("submitReview error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to submit review",
    });
  }
};

export const checkReviewExists = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { appointmentId } = req.params;

    const [review] = await query(
      `SELECT id, rating, comment, created_at 
       FROM reviews 
       WHERE appointment_id = ? AND patient_id = ?`,
      [appointmentId, patientId]
    );

    return res.status(200).json({
      success: true,
      hasReview: !!review,
      review: review || null,
    });
  } catch (error) {
    console.error("checkReviewExists error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to check review status",
    });
  }
};

export const getDashboardMetrics = async (req, res) => {
  try {
    const patientId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get active appointments (pending + accepted)
    const [activeResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE patient_id = ? AND status IN ('pending', 'accepted')`,
      [patientId]
    );

    // Get completed appointments
    const [completedResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE patient_id = ? AND status = 'completed'`,
      [patientId]
    );

    // Get upcoming consultations (accepted appointments with future dates or today)
    const [upcomingResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE patient_id = ? 
         AND status = 'accepted' 
         AND (appointment_date > ? OR (appointment_date = ? AND appointment_time >= TIME(NOW())))`,
      [patientId, todayStr, todayStr]
    );

    // Get appointment breakdown by status for pie chart
    const statusBreakdown = await query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM appointments
       WHERE patient_id = ?
       GROUP BY status`,
      [patientId]
    );

    // Get upcoming appointments list (for display)
    const upcomingAppointments = await query(
      `SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        d.full_name AS doctor_name,
        d.speciality AS doctor_speciality,
        d.profile_image_url AS doctor_profile_image
      FROM appointments a
      INNER JOIN users d ON a.doctor_id = d.id
      WHERE a.patient_id = ? 
        AND a.status = 'accepted' 
        AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= TIME(NOW())))
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT 5`,
      [patientId, todayStr, todayStr]
    );

    // Format status breakdown for pie chart
    const pieChartData = statusBreakdown.map(item => ({
      name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
      value: parseInt(item.count),
      status: item.status,
    }));

    return res.status(200).json({
      success: true,
      metrics: {
        active_appointments: parseInt(activeResult.count) || 0,
        completed_appointments: parseInt(completedResult.count) || 0,
        upcoming_consultations: parseInt(upcomingResult.count) || 0,
        pie_chart_data: pieChartData,
        upcoming_appointments: upcomingAppointments,
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
