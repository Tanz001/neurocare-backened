import { query } from "../config/db.js";

/**
 * Get transactions for the current user based on their role
 * - Patients see their own transactions
 * - Doctors see transactions for their appointments
 * - Admins see all transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const userId = Number(req.user.id);
    const role = req.user.role?.toLowerCase();
    const { status, start_date, end_date } = req.query;

    let conditions = [];
    let params = [];

    // Role filtering
    if (role === "patient") {
      conditions.push("t.patient_id = ?");
      params.push(userId);
    } 
    else if (role === "doctor") {
      conditions.push("t.doctor_id = ?");
      params.push(userId);
    } 
    else if (role !== "admin") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Optional filters
    if (status) {
      conditions.push("t.status = ?");
      params.push(status);
    }

    if (start_date) {
      conditions.push("DATE(t.created_at) >= ?");
      params.push(start_date);
    }

    if (end_date) {
      conditions.push("DATE(t.created_at) <= ?");
      params.push(end_date);
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const transactions = await query(
      `
      SELECT
        t.id,
        t.amount,
        t.status,
        t.created_at,
        t.payment_method,

        -- PLAN / PRODUCT
        pr.name AS product_name,
        pr.product_type,
        t.product_id,
        t.purchase_id,

        -- DOCTOR (only for paid appointments)
        d.id AS doctor_id,
        d.full_name AS doctor_name,
        d.speciality,

        -- APPOINTMENT (optional)
        a.appointment_date,
        a.appointment_time,
        a.service_type,

        -- PATIENT
        p.full_name AS patient_name

      FROM transactions t
      INNER JOIN users p ON p.id = t.patient_id
      LEFT JOIN products pr ON pr.id = t.product_id
      LEFT JOIN appointments a ON a.id = t.appointment_id
      LEFT JOIN users d ON d.id = t.doctor_id
      ${whereClause}
      ORDER BY t.created_at DESC
      `,
      params
    );

    const [summary] = await query(
      `
      SELECT
        COUNT(*) total_count,
        SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) total_paid
      FROM transactions t
      ${whereClause}
      `,
      params
    );

    res.json({
      success: true,
      transactions,
      summary
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch transactions" });
  }
};


/**
 * Get a single transaction by ID
 * Users can only view their own transactions
 */
export const getTransactionById = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const userRole = req.user.role?.toLowerCase();
    const transactionId = parseInt(req.params.id);

    if (isNaN(userId) || isNaN(transactionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID or transaction ID",
      });
    }

    // Get transaction
    const [transaction] = await query(
      `SELECT 
        t.*,
        d.full_name AS doctor_name,
        d.profile_image_url AS doctor_profile,
        d.speciality AS doctor_speciality,
        d.email AS doctor_email,
        d.phone AS doctor_phone,
        p.full_name AS patient_name,
        p.profile_image_url AS patient_profile,
        p.email AS patient_email,
        p.phone AS patient_phone,
        a.appointment_date,
        a.appointment_time,
        a.appointment_for,
        a.reason,
        a.notes,
        a.status AS appointment_status
       FROM transactions t
       INNER JOIN users d ON d.id = t.doctor_id
       INNER JOIN users p ON p.id = t.patient_id
       LEFT JOIN appointments a ON a.id = t.appointment_id
       WHERE t.id = ?`,
      [transactionId]
    );

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    // Check authorization
    if (userRole === "patient" && transaction.patient_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    if (userRole === "doctor" && transaction.doctor_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Admins can view all transactions

    return res.status(200).json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error("getTransactionById error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch transaction",
      error: error.message,
    });
  }
};











