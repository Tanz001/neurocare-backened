-- ==========================================================
-- NeuroCare Database Schema
-- Compatible with MySQL 8+
-- ==========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash TEXT NOT NULL,
  role ENUM('patient', 'doctor', 'admin') NOT NULL,
  active TINYINT(1) DEFAULT 1,
  gender VARCHAR(20),
  age INT,
  education TEXT,
  speciality VARCHAR(150),
  experience_years INT,
  fee DECIMAL(10, 2),
  profile_image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_active (active)
);

CREATE TABLE IF NOT EXISTS doctor_education (
  education_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doctor_id BIGINT NOT NULL,
  degree_title VARCHAR(150) NOT NULL,
  institution VARCHAR(200) NOT NULL,
  start_year INT,
  end_year INT,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_doctor_education_doctor (doctor_id)
);

CREATE TABLE IF NOT EXISTS doctor_experience (
  experience_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doctor_id BIGINT NOT NULL,
  job_title VARCHAR(150) NOT NULL,
  organization VARCHAR(200) NOT NULL,
  start_date DATE,
  end_date DATE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_doctor_experience_doctor (doctor_id)
);

CREATE TABLE IF NOT EXISTS doctor_documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doctor_id BIGINT NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  file_url TEXT NOT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_doctor_documents_status (status)
);

CREATE TABLE IF NOT EXISTS doctor_schedules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doctor_id BIGINT NOT NULL UNIQUE,
  monday JSON,
  tuesday JSON,
  wednesday JSON,
  thursday JSON,
  friday JSON,
  saturday JSON,
  sunday JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT NOT NULL,
  doctor_id BIGINT NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  appointment_for VARCHAR(100) NOT NULL,
  reason TEXT,
  notes TEXT,
  fee DECIMAL(10, 2),
  payment_method ENUM('card','easypaisa','jazzcash','bank','cash','stripe','paypal') DEFAULT 'card',
  payment_intent_id VARCHAR(255) NULL,
  status ENUM('pending','accepted','rejected','completed','cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_appointments_status (status),
  INDEX idx_appointments_doctor (doctor_id),
  INDEX idx_appointments_patient (patient_id),
  INDEX idx_appointments_payment_intent (payment_intent_id)
);

CREATE TABLE IF NOT EXISTS appointment_documents (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT NOT NULL,
  uploaded_by BIGINT NOT NULL,
  file_url TEXT NOT NULL,
  description VARCHAR(200),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_appointment_documents_appt (appointment_id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT NOT NULL,
  patient_id BIGINT NOT NULL,
  doctor_id BIGINT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method ENUM('card','easypaisa','jazzcash','bank','cash') NOT NULL,
  status ENUM('pending','paid','failed','refunded') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_transactions_status (status)
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doctor_id BIGINT NOT NULL,
  patient_id BIGINT NOT NULL,
  appointment_id BIGINT NOT NULL,
  rating TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_review_appointment_patient (appointment_id, patient_id),
  INDEX idx_reviews_doctor (doctor_id),
  INDEX idx_reviews_doctor_rating (doctor_id, rating)
);

-- Chat System Tables
CREATE TABLE IF NOT EXISTS chats (
  chat_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  doctor_id BIGINT NOT NULL,
  patient_id BIGINT NOT NULL,
  last_message_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_chats_doctor (doctor_id),
  INDEX idx_chats_patient (patient_id),
  INDEX idx_chats_last_message (last_message_at),
  UNIQUE KEY uniq_chat_doctor_patient (doctor_id, patient_id)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  sender_id BIGINT NOT NULL,
  sender_role ENUM('doctor', 'patient') NOT NULL,
  message_type ENUM('text', 'file', 'image') NOT NULL DEFAULT 'text',
  message_text TEXT NULL,
  file_url VARCHAR(500) NULL,
  file_name VARCHAR(255) NULL,
  file_type VARCHAR(50) NULL,
  file_size INT(11) NULL,
  is_read TINYINT(1) DEFAULT 0,
  read_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(chat_id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_messages_chat (chat_id),
  INDEX idx_messages_sender (sender_id),
  INDEX idx_messages_sender_role (sender_role),
  INDEX idx_messages_is_read (is_read),
  INDEX idx_messages_created_at (created_at)
);

SET FOREIGN_KEY_CHECKS = 1;

