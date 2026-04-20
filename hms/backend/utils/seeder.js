require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital_db');
  console.log('MongoDB connected for seeding');
};

const seedUsers = async () => {
  await User.deleteMany({});
  const password = await bcrypt.hash('Admin@1234', 12);

  const users = await User.insertMany([
    { name: 'Dr. Admin Kumar', email: 'admin@hms.com', password, role: 'admin', department: 'Administration', phone: '+91-9876543210', isActive: true },
    { name: 'Dr. Priya Sharma', email: 'doctor1@hms.com', password, role: 'doctor', department: 'Cardiology', specialization: 'Cardiologist', phone: '+91-9876543211', isActive: true },
    { name: 'Dr. Rahul Mehta', email: 'doctor2@hms.com', password, role: 'doctor', department: 'Neurology', specialization: 'Neurologist', phone: '+91-9876543212', isActive: true },
    { name: 'Dr. Anita Patel', email: 'doctor3@hms.com', password, role: 'doctor', department: 'Orthopedics', specialization: 'Orthopedic Surgeon', phone: '+91-9876543213', isActive: true },
    { name: 'Nurse Kavya Nair', email: 'nurse1@hms.com', password, role: 'nurse', department: 'Cardiology', phone: '+91-9876543214', isActive: true },
    { name: 'Staff Ravi Gupta', email: 'staff1@hms.com', password, role: 'staff', department: 'Reception', phone: '+91-9876543215', isActive: true },
  ]);

  console.log(`✓ Seeded ${users.length} users`);
  return users;
};

const seedPatients = async (users) => {
  await Patient.deleteMany({});
  const doctor1 = users.find(u => u.email === 'doctor1@hms.com');
  const doctor2 = users.find(u => u.email === 'doctor2@hms.com');
  const admin = users.find(u => u.role === 'admin');

  const patients = await Patient.insertMany([
    {
      patientId: 'PAT-00001',
      name: 'Arjun Singh', age: 45, gender: 'male', bloodGroup: 'O+',
      contact: { phone: '+91-9000000001', email: 'arjun@example.com', emergencyContact: 'Sunita Singh', emergencyPhone: '+91-9000000002' },
      address: { street: '12 MG Road', city: 'Bengaluru', state: 'Karnataka', zipCode: '560001' },
      currentDiagnosis: 'Hypertension', status: 'active',
      assignedDoctor: doctor1._id, createdBy: admin._id,
      medicalHistory: [{ diagnosis: 'Hypertension Stage 2', treatment: 'Medication', prescription: 'Amlodipine 5mg', notes: 'Monitor BP weekly', doctor: doctor1._id, doctorName: doctor1.name }]
    },
    {
      patientId: 'PAT-00002',
      name: 'Meera Krishnan', age: 32, gender: 'female', bloodGroup: 'B+',
      contact: { phone: '+91-9000000003', email: 'meera@example.com' },
      address: { street: '45 Koramangala', city: 'Bengaluru', state: 'Karnataka', zipCode: '560034' },
      currentDiagnosis: 'Migraine', status: 'stable',
      assignedDoctor: doctor2._id, createdBy: admin._id,
      medicalHistory: [{ diagnosis: 'Chronic Migraine', treatment: 'Preventive therapy', prescription: 'Topiramate 25mg', doctor: doctor2._id, doctorName: doctor2.name }]
    },
    {
      patientId: 'PAT-00003',
      name: 'Suresh Babu', age: 60, gender: 'male', bloodGroup: 'A+',
      contact: { phone: '+91-9000000005' },
      address: { street: '7 Indiranagar', city: 'Bengaluru', state: 'Karnataka', zipCode: '560038' },
      currentDiagnosis: 'Diabetes Type 2', status: 'critical',
      assignedDoctor: doctor1._id, createdBy: admin._id,
    },
    {
      patientId: 'PAT-00004',
      name: 'Lakshmi Devi', age: 28, gender: 'female', bloodGroup: 'AB+',
      contact: { phone: '+91-9000000007' },
      address: { city: 'Mysuru', state: 'Karnataka' },
      currentDiagnosis: 'Fracture - Left Arm', status: 'under-observation',
      assignedDoctor: users.find(u => u.email === 'doctor3@hms.com')._id, createdBy: admin._id,
    },
    {
      patientId: 'PAT-00005',
      name: 'Venkat Rao', age: 52, gender: 'male', bloodGroup: 'O-',
      contact: { phone: '+91-9000000009' },
      address: { city: 'Bengaluru', state: 'Karnataka' },
      currentDiagnosis: 'Post-op Cardiac Surgery', status: 'discharged',
      assignedDoctor: doctor1._id, createdBy: admin._id,
      dischargeDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    }
  ]);

  console.log(`✓ Seeded ${patients.length} patients`);
  return patients;
};

const seedAppointments = async (users, patients) => {
  await Appointment.deleteMany({});
  const doctor1 = users.find(u => u.email === 'doctor1@hms.com');
  const doctor2 = users.find(u => u.email === 'doctor2@hms.com');
  const admin = users.find(u => u.role === 'admin');

  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  await Appointment.insertMany([
    {
      appointmentId: 'APT-00001',
      patient: patients[0]._id, patientName: patients[0].name,
      doctor: doctor1._id, doctorName: doctor1.name,
      date: today, timeSlot: { start: '09:00', end: '09:30' },
      type: 'follow-up', reason: 'BP check', status: 'confirmed', createdBy: admin._id
    },
    {
      appointmentId: 'APT-00002',
      patient: patients[1]._id, patientName: patients[1].name,
      doctor: doctor2._id, doctorName: doctor2.name,
      date: today, timeSlot: { start: '10:00', end: '10:30' },
      type: 'consultation', reason: 'Headache recurring', status: 'pending', createdBy: admin._id
    },
    {
      appointmentId: 'APT-00003',
      patient: patients[2]._id, patientName: patients[2].name,
      doctor: doctor1._id, doctorName: doctor1.name,
      date: tomorrow, timeSlot: { start: '11:00', end: '11:30' },
      type: 'routine-checkup', reason: 'Diabetes management', status: 'pending', createdBy: admin._id
    },
    {
      appointmentId: 'APT-00004',
      patient: patients[0]._id, patientName: patients[0].name,
      doctor: doctor1._id, doctorName: doctor1.name,
      date: yesterday, timeSlot: { start: '09:00', end: '09:30' },
      type: 'consultation', reason: 'Initial assessment', status: 'completed',
      diagnosis: 'Hypertension Stage 1', createdBy: admin._id
    },
  ]);

  console.log(`✓ Seeded 4 appointments`);
};

const seed = async () => {
  try {
    await connectDB();
    const users = await seedUsers();
    const patients = await seedPatients(users);
    await seedAppointments(users, patients);

    console.log('\n🎉 Database seeded successfully!');
    console.log('\nDemo credentials:');
    console.log('  Admin:  admin@hms.com    / Admin@1234');
    console.log('  Doctor: doctor1@hms.com  / Admin@1234');
    console.log('  Nurse:  nurse1@hms.com   / Admin@1234');
    console.log('  Staff:  staff1@hms.com   / Admin@1234');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
};

seed();
