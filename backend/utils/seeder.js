require('dotenv').config({ quiet: true });
const bcrypt = require('bcryptjs');
const { testConnection, isConfigured } = require('../config/supabase');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const Medicine = require('../models/Medicine');

const seed = async () => {
  try {
    if (!isConfigured()) {
      console.log('⚠️ Supabase credentials not configured in backend/.env.');
      console.log('Please add your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env and re-run.');
      process.exit(1);
    }

    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Failed to connect to Supabase. Please verify your credentials and network.');
      process.exit(1);
    }

    console.log('Clearing existing demo records...');
    await Promise.all([User.deleteMany({}), Patient.deleteMany({}), Appointment.deleteMany({})]);

    const password = await bcrypt.hash('Admin@1234', 12);

    console.log('Inserting demo users...');
    const users = await User.insertMany([
      { name: 'Dr. Admin Kumar', email: 'admin@hms.com', password, role: 'admin', department: 'Administration', phone: '+91-9876543210', isActive: true },
      { name: 'Dr. Priya Sharma', email: 'doctor1@hms.com', password, role: 'doctor', department: 'Cardiology', specialization: 'Cardiologist', phone: '+91-9876543211', isActive: true },
      { name: 'Dr. Rahul Mehta', email: 'doctor2@hms.com', password, role: 'doctor', department: 'Neurology', specialization: 'Neurologist', phone: '+91-9876543212', isActive: true },
      { name: 'Nurse Kavya Nair', email: 'nurse1@hms.com', password, role: 'nurse', department: 'Cardiology', phone: '+91-9876543214', isActive: true },
      { name: 'Staff Ravi Gupta', email: 'staff1@hms.com', password, role: 'staff', department: 'Reception', phone: '+91-9876543215', isActive: true },
    ]);

    const [admin, doc1, doc2] = users;

    console.log('Inserting demo patients...');
    const patients = await Patient.insertMany([
      { patientId: 'PAT-00001', name: 'Arjun Singh', age: 45, gender: 'male', bloodGroup: 'O+', contact: { phone: '+91-9000000001', email: 'arjun@example.com' }, address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' }, currentDiagnosis: 'Hypertension', status: 'active', assignedDoctor: doc1.id, createdBy: admin.id, medicalHistory: [{ diagnosis: 'Hypertension Stage 2', treatment: 'Medication', prescription: 'Amlodipine 5mg', doctor: doc1.id, doctorName: doc1.name }] },
      { patientId: 'PAT-00002', name: 'Meera Krishnan', age: 32, gender: 'female', bloodGroup: 'B+', contact: { phone: '+91-9000000003' }, address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' }, currentDiagnosis: 'Migraine', status: 'stable', assignedDoctor: doc2.id, createdBy: admin.id },
      { patientId: 'PAT-00003', name: 'Suresh Babu', age: 60, gender: 'male', bloodGroup: 'A+', contact: { phone: '+91-9000000005' }, address: { city: 'Bengaluru', state: 'Karnataka', country: 'India' }, currentDiagnosis: 'Diabetes Type 2', status: 'critical', assignedDoctor: doc1.id, createdBy: admin.id },
    ]);

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('Inserting demo appointments...');
    await Appointment.insertMany([
      { appointmentId: 'APT-00001', patient: patients[0].id, patientName: patients[0].name, doctor: doc1.id, doctorName: doc1.name, date: today.toISOString(), timeSlot: { start: '09:00', end: '09:30' }, type: 'follow-up', reason: 'BP check', status: 'confirmed', createdBy: admin.id },
      { appointmentId: 'APT-00002', patient: patients[1].id, patientName: patients[1].name, doctor: doc2.id, doctorName: doc2.name, date: today.toISOString(), timeSlot: { start: '10:00', end: '10:30' }, type: 'consultation', reason: 'Headache', status: 'pending', createdBy: admin.id },
      { appointmentId: 'APT-00003', patient: patients[2].id, patientName: patients[2].name, doctor: doc1.id, doctorName: doc1.name, date: tomorrow.toISOString(), timeSlot: { start: '11:00', end: '11:30' }, type: 'routine-checkup', status: 'pending', createdBy: admin.id },
    ]);

    console.log('\n🎉 Seeded Supabase successfully!\n');
    console.log('Demo credentials (password: Admin@1234):');
    console.log('  admin@hms.com | doctor1@hms.com | nurse1@hms.com | staff1@hms.com\n');
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
};

const seedPharmacy = async () => {
  try {
    const connected = await testConnection();
    if (!connected) process.exit(1);

    await Medicine.deleteMany({});
    await Medicine.insertMany([
      { name: 'Paracetamol', genericName: 'Acetaminophen', brand: 'Calpol', category: 'tablet', strength: '500mg', unit: 'tablet', currentStock: 500, reorderLevel: 50, maxStock: 2000, costPrice: 0.5, sellingPrice: 1, gstRate: 12, location: 'A-1', storageInstructions: 'Store below 25°C' },
      { name: 'Amoxicillin', genericName: 'Amoxicillin Trihydrate', brand: 'Mox', category: 'capsule', strength: '250mg', unit: 'capsule', currentStock: 200, reorderLevel: 30, costPrice: 2, sellingPrice: 4, gstRate: 12, requiresPrescription: true, location: 'B-2' },
      { name: 'Amlodipine', genericName: 'Amlodipine Besylate', brand: 'Amlip', category: 'tablet', strength: '5mg', unit: 'tablet', currentStock: 8, reorderLevel: 20, costPrice: 1.5, sellingPrice: 3, gstRate: 12, requiresPrescription: true, location: 'C-1' },
      { name: 'Metformin', genericName: 'Metformin HCl', brand: 'Glycomet', category: 'tablet', strength: '500mg', unit: 'tablet', currentStock: 0, reorderLevel: 50, costPrice: 0.8, sellingPrice: 1.5, gstRate: 12, requiresPrescription: true, location: 'C-3' },
      { name: 'Azithromycin', genericName: 'Azithromycin', brand: 'Azithral', category: 'tablet', strength: '500mg', unit: 'tablet', currentStock: 150, reorderLevel: 25, costPrice: 8, sellingPrice: 15, gstRate: 12, requiresPrescription: true, location: 'B-5' },
      { name: 'ORS Sachets', genericName: 'Oral Rehydration Salts', brand: 'Electral', category: 'powder', strength: 'per sachet', unit: 'sachet', currentStock: 300, reorderLevel: 50, costPrice: 5, sellingPrice: 10, gstRate: 5, location: 'D-1' },
      { name: 'Cetirizine', genericName: 'Cetirizine HCl', brand: 'Cetrizet', category: 'tablet', strength: '10mg', unit: 'tablet', currentStock: 22, reorderLevel: 30, costPrice: 0.6, sellingPrice: 1.2, gstRate: 12, location: 'A-4' },
      { name: 'Pantoprazole', genericName: 'Pantoprazole Sodium', brand: 'Pan', category: 'tablet', strength: '40mg', unit: 'tablet', currentStock: 180, reorderLevel: 40, costPrice: 1.2, sellingPrice: 2.5, gstRate: 12, requiresPrescription: true, location: 'A-6' },
    ]);
    console.log('✓ Seeded 8 demo medicines in Supabase');
    process.exit(0);
  } catch (err) {
    console.error('Pharmacy seed failed:', err.message);
    process.exit(1);
  }
};

if (process.argv.includes('--pharmacy')) {
  seedPharmacy();
} else {
  seed();
}
