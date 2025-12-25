import { query } from "../config/db.js";
import pool from "../config/db.js";

/**
 * Récupère tous les plans (admin - inclut les inactifs)
 */
export const getAllPlansAdmin = async (req, res) => {
  try {
    const plans = await query(
      `SELECT
  id,
  name,
  product_type,
  service_category,
  price,
  platform_commission_percent,
  followup_commission_percent,
  requires_initial_neuro,
  description,
  active,
  created_at,
  includes_chat_support,
  includes_priority_chat_support,
  includes_private_area,
  includes_free_community_access,
  includes_personal_plan,
  includes_digital_monitoring,
  includes_advanced_digital_monitoring,
  includes_priority_scheduling,
  includes_lifestyle_coaching,
  includes_mindfulness_trial,
  includes_live_activity_trial,
  includes_discount_in_person_visit,
  discount_percent
FROM products
WHERE active = 1
ORDER BY product_type, price ASC;
`,
      []
    );

    // Pour chaque plan, récupérer les services
    const plansWithServices = await Promise.all(
      plans.map(async (plan) => {
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
          [plan.id]
        );

        return {
          ...plan,
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
          services: services.map(s => ({
            id: s.id,
            service_type: s.service_type,
            session_count: parseInt(s.session_count),
            is_locked: s.is_locked === 1 || s.is_locked === true,
            unlock_after_service: s.unlock_after_service,
          }))
        };
      })
    );

    return res.status(200).json({
      success: true,
      plans: plansWithServices,
    });
  } catch (error) {
    console.error("getAllPlansAdmin error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch plans",
    });
  }
};

/**
 * Récupère un plan par ID (admin)
 */
