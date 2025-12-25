import { query } from "../config/db.js";
import pool from "../config/db.js";
import { calculateCommission } from "../services/productService.js";

/**
 * Récupère tous les plans d'abonnement disponibles
 * Retourne seulement les plans actifs avec leurs services et statut de verrouillage
 */
export const getPlans = async (req, res) => {
  try {
    // Récupérer les plans
    const plans = await query(
      `SELECT 
        p.id,
        p.name,
        p.price,
        p.description,
        p.product_type,
        p.includes_chat_support,
        p.includes_priority_chat_support,
        p.includes_private_area,
        p.includes_free_community_access,
        p.includes_personal_plan,
        p.includes_digital_monitoring,
        p.includes_advanced_digital_monitoring,
        p.includes_priority_scheduling,
        p.includes_lifestyle_coaching,
        p.includes_mindfulness_trial,
        p.includes_live_activity_trial,
        p.includes_discount_in_person_visit,
        p.discount_percent
      FROM products p
      WHERE p.active = 1 AND p.product_type = 'subscription_plan'
      ORDER BY p.price ASC`,
      []
    );

    // Pour chaque plan, récupérer les services séparément
    const formattedPlans = await Promise.all(
      plans.map(async (plan) => {
        const services = await query(
          `SELECT 
            service_type,
            session_count,
            is_locked,
            unlock_after_service
          FROM product_services
          WHERE product_id = ?
          ORDER BY service_type`,
          [plan.id]
        );

        // Formater les services
        const formattedServices = services.map(s => ({
          service_type: s.service_type,
          session_count: parseInt(s.session_count),
          is_locked: s.is_locked === 1 || s.is_locked === true,
          unlock_after_service: s.unlock_after_service,
        }));
      
        // Séparer les services verrouillés et déverrouillés
        const unlockedServices = formattedServices.filter(s => !s.is_locked);
        const lockedServices = formattedServices.filter(s => s.is_locked);

        return {
          id: plan.id,
          name: plan.name,
          price: parseFloat(plan.price),
          description: plan.description,
          included_services: formattedServices,
          unlocked_services: unlockedServices,
          locked_services: lockedServices,
          // Additional features
          includes_chat_support: plan.includes_chat_support === 1 || plan.includes_chat_support === true,
          includes_priority_chat_support: plan.includes_priority_chat_support === 1 || plan.includes_priority_chat_support === true,
          includes_private_area: plan.includes_private_area === 1 || plan.includes_private_area === true,
          includes_free_community_access: plan.includes_free_community_access === 1 || plan.includes_free_community_access === true,
          includes_personal_plan: plan.includes_personal_plan === 1 || plan.includes_personal_plan === true,
          includes_digital_monitoring: plan.includes_digital_monitoring === 1 || plan.includes_digital_monitoring === true,
          includes_advanced_digital_monitoring: plan.includes_advanced_digital_monitoring === 1 || plan.includes_advanced_digital_monitoring === true,
          includes_priority_scheduling: plan.includes_priority_scheduling === 1 || plan.includes_priority_scheduling === true,
          includes_lifestyle_coaching: plan.includes_lifestyle_coaching === 1 || plan.includes_lifestyle_coaching === true,
          includes_mindfulness_trial: plan.includes_mindfulness_trial === 1 || plan.includes_mindfulness_trial === true,
          includes_live_activity_trial: plan.includes_live_activity_trial === 1 || plan.includes_live_activity_trial === true,
          includes_discount_in_person_visit: plan.includes_discount_in_person_visit === 1 || plan.includes_discount_in_person_visit === true,
          discount_percent: plan.discount_percent ? parseFloat(plan.discount_percent) : null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      plans: formattedPlans,
    });
  } catch (error) {
    console.error("getPlans error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch subscription plans",
    });
  }
};

/**
 * Récupère tous les produits actifs
 */
export const getProducts = async (req, res) => {
  try {
    const { product_type, service_category } = req.query;

    let whereClause = "p.active = 1";
    const params = [];

    if (product_type) {
      whereClause += " AND p.product_type = ?";
      params.push(product_type);
    }

    if (service_category) {
      whereClause += " AND p.service_category = ?";
      params.push(service_category);
    }

    const products = await query(
      `SELECT p.*
      FROM products p
      WHERE ${whereClause}
      ORDER BY p.product_type, p.price ASC`,
      params
    );

    // Pour chaque produit, récupérer les services séparément
    const productsWithServices = await Promise.all(
      products.map(async (product) => {
        const services = await query(
          `SELECT 
            id,
            service_type,
            session_count,
            is_locked,
            unlock_after_service
          FROM product_services
          WHERE product_id = ?
          ORDER BY service_type`,
          [product.id]
        );

        // Formater les services
        const formattedServices = services.map(s => ({
          id: s.id,
          service_type: s.service_type,
          session_count: parseInt(s.session_count),
          is_locked: s.is_locked === 1 || s.is_locked === true,
          unlock_after_service: s.unlock_after_service,
        }));

        return {
          ...product,
          services: formattedServices
        };
      })
    );

    return res.status(200).json({
      success: true,
      products: productsWithServices,
    });
  } catch (error) {
    console.error("getProducts error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch products",
    });
  }
};

