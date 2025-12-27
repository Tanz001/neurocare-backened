import { query } from "../config/db.js";
import pool from "../config/db.js";
import { canBookService, isFirstVisit, consumeWalletSession, getSingleServicePrice } from "../services/productService.js";
import { calculateCommission } from "../services/productService.js";

const parseSchedule = (scheduleRow) => {
  if (!scheduleRow) return null;
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const parsed = {};

  days.forEach((day) => {
    const value = scheduleRow[day];
    if (!value && value !== 0) {
      parsed[day] = null;
      return;
    }

    if (typeof value === "string") {
      try {
        parsed[day] = JSON.parse(value);
      } catch (error) {
        console.warn(`parseSchedule: failed to parse ${day} for doctor ${scheduleRow.doctor_id}:`, error.message);
        parsed[day] = null;
      }
      return;
    }

    if (typeof value === "object") {
      parsed[day] = value;
      return;
    }

    parsed[day] = null;
  });

  return parsed;
};

export const getBestDoctorFromTriage = async (req, res) => {
  try {
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Answers array is required",
      });
    }

    // Calculate scores
    const scores = { physical: 0, psychological: 0, nutritional: 0 };
    answers.forEach((answer) => {
      if (answer === "physical") scores.physical++;
      else if (answer === "psychological") scores.psychological++;
      else if (answer === "nutritional") scores.nutritional++;
    });

    // Determine result (default = physical)
    let result = "physical";
    if (scores.psychological > scores.physical && scores.psychological > scores.nutritional) {
      result = "psychological";
    } else if (scores.nutritional > scores.physical && scores.nutritional > scores.psychological) {
      result = "nutritional";
    }

    // Map result to speciality
    let speciality;
    if (result === "physical") {
      speciality = "physiotherapist";
    } else if (result === "psychological") {
      speciality = "psychologist";
    } else {
      speciality = "nutritionist";
    }

    console.log("Triage request:", { answers, scores, result, speciality });

    // Get top-rated doctor for this speciality (case-insensitive match)
    // Handle NULL speciality values
    const searchSpeciality = speciality.trim().toLowerCase();
    console.log("Searching for speciality:", searchSpeciality);
    
    const doctors = await query(
      `
        SELECT 
          u.id,
          u.full_name,
          u.email,
          u.phone,
          u.speciality,
          u.experience_years,
          u.fee,
          u.education,
          u.profile_image_url,
          u.active,
          u.bio,
          ROUND(COALESCE(AVG(r.rating), 0), 2) as average_rating,
          COUNT(r.id) as total_reviews
        FROM users u
        LEFT JOIN reviews r ON r.doctor_id = u.id
        WHERE u.role = 'doctor' 
          AND u.active = 1 
          AND u.speciality IS NOT NULL
          AND LOWER(u.speciality) = ?
        GROUP BY u.id
        ORDER BY average_rating DESC, total_reviews DESC, u.full_name ASC
        LIMIT 1
      `,
      [searchSpeciality]
    );
    
    console.log("Query result:", doctors.length, "doctors found");

    if (doctors.length === 0) {
      // Try to find any doctor with similar speciality (fallback)
      const fallbackSpeciality1 = `%${searchSpeciality}%`;
      const fallbackSpeciality2 = `%${searchSpeciality.slice(0, 5)}%`;
      const fallbackDoctors = await query(
        `
          SELECT 
            u.id,
            u.full_name,
            u.email,
            u.phone,
            u.speciality,
            u.experience_years,
            u.fee,
            u.education,
            u.profile_image_url,
            u.active,
            u.bio,
            ROUND(COALESCE(AVG(r.rating), 0), 2) as average_rating,
            COUNT(r.id) as total_reviews
          FROM users u
          LEFT JOIN reviews r ON r.doctor_id = u.id
          WHERE u.role = 'doctor' 
            AND u.active = 1 
            AND u.speciality IS NOT NULL
            AND (LOWER(u.speciality) LIKE ? OR LOWER(u.speciality) LIKE ?)
          GROUP BY u.id
          ORDER BY average_rating DESC, total_reviews DESC, u.full_name ASC
          LIMIT 1
        `,
        [fallbackSpeciality1, fallbackSpeciality2]
      );

      if (fallbackDoctors.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No ${speciality} found`,
          result,
          speciality,
        });
      }

      // Use fallback doctor
      return res.status(200).json({
        success: true,
        doctor: fallbackDoctors[0],
        result,
        speciality: fallbackDoctors[0].speciality,
      });
    }

    return res.status(200).json({
      success: true,
      doctor: doctors[0],
      result,
      speciality,
    });
  } catch (error) {
    console.error("getBestDoctorFromTriage error:", error);
    console.error("Error details:", {
      message: error.message,
      stack: error.stack,
      answers: req.body?.answers,
    });
    return res.status(500).json({
      success: false,
      message: "Unable to find best doctor",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};
export const getAllDoctors = async (req, res) => {
  try {
    const { speciality, search } = req.query;
    const patientId = req.user?.id || null;

    /* ----------------------------------------------------
       1️⃣ Build base doctor query
    ---------------------------------------------------- */
    const where = ["u.role = 'doctor'", "u.active = 1"];
    const params = [];

    if (speciality) {
      where.push("LOWER(u.speciality) = ?");
      params.push(speciality.toLowerCase());
    }

    if (search) {
      where.push("(u.full_name LIKE ? OR u.education LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const doctors = await query(
      `
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.phone,
        u.speciality,
        u.experience_years,
        u.fee,
        u.education,
        u.profile_image_url,
        u.active,
        ROUND(COALESCE(AVG(r.rating), 0), 2) AS average_rating,
        COUNT(r.id) AS total_reviews
      FROM users u
      LEFT JOIN reviews r ON r.doctor_id = u.id
      WHERE ${where.join(" AND ")}
      GROUP BY u.id
      ORDER BY average_rating DESC, u.full_name ASC
      `,
      params
    );

    /* ----------------------------------------------------
       2️⃣ Map speciality → service_type
    ---------------------------------------------------- */
    const specialityToServiceMap = {
      neurologist: "neurology",
      physiotherapist: "physiotherapy",
      psychologist: "psychology",
      nutritionist: "nutrition",
      coach: "coaching",
    };

    /* ----------------------------------------------------
       3️⃣ If NOT authenticated → return simple list
    ---------------------------------------------------- */
    if (!patientId) {
      const result = doctors.map((doctor) => ({
        ...doctor,
        service_type:
          specialityToServiceMap[doctor.speciality?.toLowerCase()] || null,
        is_locked: false,
        can_book: true,
      }));

      return res.status(200).json({
        success: true,
        doctors: result,
      });
    }

    /* ----------------------------------------------------
       4️⃣ Check if patient completed a NEUROLOGY appointment
           🔥 FIXED (no destructuring bug)
    ---------------------------------------------------- */
    const completedNeurologyAppointments = await query(
      `
      SELECT COUNT(*) AS count
      FROM appointments
      WHERE patient_id = ?
        AND status = 'completed'
        AND service_type = 'neurology'
      `,
      [patientId]
    );

    const hasCompletedNeurologyAppointment =
      completedNeurologyAppointments[0]?.count > 0;

    console.log(
      `🧠 Neurology completed for patient ${patientId}:`,
      hasCompletedNeurologyAppointment
    );

    /* ----------------------------------------------------
       5️⃣ Enrich doctors with lock / booking logic
    ---------------------------------------------------- */
    const doctorsWithLockStatus = doctors.map((doctor) => {
      const serviceType =
        specialityToServiceMap[doctor.speciality?.toLowerCase()] || null;

      let is_locked = false;
      let can_book = true;

      // 🔓 Neurology is ALWAYS unlocked
      if (serviceType === "neurology") {
        is_locked = false;
        can_book = true;
      }
      // 🔒 Other services require completed neurology
      else if (serviceType && !hasCompletedNeurologyAppointment) {
        is_locked = true;
        can_book = false;
      }

      return {
        ...doctor,
        service_type: serviceType,
        is_locked,
        can_book,
      };
    });

    /* ----------------------------------------------------
       6️⃣ Send response
    ---------------------------------------------------- */
    return res.status(200).json({
      success: true,
      doctors: doctorsWithLockStatus,
    });
  } catch (error) {
    console.error("❌ getAllDoctors error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch doctors",
    });
  }
};


export const getDoctorById = async (req, res) => {
  try {
    const doctorId = parseInt(req.params.doctorId, 10);
    if (isNaN(doctorId)) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID" });
    }

    const patientId = req.user ? req.user.id : null;

    const [doctor] = await query(
      `SELECT * FROM users WHERE id = ? AND role = 'doctor' AND active = 1`,
      [doctorId]
    );

    if (!doctor) {
      return res.status(404).json({ success: false, message: "Doctor not found" });
    }

    // Map spécialité to service_type
    const specialityToServiceMap = {
      'neurologist': 'neurology',
      'physiotherapist': 'physiotherapy',
      'psychologist': 'psychology',
      'nutritionist': 'nutrition',
      'coach': 'coaching'
    };

    const serviceType = specialityToServiceMap[doctor.speciality?.toLowerCase()];
    let is_locked = false;
    let can_book = true;

    // Si le patient est authentifié, vérifier le statut de verrouillage
    if (patientId) {
      try {
        // Vérifier si le patient a complété au moins un rendez-vous avec un neurologue
        // Check both by doctor speciality and by service_type
        const [completedNeurologyAppointments] = await query(
          `SELECT COUNT(*) as count
           FROM appointments a
           INNER JOIN users u ON a.doctor_id = u.id
           WHERE a.patient_id = ?
             AND a.status = 'completed'
             AND (
               u.speciality = 'neurologist' 
               OR a.service_type = 'neurology'
             )
           LIMIT 1`,
          [patientId]
        );

        const hasCompletedNeurologyAppointment = completedNeurologyAppointments[0]?.count > 0;

        // Si c'est un neurologue, toujours déverrouillé
        if (serviceType === 'neurology') {
          is_locked = false;
          can_book = true;
        } else if (serviceType) {
          // Pour les autres services, vérifier si le patient a complété un rendez-vous neurologique
          if (!hasCompletedNeurologyAppointment) {
            // Si pas de rendez-vous neurologique complété, verrouiller tous les autres services
            is_locked = true;
            can_book = false;
          } else {
            // Si rendez-vous neurologique complété, vérifier le wallet
            const walletEntries = await query(
              `SELECT 
                psw.service_type,
                psw.is_locked,
                psw.remaining_sessions,
                pp.status as purchase_status
              FROM patient_service_wallet psw
              INNER JOIN patient_purchases pp ON psw.purchase_id = pp.id
              WHERE psw.patient_id = ?
                AND psw.service_type = ?
                AND psw.remaining_sessions > 0
                AND pp.status = 'active'
              LIMIT 1`,
              [patientId, serviceType]
            );

            if (walletEntries && walletEntries.length > 0) {
              const entry = walletEntries[0];
              if (entry.is_locked === 1) {
                is_locked = true;
                can_book = false;
              } else {
                is_locked = false;
                can_book = true;
              }
            } else {
              // Service pas dans le wallet mais rendez-vous neurologique complété = déverrouillé
              is_locked = false;
              can_book = true;
            }
          }
        }
      } catch (lockError) {
        console.error("Error checking lock status for doctor:", lockError);
        // En cas d'erreur, considérer comme déverrouillé
        is_locked = false;
        can_book = true;
      }
    }

    const [scheduleRow] = await query(`SELECT * FROM doctor_schedules WHERE doctor_id = ?`, [doctorId]);
    const parsedSchedule = scheduleRow ? parseSchedule(scheduleRow) : {};

    const doctor_education = await query(
      `SELECT * FROM doctor_education 
       WHERE doctor_id = ? 
       ORDER BY end_year IS NULL, end_year DESC, start_year DESC`,
      [doctorId]
    ).catch(() => []);

    const experience = await query(
      `SELECT * FROM doctor_experience 
       WHERE doctor_id = ? 
       ORDER BY end_date IS NULL, end_date DESC, start_date DESC`,
      [doctorId]
    ).catch(() => []);

    const documents = await query(
      `SELECT id, document_type, file_url, status, uploaded_at 
       FROM doctor_documents 
       WHERE doctor_id = ?`,
      [doctorId]
    ).catch(() => []);

    const reviews = await query(
      `SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS patient_name
       FROM reviews r
       INNER JOIN users u ON r.patient_id = u.id
       WHERE r.doctor_id = ?
       ORDER BY r.created_at DESC`,
      [doctorId]
    ).catch(() => []);

    return res.status(200).json({
      success: true,
      doctor: {
        ...doctor,
        service_type: serviceType || null,
        is_locked: is_locked,
        can_book: can_book,
        schedule: parsedSchedule,
        experience,
        doctor_education,
        documents,
        reviews,
      },
    });
  } catch (error) {
    console.error("getDoctorById error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch doctor details",
    });
  }
};


export const createAppointment = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const {
      patient_id,
      doctor_id,
      appointment_date,
      appointment_time,
      appointment_for,
      reason,
      notes,
      payment_method: paymentMethodFromBody,
      service_type, // Type de service: neurology, physiotherapy, psychology, nutrition, coaching, group_session
      purchase_id, // Optionnel: ID de l'achat si c'est depuis un plan/package
      use_wallet = true, // Par défaut, utiliser le wallet si disponible
    } = req.body;

    // Get patient_id from body, fallback to token if not provided
    const patientId = patient_id || (req.user ? req.user.id : null);

    if (!patientId) {
      await connection.rollback();
      connection.release();
      return res.status(400).json({
        success: false,
        message: "patient_id is required",
      });
    }

    // Utiliser let pour permettre la réassignation
    let payment_method = paymentMethodFromBody;

    if (!doctor_id || !appointment_date || !appointment_time || !appointment_for) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "doctor_id, appointment_date, appointment_time and appointment_for are required",
      });
    }

    // Récupérer le docteur avec sa spécialité
    const [doctor] = await query(
      `SELECT id, fee, speciality FROM users WHERE id = ? AND role = 'doctor' AND active = 1`,
      [doctor_id]
    );

    if (!doctor) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Doctor not found or inactive",
      });
    }

    // Déterminer le service_type si non fourni (basé sur la spécialité du docteur)
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

    let appointmentFee = null;
    let productId = null;
    let walletPurchaseId = null;
    let visitType = 'first';
    let consumedFromPlan = false;

    // Simple logic: Check wallet for remaining sessions
    // If sessions available → use wallet (free, no payment)
    // If no sessions → require payment (doctor's fee via payment method)
    if (determinedServiceType !== 'group_session') {
      const walletCheck = await canBookService(patientId, determinedServiceType);
      
      if (walletCheck.canBook && walletCheck.walletEntry) {
        // Wallet has remaining sessions - use wallet (free, no payment)
        consumedFromPlan = true;
        walletPurchaseId = walletCheck.walletEntry.purchase_id;
        
        // Get product_id from purchase
        const [purchase] = await query(
          `SELECT product_id FROM patient_purchases WHERE id = ?`,
          [walletPurchaseId]
        );
        
        if (purchase) {
          productId = purchase.product_id;
        }

        // Consume wallet session
        try {
          await consumeWalletSession(walletPurchaseId, determinedServiceType, connection);
        } catch (walletError) {
          console.error("Error consuming wallet session:", walletError);
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: walletError.message || "Failed to consume wallet session. Please try again.",
          });
        }
        
        // Free appointment from wallet
        appointmentFee = 0;
        payment_method = 'none';
      } else {
        // No wallet sessions available - require payment
        consumedFromPlan = false;
        console.log(`💰 No wallet sessions available for ${determinedServiceType}, payment required`);
      }
    }

    // If no wallet sessions, this is a paid appointment
    if (!consumedFromPlan) {
      // When payment is required (no wallet), it's always a follow-up appointment
      visitType = 'followup';
      
      // For group sessions
      if (determinedServiceType === 'group_session') {
        if (!payment_method) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: "payment_method is required for group sessions",
          });
        }
        appointmentFee = doctor.fee || 39;
      } else {
        // Use doctor's fee for paid appointments
        if (!doctor.fee || doctor.fee <= 0) {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: "Doctor fee is not set. Please contact support.",
          });
        }

        appointmentFee = parseFloat(doctor.fee);

        // For paid appointments, payment must be processed via Stripe
        // If createAppointment is called directly without payment, return error
        // Payment should be processed via createAppointmentPaymentIntent + confirmAppointmentPayment
        if (!payment_method || payment_method === 'none') {
          await connection.rollback();
          connection.release();
          return res.status(400).json({
            success: false,
            message: "Payment is required for this appointment. Please process payment first via payment intent.",
          });
        }
      }
    }

    // Parse appointment_time - handle both "HH:MM" and "HH:MM - HH:MM" formats
    let timeToStore = appointment_time;
    if (appointment_time.includes(' - ')) {
      // Extract start time from range (e.g., "20:00 - 22:00" -> "20:00")
      timeToStore = appointment_time.split(' - ')[0].trim();
    }
    
    // Validate time format (HH:MM or HH:MM:SS)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9](:([0-5][0-9]))?$/;
    if (!timeRegex.test(timeToStore)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid appointment_time format. Expected HH:MM format (e.g., 20:00)",
      });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(appointment_date)) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid appointment_date format. Expected YYYY-MM-DD format",
      });
    }

    // Check if date is in the past
    const appointmentDate = new Date(appointment_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (appointmentDate < today) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Appointment date cannot be in the past",
      });
    }

    // Check for duplicate appointments (only block if there's an accepted or completed appointment)
    // Allow multiple pending appointments in case payment failed or user wants to retry
    const existing = await query(
      `SELECT id, status, payment_intent_id 
       FROM appointments 
       WHERE patient_id = ? 
         AND doctor_id = ? 
         AND appointment_date = ? 
         AND appointment_time = ? 
         AND status IN ('accepted', 'completed')`,
      [patientId, doctor_id, appointment_date, timeToStore]
    );

    if (existing.length > 0) {
      await connection.rollback();
      const existingAppointment = existing[0];
      return res.status(409).json({
        success: false,
        message: `You already have an ${existingAppointment.status} appointment scheduled at this date and time. Please choose a different time slot.`,
      });
    }

    // Check if there's a pending appointment (allow creating new one, but cancel old pending if exists)
    const pendingAppointments = await query(
      `SELECT id 
       FROM appointments 
       WHERE patient_id = ? 
         AND doctor_id = ? 
         AND appointment_date = ? 
         AND appointment_time = ? 
         AND status = 'pending'`,
      [patientId, doctor_id, appointment_date, timeToStore]
    );

    // Cancel any existing pending appointments at this time slot
    // Note: Les annulations peuvent être faites en dehors de la transaction
    if (pendingAppointments.length > 0) {
      for (const pending of pendingAppointments) {
        try {
          await connection.execute(
            `UPDATE appointments SET status = 'cancelled' WHERE id = ?`,
            [pending.id]
          );
        } catch (error) {
          console.warn("Could not cancel pending appointment:", error);
          // Continuer même si l'annulation échoue
        }
      }
    }

    // Créer le rendez-vous avec les nouvelles colonnes
    console.log(`📅 Creating appointment: patientId=${patientId}, doctorId=${doctor_id}, consumedFromPlan=${consumedFromPlan}, serviceType=${determinedServiceType}`);
    
    const [insertResult] = await connection.execute(
      `INSERT INTO appointments 
        (patient_id, doctor_id, appointment_date, appointment_time, appointment_for, fee, 
         payment_method, reason, notes, status, product_id, purchase_id, service_type, 
         visit_type, consumed_from_plan)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [
        patientId,
        doctor_id,
        appointment_date,
        timeToStore,
        appointment_for,
        appointmentFee || 0,
        payment_method || (consumedFromPlan ? 'none' : 'card'), // 'none' pour les plans, requis pour les appointments payants
        reason || null,
        notes || null,
        productId,
        walletPurchaseId || purchase_id || null,
        determinedServiceType,
        visitType,
        consumedFromPlan ? 1 : 0,
      ]
    );

    const appointmentId = insertResult.insertId;
    console.log(`✅ Appointment inserted with ID: ${appointmentId}, consumedFromPlan: ${consumedFromPlan}`);

    // Si l'appointment est depuis un plan, créer une transaction
    if (consumedFromPlan && walletPurchaseId) {
      try {
        // Récupérer les informations du purchase pour calculer la commission
        const purchaseInfoResult = await connection.execute(
          `SELECT pp.product_id, pp.total_paid, p.platform_commission_percent 
           FROM patient_purchases pp
           INNER JOIN products p ON pp.product_id = p.id
           WHERE pp.id = ?`,
          [walletPurchaseId]
        );

        const purchaseInfo = purchaseInfoResult[0]; // Get rows array from result

        if (!purchaseInfo || purchaseInfo.length === 0) {
          console.error(`❌ No purchase info found for walletPurchaseId: ${walletPurchaseId}`);
          throw new Error("Purchase information not found");
        }

        const purchase = purchaseInfo[0];
        
        if (!purchase || !purchase.product_id) {
          console.error("❌ Purchase info is missing product_id:", purchase);
          throw new Error("Invalid purchase information - product_id is missing");
        }
        
        // Calculer la commission (pour un followup appointment depuis un plan, utiliser le pourcentage de followup)
        const commission = await calculateCommission(purchase.product_id, visitType, 0); // fee = 0 car c'est depuis le plan

        // Créer la transaction avec transaction_type='followup_appointment'
        // payment_method = 'card' for plan-based appointments (ENUM doesn't support 'plan', using 'card' as default)
        await connection.execute(
          `INSERT INTO transactions
           (transaction_type, appointment_id, patient_id, doctor_id, amount, payment_method, status,
            product_id, purchase_id, platform_fee, professional_earning)
           VALUES ('followup_appointment', ?, ?, ?, ?, 'card', 'paid', ?, ?, ?, ?)`,
          [
            appointmentId,
            patientId,
            doctor_id,
            0, // amount = 0 car c'est depuis un plan
            purchase.product_id,
            walletPurchaseId,
            commission.platformFee || 0,
            commission.professionalEarning || 0,
          ]
        );

        // Update doctor's balance (professional earning from plan)
        if (commission.professionalEarning > 0) {
          await connection.execute(
            `UPDATE users SET balance = balance + ? WHERE id = ? AND role = 'doctor'`,
            [commission.professionalEarning, doctor_id]
          );
          console.log(`✅ Updated doctor ${doctor_id} balance from plan: +${commission.professionalEarning}`);
        }
      } catch (txError) {
        console.error("Error creating transaction for plan appointment:", txError);
        // Ne pas faire échouer la création de l'appointment si la transaction échoue
        // L'appointment est créé, c'est juste l'enregistrement de transaction qui échoue
      }
    } else if (!consumedFromPlan && appointmentFee > 0) {
      // Create transaction for paid appointments (not from plan)
      try {
        // Calculate commission for paid appointments
        // Use default commission rate (20%) if no product
        let commission = { platformFee: 0, professionalEarning: 0 };
        try {
          // Try to get commission from a default product or use system default
          // For now, use default 20% platform commission
          const defaultCommissionRate = 0.20; // 20%
          commission = {
            platformFee: appointmentFee * defaultCommissionRate,
            professionalEarning: appointmentFee * (1 - defaultCommissionRate),
          };
        } catch (error) {
          // Fallback to default commission
          const defaultCommissionRate = 0.20;
          commission = {
            platformFee: appointmentFee * defaultCommissionRate,
            professionalEarning: appointmentFee * (1 - defaultCommissionRate),
          };
        }

        // Create transaction for paid appointment
        await connection.execute(
          `INSERT INTO transactions
           (transaction_type, appointment_id, patient_id, doctor_id, amount, payment_method, status,
            platform_fee, professional_earning)
           VALUES ('appointment_payment', ?, ?, ?, ?, ?, 'paid', ?, ?)`,
          [
            appointmentId,
            patientId,
            doctor_id,
            appointmentFee,
            payment_method || 'card',
            commission.platformFee || 0,
            commission.professionalEarning || 0,
          ]
        );

        // Update doctor's balance (80% of appointment fee for paid appointments)
        if (commission.professionalEarning > 0) {
          await connection.execute(
            `UPDATE users SET balance = balance + ? WHERE id = ? AND role = 'doctor'`,
            [commission.professionalEarning, doctor_id]
          );
          console.log(`✅ Updated doctor ${doctor_id} balance from paid appointment: +${commission.professionalEarning}`);
        }
      } catch (txError) {
        console.error("Error creating transaction for paid appointment:", txError);
        // Don't fail appointment creation if transaction fails
      }
    }

    // Commit the transaction
    await connection.commit();
    console.log(`✅ Transaction committed successfully for appointment ID: ${insertResult.insertId}`);
    
    // Verify appointment was created by querying it back
    const verifyAppointmentResult = await query(
      `SELECT id, status, consumed_from_plan FROM appointments WHERE id = ?`,
      [insertResult.insertId]
    );
    
    if (!verifyAppointmentResult || verifyAppointmentResult.length === 0) {
      console.error(`❌ CRITICAL: Appointment ${insertResult.insertId} was not found after commit!`);
      connection.release();
      return res.status(500).json({
        success: false,
        message: "Appointment was created but could not be verified. Please contact support.",
      });
    }
    
    const verifyAppointment = verifyAppointmentResult[0];
    console.log(`✅ Appointment verified in database: ID=${verifyAppointment.id}, status=${verifyAppointment.status}, consumedFromPlan=${verifyAppointment.consumed_from_plan}`);

    return res.status(201).json({
      success: true,
      message: consumedFromPlan 
        ? "Appointment booked successfully from your plan"
        : "Appointment request submitted successfully",
      appointment: {
        id: insertResult.insertId,
        appointment_id: insertResult.insertId,
        fee: appointmentFee,
        consumed_from_plan: consumedFromPlan,
        service_type: determinedServiceType,
        visit_type: visitType,
      },
      appointment_id: insertResult.insertId,
      fee: appointmentFee,
    });
  } catch (error) {
    await connection.rollback();
    console.error("createAppointment error:", error);
    
    // Provide more specific error messages
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        success: false,
        message: "An appointment already exists at this date and time",
      });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor_id or patient_id",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to create appointment. Please try again later.",
    });
  } finally {
    connection.release();
  }
};