export const getPlanByIdAdmin = async (req, res) => {
  try {
    const planId = parseInt(req.params.planId, 10);

    if (isNaN(planId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    const [plan] = await query(
      `SELECT 
        id, name, product_type, service_category, price, platform_commission_percent,
        followup_commission_percent, requires_initial_neuro, description, active, created_at,
        includes_chat_support, includes_priority_chat_support, includes_private_area,
        includes_free_community_access, includes_personal_plan, includes_digital_monitoring,
        includes_advanced_digital_monitoring, includes_priority_scheduling, includes_lifestyle_coaching,
        includes_mindfulness_trial, includes_live_activity_trial, includes_discount_in_person_visit, discount_percent
      FROM products WHERE id = ? AND product_type = 'subscription_plan'`,
      [planId]
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
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
      [planId]
    );

    return res.status(200).json({
      success: true,
      plan: {
        ...plan,
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
        services: services.map(s => ({
          id: s.id,
          service_type: s.service_type,
          session_count: parseInt(s.session_count),
          is_locked: s.is_locked === 1 || s.is_locked === true,
          unlock_after_service: s.unlock_after_service,
        }))
      },
    });
  } catch (error) {
    console.error("getPlanByIdAdmin error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch plan",
    });
  }
};

/**
 * Crée un nouveau plan
 */
export const createPlan = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const {
      name,
      price,
      description,
      service_category,
      platform_commission_percent,
      followup_commission_percent,
      requires_initial_neuro,
      services, // Array of { service_type, session_count, is_locked, unlock_after_service }
      // Additional features
      includes_chat_support,
      includes_priority_chat_support,
      includes_private_area,
      includes_free_community_access,
      includes_personal_plan,
      includes_digital_monitoring,
      includes_advanced_digital_monitoring,
      includes_priority_scheduling,
      includes_lifestyle_coaching,
      includes_mindfulness_trial,
      includes_live_activity_trial,
      includes_discount_in_person_visit,
      discount_percent,
    } = req.body;

    // Validation
    if (!name || !price || !services || !Array.isArray(services) || services.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "name, price, and services are required",
      });
    }

    // Créer le plan
    const [result] = await connection.execute(
      `INSERT INTO products
       (name, product_type, service_category, price, platform_commission_percent, followup_commission_percent, requires_initial_neuro, description, active,
        includes_chat_support, includes_priority_chat_support, includes_private_area, includes_free_community_access,
        includes_personal_plan, includes_digital_monitoring, includes_advanced_digital_monitoring, includes_priority_scheduling,
        includes_lifestyle_coaching, includes_mindfulness_trial, includes_live_activity_trial, includes_discount_in_person_visit, discount_percent)
       VALUES (?, 'subscription_plan', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        service_category || 'multidisciplinary',
        parseFloat(price),
        platform_commission_percent ? parseFloat(platform_commission_percent) : 10.0,
        followup_commission_percent ? parseFloat(followup_commission_percent) : null,
        requires_initial_neuro ? 1 : 0,
        description || null,
        // Additional features
        includes_chat_support ? 1 : 0,
        includes_priority_chat_support ? 1 : 0,
        includes_private_area ? 1 : 0,
        includes_free_community_access ? 1 : 0,
        includes_personal_plan ? 1 : 0,
        includes_digital_monitoring ? 1 : 0,
        includes_advanced_digital_monitoring ? 1 : 0,
        includes_priority_scheduling ? 1 : 0,
        includes_lifestyle_coaching ? 1 : 0,
        includes_mindfulness_trial ? 1 : 0,
        includes_live_activity_trial ? 1 : 0,
        includes_discount_in_person_visit ? 1 : 0,
        discount_percent ? parseFloat(discount_percent) : null,
      ]
    );

    const planId = result.insertId;

    // Créer les services du plan
    for (const service of services) {
      if (!service.service_type || service.session_count === undefined) {
        await connection.rollback();
        return res.status(400).json({
          success: false,
          message: `Each service must have service_type and session_count`,
        });
      }

      await connection.execute(
        `INSERT INTO product_services
         (product_id, service_type, session_count, is_locked, unlock_after_service)
         VALUES (?, ?, ?, ?, ?)`,
        [
          planId,
          service.service_type,
          parseInt(service.session_count),
          service.is_locked === true || service.is_locked === 1 ? 1 : 0,
          service.unlock_after_service || 'none',
        ]
      );
    }

    await connection.commit();
    connection.release();

    // Récupérer le plan créé avec ses services
    const [createdPlan] = await query(
      `SELECT 
        id, name, product_type, service_category, price, platform_commission_percent,
        followup_commission_percent, requires_initial_neuro, description, active, created_at,
        includes_chat_support, includes_priority_chat_support, includes_private_area,
        includes_free_community_access, includes_personal_plan, includes_digital_monitoring,
        includes_advanced_digital_monitoring, includes_priority_scheduling, includes_lifestyle_coaching,
        includes_mindfulness_trial, includes_live_activity_trial, includes_discount_in_person_visit, discount_percent
      FROM products WHERE id = ?`,
      [planId]
    );

    const createdServices = await query(
      `SELECT * FROM product_services WHERE product_id = ?`,
      [planId]
    );

    return res.status(201).json({
      success: true,
      message: "Plan created successfully",
      plan: {
        ...createdPlan,
        includes_chat_support: createdPlan.includes_chat_support === 1 || createdPlan.includes_chat_support === true,
        includes_priority_chat_support: createdPlan.includes_priority_chat_support === 1 || createdPlan.includes_priority_chat_support === true,
        includes_private_area: createdPlan.includes_private_area === 1 || createdPlan.includes_private_area === true,
        includes_free_community_access: createdPlan.includes_free_community_access === 1 || createdPlan.includes_free_community_access === true,
        includes_personal_plan: createdPlan.includes_personal_plan === 1 || createdPlan.includes_personal_plan === true,
        includes_digital_monitoring: createdPlan.includes_digital_monitoring === 1 || createdPlan.includes_digital_monitoring === true,
        includes_advanced_digital_monitoring: createdPlan.includes_advanced_digital_monitoring === 1 || createdPlan.includes_advanced_digital_monitoring === true,
        includes_priority_scheduling: createdPlan.includes_priority_scheduling === 1 || createdPlan.includes_priority_scheduling === true,
        includes_lifestyle_coaching: createdPlan.includes_lifestyle_coaching === 1 || createdPlan.includes_lifestyle_coaching === true,
        includes_mindfulness_trial: createdPlan.includes_mindfulness_trial === 1 || createdPlan.includes_mindfulness_trial === true,
        includes_live_activity_trial: createdPlan.includes_live_activity_trial === 1 || createdPlan.includes_live_activity_trial === true,
        includes_discount_in_person_visit: createdPlan.includes_discount_in_person_visit === 1 || createdPlan.includes_discount_in_person_visit === true,
        discount_percent: createdPlan.discount_percent ? parseFloat(createdPlan.discount_percent) : null,
        services: createdServices.map(s => ({
          id: s.id,
          service_type: s.service_type,
          session_count: parseInt(s.session_count),
          is_locked: s.is_locked === 1 || s.is_locked === true,
          unlock_after_service: s.unlock_after_service,
        }))
      },
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("createPlan error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to create plan",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Met à jour un plan
 */
export const updatePlan = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const planId = parseInt(req.params.planId, 10);
    const {
      name,
      price,
      description,
      service_category,
      platform_commission_percent,
      followup_commission_percent,
      requires_initial_neuro,
      active,
      services, // Array of { id?, service_type, session_count, is_locked, unlock_after_service }
      // Additional features
      includes_chat_support,
      includes_priority_chat_support,
      includes_private_area,
      includes_free_community_access,
      includes_personal_plan,
      includes_digital_monitoring,
      includes_advanced_digital_monitoring,
      includes_priority_scheduling,
      includes_lifestyle_coaching,
      includes_mindfulness_trial,
      includes_live_activity_trial,
      includes_discount_in_person_visit,
      discount_percent,
    } = req.body;

    if (isNaN(planId)) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    // Vérifier que le plan existe
    const [existingPlan] = await query(
      `SELECT id FROM products WHERE id = ?`,
      [planId]
    );

    if (!existingPlan) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Mettre à jour le plan
    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (price !== undefined) {
      updateFields.push('price = ?');
      updateValues.push(parseFloat(price));
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (service_category !== undefined) {
      updateFields.push('service_category = ?');
      updateValues.push(service_category);
    }
    if (platform_commission_percent !== undefined) {
      updateFields.push('platform_commission_percent = ?');
      updateValues.push(parseFloat(platform_commission_percent));
    }
    if (followup_commission_percent !== undefined) {
      updateFields.push('followup_commission_percent = ?');
      updateValues.push(followup_commission_percent ? parseFloat(followup_commission_percent) : null);
    }
    if (requires_initial_neuro !== undefined) {
      updateFields.push('requires_initial_neuro = ?');
      updateValues.push(requires_initial_neuro ? 1 : 0);
    }
    if (active !== undefined) {
      updateFields.push('active = ?');
      updateValues.push(active ? 1 : 0);
    }
    // Additional features
    if (includes_chat_support !== undefined) {
      updateFields.push('includes_chat_support = ?');
      updateValues.push(includes_chat_support ? 1 : 0);
    }
    if (includes_priority_chat_support !== undefined) {
      updateFields.push('includes_priority_chat_support = ?');
      updateValues.push(includes_priority_chat_support ? 1 : 0);
    }
    if (includes_private_area !== undefined) {
      updateFields.push('includes_private_area = ?');
      updateValues.push(includes_private_area ? 1 : 0);
    }
    if (includes_free_community_access !== undefined) {
      updateFields.push('includes_free_community_access = ?');
      updateValues.push(includes_free_community_access ? 1 : 0);
    }
    if (includes_personal_plan !== undefined) {
      updateFields.push('includes_personal_plan = ?');
      updateValues.push(includes_personal_plan ? 1 : 0);
    }
    if (includes_digital_monitoring !== undefined) {
      updateFields.push('includes_digital_monitoring = ?');
      updateValues.push(includes_digital_monitoring ? 1 : 0);
    }
    if (includes_advanced_digital_monitoring !== undefined) {
      updateFields.push('includes_advanced_digital_monitoring = ?');
      updateValues.push(includes_advanced_digital_monitoring ? 1 : 0);
    }
    if (includes_priority_scheduling !== undefined) {
      updateFields.push('includes_priority_scheduling = ?');
      updateValues.push(includes_priority_scheduling ? 1 : 0);
    }
    if (includes_lifestyle_coaching !== undefined) {
      updateFields.push('includes_lifestyle_coaching = ?');
      updateValues.push(includes_lifestyle_coaching ? 1 : 0);
    }
    if (includes_mindfulness_trial !== undefined) {
      updateFields.push('includes_mindfulness_trial = ?');
      updateValues.push(includes_mindfulness_trial ? 1 : 0);
    }
    if (includes_live_activity_trial !== undefined) {
      updateFields.push('includes_live_activity_trial = ?');
      updateValues.push(includes_live_activity_trial ? 1 : 0);
    }
    if (includes_discount_in_person_visit !== undefined) {
      updateFields.push('includes_discount_in_person_visit = ?');
      updateValues.push(includes_discount_in_person_visit ? 1 : 0);
    }
    if (discount_percent !== undefined) {
      updateFields.push('discount_percent = ?');
      updateValues.push(discount_percent ? parseFloat(discount_percent) : null);
    }

    if (updateFields.length > 0) {
      updateValues.push(planId);
      await connection.execute(
        `UPDATE products SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // Mettre à jour les services si fournis
    if (services && Array.isArray(services)) {
      // Supprimer les services existants
      await connection.execute(
        `DELETE FROM product_services WHERE product_id = ?`,
        [planId]
      );

      // Créer les nouveaux services
      for (const service of services) {
        if (!service.service_type || service.session_count === undefined) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: `Each service must have service_type and session_count`,
          });
        }

        await connection.execute(
          `INSERT INTO product_services
           (product_id, service_type, session_count, is_locked, unlock_after_service)
           VALUES (?, ?, ?, ?, ?)`,
          [
            planId,
            service.service_type,
            parseInt(service.session_count),
            service.is_locked === true || service.is_locked === 1 ? 1 : 0,
            service.unlock_after_service || 'none',
          ]
        );
      }
    }

    await connection.commit();
    connection.release();

    // Récupérer le plan mis à jour
    const [updatedPlan] = await query(
      `SELECT 
        id, name, product_type, service_category, price, platform_commission_percent,
        followup_commission_percent, requires_initial_neuro, description, active, created_at, 
        includes_chat_support, includes_priority_chat_support, includes_private_area,
        includes_free_community_access, includes_personal_plan, includes_digital_monitoring,
        includes_advanced_digital_monitoring, includes_priority_scheduling, includes_lifestyle_coaching,
        includes_mindfulness_trial, includes_live_activity_trial, includes_discount_in_person_visit, discount_percent
      FROM products WHERE id = ?`,
      [planId]
    );

    const updatedServices = await query(
      `SELECT * FROM product_services WHERE product_id = ?`,
      [planId]
    );

    return res.status(200).json({
      success: true,
      message: "Plan updated successfully",
      plan: {
        ...updatedPlan,
        includes_chat_support: updatedPlan.includes_chat_support === 1 || updatedPlan.includes_chat_support === true,
        includes_priority_chat_support: updatedPlan.includes_priority_chat_support === 1 || updatedPlan.includes_priority_chat_support === true,
        includes_private_area: updatedPlan.includes_private_area === 1 || updatedPlan.includes_private_area === true,
        includes_free_community_access: updatedPlan.includes_free_community_access === 1 || updatedPlan.includes_free_community_access === true,
        includes_personal_plan: updatedPlan.includes_personal_plan === 1 || updatedPlan.includes_personal_plan === true,
        includes_digital_monitoring: updatedPlan.includes_digital_monitoring === 1 || updatedPlan.includes_digital_monitoring === true,
        includes_advanced_digital_monitoring: updatedPlan.includes_advanced_digital_monitoring === 1 || updatedPlan.includes_advanced_digital_monitoring === true,
        includes_priority_scheduling: updatedPlan.includes_priority_scheduling === 1 || updatedPlan.includes_priority_scheduling === true,
        includes_lifestyle_coaching: updatedPlan.includes_lifestyle_coaching === 1 || updatedPlan.includes_lifestyle_coaching === true,
        includes_mindfulness_trial: updatedPlan.includes_mindfulness_trial === 1 || updatedPlan.includes_mindfulness_trial === true,
        includes_live_activity_trial: updatedPlan.includes_live_activity_trial === 1 || updatedPlan.includes_live_activity_trial === true,
        includes_discount_in_person_visit: updatedPlan.includes_discount_in_person_visit === 1 || updatedPlan.includes_discount_in_person_visit === true,
        discount_percent: updatedPlan.discount_percent ? parseFloat(updatedPlan.discount_percent) : null,
        services: updatedServices.map(s => ({
          id: s.id,
          service_type: s.service_type,
          session_count: parseInt(s.session_count),
          is_locked: s.is_locked === 1 || s.is_locked === true,
          unlock_after_service: s.unlock_after_service,
        }))
      },
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error("updatePlan error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to update plan",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * Supprime un plan (soft delete - désactive)
 */
export const deletePlan = async (req, res) => {
  try {
    const planId = parseInt(req.params.planId, 10);

    if (isNaN(planId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan ID",
      });
    }

    // Vérifier que le plan existe
    const [existingPlan] = await query(
      `SELECT id FROM products WHERE id = ?`,
      [planId]
    );

    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Désactiver le plan (soft delete)
    await query(
      `UPDATE products SET active = 0 WHERE id = ?`,
      [planId]
    );

    return res.status(200).json({
      success: true,
      message: "Plan deleted successfully",
    });
  } catch (error) {
    console.error("deletePlan error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to delete plan",
    });
  }
};

