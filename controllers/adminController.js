import { query } from "../config/db.js";

const parseBoolean = (value) => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  return value === "true" || value === "1";
};

export const getUsers = async (req, res) => {
  try {
    const { role, active, search } = req.query;
    const conditions = [];
    const params = [];

    if (role) {
      conditions.push("role = ?");
      params.push(role);
    }

    if (active !== undefined) {
      conditions.push("active = ?");
      params.push(parseBoolean(active) ? 1 : 0);
    }

    if (search) {
      conditions.push("(full_name LIKE ? OR email LIKE ? OR phone LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const users = await query(
      `SELECT id, full_name, email, phone, role, active, gender, age, speciality, experience_years, fee, created_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC`,
      params
    );

    return res.status(200).json({
      success: true,
      users,
    });
  } catch (error) {
    console.error("getUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch users",
    });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { active } = req.body;

    if (active === undefined) {
      return res.status(400).json({
        success: false,
        message: "active flag is required",
      });
    }

    const result = await query(
      `UPDATE users SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [active ? 1 : 0, userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `User has been ${active ? "activated" : "deactivated"}`,
    });
  } catch (error) {
    console.error("updateUserStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update user status",
    });
  }
};

export const getDoctorDocuments = async (req, res) => {
  try {
    const { doctorId, status } = req.query;
    const conditions = [];
    const params = [];

    if (doctorId) {
      conditions.push("d.doctor_id = ?");
      params.push(doctorId);
    }

    if (status) {
      conditions.push("d.status = ?");
      params.push(status);
    }

    const documents = await query(
      `SELECT d.id, d.doctor_id, u.full_name AS doctor_name, u.profile_image_url AS doctor_profile_image, d.document_type, d.file_url, d.status, d.uploaded_at
       FROM doctor_documents d
       INNER JOIN users u ON u.id = d.doctor_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY d.uploaded_at DESC`,
      params
    );

    return res.status(200).json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error("getDoctorDocuments error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch documents",
    });
  }
};

export const setDoctorDocumentStatus = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { status } = req.body;
    const allowedStatuses = ["pending", "approved", "rejected"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of ${allowedStatuses.join(", ")}`,
      });
    }

    const result = await query(
      `UPDATE doctor_documents SET status = ? WHERE id = ?`,
      [status, documentId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Document not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Document status updated",
    });
  } catch (error) {
    console.error("setDoctorDocumentStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update document status",
    });
  }
};

export const getAppointmentsAdmin = async (req, res) => {
  try {
    const { status, doctorId, patientId } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push("a.status = ?");
      params.push(status);
    }
    if (doctorId) {
      conditions.push("a.doctor_id = ?");
      params.push(doctorId);
    }
    if (patientId) {
      conditions.push("a.patient_id = ?");
      params.push(patientId);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const appointments = await query(
      `SELECT 
        a.*,
        d.full_name AS doctor_name,
        p.full_name AS patient_name
       FROM appointments a
       INNER JOIN users d ON d.id = a.doctor_id
       INNER JOIN users p ON p.id = a.patient_id
       ${whereClause}
       ORDER BY a.created_at DESC`,
      params
    );

    return res.status(200).json({
      success: true,
      appointments,
    });
  } catch (error) {
    console.error("getAppointmentsAdmin error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch appointments",
    });
  }
};

export const updateAppointmentStatusAdmin = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { status } = req.body;
    const allowedStatuses = ["pending", "accepted", "rejected", "completed", "cancelled"];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of ${allowedStatuses.join(", ")}`,
      });
    }

    const result = await query(
      `UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, appointmentId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment status updated",
    });
  } catch (error) {
    console.error("updateAppointmentStatusAdmin error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update appointment",
    });
  }
};

