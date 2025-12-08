import Stripe from "stripe";
import { query } from "../config/db.js";
import pool from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY , {
  apiVersion: "2024-12-18.acacia",
});

/**
 * Create Stripe payment intent for appointment
 */
export const createPaymentIntent = async (req, res) => {
  try {
    const userId = req.user.id;
    const { appointment_id, amount } = req.body;

    if (!appointment_id || !amount) {
      return res.status(400).json({
        success: false,
        message: "appointment_id and amount are required",
      });
    }

    // Verify appointment belongs to user
    const [appointment] = await query(
      `SELECT id, patient_id, doctor_id, fee, status 
       FROM appointments 
       WHERE id = ? AND patient_id = ?`,
      [appointment_id, userId]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (appointment.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Appointment is not in pending status",
      });
    }

    // Validate amount matches appointment fee
    const appointmentFee = parseFloat(appointment.fee) || 0;
    const requestedAmount = parseFloat(amount);

    if (requestedAmount !== appointmentFee) {
      return res.status(400).json({
        success: false,
        message: "Amount does not match appointment fee",
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(requestedAmount * 100), // Convert to cents
      currency: "usd",
      metadata: {
        appointment_id: appointment_id.toString(),
        patient_id: userId.toString(),
        doctor_id: appointment.doctor_id.toString(),
      },
    });

    // Update appointment with payment intent ID (if column exists)
    try {
      await pool.execute(
        `UPDATE appointments 
         SET payment_intent_id = ? 
         WHERE id = ?`,
        [paymentIntent.id, appointment_id]
      );
    } catch (error) {
      // If column doesn't exist, log warning but continue
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        console.warn("payment_intent_id column does not exist. Please run the migration script: database/migrations/add_payment_intent_to_appointments.sql");
      } else {
        throw error;
      }
    }

    res.json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (error) {
    console.error("Error creating payment intent:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create payment intent",
      error: error.message,
    });
  }
};

/**
 * Confirm payment and update appointment status
 */
