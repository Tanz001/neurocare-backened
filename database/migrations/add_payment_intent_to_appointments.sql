-- ==========================================================
-- Migration: Add payment_intent_id column to appointments table
-- Date: 2024
-- Description: Adds payment_intent_id column for Stripe payment integration
-- ==========================================================

-- Step 1: Add payment_intent_id column
ALTER TABLE appointments 
ADD COLUMN payment_intent_id VARCHAR(255) NULL AFTER payment_method;

-- Step 2: Add index for payment_intent_id for faster lookups
ALTER TABLE appointments 
ADD INDEX idx_appointments_payment_intent (payment_intent_id);

-- Verification query (optional - run to verify the column was added)
-- SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_NAME = 'appointments' AND COLUMN_NAME = 'payment_intent_id';
