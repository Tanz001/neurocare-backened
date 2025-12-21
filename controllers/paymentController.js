import Stripe from 'stripe';
import dotenv from 'dotenv';
import { query } from '../config/db.js';
import pool from '../config/db.js';
import { calculateCommission } from '../services/productService.js';

dotenv.config();

/**
 * Stripe instance
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * IMPORTANT
 * Frontend is running on PORT 8080
 * Never fallback to backend or 3000
 */
const FRONTEND_URL = process.env.FRONTEND_URL; // http://localhost:8080

if (!FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not defined in .env');
}

/* =====================================================
   APPOINTMENT PAYMENT (PAYMENT INTENT)
===================================================== */

export const createPaymentIntent = async (req, res) => {
  try {
    const { appointment_id, amount } = req.body;
    const patientId = req.user.id;

    if (!appointment_id || !amount) {
      return res.status(400).json({
        success: false,
        message: 'appointment_id and amount are required',
      });
    }

    const [appointment] = await query(
      `SELECT id, doctor_id, patient_id, fee, status
       FROM appointments
       WHERE id = ? AND patient_id = ?`,
      [appointment_id, patientId]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: 'Appointment not found',
      });
    }

    if (appointment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Appointment is not pending payment',
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(amount) * 100),
      currency: 'eur',
      metadata: {
        appointment_id: appointment_id.toString(),
        patient_id: patientId.toString(),
        doctor_id: appointment.doctor_id.toString(),
      },
    });

    await query(
      `UPDATE appointments SET payment_intent_id = ? WHERE id = ?`,
      [paymentIntent.id, appointment_id]
    );

    res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
    });
  }
};

/* =====================================================
   PLAN PURCHASE - PAYMENT INTENT (AUTHENTICATED)
===================================================== */

export const createPlanPaymentIntent = async (req, res) => {
  try {
    const { product_id } = req.body;
    const patientId = req.user.id;

    if (!product_id) {
      return res.status(400).json({
        success: false,
        message: 'product_id is required',
      });
    }

    const [product] = await query(
      `SELECT id, name, price
       FROM products
       WHERE id = ? AND active = 1 AND product_type = 'subscription_plan'`,
      [product_id]
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found',
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(product.price) * 100),
      currency: 'eur',
      metadata: {
        product_id: product_id.toString(),
        patient_id: patientId.toString(),
        purchase_type: 'subscription_plan',
      },
    });

    res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating plan payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
    });
  }
};

/* =====================================================
   PLAN PURCHASE - PAYMENT INTENT (NO AUTH)
===================================================== */

export const createPlanPaymentIntentNoAuth = async (req, res) => {
  try {
    const { product_id, email } = req.body;

    if (!product_id || !email) {
      return res.status(400).json({
        success: false,
        message: 'product_id and email are required',
      });
    }

    const [product] = await query(
      `SELECT id, name, price
       FROM products
       WHERE id = ? AND active = 1 AND product_type = 'subscription_plan'`,
      [product_id]
    );

    const [user] = await query(
      `SELECT id, email FROM users WHERE email = ? AND role = 'patient'`,
      [email.toLowerCase()]
    );

    if (!product || !user) {
      return res.status(404).json({
        success: false,
        message: 'User or product not found',
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(product.price) * 100),
      currency: 'eur',
      metadata: {
        product_id: product_id.toString(),
        patient_id: user.id.toString(),
        purchase_type: 'subscription_plan',
      },
    });

    res.status(200).json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating plan payment intent (no auth):', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
    });
  }
};

/* =====================================================
   PLAN PURCHASE - CONFIRM PAYMENT & STORE DATA
===================================================== */