export const getTransactions = async (req, res) => {
  try {
    const { status } = req.query;
    const conditions = [];
    const params = [];

    if (status) {
      conditions.push("t.status = ?");
      params.push(status);
    }

    const transactions = await query(
      `SELECT 
        t.id,
        t.transaction_type,
        t.amount,
        t.status,
        t.payment_method,
        t.created_at,
        t.platform_fee,
        t.professional_earning,
        t.product_id,
        t.purchase_id,
        t.appointment_id,
        d.id AS doctor_id,
        d.full_name AS doctor_name,
        d.speciality AS doctor_speciality,
        p.id AS patient_id,
        p.full_name AS patient_name,
        a.appointment_date,
        a.appointment_time,
        a.appointment_for,
        a.service_type,
        a.visit_type,
        pr.name AS product_name,
        pr.product_type,
        pr.platform_commission_percent,
        pr.followup_commission_percent,
        CASE 
          WHEN a.visit_type = 'followup' AND pr.followup_commission_percent IS NOT NULL 
          THEN pr.followup_commission_percent
          ELSE pr.platform_commission_percent
        END AS applied_commission_percent,
        CASE 
          WHEN t.platform_fee IS NOT NULL AND t.amount > 0
          THEN ROUND((t.platform_fee / t.amount) * 100, 2)
          WHEN pr.platform_commission_percent IS NOT NULL
          THEN pr.platform_commission_percent
          ELSE NULL
        END AS calculated_commission_rate
       FROM transactions t
       LEFT JOIN users d ON d.id = t.doctor_id
       LEFT JOIN users p ON p.id = t.patient_id
       LEFT JOIN appointments a ON a.id = t.appointment_id
       LEFT JOIN products pr ON pr.id = t.product_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY t.created_at DESC`,
      params
    );

    // Calculate summary with commission details
    const [summaryData] = await query(
      `SELECT 
        COUNT(*) AS total_count,
        SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS total_paid,
        SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_count,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status='paid' THEN platform_fee ELSE 0 END) AS total_platform_fee,
        SUM(CASE WHEN status='paid' THEN professional_earning ELSE 0 END) AS total_professional_earning,
        SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS total_amount
       FROM transactions t
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}`,
      params
    );

    return res.status(200).json({
      success: true,
      transactions,
      summary: summaryData || {
        total_count: 0,
        total_paid: 0,
        paid_count: 0,
        pending_count: 0,
        failed_count: 0,
        total_platform_fee: 0,
        total_professional_earning: 0,
        total_amount: 0,
      },
    });
  } catch (error) {
    console.error("getTransactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch transactions",
    });
  }
};

export const createTransaction = async (req, res) => {
  try {
    const { appointment_id, patient_id, doctor_id, amount, payment_method, status } = req.body;

    if (!appointment_id || !patient_id || !doctor_id || !amount || !payment_method) {
      return res.status(400).json({
        success: false,
        message: "appointment_id, patient_id, doctor_id, amount and payment_method are required",
      });
    }

    const allowedStatuses = ["pending", "paid", "failed", "refunded"];
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of ${allowedStatuses.join(", ")}`,
      });
    }

    const insertResult = await query(
      `INSERT INTO transactions 
        (appointment_id, patient_id, doctor_id, amount, payment_method, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [appointment_id, patient_id, doctor_id, amount, payment_method, status || "pending"]
    );

    return res.status(201).json({
      success: true,
      message: "Transaction recorded",
      transaction_id: insertResult.insertId,
    });
  } catch (error) {
    console.error("createTransaction error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create transaction",
    });
  }
};

export const getDashboardOverview = async (req, res) => {
  try {
    const [counts] = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'patient') AS total_patients,
        (SELECT COUNT(*) FROM users WHERE role = 'doctor') AS total_doctors,
        (SELECT COUNT(*) FROM users WHERE role = 'doctor' AND active = 0) AS pending_doctors,
        (SELECT COUNT(*) FROM appointments WHERE status = 'pending') AS pending_appointments,
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE status = 'paid') AS total_revenue
    `);

    const recentTransactions = await query(
      `SELECT t.id, t.amount, t.status, t.payment_method, t.created_at, p.full_name AS patient_name, d.full_name AS doctor_name
       FROM transactions t
       INNER JOIN users p ON p.id = t.patient_id
       INNER JOIN users d ON d.id = t.doctor_id
       ORDER BY t.created_at DESC
       LIMIT 10`
    );

    const revenueByMonth = await query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, SUM(amount) AS total
       FROM transactions
       WHERE status = 'paid'
       GROUP BY DATE_FORMAT(created_at, '%Y-%m')
       ORDER BY month DESC
       LIMIT 6`
    );

    return res.status(200).json({
      success: true,
      stats: counts,
      recentTransactions,
      revenueByMonth,
    });
  } catch (error) {
    console.error("getDashboardOverview error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard stats",
    });
  }
};

