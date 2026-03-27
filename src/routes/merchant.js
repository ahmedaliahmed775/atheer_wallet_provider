// src/routes/merchant.js
// Re-refactored to be compliant with PAYAG.ECOMMCASHOUT specification.
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { sequelize, User, Wallet, Transaction, Voucher } from '../models/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'atheer_dev_secret_not_for_production';

// Rate limiter for the cashout endpoint
const chargeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, 
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'REJECTED',
    message: 'Too many cashout requests from this IP, please try again after 15 minutes.'
  },
});

const router = express.Router();
router.use(chargeLimiter);

/**
 * @route   POST /api/v1/merchant/switch-charge
 * @desc    Processes e-commerce cashout, compliant with PAYAG.ECOMMCASHOUT spec.
 * @access  Public (authenticated by accessToken and password in body)
 */
router.post('/switch-charge', async (req, res) => {
  // 1. Destructure and validate request parameters from the flat body
  const { agentWallet, voucher, receiverMobile, password, accessToken, refId, purpose } = req.body;

  if (!agentWallet || !voucher || !receiverMobile || !password || !accessToken || !refId) {
    return res.status(400).json({
      status: 'REJECTED',
      message: 'Missing required parameters: agentWallet, voucher, receiverMobile, password, accessToken, refId are all mandatory.'
    });
  }

  // 2. Authenticate the agent making the request
  let decoded;
  try {
    decoded = jwt.verify(accessToken, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ status: 'REJECTED', message: 'Invalid or expired accessToken.' });
  }

  // The user associated with the accessToken should be the one whose password we check
  const agentUser = await User.findByPk(decoded.phone);
  if (!agentUser) {
    return res.status(404).json({ status: 'REJECTED', message: 'Agent user not found.' });
  }

  const isPasswordValid = await bcrypt.compare(password, agentUser.password);
  if (!isPasswordValid) {
    return res.status(401).json({ status: 'REJECTED', message: 'Incorrect agent password.' });
  }
  
  // The agent making the call must be the one specified in agentWallet
  if (agentUser.phone !== agentWallet) {
      return res.status(403).json({ status: 'REJECTED', message: 'Authentication credentials do not match agentWallet.' });
  }


  // 3. Validate the voucher
  const voucherObj = await Voucher.findOne({ 
    where: { 
      voucherCode: voucher, 
      status: 'ACTIVE', 
      expiresAt: { [sequelize.Op.gt]: new Date() } 
    } 
  });

  if (!voucherObj) {
    return res.status(404).json({ status: 'REJECTED', message: 'Voucher is invalid, expired, or already used.' });
  }

  // 4. Start DB transaction
  const dbTransaction = await sequelize.transaction();

  try {
    // Lock the merchant's wallet for updating
    const merchantWallet = await Wallet.findByPk(agentWallet, { transaction: dbTransaction, lock: dbTransaction.LOCK.UPDATE });
    if (!merchantWallet) {
      await dbTransaction.rollback();
      return res.status(404).json({ status: 'REJECTED', message: 'Merchant wallet not found.' });
    }

    const transactionAmount = parseFloat(voucherObj.amount);
    const newBalance = parseFloat(merchantWallet.balance) + transactionAmount;

    // Credit the merchant's wallet
    await merchantWallet.update({ balance: newBalance }, { transaction: dbTransaction });

    // Mark voucher as consumed
    await voucherObj.update({ status: 'CONSUMED' }, { transaction: dbTransaction });

    // Create a transaction record for auditing
    const newTransaction = await Transaction.create({
      sender: voucherObj.customerPhone, // The customer who created the voucher
      receiver: agentWallet,
      amount: transactionAmount,
      transactionType: 'VOUCHER_CASHOUT',
      status: 'ACCEPTED',
      refId: refId, // Store the agent's reference ID
    }, { transaction: dbTransaction });

    // Commit the transaction
    await dbTransaction.commit();

    // 5. Return the response compliant with PAYAG.ECOMMCASHOUT spec
    return res.status(200).json({
      amount: transactionAmount,
      balance: newBalance,
      IssuerRef: newTransaction.id, // Our system's transaction reference
      refId: refId, // The agent's provided reference ID
      userId: agentWallet, // As per spec, "user id from 3rd party system"
      trxDate: newTransaction.createdAt, // Timestamp from the created transaction
      status: 'ACCEPTED'
    });

  } catch (error) {
    if (dbTransaction) await dbTransaction.rollback();
    console.error('Error during e-commerce cashout:', error);
    return res.status(500).json({
      status: 'REJECTED',
      message: 'An internal server error occurred during the transaction.'
    });
  }
});


/**
 * @route   POST /api/v1/merchant/inquiry
 * @desc    Inquires about an e-commerce transaction, compliant with PAYAG.ECOMMERCEINQUIRY spec.
 * @access  Public (authenticated by accessToken and password in body)
 */
router.post('/inquiry', async (req, res) => {
  // 1. Destructure and validate request parameters
  const { agentWallet, password, accessToken, refId } = req.body;

  if (!agentWallet || !password || !accessToken || !refId) {
    return res.status(400).json({
      state: 'REJECTED',
      message: 'Missing required parameters: agentWallet, password, accessToken, refId are all mandatory.'
    });
  }

  // 2. Authenticate the agent making the request (similar to cashout)
  let decoded;
  try {
    decoded = jwt.verify(accessToken, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ state: 'REJECTED', message: 'Invalid or expired accessToken.' });
  }

  const agentUser = await User.findByPk(decoded.phone);
  if (!agentUser) {
    return res.status(404).json({ state: 'REJECTED', message: 'Agent user not found.' });
  }

  const isPasswordValid = await bcrypt.compare(password, agentUser.password);
  if (!isPasswordValid) {
    return res.status(401).json({ state: 'REJECTED', message: 'Incorrect agent password.' });
  }
  
  if (agentUser.phone !== agentWallet) {
      return res.status(403).json({ state: 'REJECTED', message: 'Authentication credentials do not match agentWallet.' });
  }

  // 3. Find the transaction by the agent's reference ID
  const transaction = await Transaction.findOne({ where: { refId: refId, receiver: agentWallet } });

  if (!transaction) {
    return res.status(404).json({ state: 'REJECTED', message: 'Transaction with the given refId not found for this agent.' });
  }

  // 4. Return the response compliant with PAYAG.ECOMMERCEINQUIRY spec
  return res.status(200).json({
    issuerTrxRef: transaction.id,
    txnamount: parseFloat(transaction.amount),
    receiverMobile: transaction.receiver,
    senderMobile: transaction.sender,
    updateTime: transaction.updatedAt,
    state: transaction.status,
    trxDate: transaction.createdAt
  });
});

export default router;
