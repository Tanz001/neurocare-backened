-- Migration: Add subscription columns to users table
-- Adds subscribed and current_plan_id columns to track patient subscription status

SET @dbname = DATABASE();

-- Add subscribed column (TINYINT(1), default 0)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscribed TINYINT(1) DEFAULT 0 COMMENT 'Subscription status: 1 = subscribed, 0 = not subscribed';

-- Add current_plan_id column (BIGINT, nullable, references products.id)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS current_plan_id BIGINT NULL COMMENT 'Currently active subscription plan ID';

-- Add foreign key constraint for current_plan_id
-- Note: MySQL doesn't support IF NOT EXISTS for foreign keys, so we check first
SET @fkname = 'fk_users_current_plan';
SET @tablename = 'users';

SET @sql = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
   WHERE CONSTRAINT_SCHEMA = @dbname 
   AND TABLE_NAME = @tablename 
   AND CONSTRAINT_NAME = @fkname) > 0,
  'SELECT ''Foreign key already exists'' AS message;',
  CONCAT('ALTER TABLE ', @tablename, ' ADD CONSTRAINT ', @fkname, ' FOREIGN KEY (current_plan_id) REFERENCES products(id) ON DELETE SET NULL;')
));

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add index on subscribed for faster queries
CREATE INDEX IF NOT EXISTS idx_users_subscribed ON users(subscribed);

-- Add index on current_plan_id for faster joins
CREATE INDEX IF NOT EXISTS idx_users_current_plan ON users(current_plan_id);