export const confirmPlanPayment = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const { payment_intent_id } = req.body;
    const patientId = req.user ? req.user.id : null;

    if (!payment_intent_id) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'payment_intent_id is required',
      });
    }

    // Récupérer le patient_id depuis les metadata du payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Payment intent status is ${paymentIntent.status}, not succeeded`,
      });
    }

    const productId = Number(paymentIntent.metadata.product_id);
    const metadataPatientId = Number(paymentIntent.metadata.patient_id);

    // Utiliser patient_id depuis metadata ou depuis req.user
    const finalPatientId = patientId || metadataPatientId;

    if (!finalPatientId) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Patient ID not found',
      });
    }

    // Vérifier si l'achat n'existe pas déjà (idempotent)
    const [existing] = await connection.execute(
      `SELECT id FROM patient_purchases
       WHERE patient_id = ? AND product_id = ? AND status = 'active'`,
      [finalPatientId, productId]
    );

    if (existing.length > 0) {
      await connection.commit();
      connection.release();
      return res.status(200).json({
        success: true,
        message: 'Purchase already exists',
        purchase_id: existing[0].id,
      });
    }

    // Récupérer les détails du produit
    const [products] = await connection.execute(
      `SELECT * FROM products WHERE id = ?`,
      [productId]
    );

    if (!products || products.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    const amount = paymentIntent.amount / 100;
    const commission = await calculateCommission(productId, 'first', amount);

    // Créer l'entrée patient_purchases
    const [purchaseResult] = await connection.execute(
      `INSERT INTO patient_purchases
       (patient_id, product_id, total_paid, platform_fee, professional_pool, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [finalPatientId, productId, amount, commission.platformFee, commission.professionalEarning]
    );

    const purchaseId = purchaseResult.insertId;

    // Récupérer les services du produit
    const [productServices] = await connection.execute(
      `SELECT * FROM product_services WHERE product_id = ?`,
      [productId]
    );

    // Créer les entrées wallet pour chaque service
    for (const service of productServices) {
      // Neurologie est déverrouillée initialement, autres services sont verrouillés selon is_locked
      const isLocked = service.service_type === 'neurology' ? 0 : service.is_locked;

      await connection.execute(
        `INSERT INTO patient_service_wallet
         (patient_id, purchase_id, service_type, remaining_sessions, is_locked)
         VALUES (?, ?, ?, ?, ?)`,
        [
          finalPatientId,
          purchaseId,
          service.service_type,
          service.session_count,
          isLocked,
        ]
      );
    }

    // Créer la transaction avec transaction_type='plan_purchase'
    await connection.execute(
      `INSERT INTO transactions
       (transaction_type, appointment_id, patient_id, doctor_id, amount, payment_method, status,
        product_id, purchase_id, platform_fee, professional_earning)
       VALUES ('plan_purchase', NULL, ?, NULL, ?, 'card', 'paid', ?, ?, ?, ?)`,
      [
        finalPatientId,
        amount,
        productId,
        purchaseId,
        commission.platformFee,
        commission.professionalEarning,
      ]
    );

    // Activer l'abonnement du patient
    await connection.execute(
      `UPDATE users SET subscribed = 1 WHERE id = ?`,
      [finalPatientId]
    );

    await connection.commit();
    connection.release();

    console.log(`✅ Plan purchase confirmed: Patient ${finalPatientId}, Product ${productId}, Purchase ID ${purchaseId}`);

    return res.status(200).json({
      success: true,
      message: 'Plan purchase confirmed successfully',
      purchase_id: purchaseId,
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Error confirming plan payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm plan payment',
      error: error.message,
    });
  }
};

/* =====================================================
   STRIPE WEBHOOK (OPTIONAL - NOT USED FOR PLANS)
===================================================== */

export const stripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const connection = await pool.getConnection();

  try {
    console.log('📥 Webhook received:', event.type);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('💳 Checkout session completed:', session.id);
      console.log('📋 Metadata:', session.metadata);

      // Vérifier que c'est bien un achat de plan
      const purchaseType = session.metadata.purchase_type;
      if (purchaseType !== 'subscription_plan') {
        console.log('⚠️ Not a subscription plan purchase, skipping');
        connection.release();
        return res.json({ received: true });
      }

      const productId = Number(session.metadata.product_id);
      const patientId = Number(session.metadata.patient_id);
      console.log(`🛒 Processing purchase: Patient ${patientId}, Product ${productId}`);

      await connection.beginTransaction();

      // Vérifier si l'achat n'existe pas déjà (idempotent)
      const [existing] = await connection.execute(
        `SELECT id FROM patient_purchases
         WHERE patient_id = ? AND product_id = ? AND status = 'active'`,
        [patientId, productId]
      );

      if (existing.length > 0) {
        await connection.commit();
        connection.release();
        return res.json({ received: true });
      }

      // Récupérer les détails du produit
      const [products] = await connection.execute(
        `SELECT * FROM products WHERE id = ?`,
        [productId]
      );

      if (!products || products.length === 0) {
        await connection.rollback();
        connection.release();
        console.error('Product not found:', productId);
        return res.status(400).json({ error: 'Product not found' });
      }

      const amount = session.amount_total / 100;
      const commission = await calculateCommission(productId, 'first', amount);

      // Créer l'entrée patient_purchases
      const [purchaseResult] = await connection.execute(
        `INSERT INTO patient_purchases
         (patient_id, product_id, total_paid, platform_fee, professional_pool, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [patientId, productId, amount, commission.platformFee, commission.professionalEarning]
      );

      const purchaseId = purchaseResult.insertId;

      // Récupérer les services du produit
      const [productServices] = await connection.execute(
        `SELECT * FROM product_services WHERE product_id = ?`,
        [productId]
      );

      // Créer les entrées wallet pour chaque service
      for (const service of productServices) {
        // Neurologie est déverrouillée initialement, autres services sont verrouillés selon is_locked
        const isLocked = service.service_type === 'neurology' ? 0 : service.is_locked;

        await connection.execute(
          `INSERT INTO patient_service_wallet
           (patient_id, purchase_id, service_type, remaining_sessions, is_locked)
           VALUES (?, ?, ?, ?, ?)`,
          [
            patientId,
            purchaseId,
            service.service_type,
            service.session_count,
            isLocked,
          ]
        );
      }

      // Créer la transaction avec transaction_type='plan_purchase'
      await connection.execute(
        `INSERT INTO transactions
         (transaction_type, appointment_id, patient_id, doctor_id, amount, payment_method, status,
          product_id, purchase_id, platform_fee, professional_earning)
         VALUES ('plan_purchase', NULL, ?, NULL, ?, 'card', 'paid', ?, ?, ?, ?)`,
        [
          patientId,
          amount,
          productId,
          purchaseId,
          commission.platformFee,
          commission.professionalEarning,
        ]
      );

      // Activer l'abonnement du patient
      await connection.execute(
        `UPDATE users SET subscribed = 1 WHERE id = ?`,
        [patientId]
      );

      await connection.commit();
      connection.release();
 
      console.log(`✅ Purchase completed successfully!`);
      console.log(`   - Patient ID: ${patientId}`);
      console.log(`   - Product ID: ${productId}`);
      console.log(`   - Purchase ID: ${purchaseId}`);
      console.log(`   - Amount: €${amount}`);
      console.log(`   - Wallet entries created: ${productServices.length}`);
      return res.json({ received: true });
    }

    console.log('ℹ️ Event type not handled:', event.type);
    res.json({ received: true });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook failed' });
  }
};
