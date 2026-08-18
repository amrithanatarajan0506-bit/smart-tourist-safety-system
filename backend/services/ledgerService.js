const crypto = require('crypto');
const LedgerRecord = require('../models/LedgerRecord');

/**
 * ledgerService - TAMPER-EVIDENT LEDGER PROTOTYPE (Feature 13, Option B)
 *
 * This is a cryptographic hash-chain, not a real blockchain network.
 * hash_n = SHA256( previousHash + JSON.stringify(canonicalPayload) )
 * Any edit to a stored payload (even in the DB directly) changes what its
 * hash *should* be, so verifyChain() can detect tampering.
 */

const GENESIS_HASH = '0'.repeat(64);

function canonicalize(payload) {
  // Stable key ordering so the same logical payload always hashes the same way
  return JSON.stringify(payload, Object.keys(payload).sort());
}

function computeHash(previousHash, payload) {
  return crypto
    .createHash('sha256')
    .update(previousHash + canonicalize(payload))
    .digest('hex');
}

async function appendRecord(recordType, refId, payload) {
  // Serialize appends to avoid two concurrent writers racing on `sequence`
  const last = await LedgerRecord.findOne().sort({ sequence: -1 });
  const previousHash = last ? last.hash : GENESIS_HASH;
  const sequence = last ? last.sequence + 1 : 0;
  const hash = computeHash(previousHash, payload);

  try {
    const record = await LedgerRecord.create({
      sequence,
      recordType,
      refId,
      payload,
      previousHash,
      hash,
    });
    return record;
  } catch (err) {
    // Duplicate sequence race - retry once
    if (err.code === 11000) {
      return appendRecord(recordType, refId, payload);
    }
    throw err;
  }
}

/** Verifies the entire chain (or the chain up to `limit` records) is intact. */
async function verifyChain(limit = 0) {
  const query = LedgerRecord.find().sort({ sequence: 1 });
  const records = limit ? await query.limit(limit) : await query;

  let expectedPrev = GENESIS_HASH;
  const breaks = [];

  for (const record of records) {
    if (record.previousHash !== expectedPrev) {
      breaks.push({ sequence: record.sequence, reason: 'PREVIOUS_HASH_MISMATCH' });
    }
    const recomputed = computeHash(record.previousHash, record.payload);
    if (recomputed !== record.hash) {
      breaks.push({ sequence: record.sequence, reason: 'PAYLOAD_TAMPERED' });
    }
    expectedPrev = record.hash;
  }

  return {
    valid: breaks.length === 0,
    recordsChecked: records.length,
    breaks,
    verifiedAt: new Date().toISOString(),
  };
}

module.exports = { appendRecord, verifyChain, computeHash, GENESIS_HASH };
