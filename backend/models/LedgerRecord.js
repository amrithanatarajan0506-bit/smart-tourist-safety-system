const mongoose = require('mongoose');

/**
 * LedgerRecord - "TAMPER-EVIDENT LEDGER PROTOTYPE"
 * FEATURE 13. This is NOT a blockchain / distributed ledger. It is a
 * cryptographic hash-chain stored in MongoDB: each record hashes its own
 * payload together with the previous record's hash, so any modification to
 * a past record breaks the chain and can be detected by verification.
 */
const LedgerRecordSchema = new mongoose.Schema({
  sequence: { type: Number, required: true, unique: true, index: true },
  recordType: {
    type: String,
    enum: ['DIGITAL_ID', 'TRIP', 'GEOFENCE_VIOLATION', 'SOS', 'INCIDENT_STATUS'],
    required: true,
  },
  refId: { type: mongoose.Schema.ObjectId, required: true }, // id of the referenced document
  payload: { type: mongoose.Schema.Types.Mixed, required: true }, // canonicalised snapshot that was hashed
  previousHash: { type: String, required: true },
  hash: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('LedgerRecord', LedgerRecordSchema);
