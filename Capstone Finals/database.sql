-- MaternaCare database setup
CREATE DATABASE IF NOT EXISTS maternadb;
USE maternadb;

CREATE TABLE IF NOT EXISTS maternal_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id VARCHAR(50) NOT NULL,
    barangay VARCHAR(120),
    full_name VARCHAR(255) NOT NULL,
    age INT,
    zone VARCHAR(100),
    date_of_birth DATE,
    husband_name VARCHAR(255),
    delivery_type VARCHAR(100),
    gender VARCHAR(10),
    remarks TEXT,
    form_timestamp DATETIME,
    address TEXT,
    purok VARCHAR(100),
    contact_number VARCHAR(20),
    email VARCHAR(255),
    blood_pressure VARCHAR(50),
    chief_complaint TEXT,
    pulse_rate VARCHAR(20),
    respiratory_rate VARCHAR(20),
    last_menstrual_period DATE,
    expected_delivery_date DATE,
    para VARCHAR(50),
    abortion VARCHAR(50),
    living_children VARCHAR(50),
    age_of_gestation DOUBLE,
    weight DOUBLE,
    height DOUBLE,
    fetal_heart_tone INT,
    presentation VARCHAR(100),
    fundal_height DOUBLE,
    next_appointment DATE,
    term VARCHAR(50),
    preterm VARCHAR(50),
    high_risk BOOLEAN DEFAULT FALSE,
    barangay_residency_number VARCHAR(100),
    manual_gravida VARCHAR(50),
    health_profile JSON,
    pregnancy_history JSON,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_patient_id (patient_id),
    INDEX idx_maternal_records_full_name (full_name),
    INDEX idx_maternal_records_contact_number (contact_number)
);

CREATE TABLE IF NOT EXISTS pregnancy_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maternal_record_id INT NOT NULL,
    pregnancy_number INT NOT NULL,
    delivery_type VARCHAR(100),
    gender VARCHAR(10),
    place_of_delivery VARCHAR(255),
    year_delivered INT,
    attended_by VARCHAR(255),
    status VARCHAR(50),
    birth_date DATE,
    tt_injection VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maternal_record_id) REFERENCES maternal_records(id) ON DELETE CASCADE,
    UNIQUE KEY unique_pregnancy (maternal_record_id, pregnancy_number)
);

CREATE TABLE IF NOT EXISTS child_details (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maternal_record_id INT NOT NULL,
    delivery_type VARCHAR(100),
    gender VARCHAR(10),
    place_of_delivery VARCHAR(255),
    year_delivered VARCHAR(10),
    attended_by VARCHAR(255),
    status VARCHAR(50),
    birthdate DATE,
    tetanus_status VARCHAR(50),
    tetanus_year VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maternal_record_id) REFERENCES maternal_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vital_signs_entries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maternal_record_id INT NOT NULL,
    recorded_by INT,
    date DATE NOT NULL,
    blood_pressure VARCHAR(50),
    pulse_rate VARCHAR(20),
    respiratory_rate VARCHAR(20),
    remarks TEXT,
    aog VARCHAR(50),
    height VARCHAR(20),
    weight VARCHAR(20),
    fundal_height VARCHAR(20),
    fht VARCHAR(20),
    presentation VARCHAR(100),
    chief_complaint TEXT,
    to_come_back DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maternal_record_id) REFERENCES maternal_records(id) ON DELETE CASCADE,
    INDEX idx_vital_signs_date (date)
);

CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maternal_record_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    purpose VARCHAR(255) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Scheduled',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maternal_record_id) REFERENCES maternal_records(id) ON DELETE CASCADE,
    INDEX idx_appointments_date (appointment_date)
);

CREATE TABLE IF NOT EXISTS barangay_inventory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangay VARCHAR(120) NOT NULL,
    item_name VARCHAR(160) NOT NULL,
    category VARCHAR(80) NOT NULL,
    quantity DECIMAL(12, 2) UNSIGNED NOT NULL DEFAULT 0,
    unit VARCHAR(30) NOT NULL,
    minimum_quantity DECIMAL(12, 2) UNSIGNED NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_barangay_inventory_barangay (barangay),
    INDEX idx_barangay_inventory_item (item_name)
);

CREATE TABLE IF NOT EXISTS app_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    display_name VARCHAR(160) NOT NULL,
    role ENUM('bhw', 'municipality', 'admin') NOT NULL,
    barangay VARCHAR(120) NULL,
    password_hash VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_app_sessions_expiry (expires_at),
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS barangay_resource_needs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    barangay VARCHAR(120) NOT NULL,
    item_name VARCHAR(160) NOT NULL,
    category ENUM('Medicines', 'Medical supplies', 'Equipment', 'Services', 'Other resources') NOT NULL,
    quantity DECIMAL(12, 2) UNSIGNED NOT NULL,
    unit VARCHAR(30) NOT NULL,
    priority ENUM('Routine', 'High', 'Urgent') NOT NULL DEFAULT 'Routine',
    details TEXT NOT NULL,
    status ENUM('Submitted', 'Under Review', 'Approved', 'Fulfilled', 'Declined') NOT NULL DEFAULT 'Submitted',
    reviewed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_barangay_resource_needs_barangay (barangay),
    INDEX idx_barangay_resource_needs_status (status),
    INDEX idx_barangay_resource_needs_priority (priority),
    FOREIGN KEY (reviewed_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS barangay_supply_distributions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    inventory_id INT NULL,
    resource_need_id INT NULL,
    barangay VARCHAR(120) NOT NULL,
    item_name VARCHAR(160) NOT NULL,
    category VARCHAR(80) NOT NULL,
    quantity DECIMAL(12, 2) UNSIGNED NOT NULL,
    unit VARCHAR(30) NOT NULL,
    distribution_date DATE NOT NULL,
    notes TEXT,
    distributed_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_supply_distributions_date (distribution_date),
    INDEX idx_supply_distributions_barangay (barangay),
    INDEX idx_supply_distributions_need (resource_need_id),
    FOREIGN KEY (inventory_id) REFERENCES barangay_inventory(id) ON DELETE SET NULL,
    FOREIGN KEY (resource_need_id) REFERENCES barangay_resource_needs(id) ON DELETE SET NULL,
    FOREIGN KEY (distributed_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS sms_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maternal_record_id INT,
    recipient VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    provider_message_id VARCHAR(100),
    status VARCHAR(30) NOT NULL,
    provider_response JSON,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maternal_record_id) REFERENCES maternal_records(id) ON DELETE SET NULL,
    INDEX idx_sms_logs_recipient (recipient),
    INDEX idx_sms_logs_status (status)
);

SELECT 'MaternaCare database setup completed successfully.' AS status;
SHOW TABLES;
