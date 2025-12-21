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
  created_at
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
      `SELECT * FROM products WHERE id = ? AND product_type = 'subscription_plan'`,
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
       (name, product_type, service_category, price, platform_commission_percent, followup_commission_percent, requires_initial_neuro, description, active)
       VALUES (?, 'subscription_plan', ?, ?, ?, ?, ?, ?, 1)`,
      [
        name,
        service_category || 'multidisciplinary',
        parseFloat(price),
        platform_commission_percent ? parseFloat(platform_commission_percent) : 10.0,
        followup_commission_percent ? parseFloat(followup_commission_percent) : null,
        requires_initial_neuro ? 1 : 0,
        description || null,
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
      `SELECT * FROM products WHERE id = ?`,
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
      `SELECT * FROM products WHERE id = ?`,
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

