import { query } from "../config/db.js";
import pool from "../config/db.js";

/**
 * Annule un plan d'abonnement pour un patient
 * - Met à jour le statut de l'achat à 'cancelled'
 * - Met à jour users.subscribed = 0
 * - Verrouille toutes les entrées wallet liées à cet achat
 * 
 * @param {number} patientId - ID du patient
 * @param {number} purchaseId - ID de l'achat à annuler
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const cancelPlan = async (patientId, purchaseId) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Vérifier que l'achat appartient au patient et est actif
    const [purchaseRows] = await connection.execute(
      `SELECT id, patient_id, product_id, status 
       FROM patient_purchases 
       WHERE id = ? AND patient_id = ? AND status = 'active'`,
      [purchaseId, patientId]
    );

    if (purchaseRows.length === 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Purchase not found or already cancelled'
      };
    }

    const purchaseData = purchaseRows[0];

    // Marquer l'achat comme annulé
    await connection.execute(
      `UPDATE patient_purchases 
       SET status = 'cancelled' 
       WHERE id = ?`,
      [purchaseId]
    );

    // Verrouiller toutes les entrées wallet liées à cet achat
    await connection.execute(
      `UPDATE patient_service_wallet 
       SET is_locked = 1 
       WHERE purchase_id = ?`,
      [purchaseId]
    );

    // Vérifier si le patient a d'autres achats actifs
    const [activePurchasesRows] = await connection.execute(
      `SELECT COUNT(*) as count 
       FROM patient_purchases 
       WHERE patient_id = ? AND status = 'active'`,
      [patientId]
    );

    // Si aucun achat actif restant, désabonner le patient
    if (activePurchasesRows[0].count === 0) {
      await connection.execute(
        `UPDATE users 
         SET subscribed = 0 
         WHERE id = ? AND role = 'patient'`,
        [patientId]
      );
    }

    await connection.commit();

    return {
      success: true,
      message: 'Plan cancelled successfully'
    };
  } catch (error) {
    await connection.rollback();
    console.error("cancelPlan error:", error);
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Marque un plan comme expiré
 * - Met à jour le statut de l'achat à 'expired'
 * - Si c'est le dernier plan actif, met à jour users.subscribed = 0
 * - Verrouille toutes les entrées wallet liées à cet achat
 * 
 * @param {number} purchaseId - ID de l'achat à marquer comme expiré
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const expirePlan = async (purchaseId) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    // Vérifier que l'achat existe et est actif
    const [purchaseRows] = await connection.execute(
      `SELECT id, patient_id, status 
       FROM patient_purchases 
       WHERE id = ? AND status = 'active'`,
      [purchaseId]
    );

    if (purchaseRows.length === 0) {
      await connection.rollback();
      return {
        success: false,
        message: 'Purchase not found or already expired/cancelled'
      };
    }

    const purchaseData = purchaseRows[0];
    const patientId = purchaseData.patient_id;

    // Marquer l'achat comme expiré
    await connection.execute(
      `UPDATE patient_purchases 
       SET status = 'expired' 
       WHERE id = ?`,
      [purchaseId]
    );

    // Verrouiller toutes les entrées wallet liées à cet achat
    await connection.execute(
      `UPDATE patient_service_wallet 
       SET is_locked = 1 
       WHERE purchase_id = ?`,
      [purchaseId]
    );

    // Vérifier si le patient a d'autres achats actifs
    const [activePurchases] = await connection.execute(
      `SELECT COUNT(*) as count 
       FROM patient_purchases 
       WHERE patient_id = ? AND status = 'active'`,
      [patientId]
    );

    // Si aucun achat actif restant, désabonner le patient
    if (activePurchases[0].count === 0) {
      await connection.execute(
        `UPDATE users 
         SET subscribed = 0 
         WHERE id = ? AND role = 'patient'`,
        [patientId]
      );
    }

    await connection.commit();

    return {
      success: true,
      message: 'Plan expired successfully'
    };
  } catch (error) {
    await connection.rollback();
    console.error("expirePlan error:", error);
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * Vérifie si un patient est abonné
 * @param {number} patientId - ID du patient
 * @returns {Promise<boolean>}
 */
export const isPatientSubscribed = async (patientId) => {
  try {
    const [user] = await query(
      `SELECT subscribed FROM users WHERE id = ? AND role = 'patient'`,
      [patientId]
    );

    return user && (user.subscribed === 1 || user.subscribed === true);
  } catch (error) {
    console.error("isPatientSubscribed error:", error);
    return false;
  }
};

