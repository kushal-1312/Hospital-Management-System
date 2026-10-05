-- ==============================================================================
-- MedCare One - Supabase PostgreSQL Schema
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- to create all required tables, constraints, indexes, and initial sequences.
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Sequences Table (for human-readable IDs like PAT-00001, APT-00001, etc.)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sequences (
  id TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Function to atomically get and increment a sequence value
CREATE OR REPLACE FUNCTION get_next_sequence(seq_id TEXT, initial_val INTEGER DEFAULT 0)
RETURNS INTEGER AS $$
DECLARE
  next_val INTEGER;
BEGIN
  INSERT INTO sequences (id, value, updated_at)
  VALUES (seq_id, initial_val + 1, NOW())
  ON CONFLICT (id) DO UPDATE
  SET value = sequences.value + 1, updated_at = NOW()
  RETURNING value INTO next_val;
  RETURN next_val;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 2. Users Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'doctor', 'nurse', 'staff')),
  department VARCHAR(100),
  phone VARCHAR(50),
  specialization VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  avatar TEXT,
  last_login TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,

  -- Security fields
  refresh_token_hash VARCHAR(255),
  login_attempts INTEGER DEFAULT 0,
  lock_until TIMESTAMPTZ,
  password_reset_token VARCHAR(255),
  password_reset_expires TIMESTAMPTZ,
  two_factor_secret TEXT,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_backup_codes JSONB DEFAULT '[]'::jsonb,
  two_factor_pending BOOLEAN DEFAULT FALSE,
  security_log JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- ------------------------------------------------------------------------------
-- 3. Patients Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  age INTEGER NOT NULL CHECK (age >= 0 AND age <= 150),
  gender VARCHAR(10) NOT NULL CHECK (gender IN ('male', 'female', 'other')),
  blood_group VARCHAR(10),
  contact JSONB DEFAULT '{}'::jsonb,
  address JSONB DEFAULT '{"country": "India"}'::jsonb,
  current_diagnosis TEXT,
  current_prescriptions JSONB DEFAULT '[]'::jsonb,
  allergies JSONB DEFAULT '[]'::jsonb,
  medical_history JSONB DEFAULT '[]'::jsonb,
  files JSONB DEFAULT '[]'::jsonb,
  assigned_doctor UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'discharged', 'critical', 'stable', 'under-observation')),
  admission_date TIMESTAMPTZ DEFAULT NOW(),
  discharge_date TIMESTAMPTZ,
  ward VARCHAR(50),
  bed_number VARCHAR(50),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  audit_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);
CREATE INDEX IF NOT EXISTS idx_patients_status ON patients(status);
CREATE INDEX IF NOT EXISTS idx_patients_assigned_doctor ON patients(assigned_doctor);
CREATE INDEX IF NOT EXISTS idx_patients_admission_date ON patients(admission_date);

-- ------------------------------------------------------------------------------
-- 4. Appointments Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id VARCHAR(50) UNIQUE NOT NULL,
  patient UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  patient_name VARCHAR(100),
  doctor_name VARCHAR(100),
  date TIMESTAMPTZ NOT NULL,
  time_slot JSONB NOT NULL, -- {"start": "09:00", "end": "09:30"}
  duration INTEGER DEFAULT 30,
  type VARCHAR(30) DEFAULT 'consultation' CHECK (type IN ('consultation', 'follow-up', 'emergency', 'routine-checkup', 'procedure')),
  reason TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no-show')),
  diagnosis TEXT,
  prescription TEXT,
  follow_up_date TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_appointment_id ON appointments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON appointments(doctor);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- ------------------------------------------------------------------------------
-- 5. Suppliers Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE,
  contact_person VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(255),
  address JSONB DEFAULT '{}'::jsonb,
  gst_number VARCHAR(50),
  license_number VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  total_orders INTEGER DEFAULT 0,
  total_value NUMERIC(15, 2) DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(code);

-- ------------------------------------------------------------------------------
-- 6. Medicines Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medicines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  generic_name VARCHAR(255),
  brand VARCHAR(255),
  category VARCHAR(30) DEFAULT 'tablet' CHECK (category IN ('tablet', 'capsule', 'syrup', 'injection', 'cream', 'drops', 'inhaler', 'patch', 'powder', 'other')),
  code VARCHAR(50) UNIQUE,
  strength VARCHAR(50),
  unit VARCHAR(50) DEFAULT 'tablet',
  pack_size INTEGER DEFAULT 1,
  current_stock INTEGER DEFAULT 0,
  reorder_level INTEGER DEFAULT 10,
  max_stock INTEGER DEFAULT 1000,
  location VARCHAR(100),
  cost_price NUMERIC(12, 2) DEFAULT 0,
  selling_price NUMERIC(12, 2) DEFAULT 0,
  requires_prescription BOOLEAN DEFAULT FALSE,
  schedule VARCHAR(10) DEFAULT '',
  hsn VARCHAR(50),
  gst_rate NUMERIC(5, 2) DEFAULT 12,
  is_active BOOLEAN DEFAULT TRUE,
  is_discontinued BOOLEAN DEFAULT FALSE,
  description TEXT,
  side_effects TEXT,
  contraindications TEXT,
  storage_instructions VARCHAR(255) DEFAULT 'Store in a cool, dry place below 25°C',
  batches JSONB DEFAULT '[]'::jsonb,
  movements JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_code ON medicines(code);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);
