import { query } from "../config/db.js";
import pool from "../config/db.js";

/**
 * Vérifie si un patient peut réserver un service donné
 * @param {number} patientId - ID du patient
 * @param {string} serviceType - Type de service (neurology, physiotherapy, psychology, nutrition, coaching, group_session)
 * @returns {Promise<{canBook: boolean, reason?: string, walletEntry?: object}>}
 */
export const canBookService = async (patientId, serviceType) => {
  try {
    // Pour les sessions de groupe, pas besoin de vérifier le wallet
    if (serviceType === 'group_session') {
      return { canBook: true };
    }

    // Chercher une entrée wallet disponible pour ce service
    const walletEntries = await query(
      `SELECT 
        psw.id,
        psw.purchase_id,
        psw.remaining_sessions,
        psw.is_locked,
        pp.product_id,
        p.product_type,
        ps.unlock_after_service
      FROM patient_service_wallet psw
      INNER JOIN patient_purchases pp ON psw.purchase_id = pp.id
      INNER JOIN products p ON pp.product_id = p.id
      INNER JOIN product_services ps ON ps.product_id = p.id AND ps.service_type = ?
      WHERE psw.patient_id = ?
        AND psw.service_type = ?
        AND psw.remaining_sessions > 0
        AND pp.status = 'active'
      ORDER BY psw.is_locked ASC, psw.created_at ASC
      LIMIT 1`,
      [serviceType, patientId, serviceType]
    );

    if (walletEntries.length === 0) {
      return { 
        canBook: false, 
        reason: 'No available sessions in wallet for this service' 
      };
    }

    const walletEntry = walletEntries[0];

    // Vérifier si le service est verrouillé
    if (walletEntry.is_locked) {
      // Si unlock_after_service = 'neurology', vérifier si la consultation neurologique est complétée
      if (walletEntry.unlock_after_service === 'neurology') {
        // Vérifier si le patient a complété une consultation neurologique pour ce même achat
        const hasCompletedNeurology = await query(
          `SELECT COUNT(*) as count
           FROM appointments a
           WHERE a.patient_id = ?
             AND a.service_type = 'neurology'
             AND a.status = 'completed'
             AND a.purchase_id = ?`,
          [patientId, walletEntry.purchase_id]
        );

        if (hasCompletedNeurology[0].count === 0) {
          return { 
            canBook: false, 
            reason: 'Neurology consultation must be completed first' 
          };
        }
      } else {
        return { 
          canBook: false, 
          reason: 'Service is locked' 
        };
      }
    }

    return { 
      canBook: true, 
      walletEntry 
    };
  } catch (error) {
    console.error("canBookService error:", error);
    throw error;
  }
};

/**
 * Vérifie si c'est une première visite ou un suivi
 * @param {number} patientId - ID du patient
 * @param {number} doctorId - ID du docteur
 * @param {string} serviceType - Type de service
 * @returns {Promise<boolean>} - true si première visite, false si suivi
 */
export const isFirstVisit = async (patientId, doctorId, serviceType) => {
  try {
    const completedVisits = await query(
      `SELECT COUNT(*) as count
       FROM appointments
       WHERE patient_id = ?
         AND doctor_id = ?
         AND service_type = ?
         AND status = 'completed'`,
      [patientId, doctorId, serviceType]
    );

    return completedVisits[0].count === 0;
  } catch (error) {
    console.error("isFirstVisit error:", error);
    // En cas d'erreur, considérer comme première visite pour sécurité
    return true;
  }
};

/**
 * Calcule la commission pour un produit donné selon le type de visite
 * @param {number} productId - ID du produit
 * @param {string} visitType - 'first' ou 'followup'
 * @param {number} amount - Montant de la transaction
 * @returns {Promise<{platformFee: number, professionalEarning: number}>}
 */
export const calculateCommission = async (productId, visitType, amount) => {
  try {
    const [product] = await query(
      `SELECT 
        platform_commission_percent,
        followup_commission_percent
      FROM products
      WHERE id = ? AND active = 1`,
      [productId]
    );

    if (!product) {
      throw new Error('Product not found');
    }

    let commissionPercent;
    if (visitType === 'followup' && product.followup_commission_percent !== null) {
      commissionPercent = parseFloat(product.followup_commission_percent);
    } else {
      commissionPercent = parseFloat(product.platform_commission_percent);
    }

    const platformFee = (amount * commissionPercent) / 100;
    const professionalEarning = amount - platformFee;

    return {
      platformFee: parseFloat(platformFee.toFixed(2)),
      professionalEarning: parseFloat(professionalEarning.toFixed(2))
    };
  } catch (error) {
    console.error("calculateCommission error:", error);
    throw error;
  }
};