export const confirmPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const { payment_intent_id, appointment_id } = req.body;

    if (!payment_intent_id || !appointment_id) {
      return res.status(400).json({
        success: false,
        message: "payment_intent_id and appointment_id are required",
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);

    // Verify payment intent belongs to user's appointment
    // Check if payment_intent_id column exists, if not, select without it
    const [appointment] = await query(
      `SELECT id, patient_id, status 
       FROM appointments 
       WHERE id = ? AND patient_id = ?`,
      [appointment_id, userId]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    // Try to get payment_intent_id if column exists
    try {
      const [appointmentWithPayment] = await query(
        `SELECT payment_intent_id 
         FROM appointments 
         WHERE id = ?`,
        [appointment_id]
      );
      
      if (appointmentWithPayment && appointmentWithPayment.payment_intent_id && 
          appointmentWithPayment.payment_intent_id !== payment_intent_id) {
        return res.status(400).json({
          success: false,
          message: "Payment intent does not match appointment",
        });
      }
    } catch (error) {
      // Column doesn't exist, skip validation
      console.log("payment_intent_id column not found, skipping validation");
    }

    // Check if payment has already been confirmed
    if (appointment.status === "accepted") {
      // Check if transaction already exists
      const [existingTransaction] = await query(
        `SELECT id FROM transactions WHERE appointment_id = ? AND status = 'paid'`,
        [appointment_id]
      );

      if (existingTransaction) {
        // Payment already confirmed, return success
        return res.json({
          success: true,
          message: "Payment already confirmed",
          appointment_id: appointment_id,
        });
      }
    }

    // Check payment status
    if (paymentIntent.status === "succeeded") {
      // Check if appointment is already accepted (idempotency)
      if (appointment.status !== "accepted") {
        // Update appointment status
        await pool.execute(
          `UPDATE appointments 
           SET status = 'accepted' 
           WHERE id = ?`,
          [appointment_id]
        );
      }

      // Check if transaction already exists
      const [existingTransaction] = await query(
        `SELECT id FROM transactions WHERE appointment_id = ? AND status = 'paid'`,
        [appointment_id]
      );

      if (!existingTransaction) {
        // Create transaction record only if it doesn't exist
        const [appointmentDetails] = await query(
          `SELECT doctor_id, fee, payment_method 
           FROM appointments 
           WHERE id = ?`,
          [appointment_id]
        );

        // Map payment_method: 'stripe' -> 'card', 'paypal' -> 'card', ensure it's valid for ENUM
        let paymentMethod = appointmentDetails.payment_method || "card";
        if (paymentMethod === "stripe" || paymentMethod === "paypal") {
          paymentMethod = "card"; // Map to 'card' for transactions table ENUM
        }
        // Ensure payment_method is one of the valid ENUM values
        const validMethods = ["card", "easypaisa", "jazzcash", "bank", "cash"];
        if (!validMethods.includes(paymentMethod)) {
          paymentMethod = "card";
        }
        // Truncate if too long (for VARCHAR columns)
        if (paymentMethod.length > 30) {
          paymentMethod = paymentMethod.substring(0, 30);
        }

        await pool.execute(
          `INSERT INTO transactions 
           (appointment_id, patient_id, doctor_id, amount, payment_method, status) 
           VALUES (?, ?, ?, ?, ?, 'paid')`,
          [
            appointment_id,
            userId,
            appointmentDetails.doctor_id,
            appointmentDetails.fee,
            paymentMethod,
          ]
        );
      }

      res.json({
        success: true,
        message: "Payment confirmed successfully",
        appointment_id: appointment_id,
      });
    } else {
      res.status(400).json({
        success: false,
        message: `Payment not completed. Status: ${paymentIntent.status}`,
      });
    }
  } catch (error) {
    console.error("Error confirming payment:", error);
    
    // Handle Stripe-specific errors
    if (error.type === "StripeInvalidRequestError") {
      if (error.code === "payment_intent_unexpected_state") {
        // Payment intent already succeeded, check if we can still process it
        const paymentIntent = error.payment_intent;
        if (paymentIntent && paymentIntent.status === "succeeded") {
          // Try to confirm anyway (idempotency check will handle it)
          try {
            const [appointment] = await query(
              `SELECT id, status FROM appointments WHERE id = ? AND patient_id = ?`,
              [appointment_id, userId]
            );
            
            if (appointment && appointment.status !== "accepted") {
              // Update appointment and create transaction
              await pool.execute(
                `UPDATE appointments SET status = 'accepted' WHERE id = ?`,
                [appointment_id]
              );
              
              const [appointmentDetails] = await query(
                `SELECT doctor_id, fee, payment_method FROM appointments WHERE id = ?`,
                [appointment_id]
              );
              
              const [existingTransaction] = await query(
                `SELECT id FROM transactions WHERE appointment_id = ? AND status = 'paid'`,
                [appointment_id]
              );
              
              if (!existingTransaction) {
                let paymentMethod = appointmentDetails.payment_method || "card";
                if (paymentMethod === "stripe" || paymentMethod === "paypal") {
                  paymentMethod = "card";
                }
                const validMethods = ["card", "easypaisa", "jazzcash", "bank", "cash"];
                if (!validMethods.includes(paymentMethod)) {
                  paymentMethod = "card";
                }
                if (paymentMethod.length > 30) {
                  paymentMethod = paymentMethod.substring(0, 30);
                }
                
                await pool.execute(
                  `INSERT INTO transactions 
                   (appointment_id, patient_id, doctor_id, amount, payment_method, status) 
                   VALUES (?, ?, ?, ?, ?, 'paid')`,
                  [appointment_id, userId, appointmentDetails.doctor_id, appointmentDetails.fee, paymentMethod]
                );
              }
              
              return res.json({
                success: true,
                message: "Payment confirmed successfully",
                appointment_id: appointment_id,
              });
            } else {
              return res.json({
                success: true,
                message: "Payment already confirmed",
                appointment_id: appointment_id,
              });
            }
          } catch (innerError) {
            console.error("Error handling already succeeded payment:", innerError);
          }
        }
      }
      
      return res.status(400).json({
        success: false,
        message: error.message || "Payment confirmation failed",
        error: error.code || error.type,
      });
    }
    
    res.status(500).json({
      success: false,
      message: "Failed to confirm payment",
      error: error.message,
    });
  }
};

/**
 * Webhook handler for Stripe events
 */
export const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded":
      const paymentIntent = event.data.object;
      const appointmentId = paymentIntent.metadata.appointment_id;

      if (appointmentId) {
        try {
          // Update appointment status
          // Check if payment_intent_id column exists
          try {
            await pool.execute(
              `UPDATE appointments 
               SET status = 'accepted' 
               WHERE id = ? AND payment_intent_id = ?`,
              [appointmentId, paymentIntent.id]
            );
          } catch (error) {
            // If column doesn't exist, update without payment_intent_id check
            if (error.code === 'ER_BAD_FIELD_ERROR') {
              await pool.execute(
                `UPDATE appointments 
                 SET status = 'accepted' 
                 WHERE id = ?`,
                [appointmentId]
              );
            } else {
              throw error;
            }
          }

          // Create transaction record
          const [appointment] = await query(
            `SELECT patient_id, doctor_id, fee, payment_method 
             FROM appointments 
             WHERE id = ?`,
            [appointmentId]
          );

          if (appointment) {
            await pool.execute(
              `INSERT INTO transactions 
               (appointment_id, patient_id, doctor_id, amount, payment_method, status) 
               VALUES (?, ?, ?, ?, ?, 'paid')`,
              [
                appointmentId,
                appointment.patient_id,
                appointment.doctor_id,
                appointment.fee,
                appointment.payment_method || "card",
              ]
            );
          }
        } catch (error) {
          console.error("Error processing webhook:", error);
        }
      }
      break;

    case "payment_intent.payment_failed":
      const failedPayment = event.data.object;
      const failedAppointmentId = failedPayment.metadata.appointment_id;

      if (failedAppointmentId) {
        try {
          try {
            await pool.execute(
              `UPDATE appointments 
               SET status = 'pending' 
               WHERE id = ? AND payment_intent_id = ?`,
              [failedAppointmentId, failedPayment.id]
            );
          } catch (error) {
            // If column doesn't exist, update without payment_intent_id check
            if (error.code === 'ER_BAD_FIELD_ERROR') {
              await pool.execute(
                `UPDATE appointments 
                 SET status = 'pending' 
                 WHERE id = ?`,
                [failedAppointmentId]
              );
            } else {
              throw error;
            }
          }
        } catch (error) {
          console.error("Error processing failed payment webhook:", error);
        }
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};