export const getMyAppointments = async (req, res) => {
  try {
    const patientId = req.user.id;
    const appointments = await query(
      `SELECT 
        a.*,
        d.full_name AS doctor_name,
        d.speciality AS doctor_speciality,
        d.profile_image_url AS doctor_profile_image,
        d.fee AS doctor_fee
      FROM appointments a
      INNER JOIN users d ON a.doctor_id = d.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
      [patientId]
    );

    return res.status(200).json({
      success: true,
      appointments,
    });
  } catch (error) {
    console.error("getMyAppointments error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch appointments",
    });
  }
};

export const getAppointmentDetails = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { appointmentId } = req.params;

    const [appointment] = await query(
      `SELECT 
        a.*,
        d.full_name AS doctor_name,
        d.speciality AS doctor_speciality,
        d.profile_image_url AS doctor_profile_image
      FROM appointments a
      INNER JOIN users d ON a.doctor_id = d.id
      WHERE a.id = ? AND a.patient_id = ?`,
      [appointmentId, patientId]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const documents = await query(
      `SELECT id, file_url, description, uploaded_at, uploaded_by 
       FROM appointment_documents
       WHERE appointment_id = ?
       ORDER BY uploaded_at DESC`,
      [appointmentId]
    );

    return res.status(200).json({
      success: true,
      appointment: {
        ...appointment,
        documents,
      },
    });
  } catch (error) {
    console.error("getAppointmentDetails error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch appointment details",
    });
  }
};

export const cancelAppointment = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { appointmentId } = req.params;

    const result = await query(
      `UPDATE appointments 
       SET status = 'cancelled'
       WHERE id = ? AND patient_id = ? AND status IN ('pending', 'accepted')`,
      [appointmentId, patientId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found or cannot be cancelled anymore",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Appointment cancelled",
    });
  } catch (error) {
    console.error("cancelAppointment error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to cancel appointment",
    });
  }
};

export const submitReview = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { doctor_id, appointment_id, rating, comment } = req.body;

    if (!doctor_id || !appointment_id || !rating) {
      return res.status(400).json({
        success: false,
        message: "doctor_id, appointment_id and rating are required",
      });
    }

    if (Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        success: false,
        message: "rating must be between 1 and 5",
      });
    }

    const [appointment] = await query(
      `SELECT id, status FROM appointments 
       WHERE id = ? AND patient_id = ? AND doctor_id = ?`,
      [appointment_id, patientId, doctor_id]
    );

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (!["completed", "accepted"].includes(appointment.status)) {
      return res.status(400).json({
        success: false,
        message: "You can only review completed or accepted appointments",
      });
    }

    const existing = await query(
      `SELECT id FROM reviews WHERE appointment_id = ? AND patient_id = ?`,
      [appointment_id, patientId]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this appointment",
      });
    }

    const insertResult = await query(
      `INSERT INTO reviews (doctor_id, patient_id, appointment_id, rating, comment)
       VALUES (?, ?, ?, ?, ?)`,
      [doctor_id, patientId, appointment_id, rating, comment || null]
    );

    return res.status(201).json({
      success: true,
      message: "Review submitted",
      review_id: insertResult.insertId,
    });
  } catch (error) {
    console.error("submitReview error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to submit review",
    });
  }
};

export const checkReviewExists = async (req, res) => {
  try {
    const patientId = req.user.id;
    const { appointmentId } = req.params;

    const [review] = await query(
      `SELECT id, rating, comment, created_at 
       FROM reviews 
       WHERE appointment_id = ? AND patient_id = ?`,
      [appointmentId, patientId]
    );

    return res.status(200).json({
      success: true,
      hasReview: !!review,
      review: review || null,
    });
  } catch (error) {
    console.error("checkReviewExists error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to check review status",
    });
  }
};

export const getDashboardMetrics = async (req, res) => {
  try {
    const patientId = req.user.id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    // Get active appointments (pending + accepted)
    const [activeResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE patient_id = ? AND status IN ('pending', 'accepted')`,
      [patientId]
    );

    // Get completed appointments
    const [completedResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE patient_id = ? AND status = 'completed'`,
      [patientId]
    );

    // Get upcoming consultations (accepted appointments with future dates or today)
    const [upcomingResult] = await query(
      `SELECT COUNT(*) as count 
       FROM appointments 
       WHERE patient_id = ? 
         AND status = 'accepted' 
         AND (appointment_date > ? OR (appointment_date = ? AND appointment_time >= TIME(NOW())))`,
      [patientId, todayStr, todayStr]
    );

    // Get appointment breakdown by status for pie chart
    const statusBreakdown = await query(
      `SELECT 
        status,
        COUNT(*) as count
       FROM appointments
       WHERE patient_id = ?
       GROUP BY status`,
      [patientId]
    );

    // Get upcoming appointments list (for display)
    const upcomingAppointments = await query(
      `SELECT 
        a.id,
        a.appointment_date,
        a.appointment_time,
        a.status,
        d.full_name AS doctor_name,
        d.speciality AS doctor_speciality,
        d.profile_image_url AS doctor_profile_image
      FROM appointments a
      INNER JOIN users d ON a.doctor_id = d.id
      WHERE a.patient_id = ? 
        AND a.status = 'accepted' 
        AND (a.appointment_date > ? OR (a.appointment_date = ? AND a.appointment_time >= TIME(NOW())))
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
      LIMIT 5`,
      [patientId, todayStr, todayStr]
    );

    // Format status breakdown for pie chart
    const pieChartData = statusBreakdown.map(item => ({
      name: item.status.charAt(0).toUpperCase() + item.status.slice(1),
      value: parseInt(item.count),
      status: item.status,
    }));

    return res.status(200).json({
      success: true,
      metrics: {
        active_appointments: parseInt(activeResult.count) || 0,
        completed_appointments: parseInt(completedResult.count) || 0,
        upcoming_consultations: parseInt(upcomingResult.count) || 0,
        pie_chart_data: pieChartData,
        upcoming_appointments: upcomingAppointments,
      },
    });
  } catch (error) {
    console.error("getDashboardMetrics error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard metrics",
    });
  }
};