/**
 * Récupère un produit par ID avec ses services
 */
export const getProductById = async (req, res) => {
  try {
    const productId = parseInt(req.params.productId, 10);
    
    if (isNaN(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const [product] = await query(
      `SELECT * FROM products WHERE id = ? AND active = 1`,
      [productId]
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const services = await query(
      `SELECT 
        id,
        service_type,
        session_count,
        is_locked,
        unlock_after_service
      FROM product_services 
      WHERE product_id = ?
      ORDER BY service_type`,
      [productId]
    );

    // Formater les services
    const formattedServices = services.map(s => ({
      id: s.id,
      service_type: s.service_type,
      session_count: parseInt(s.session_count),
      is_locked: s.is_locked === 1 || s.is_locked === true,
      unlock_after_service: s.unlock_after_service,
    }));

    return res.status(200).json({
      success: true,
      product: {
        ...product,
        services: formattedServices
      },
    });
  } catch (error) {
    console.error("getProductById error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch product",
    });
  }
};

/**
 * Achète un produit (plan, service individuel, package)
 */
export const purchaseProduct = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const patientId = req.user.id;
    const { product_id, payment_method = 'card' } = req.body;

    if (!product_id) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "product_id is required",
      });
    }

    // Récupérer le produit
    const [products] = await connection.execute(
      `SELECT * FROM products WHERE id = ? AND active = 1`,
      [product_id]
    );

    if (!products || products.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: "Product not found or inactive",
      });
    }

    const product = products[0];

    // Calculer les commissions (pour les plans, utiliser 'first' par défaut)
    const commission = await calculateCommission(product_id, 'first', parseFloat(product.price));
    
    // Créer l'achat patient
    const [purchaseResult] = await connection.execute(
      `INSERT INTO patient_purchases 
        (patient_id, product_id, total_paid, platform_fee, professional_pool, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [
        patientId,
        product_id,
        product.price,
        commission.platformFee,
        commission.professionalEarning
      ]
    );

    const purchaseId = purchaseResult.insertId;

    // Récupérer les services du produit
    const [productServices] = await connection.execute(
      `SELECT * FROM product_services WHERE product_id = ?`,
      [product_id]
    );

    console.log(`📦 Product ${product_id} has ${productServices.length} services`);

    // Créer les entrées wallet pour chaque service
    if (productServices && productServices.length > 0) {
      for (const service of productServices) {
        // Convertir is_locked de TINYINT(1) à 0/1
        const serviceIsLocked = service.is_locked === 1 || service.is_locked === true ? 1 : 0;
        // Neurologie est déverrouillée initialement
        const isLocked = service.service_type === 'neurology' ? 0 : serviceIsLocked;

        await connection.execute(
          `INSERT INTO patient_service_wallet
            (patient_id, purchase_id, service_type, remaining_sessions, is_locked)
           VALUES (?, ?, ?, ?, ?)`,
          [
            patientId,
            purchaseId,
            service.service_type,
            parseInt(service.session_count) || 0,
            isLocked,
          ]
        );
        
        console.log(`✅ Wallet entry created: ${service.service_type}, sessions: ${service.session_count}, locked: ${isLocked}`);
      }
    } else {
      console.warn(`⚠️ No services found for product ${product_id}`);
    }

    // Si c'est un plan d'abonnement, activer l'abonnement du patient
    if (product.product_type === 'subscription_plan') {
      const [updateResult] = await connection.execute(
        `UPDATE users SET subscribed = 1 WHERE id = ?`,
        [patientId]
      );
      console.log(`✅ Updated subscribed status for patient ${patientId}, affected rows: ${updateResult.affectedRows}`);
    }

    // Créer une transaction pour l'achat
    // Note: Pour les plans/packages, doctor_id peut être NULL car c'est un pool
    await connection.execute(
      `INSERT INTO transactions
        (appointment_id, patient_id, doctor_id, amount, payment_method, status, 
         product_id, purchase_id, platform_fee, professional_earning)
       VALUES (NULL, ?, NULL, ?, ?, 'paid', ?, ?, ?, ?)`,
      [
        patientId,
        product.price,
        payment_method,
        product_id,
        purchaseId,
        commission.platformFee,
        commission.professionalEarning
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Product purchased successfully",
      purchase: {
        id: purchaseId,
        product_id: product_id,
        total_paid: product.price,
        platform_fee: commission.platformFee,
        professional_pool: commission.professionalEarning
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error("purchaseProduct error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to purchase product",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
};

/**
 * Récupère les achats d'un patient
 */
export const getMyPurchases = async (req, res) => {
  try {
    const patientId = req.user.id;

    const purchases = await query(
      `SELECT 
        pp.*,
        p.name as product_name,
        p.product_type,
        p.service_category,
        p.description as product_description,
        p.includes_chat_support,
        p.includes_priority_chat_support,
        p.includes_private_area,
        p.includes_free_community_access,
        p.includes_personal_plan,
        p.includes_digital_monitoring,
        p.includes_advanced_digital_monitoring,
        p.includes_priority_scheduling,
        p.includes_lifestyle_coaching,
        p.includes_mindfulness_trial,
        p.includes_live_activity_trial,
        p.includes_discount_in_person_visit,
        p.discount_percent
      FROM patient_purchases pp
      INNER JOIN products p ON pp.product_id = p.id
      WHERE pp.patient_id = ?
      ORDER BY pp.purchased_at DESC`,
      [patientId]
    );

    // Pour chaque achat, récupérer les services wallet
    const purchasesWithWallet = await Promise.all(
      purchases.map(async (purchase) => {
        const walletEntries = await query(
          `SELECT 
            id,
            service_type,
            remaining_sessions,
            is_locked
          FROM patient_service_wallet
          WHERE purchase_id = ?
          ORDER BY service_type`,
          [purchase.id]
        );

        return {
          ...purchase,
          wallet: walletEntries,
          // Additional features from product
          includes_chat_support: purchase.includes_chat_support === 1 || purchase.includes_chat_support === true,
          includes_priority_chat_support: purchase.includes_priority_chat_support === 1 || purchase.includes_priority_chat_support === true,
          includes_private_area: purchase.includes_private_area === 1 || purchase.includes_private_area === true,
          includes_free_community_access: purchase.includes_free_community_access === 1 || purchase.includes_free_community_access === true,
          includes_personal_plan: purchase.includes_personal_plan === 1 || purchase.includes_personal_plan === true,
          includes_digital_monitoring: purchase.includes_digital_monitoring === 1 || purchase.includes_digital_monitoring === true,
          includes_advanced_digital_monitoring: purchase.includes_advanced_digital_monitoring === 1 || purchase.includes_advanced_digital_monitoring === true,
          includes_priority_scheduling: purchase.includes_priority_scheduling === 1 || purchase.includes_priority_scheduling === true,
          includes_lifestyle_coaching: purchase.includes_lifestyle_coaching === 1 || purchase.includes_lifestyle_coaching === true,
          includes_mindfulness_trial: purchase.includes_mindfulness_trial === 1 || purchase.includes_mindfulness_trial === true,
          includes_live_activity_trial: purchase.includes_live_activity_trial === 1 || purchase.includes_live_activity_trial === true,
          includes_discount_in_person_visit: purchase.includes_discount_in_person_visit === 1 || purchase.includes_discount_in_person_visit === true,
          discount_percent: purchase.discount_percent ? parseFloat(purchase.discount_percent) : null,
        };
      })
    );

    return res.status(200).json({
      success: true,
      purchases: purchasesWithWallet,
    });
  } catch (error) {
    console.error("getMyPurchases error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch purchases",
    });
  }
};

/**
 * Récupère le wallet d'un patient (tous les services disponibles)
 * Retourne les services avec leur statut de verrouillage et disponibilité
 */
/**
 * Annule un plan d'abonnement pour un patient authentifié
 * Met à jour subscribed=0 si c'est le dernier plan actif
 * Verrouille toutes les entrées wallet liées à cet achat
 */
export const cancelMyPlan = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { purchase_id } = req.body;

    if (!purchase_id) {
      return res.status(400).json({
        success: false,
        message: "purchase_id is required",
      });
    }

    const { cancelPlan } = await import("../services/subscriptionService.js");
    const result = await cancelPlan(patientId, parseInt(purchase_id));

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("cancelMyPlan error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to cancel plan",
    });
  }
};

export const getMyWallet = async (req, res) => {
  try {
    const patientId = req.user.id;

    const walletEntries = await query(
      `SELECT 
        psw.id,
        psw.purchase_id,
        psw.service_type,
        psw.remaining_sessions,
        psw.is_locked,
        psw.created_at,
        pp.product_id,
        pp.status as purchase_status,
        p.name as product_name,
        p.product_type,
        ps.unlock_after_service
      FROM patient_service_wallet psw
      INNER JOIN patient_purchases pp ON psw.purchase_id = pp.id
      INNER JOIN products p ON pp.product_id = p.id
      LEFT JOIN product_services ps ON ps.product_id = p.id AND ps.service_type = psw.service_type
      WHERE psw.patient_id = ?
        AND psw.remaining_sessions > 0
        AND pp.status = 'active'
      ORDER BY psw.service_type, psw.created_at ASC`,
      [patientId]
    );

    // Formater les entrées wallet pour le frontend
    const formattedEntries = walletEntries.map(entry => ({
      id: entry.id,
      purchase_id: entry.purchase_id,
      service_type: entry.service_type,
      remaining_sessions: entry.remaining_sessions,
      is_locked: entry.is_locked === 1,
      unlock_after_service: entry.unlock_after_service,
      product_name: entry.product_name,
      purchase_status: entry.purchase_status,
      can_book: entry.is_locked === 0 && entry.remaining_sessions > 0,
    }));

    // Regrouper par type de service avec résumé
    const walletByService = {};
    const summary = {
      total_services: 0,
      available_services: 0,
      locked_services: 0,
      total_sessions: 0,
      available_sessions: 0,
    };

    formattedEntries.forEach(entry => {
      if (!walletByService[entry.service_type]) {
        walletByService[entry.service_type] = {
          service_type: entry.service_type,
          entries: [],
          total_sessions: 0,
          available_sessions: 0,
          is_locked: false,
          can_book: false,
        };
      }
      
      walletByService[entry.service_type].entries.push(entry);
      walletByService[entry.service_type].total_sessions += entry.remaining_sessions;
      
      if (!entry.is_locked) {
        walletByService[entry.service_type].available_sessions += entry.remaining_sessions;
        walletByService[entry.service_type].can_book = true;
        walletByService[entry.service_type].is_locked = false;
      } else {
        walletByService[entry.service_type].is_locked = true;
      }

      // Mise à jour du résumé global
      summary.total_services++;
      summary.total_sessions += entry.remaining_sessions;
      if (!entry.is_locked) {
        summary.available_services++;
        summary.available_sessions += entry.remaining_sessions;
      } else {
        summary.locked_services++;
      }
    });

    return res.status(200).json({
      success: true,
      wallet: walletByService,
      wallet_entries: formattedEntries,
      summary: summary,
    });
  } catch (error) {
    console.error("getMyWallet error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch wallet",
    });
  }
};

