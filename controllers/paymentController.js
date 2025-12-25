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
   APPOINTMENT PAYMENT - PAYMENT INTENT (BEFORE APPOINTMENT CREATION)
===================================================== */

export const createAppointmentPaymentIntent = async (req, res) => {
  try {
    const { doctor_id, appointment_date, appointment_time, service_type, visit_type } = req.body;
    const patientId = req.user.id;

    if (!doctor_id || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        message: 'doctor_id, appointment_date, and appointment_time are required',
      });
    }

    // Get doctor fee
    const [doctor] = await query(
      `SELECT id, fee, speciality FROM users WHERE id = ? AND role = 'doctor' AND active = 1`,
      [doctor_id]
    );

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: 'Doctor not found or inactive',
      });
    }

    // Determine service type if not provided
    let determinedServiceType = service_type;
    if (!determinedServiceType) {
      const specialityMap = {
        'neurologist': 'neurology',
        'physiotherapist': 'physiotherapy',
        'psychologist': 'psychology',
        'nutritionist': 'nutrition',
        'coach': 'coaching'
      };
      determinedServiceType = specialityMap[doctor.speciality?.toLowerCase()] || 'neurology';
    }

    // Check if patient has wallet sessions for this service
    const { canBookService } = await import('../services/productService.js');
    const walletCheck = await canBookService(patientId, determinedServiceType);

    // If wallet has sessions, no payment needed
    if (walletCheck.canBook && walletCheck.walletEntry) {
      return res.status(200).json({
        success: true,
        requires_payment: false,
        message: 'Appointment can be booked using your plan',
      });
    }

    // If payment is required (no wallet sessions), use doctor's fee and mark as followup
    // If wallet has sessions, it's free and visit type is determined by isFirstVisit
    const { isFirstVisit } = await import('../services/productService.js');
    const isFirst = await isFirstVisit(patientId, doctor_id, determinedServiceType);
    
    // When payment is required (no wallet), it's always a follow-up appointment
    const finalVisitType = visit_type || 'followup';
    
    // Use doctor's fee for paid appointments
    if (!doctor.fee || doctor.fee <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Doctor fee is not set. Please contact support.',
      });
    }

    const amount = parseFloat(doctor.fee);

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(parseFloat(amount) * 100),
      currency: 'eur',
      metadata: {
        doctor_id: doctor_id.toString(),
        patient_id: patientId.toString(),
        appointment_date: appointment_date,
        appointment_time: appointment_time,
        service_type: determinedServiceType,
        visit_type: finalVisitType,
        purchase_type: 'appointment',
      },
    });

    res.status(200).json({
      success: true,
      requires_payment: true,
      amount: amount,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error('Error creating appointment payment intent:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/* =====================================================
   APPOINTMENT PAYMENT - CONFIRM PAYMENT & CREATE APPOINTMENT
===================================================== */

export const confirmAppointmentPayment = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();

    const { payment_intent_id, appointment_for, reason, notes } = req.body;
    const patientId = req.user ? req.user.id : null;

    if (!payment_intent_id) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'payment_intent_id is required',
      });
    }

    // Retrieve payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (paymentIntent.status !== 'succeeded') {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: `Payment intent status is ${paymentIntent.status}, not succeeded`,
      });
    }

    // Check if appointment already exists for this payment intent (idempotency check)
    const [existingAppointment] = await connection.execute(
      `SELECT id FROM appointments WHERE payment_intent_id = ?`,
      [payment_intent_id]
    );

    if (existingAppointment && existingAppointment.length > 0) {
      // Appointment already created for this payment intent
      await connection.commit();
      connection.release();
      return res.status(200).json({
        success: true,
        message: 'Appointment already created for this payment',
        appointment_id: existingAppointment[0].id,
      });
    }

    const doctorId = Number(paymentIntent.metadata.doctor_id);
    const metadataPatientId = Number(paymentIntent.metadata.patient_id);
    const finalPatientId = patientId || metadataPatientId;
    const appointmentDate = paymentIntent.metadata.appointment_date;
    const appointmentTime = paymentIntent.metadata.appointment_time;
    const serviceType = paymentIntent.metadata.service_type;
    const visitType = paymentIntent.metadata.visit_type;
    const amount = paymentIntent.amount / 100;

    if (!finalPatientId || !doctorId || !appointmentDate || !appointmentTime) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: 'Missing required payment intent metadata',
      });
    }

    // Get doctor info
    const [doctor] = await connection.execute(
      `SELECT id, fee, speciality FROM users WHERE id = ? AND role = 'doctor' AND active = 1`,
      [doctorId]
    );

    if (!doctor || doctor.length === 0) {
      await connection.rollback();
      connection.release();
      return res.status(404).json({
        success: false,
        message: 'Doctor not found',
      });
    }

    // Calculate commission for paid appointments
    // For paid appointments without a product, use default commission rate (e.g., 20%)
    // Or we can get it from a default product or system settings
    let commission = { platformFee: 0, professionalEarning: 0 };
    try {
      // Try to calculate commission (may fail if no product, so we have fallback)
      commission = await calculateCommission(null, visitType, amount);
    } catch (error) {
      // If no product, use default commission rate (20% platform, 80% professional)
      const defaultCommissionRate = 0.20; // 20%
      commission = {
        platformFee: amount * defaultCommissionRate,
        professionalEarning: amount * (1 - defaultCommissionRate),
      };
      console.log(`Using default commission rate for paid appointment: ${defaultCommissionRate * 100}%`);
    }

    // Parse appointment_time - handle both "HH:MM" and "HH:MM - HH:MM" formats
    let timeToStore = appointmentTime;
    if (appointmentTime.includes(' - ')) {
      timeToStore = appointmentTime.split(' - ')[0].trim();
    }

    // Create appointment
    const [insertResult] = await connection.execute(
      `INSERT INTO appointments 
        (patient_id, doctor_id, appointment_date, appointment_time, appointment_for, fee, 
         payment_method, reason, notes, status, service_type, visit_type, consumed_from_plan, payment_intent_id)
       VALUES (?, ?, ?, ?, ?, ?, 'card', ?, ?, 'pending', ?, ?, 0, ?)`,
      [
        finalPatientId,
        doctorId,
        appointmentDate,
        timeToStore,
        appointment_for || 'Consultation',
        amount,
        reason || null,
        notes || null,
        serviceType,
        visitType,
        payment_intent_id,
      ]
    );

    const appointmentId = insertResult.insertId;

    // Create transaction
    await connection.execute(
      `INSERT INTO transactions
       (transaction_type, appointment_id, patient_id, doctor_id, amount, payment_method, status,
        platform_fee, professional_earning)
       VALUES ('followup_appointment', ?, ?, ?, ?, 'card', 'paid', ?, ?)`,
      [
        appointmentId,
        finalPatientId,
        doctorId,
        amount,
        commission.platformFee || 0,
        commission.professionalEarning || 0,
      ]
    );

    await connection.commit();
    connection.release();

    console.log(`✅ Appointment payment confirmed: Patient ${finalPatientId}, Doctor ${doctorId}, Appointment ID ${appointmentId}`);

    return res.status(200).json({
      success: true,
      message: 'Appointment booked and payment confirmed successfully',
      appointment_id: appointmentId,
    });
  } catch (error) {
    await connection.rollback();
    connection.release();
    console.error('Error confirming appointment payment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm appointment payment',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
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

    console.log(`📦 Product ${productId} has ${productServices.length} services`);

    // Créer les entrées wallet pour chaque service
    if (productServices && productServices.length > 0) {
      for (const service of productServices) {
        // Neurologie est déverrouillée initialement, autres services sont verrouillés selon is_locked
        // Convertir is_locked de TINYINT(1) à 0/1
        const serviceIsLocked = service.is_locked === 1 || service.is_locked === true ? 1 : 0;
        const isLocked = service.service_type === 'neurology' ? 0 : serviceIsLocked;

        await connection.execute(
          `INSERT INTO patient_service_wallet
           (patient_id, purchase_id, service_type, remaining_sessions, is_locked)
           VALUES (?, ?, ?, ?, ?)`,
          [
            finalPatientId,
            purchaseId,
            service.service_type,
            parseInt(service.session_count) || 0,
            isLocked,
          ]
        );
        
        console.log(`✅ Wallet entry created: ${service.service_type}, sessions: ${service.session_count}, locked: ${isLocked}`);
      }
    } else {
      console.warn(`⚠️ No services found for product ${productId}`);
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
    const [updateResult] = await connection.execute(
      `UPDATE users SET subscribed = 1 WHERE id = ?`,
      [finalPatientId]
    );
    
    console.log(`✅ Updated subscribed status for patient ${finalPatientId}, affected rows: ${updateResult.affectedRows}`);

    await connection.commit();
    connection.release();

    console.log(`✅ Plan purchase confirmed: Patient ${finalPatientId}, Product ${productId}, Purchase ID ${purchaseId}, Wallet entries: ${productServices ? productServices.length : 0}`);

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
