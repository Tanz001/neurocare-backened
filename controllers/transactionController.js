import { query } from "../config/db.js";

/**
 * Get transactions for the current user based on their role
 * - Patients see their own transactions
 * - Doctors see transactions for their appointments
 * - Admins see all transactions
 */
export const getTransactions = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const userRole = req.user.role?.toLowerCase();
    const { status, start_date, end_date } = req.query;

    if (isNaN(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    let whereConditions = [];
    let params = [];

    // Filter by role
    if (userRole === "patient") {
      whereConditions.push("t.patient_id = ?");
      params.push(userId);
    } else if (userRole === "doctor") {
      whereConditions.push("t.doctor_id = ?");
      params.push(userId);
    } else if (userRole === "admin") {
      // Admins see all transactions, no filter needed
    } else {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access",
      });
    }

    // Filter by status if provided
    if (status) {
      whereConditions.push("t.status = ?");
      params.push(status);
    }

    // Filter by date range if provided
    if (start_date) {
      whereConditions.push("DATE(t.created_at) >= ?");
      params.push(start_date);
    }

    if (end_date) {
      whereConditions.push("DATE(t.created_at) <= ?");
      params.push(end_date);
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(" AND ")}`
      : "";

    const transactions = await query(
      `SELECT 
        t.id,
        t.appointment_id,
        t.patient_id,
        t.doctor_id,
        t.amount,
        t.payment_method,
        t.status,
        t.created_at,
        d.full_name AS doctor_name,
        d.profile_image_url AS doctor_profile,
        d.speciality AS doctor_speciality,
        p.full_name AS patient_name,
        p.profile_image_url AS patient_profile,
        a.appointment_date,
        a.appointment_time,
        a.appointment_for,
        a.status AS appointment_status
       FROM transactions t
       INNER JOIN users d ON d.id = t.doctor_id
       INNER JOIN users p ON p.id = t.patient_id
       LEFT JOIN appointments a ON a.id = t.appointment_id
       ${whereClause}
       ORDER BY t.created_at DESC`,
      params
    );

    // Calculate summary statistics
    const summary = await query(
      `SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN t.status = 'paid' THEN 1 ELSE 0 END) as paid_count,
        SUM(CASE WHEN t.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN t.status = 'refunded' THEN 1 ELSE 0 END) as refunded_count,
        SUM(CASE WHEN t.status = 'paid' THEN t.amount ELSE 0 END) as total_paid,
        SUM(t.amount) as total_amount
       FROM transactions t
       ${whereClause}`,
      params
    );

    return res.status(200).json({
      success: true,
      transactions: transactions || [],
      summary: summary[0] || {
        total_count: 0,
        paid_count: 0,
        pending_count: 0,
        failed_count: 0,
        refunded_count: 0,
        total_paid: 0,
        total_amount: 0,
      },
    });
  } catch (error) {
    console.error("getTransactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch transactions",
      error: error.message,
    });
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


