const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name']
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  phone: {
    type: String,
    required: [true, 'Please add a phone number']
  },
  role: {
    type: String,
    enum: ['tourist', 'admin', 'authority'],
    default: 'tourist'
  },
  digitalId: {
    type: String,
    unique: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  emergencyContacts: [{
    name: String,
    phone: String,
    relation: String
  }],
  lastLocation: {
    type: {
      type: String,
      enum: ['Point']
    },
    coordinates: {
      type: [Number],
      index: '2dsphere'
    },
    timestamp: Date
  },
  // ---- Automatic Tourist Safety Profile (Module 1) ----
  // Initialized automatically on registration (see pre('save') hook below) -
  // no administrator action required. Kept in sync on every location update
  // by services/decisionEngine.js so it always reflects current system state.
  safety: {
    status: {
      type: String,
      enum: ['SAFE', 'ATTENTION_REQUIRED', 'CRITICAL'],
      default: 'SAFE'
    },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'LOW' },
    monitoringStatus: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'INACTIVE' },
    locationStatus: { type: String, enum: ['LIVE', 'LAST_KNOWN', 'OFFLINE', 'UNKNOWN'], default: 'UNKNOWN' },
    batteryPercent: { type: Number, default: null },
    tripStatus: { type: String, enum: ['NONE', 'ACTIVE', 'COMPLETED'], default: 'NONE' },
    contributingFactors: { type: [String], default: [] },
    recommendedAction: { type: String, default: 'Continue automated monitoring.' },
    lastUpdatedAt: { type: Date, default: Date.now }
  }
}, {
  timestamps: true
});

// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  
  // Generate Digital ID if not present
  if (!this.digitalId) {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    this.digitalId = `${this.role.charAt(0).toUpperCase()}ID${timestamp}${random}`;
  }
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Backwards compatibility method for routes using comparePassword
UserSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