// Dashboard Metrics with charts data
export const getDashboardMetrics = async (req, res) => {
  try {
    // Total counts
    const [counts] = await query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'patient') AS total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'doctor') AS total_doctors,
        (SELECT COUNT(*) FROM appointments) AS total_appointments,
        (SELECT COALESCE(SUM(fee), 0) FROM appointments WHERE status = 'completed') AS total_earnings
    `);

    // Weekly user growth (last 6 weeks) - simplified query
    const weeklyUserGrowth = await query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%u') AS week_key,
        DATE_FORMAT(created_at, 'Week %u') AS week,
        COUNT(*) AS users
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 WEEK)
      GROUP BY week_key, week
      ORDER BY week_key DESC
      LIMIT 6
    `);

    // Get revenue for each week separately
    const weeklyRevenue = await query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%u') AS week_key,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS revenue
      FROM transactions
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 WEEK)
      GROUP BY week_key
    `);

    // Merge revenue data with user growth
    const weeklyDataWithRevenue = weeklyUserGrowth.map(week => {
      const revenueData = weeklyRevenue.find(r => r.week_key === week.week_key);
      return {
        ...week,
        revenue: revenueData ? parseFloat(revenueData.revenue) : 0,
      };
    });

    // Monthly platform stats (last 6 months) - simplified query
    const monthlyPlatformStats = await query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS month_key,
        DATE_FORMAT(created_at, '%b') AS month,
        COUNT(*) AS consultations,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN fee ELSE 0 END), 0) AS revenue
      FROM appointments
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month_key, month
      ORDER BY month_key DESC
      LIMIT 6
    `);

    // Get active users per month
    const monthlyActiveUsers = await query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS month_key,
        COUNT(DISTINCT id) AS activeUsers
      FROM users
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month_key
    `);

    // Merge active users data with monthly stats
    const monthlyDataWithUsers = monthlyPlatformStats.map(month => {
      const userData = monthlyActiveUsers.find(u => u.month_key === month.month_key);
      return {
        ...month,
        activeUsers: userData ? parseInt(userData.activeUsers) : 0,
      };
    });

    return res.status(200).json({
      success: true,
      metrics: {
        total_users: parseInt(counts.total_users) || 0,
        total_doctors: parseInt(counts.total_doctors) || 0,
        total_appointments: parseInt(counts.total_appointments) || 0,
        total_earnings: parseFloat(counts.total_earnings) || 0,
        weekly_user_growth: weeklyDataWithRevenue.map(w => ({
          week: w.week || `Week ${w.week_key}`,
          users: parseInt(w.users) || 0,
          revenue: parseFloat(w.revenue) || 0,
        })),
        monthly_platform_stats: monthlyDataWithUsers.map(m => ({
          month: m.month,
          activeUsers: parseInt(m.activeUsers) || 0,
          consultations: parseInt(m.consultations) || 0,
          revenue: parseFloat(m.revenue) || 0,
        })),
      },
    });
  } catch (error) {
    console.error("getDashboardMetrics error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard metrics",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

// Update user
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { full_name, email, phone, gender, age, active } = req.body;

    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      updates.push("full_name = ?");
      params.push(full_name);
    }
    if (email !== undefined) {
      updates.push("email = ?");
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push("phone = ?");
      params.push(phone);
    }
    if (gender !== undefined) {
      updates.push("gender = ?");
      params.push(gender);
    }
    if (age !== undefined) {
      updates.push("age = ?");
      params.push(age);
    }
    if (active !== undefined) {
      updates.push("active = ?");
      params.push(active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(userId);

    const result = await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
    });
  } catch (error) {
    console.error("updateUser error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update user",
    });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user exists
    const [user] = await query(`SELECT id, role FROM users WHERE id = ?`, [userId]);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete user (cascade will handle related records if foreign keys are set)
    const result = await query(`DELETE FROM users WHERE id = ?`, [userId]);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("deleteUser error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete user",
    });
  }
};

// Get single doctor details with stats, appointments, reviews, documents
export const getDoctorById = async (req, res) => {
  try {
    const { doctorId } = req.params;

    // Get doctor basic info
    const [doctor] = await query(
      `SELECT 
        id, 
        full_name, 
        email, 
        phone, 
        role, 
        active, 
        gender, 
        age, 
        education,
        speciality, 
        experience_years, 
        fee, 
        bio,
        profile_image_url,
        created_at
       FROM users
       WHERE id = ? AND role = 'doctor'`,
      [doctorId]
    );

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Get appointment stats
    const [stats] = await query(
      `SELECT 
        COUNT(*) AS total_appointments,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_appointments,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_appointments,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) AS accepted_appointments,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_appointments,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN fee ELSE 0 END), 0) AS total_earnings
       FROM appointments
       WHERE doctor_id = ?`,
      [doctorId]
    );

    // Get recent appointments
    const appointments = await query(
      `SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.appointment_for,
        a.fee,
        a.created_at,
        p.full_name AS patient_name,
        p.profile_image_url AS patient_profile_image
       FROM appointments a
       LEFT JOIN users p ON p.id = a.patient_id
       WHERE a.doctor_id = ?
       ORDER BY a.appointment_date DESC, a.appointment_time DESC
       LIMIT 10`,
      [doctorId]
    );

    // Get reviews
    const reviews = await query(
      `SELECT 
        r.id,
        r.rating,
        r.comment,
        r.created_at,
        p.full_name AS patient_name,
        p.profile_image_url AS patient_profile_image
       FROM reviews r
       LEFT JOIN users p ON p.id = r.patient_id
       WHERE r.doctor_id = ?
       ORDER BY r.created_at DESC`,
      [doctorId]
    );

    // Calculate average rating
    const [ratingStats] = await query(
      `SELECT 
        AVG(rating) AS average_rating,
        COUNT(*) AS total_reviews
       FROM reviews
       WHERE doctor_id = ?`,
      [doctorId]
    );

    // Get documents
    const documents = await query(
      `SELECT 
        id,
        document_type,
        file_url,
        status,
        uploaded_at
       FROM doctor_documents
       WHERE doctor_id = ?
       ORDER BY uploaded_at DESC`,
      [doctorId]
    );

    return res.status(200).json({
      success: true,
      doctor: {
        ...doctor,
        stats: {
          total_appointments: parseInt(stats.total_appointments) || 0,
          completed_appointments: parseInt(stats.completed_appointments) || 0,
          pending_appointments: parseInt(stats.pending_appointments) || 0,
          accepted_appointments: parseInt(stats.accepted_appointments) || 0,
          cancelled_appointments: parseInt(stats.cancelled_appointments) || 0,
          total_earnings: parseFloat(stats.total_earnings) || 0,
          average_rating: parseFloat(ratingStats.average_rating) || 0,
          total_reviews: parseInt(ratingStats.total_reviews) || 0,
        },
        appointments,
        reviews,
        documents,
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

// Get all doctors
export const getDoctors = async (req, res) => {
  try {
    const { active, search, speciality } = req.query;
    const conditions = ["role = 'doctor'"];
    const params = [];

    if (active !== undefined) {
      conditions.push("active = ?");
      params.push(parseBoolean(active) ? 1 : 0);
    }

    if (search) {
      conditions.push("(full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR speciality LIKE ?)");
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (speciality) {
      conditions.push("speciality = ?");
      params.push(speciality);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    
    const doctors = await query(
      `SELECT 
        id, 
        full_name, 
        email, 
        phone, 
        role, 
        active, 
        gender, 
        age, 
        education,
        speciality, 
        experience_years, 
        fee, 
        bio,
        profile_image_url,
        created_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC`,
      params
    );

    // Get appointment counts for each doctor
    const doctorsWithStats = await Promise.all(
      doctors.map(async (doctor) => {
        const [stats] = await query(
          `SELECT 
            COUNT(*) AS total_appointments,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_appointments,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN fee ELSE 0 END), 0) AS total_earnings
           FROM appointments
           WHERE doctor_id = ?`,
          [doctor.id]
        );

        return {
          ...doctor,
          total_appointments: parseInt(stats.total_appointments) || 0,
          completed_appointments: parseInt(stats.completed_appointments) || 0,
          total_earnings: parseFloat(stats.total_earnings) || 0,
        };
      })
    );

    return res.status(200).json({
      success: true,
      doctors: doctorsWithStats,
    });
  } catch (error) {
    console.error("getDoctors error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch doctors",
    });
  }
};

// Update doctor
export const updateDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { full_name, email, phone, gender, age, education, speciality, experience_years, fee, bio, active } = req.body;

    // Verify doctor exists and is a doctor
    const [doctor] = await query(`SELECT id, role FROM users WHERE id = ?`, [doctorId]);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const updates = [];
    const params = [];

    if (full_name !== undefined) {
      updates.push("full_name = ?");
      params.push(full_name);
    }
    if (email !== undefined) {
      updates.push("email = ?");
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push("phone = ?");
      params.push(phone);
    }
    if (gender !== undefined) {
      updates.push("gender = ?");
      params.push(gender);
    }
    if (age !== undefined) {
      updates.push("age = ?");
      params.push(age);
    }
    if (education !== undefined) {
      updates.push("education = ?");
      params.push(education);
    }
    if (speciality !== undefined) {
      updates.push("speciality = ?");
      params.push(speciality);
    }
    if (experience_years !== undefined) {
      updates.push("experience_years = ?");
      params.push(experience_years);
    }
    if (fee !== undefined) {
      updates.push("fee = ?");
      params.push(fee);
    }
    if (bio !== undefined) {
      updates.push("bio = ?");
      params.push(bio);
    }
    if (active !== undefined) {
      updates.push("active = ?");
      params.push(active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(doctorId);

    const result = await query(
      `UPDATE users SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    return res.status(200).json({
      success: true,
      message: "Doctor updated successfully",
    });
  } catch (error) {
    console.error("updateDoctor error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update doctor",
    });
  }
};

