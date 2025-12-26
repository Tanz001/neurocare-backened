-- Migration: Add additional features columns to products table
-- This adds columns for non-appointment related features like chat, private area, community access, etc.

ALTER TABLE products
ADD COLUMN IF NOT EXISTS includes_chat_support TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_priority_chat_support TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_private_area TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_free_community_access TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_personal_plan TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_digital_monitoring TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_advanced_digital_monitoring TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_priority_scheduling TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_lifestyle_coaching TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_mindfulness_trial TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_live_activity_trial TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS includes_discount_in_person_visit TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NULL DEFAULT NULL;

-- Note: MySQL 8.0+ supports IF NOT EXISTS for ADD COLUMN
-- For older versions, you may need to remove IF NOT EXISTS or handle errors manually