/**
 * Consomme une session du wallet pour un service
 * @param {number} purchaseId - ID de l'achat
 * @param {string} serviceType - Type de service
 * @param {object} connection - Optionnel: connection de transaction MySQL
 * @returns {Promise<{success: boolean, walletId?: number}>}
 */
export const consumeWalletSession = async (purchaseId, serviceType, connection = null) => {
  const db = connection || pool;
  const executeMethod = connection ? connection.execute.bind(connection) : pool.execute.bind(pool);
  const queryMethod = connection 
    ? async (sql, params) => {
        const [rows] = await connection.execute(sql, params);
        return rows;
      }
    : query;

  try {
    // Trouver une entrée wallet disponible
    const [walletEntry] = await queryMethod(
      `SELECT id, remaining_sessions
       FROM patient_service_wallet
       WHERE purchase_id = ?
         AND service_type = ?
         AND remaining_sessions > 0
       ORDER BY created_at ASC
       LIMIT 1`,
      [purchaseId, serviceType]
    );

    if (!walletEntry) {
      throw new Error('No available sessions in wallet');
    }

    // Décrémenter le nombre de sessions restantes
    await executeMethod(
      `UPDATE patient_service_wallet
       SET remaining_sessions = remaining_sessions - 1
       WHERE id = ?`,
      [walletEntry.id]
    );

    // Vérifier si toutes les sessions sont consommées pour ce purchase
    const [remainingCheck] = await queryMethod(
      `SELECT SUM(remaining_sessions) as total_remaining
       FROM patient_service_wallet
       WHERE purchase_id = ?`,
      [purchaseId]
    );

    // Si toutes les sessions sont consommées, marquer l'achat comme complété
    if (remainingCheck.total_remaining === 0) {
      await executeMethod(
        `UPDATE patient_purchases
         SET status = 'completed'
         WHERE id = ?`,
        [purchaseId]
      );
    }

    return { 
      success: true, 
      walletId: walletEntry.id 
    };
  } catch (error) {
    console.error("consumeWalletSession error:", error);
    throw error;
  }
};

/**
 * Déverrouille tous les services liés à un achat après la consultation neurologique
 * @param {number} patientId - ID du patient
 * @param {number} purchaseId - ID de l'achat
 * @returns {Promise<void>}
 */
export const unlockServicesAfterNeurology = async (patientId, purchaseId) => {
  try {
    // Déverrouiller tous les services wallet qui nécessitent la consultation neurologique
    await pool.execute(
      `UPDATE patient_service_wallet psw
       INNER JOIN product_services ps ON ps.product_id = (
         SELECT product_id FROM patient_purchases WHERE id = ?
       ) AND ps.service_type = psw.service_type
       SET psw.is_locked = 0
       WHERE psw.patient_id = ?
         AND psw.purchase_id = ?
         AND ps.unlock_after_service = 'neurology'
         AND psw.is_locked = 1`,
      [purchaseId, patientId, purchaseId]
    );

    console.log(`Services unlocked for patient ${patientId}, purchase ${purchaseId}`);
  } catch (error) {
    console.error("unlockServicesAfterNeurology error:", error);
    throw error;
  }
};

/**
 * Obtient le prix d'un service individuel selon le type de visite
 * @param {string} serviceType - Type de service
 * @param {boolean} isFirstVisit - Si c'est une première visite
 * @returns {Promise<number|null>} - Prix du service ou null si non trouvé
 */
export const getSingleServicePrice = async (serviceType, isFirstVisit) => {
  try {
    // Prix fixes selon les règles métier
    const prices = {
      'neurology': { first: null, followup: 79 }, // Toujours suivi
      'physiotherapy': { first: 49, followup: 49 },
      'psychology': { first: 49, followup: 49 },
      'nutrition': { first: 69, followup: 49 },
    };

    if (!prices[serviceType]) {
      return null;
    }

    // Pour la neurologie, toujours le prix de suivi
    if (serviceType === 'neurology') {
      return prices[serviceType].followup;
    }

    return isFirstVisit ? prices[serviceType].first : prices[serviceType].followup;
  } catch (error) {
    console.error("getSingleServicePrice error:", error);
    return null;
  }
};