// Delete doctor
export const deleteDoctor = async (req, res) => {
  try {
    const { doctorId } = req.params;

    // Check if doctor exists
    const [doctor] = await query(`SELECT id, role FROM users WHERE id = ?`, [doctorId]);
    if (!doctor || doctor.role !== 'doctor') {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Delete doctor
    const result = await query(`DELETE FROM users WHERE id = ?`, [doctorId]);

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Doctor deleted successfully",
    });
  } catch (error) {
    console.error("deleteDoctor error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete doctor",
    });
  }
};

// Appointment overview
export const getAppointmentOverview = async (req, res) => {
  try {
    // Total appointments by status
    const statusBreakdown = await query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM appointments
       GROUP BY status`
    );

    // Recent appointments
    const recentAppointments = await query(
      `SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        a.appointment_for,
        a.fee,
        d.full_name AS doctor_name,
        d.profile_image_url AS doctor_profile_image,
        p.full_name AS patient_name,
        p.profile_image_url AS patient_profile_image
      FROM appointments a
      INNER JOIN users d ON a.doctor_id = d.id
      INNER JOIN users p ON a.patient_id = p.id
      ORDER BY a.created_at DESC
      LIMIT 10`
    );

    // Appointments by month (last 6 months)
    const appointmentsByMonth = await query(
      `SELECT 
        DATE_FORMAT(created_at, '%Y-%m') AS month_key,
        DATE_FORMAT(created_at, '%b') AS month,
        COUNT(*) AS total,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending
      FROM appointments
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
      GROUP BY month_key, month
      ORDER BY month_key DESC
      LIMIT 6`
    );

    return res.status(200).json({
      success: true,
      overview: {
        status_breakdown: statusBreakdown.map(s => ({
          status: s.status,
          count: parseInt(s.count) || 0,
        })),
        recent_appointments: recentAppointments,
        appointments_by_month: appointmentsByMonth.map(m => ({
          month: m.month,
          total: parseInt(m.total) || 0,
          completed: parseInt(m.completed) || 0,
          pending: parseInt(m.pending) || 0,
        })),
      },
    });
  } catch (error) {
    console.error("getAppointmentOverview error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch appointment overview",
    });
  }
};