CREATE INDEX IF NOT EXISTS idx_medicines_current_stock ON medicines(current_stock);

-- ------------------------------------------------------------------------------
-- 7. Dispensings Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispensings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispensing_id VARCHAR(50) UNIQUE NOT NULL,
  patient UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  patient_name VARCHAR(100),
  appointment UUID REFERENCES appointments(id) ON DELETE SET NULL,
  prescribed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  prescribed_by_name VARCHAR(100),
  items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12, 2) DEFAULT 0,
  discount NUMERIC(12, 2) DEFAULT 0,
  total_amount NUMERIC(12, 2) DEFAULT 0,
  payment_method VARCHAR(30) DEFAULT 'cash',
  invoice UUID,
  notes TEXT,
  status VARCHAR(30) DEFAULT 'dispensed' CHECK (status IN ('pending', 'dispensed', 'partially_dispensed', 'cancelled')),
  dispensed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  dispensed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispensings_dispensing_id ON dispensings(dispensing_id);
CREATE INDEX IF NOT EXISTS idx_dispensings_patient ON dispensings(patient);
CREATE INDEX IF NOT EXISTS idx_dispensings_dispensed_at ON dispensings(dispensed_at);

-- ------------------------------------------------------------------------------
-- 8. Invoices Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  patient UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment UUID REFERENCES appointments(id) ON DELETE SET NULL,
  patient_name VARCHAR(100),
  patient_id VARCHAR(50),
  line_items JSONB DEFAULT '[]'::jsonb,
  subtotal NUMERIC(12, 2) DEFAULT 0,
  total_discount NUMERIC(12, 2) DEFAULT 0,
  total_tax NUMERIC(12, 2) DEFAULT 0,
  grand_total NUMERIC(12, 2) DEFAULT 0,
  insurance JSONB DEFAULT '{"provider":"","policyNumber":"","claimNumber":"","coverageAmount":0,"status":"not_claimed"}'::jsonb,
  insurance_covered NUMERIC(12, 2) DEFAULT 0,
  payments JSONB DEFAULT '[]'::jsonb,
  amount_paid NUMERIC(12, 2) DEFAULT 0,
  amount_due NUMERIC(12, 2) DEFAULT 0,
  status VARCHAR(30) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'cancelled', 'refunded')),
  payment_method VARCHAR(30),
  notes TEXT,
  issued_date TIMESTAMPTZ DEFAULT NOW(),
  due_date TIMESTAMPTZ,
  paid_date TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  audit_trail JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_date ON invoices(issued_date);

-- ------------------------------------------------------------------------------
-- 9. Audit Events Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  request_id VARCHAR(100) NOT NULL,
  actor JSONB NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  outcome VARCHAR(20) NOT NULL CHECK (outcome IN ('success', 'rejected')),
  status_code INTEGER NOT NULL,
  duration_ms NUMERIC(10, 2),
  source JSONB DEFAULT '{}'::jsonb,
  integrity VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_events(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_events(resource, resource_id);

-- ------------------------------------------------------------------------------
-- 10. Notifications Table
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(100) NOT NULL,
  body VARCHAR(500) NOT NULL,
  type VARCHAR(30) DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'critical', 'appointment', 'patient', 'staff', 'system')),
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient, read, created_at DESC);

-- ------------------------------------------------------------------------------
-- Optional: Enable Row Level Security (RLS)
-- By default with service_role key, queries bypass RLS.
-- ------------------------------------------------------------------------------
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispensings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;

-- Allow full access for backend service role key
CREATE POLICY "Full service access for users" ON users FOR ALL USING (true);
CREATE POLICY "Full service access for patients" ON patients FOR ALL USING (true);
CREATE POLICY "Full service access for appointments" ON appointments FOR ALL USING (true);
CREATE POLICY "Full service access for medicines" ON medicines FOR ALL USING (true);
CREATE POLICY "Full service access for dispensings" ON dispensings FOR ALL USING (true);
CREATE POLICY "Full service access for invoices" ON invoices FOR ALL USING (true);
CREATE POLICY "Full service access for suppliers" ON suppliers FOR ALL USING (true);
CREATE POLICY "Full service access for audit_events" ON audit_events FOR ALL USING (true);
CREATE POLICY "Full service access for notifications" ON notifications FOR ALL USING (true);
CREATE POLICY "Full service access for sequences" ON sequences FOR ALL USING (true);
