-- Migration: Add product system columns to appointments and transactions tables
-- Run this migration after creating the products, product_services, patient_purchases, and patient_service_wallet tables

-- Add columns to appointments table
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS product_id BIGINT NULL,
ADD COLUMN IF NOT EXISTS purchase_id BIGINT NULL,
ADD COLUMN IF NOT EXISTS service_type ENUM(
  'neurology',
  'physiotherapy',
  'psychology',
  'nutrition',
  'coaching',
  'group_session'
) NULL,
ADD COLUMN IF NOT EXISTS visit_type ENUM('first','followup') DEFAULT 'first',
ADD COLUMN IF NOT EXISTS consumed_from_plan TINYINT(1) DEFAULT 0;

-- Add foreign keys if columns were just created (MySQL doesn't support IF NOT EXISTS for foreign keys)
-- These will fail gracefully if foreign keys already exist
SET @dbname = DATABASE();
SET @tablename = 'appointments';
SET @fkname = 'fk_appointments_product';
SET @fkname2 = 'fk_appointments_purchase';

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
   WHERE CONSTRAINT_SCHEMA = @dbname 
   AND TABLE_NAME = @tablename 
   AND CONSTRAINT_NAME = @fkname) > 0,
  'SELECT ''Foreign key already exists'' AS message;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @fkname, ' FOREIGN KEY (product_id) REFERENCES products(id);')
));

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
   WHERE CONSTRAINT_SCHEMA = @dbname 
   AND TABLE_NAME = @tablename 
   AND CONSTRAINT_NAME = @fkname2) > 0,
  'SELECT ''Foreign key already exists'' AS message;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @fkname2, ' FOREIGN KEY (purchase_id) REFERENCES patient_purchases(id);')
));

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add columns to transactions table
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS product_id BIGINT NULL,
ADD COLUMN IF NOT EXISTS purchase_id BIGINT NULL,
ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS professional_earning DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Add foreign keys for transactions table
SET @tablename = 'transactions';
SET @fkname = 'fk_transactions_product';
SET @fkname2 = 'fk_transactions_purchase';

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
   WHERE CONSTRAINT_SCHEMA = @dbname 
   AND TABLE_NAME = @tablename 
   AND CONSTRAINT_NAME = @fkname) > 0,
  'SELECT ''Foreign key already exists'' AS message;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @fkname, ' FOREIGN KEY (product_id) REFERENCES products(id);')
));

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
   WHERE CONSTRAINT_SCHEMA = @dbname 
   AND TABLE_NAME = @tablename 
   AND CONSTRAINT_NAME = @fkname2) > 0,
  'SELECT ''Foreign key already exists'' AS message;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @fkname2, ' FOREIGN KEY (purchase_id) REFERENCES patient_purchases(id);')
));

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Note: MySQL 8.0+ supports IF NOT EXISTS for ADD COLUMN
-- For older versions, you may need to remove IF NOT EXISTS or handle errors manually



