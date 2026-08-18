const express = require('express');
const { authorityOnly } = require('../middleware/auth');
const ledgerService = require('../services/ledgerService');

const router = express.Router();

// @route  GET /api/ledger/verify
// @desc   Feature 13: verify the tamper-evident hash-chain ledger prototype
// @access Private (authority)
router.get('/verify', authorityOnly, async (req, res) => {
  const result = await ledgerService.verifyChain(Number(req.query.limit) || 0);
  res.json({ success: true, ledgerType: 'TAMPER_EVIDENT_LEDGER_PROTOTYPE', ...result });
});

module.exports = router;
