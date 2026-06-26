// src/investigator.js
// Core evidence reasoning engine
// Handles: amount matching, time matching, established-recipient pattern,
// duplicate detection, ambiguous multi-match, phishing detection, Bangla keywords

// ============================================================
// Bengali digit mapping for extracting numbers from Bangla text
// ============================================================
const BANGLA_DIGIT_MAP = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
  '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9'
};

function normalizeBanglaDigits(text) {
  return text.replace(/[০-৯]/g, ch => BANGLA_DIGIT_MAP[ch] || ch);
}

// ============================================================
// Keywords for complaint classification (en + bn + banglish)
// ============================================================
const CASE_KEYWORDS = {
  phishing_or_social_engineering: [
    // English
    'otp', 'pin', 'password', 'verification code', 'security code', 'account will be blocked',
    'someone called', 'received a call', 'suspicious call', 'phishing', 'scam', 'fraud call',
    'asking for my', 'asked for my',
    // Bangla / Banglish
    'ওটিপি', 'পিন', 'পাসওয়ার্ড', 'ব্লক', 'কল করেছে', 'ভেরিফিকেশন'
  ],
  agent_cash_in_issue: [
    'cash in', 'cash-in', 'cashin', 'এজেন্ট', 'ক্যাশ ইন', 'cash deposit',
    'agent cash', 'cash_in', 'cash in agent', 'agent sent', 'agent balance'
  ],
  merchant_settlement_delay: [
    'settlement', 'not settled', 'pending settlement', 'my settlement',
    'settlement delay', 'settlement not received', 'sales settlement',
    'MERCHANT-SELF', 'settlement usually', 'settlement batch'
  ],
  duplicate_payment: [
    'twice', 'double', 'duplicate', 'charged twice', 'deducted twice', 'two times',
    'paid twice', 'two payments', 'two times', 'দুইবার', 'দুইটা', 'দুবার'
  ],
  payment_failed: [
    'failed', 'did not go through', 'unsuccessful', 'error', 'app showed failed',
    'transaction failed', 'payment failed', 'balance was deducted', 'deducted but failed',
    'ব্যর্থ', 'হয়নি', 'কাটা গেছে'
  ],
  wrong_transfer: [
    'wrong number', 'wrong person', 'wrong recipient',
    'typed it wrong', 'wrong account', 'wrong mobile',
    'accidentally sent', 'sent to wrong', 'by mistake',
    'sent money to wrong', 'sent taka to wrong', 'wrong bkash', 'wrong nagad',
    'mistakenly sent', 'sent to a wrong', 'didn\'t get it', 'did not get it', 'not received', 'didn\'t receive',
    'ভুল নম্বর', 'ভুলে পাঠিয়েছি', 'ভুল ব্যক্তি', 'ভুলক্রমে পাঠিয়েছি'
  ],
  refund_request: [
    'refund', 'money back', 'return my money', 'get my money back', 'cancel',
    'changed my mind', 'dont want', "don't want", 'return', 'ফেরত', 'রিফান্ড'
  ]
};

// ============================================================
// Extract amounts from text (supports English + Bengali digits)
// ============================================================
function extractAmounts(text) {
  const normalized = normalizeBanglaDigits(text);
  // Match standalone numbers (not part of transaction IDs like TXN-9101)
  const matches = normalized.match(/(?<!\w)\d+(?:\.\d+)?(?!\w|\-)/g);
  if (!matches) return [];
  return [...new Set(matches.map(Number).filter(n => n > 0 && n < 10000000))];
}

// ============================================================
// Detect if complaint mentions "yesterday" or "today"
// ============================================================
function extractDayReference(text) {
  const lower = text.toLowerCase();
  if (lower.includes('yesterday') || lower.includes('গতকাল') || lower.includes('আগের দিন')) {
    return 'yesterday';
  }
  if (lower.includes('today') || lower.includes('আজ') || lower.includes('এখন')) {
    return 'today';
  }
  return null;
}

// ============================================================
// Classify complaint into a case type
// Order matters — more specific checks first
// ============================================================
function classifyComplaintType(complaint) {
  const lower = complaint.toLowerCase();
  const normalized = normalizeBanglaDigits(lower);

  for (const [caseType, keywords] of Object.entries(CASE_KEYWORDS)) {
    if (keywords.some(kw => normalized.includes(kw.toLowerCase()))) {
      return caseType;
    }
  }
  return 'other';
}

// ============================================================
// Score a transaction against the complaint
// Returns { transaction, score, reasons }
// ============================================================
function scoreTransaction(txn, complaint, amounts, dayRef) {
  let score = 0;
  const reasons = [];
  const txnTime = new Date(txn.timestamp);
  const now = new Date();

  // Amount match (highest weight)
  const exactAmountMatch = amounts.some(a => a === txn.amount);
  const fuzzyAmountMatch = amounts.some(a => Math.abs(a - txn.amount) / Math.max(a, txn.amount) <= 0.10);

  if (exactAmountMatch) {
    score += 50;
    reasons.push('exact_amount_match');
  } else if (fuzzyAmountMatch) {
    score += 25;
    reasons.push('fuzzy_amount_match');
  }

  // Day reference match
  if (dayRef === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
      txnTime.getDate() === yesterday.getDate() &&
      txnTime.getMonth() === yesterday.getMonth() &&
      txnTime.getFullYear() === yesterday.getFullYear()
    ) {
      score += 20;
      reasons.push('day_match_yesterday');
    }
  } else if (dayRef === 'today') {
    if (
      txnTime.getDate() === now.getDate() &&
      txnTime.getMonth() === now.getMonth() &&
      txnTime.getFullYear() === now.getFullYear()
    ) {
      score += 20;
      reasons.push('day_match_today');
    }
  }

  // Type-based bonus
  const lower = complaint.toLowerCase();
  if ((lower.includes('cash') || lower.includes('ক্যাশ')) && txn.type === 'cash_in') {
    score += 15;
    reasons.push('type_match_cash_in');
  }
  if ((lower.includes('settlement') || lower.includes('সেটেলমেন্ট')) && txn.type === 'settlement') {
    score += 15;
    reasons.push('type_match_settlement');
  }
  if ((lower.includes('transfer') || lower.includes('sent') || lower.includes('পাঠিয়েছি')) && txn.type === 'transfer') {
    score += 10;
    reasons.push('type_match_transfer');
  }
  if ((lower.includes('payment') || lower.includes('paid') || lower.includes('bill')) && txn.type === 'payment') {
    score += 10;
    reasons.push('type_match_payment');
  }

  // Counterparty mention in complaint
  if (txn.counterparty && lower.includes(txn.counterparty.toLowerCase().replace('+880', '0'))) {
    score += 30;
    reasons.push('counterparty_mentioned');
  }

  return { transaction: txn, score, reasons };
}

// ============================================================
// Count how many times a counterparty appears in transfers
// Used to detect the "established recipient" pattern
// ============================================================
function getRecipientTransferCount(counterparty, transactions) {
  return transactions.filter(
    t => t.counterparty === counterparty && t.type === 'transfer'
  ).length;
}

// ============================================================
// Find suspected duplicate transactions
// Two payments: same amount + same counterparty + ≤60s apart
// ============================================================
function findDuplicatePair(transactions) {
  const payments = transactions.filter(t => t.type === 'payment' || t.type === 'transfer');
  for (let i = 0; i < payments.length; i++) {
    for (let j = i + 1; j < payments.length; j++) {
      const a = payments[i];
      const b = payments[j];
      if (
        a.amount === b.amount &&
        a.counterparty === b.counterparty &&
        a.type === b.type
      ) {
        const timeDiff = Math.abs(
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        if (timeDiff <= 120000) { // within 120 seconds
          // Return the later one as the "duplicate"
          const duplicate = new Date(a.timestamp) > new Date(b.timestamp) ? a : b;
          const original = duplicate === a ? b : a;
          return { duplicate, original };
        }
      }
    }
  }
  return null;
}

// ============================================================
// Main investigation function
// Returns all investigation results consumed by server.js
// ============================================================
function investigate(ticket, externalCaseType = null) {
  const {
    ticket_id,
    complaint,
    transaction_history = [],
    user_type = 'unknown',
    language = 'en'
  } = ticket;

  // Step 1: Classify the complaint (use LLM external case type if provided, otherwise fallback to Regex)
  const caseType = externalCaseType || classifyComplaintType(complaint);

  // Step 2: Extract entities from complaint
  const amounts = extractAmounts(complaint);
  const dayRef = extractDayReference(complaint);

  // Step 3: Early return for phishing — no transaction needed
  if (caseType === 'phishing_or_social_engineering') {
    return {
      caseType,
      relevantTransactionId: null,
      evidenceVerdict: 'insufficient_data',
      matchedTxn: null,
      isAmbiguous: false,
      allMatches: [],
      userType: user_type,
      language,
      complaint,
      reasonCodes: ['phishing', 'credential_protection', 'critical_escalation'],
      confidence: 0.95
    };
  }

  // Step 4: Early return for vague complaints with no amounts
  if (amounts.length === 0 && caseType === 'other') {
    return {
      caseType: 'other',
      relevantTransactionId: null,
      evidenceVerdict: 'insufficient_data',
      matchedTxn: null,
      isAmbiguous: false,
      allMatches: [],
      userType: user_type,
      language,
      complaint,
      reasonCodes: ['vague_complaint', 'needs_clarification'],
      confidence: 0.6
    };
  }

  // Step 5: Check for duplicate payment first (special case)
  if (caseType === 'duplicate_payment') {
    const dupResult = findDuplicatePair(transaction_history);
    if (dupResult) {
      return {
        caseType: 'duplicate_payment',
        relevantTransactionId: dupResult.duplicate.transaction_id,
        evidenceVerdict: 'consistent',
        matchedTxn: dupResult.duplicate,
        isAmbiguous: false,
        allMatches: [dupResult.duplicate, dupResult.original],
        userType: user_type,
        language,
        complaint,
        reasonCodes: ['duplicate_payment', 'biller_verification_required'],
        confidence: 0.93
      };
    }
  }

  // Step 6: Score all transactions and find best match(es)
  if (transaction_history.length === 0) {
    return {
      caseType,
      relevantTransactionId: null,
      evidenceVerdict: 'insufficient_data',
      matchedTxn: null,
      isAmbiguous: false,
      allMatches: [],
      userType: user_type,
      language,
      complaint,
      reasonCodes: ['no_transaction_history'],
      confidence: 0.5
    };
  }

  const scored = transaction_history
    .map(txn => scoreTransaction(txn, complaint, amounts, dayRef))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  // Step 7: Handle ambiguous multiple matches
  const topScore = scored.length > 0 ? scored[0].score : 0;
  const topMatches = scored.filter(r => r.score >= topScore - 10 && r.score > 0);

  // Multiple equally-good matches that differ in counterparty → ambiguous
  const distinctCounterparties = new Set(topMatches.map(r => r.transaction.counterparty));
  const isAmbiguous = topMatches.length > 1 && distinctCounterparties.size > 1;

  if (isAmbiguous) {
    return {
      caseType,
      relevantTransactionId: null,
      evidenceVerdict: 'insufficient_data',
      matchedTxn: null,
      isAmbiguous: true,
      allMatches: topMatches.map(r => r.transaction),
      userType: user_type,
      language,
      complaint,
      reasonCodes: ['ambiguous_match', 'needs_clarification'],
      confidence: 0.65
    };
  }

  const bestMatch = scored.length > 0 ? scored[0] : null;
  const matchedTxn = bestMatch ? bestMatch.transaction : null;

  // Step 8: Determine evidence verdict for matched transaction
  let evidenceVerdict = 'insufficient_data';
  let reasonCodes = [];
  let confidence = 0.7;

  if (!matchedTxn) {
    evidenceVerdict = 'insufficient_data';
    reasonCodes = ['no_transaction_match'];
    confidence = 0.5;
  } else if (caseType === 'wrong_transfer') {
    // Check for established recipient pattern
    const transferCount = getRecipientTransferCount(matchedTxn.counterparty, transaction_history);
    if (transferCount >= 2) {
      // 2+ transfers to same counterparty strongly contradicts "wrong transfer"
      evidenceVerdict = 'inconsistent';
      reasonCodes = ['wrong_transfer_claim', 'established_recipient_pattern', 'evidence_inconsistent'];
      confidence = 0.75;
    } else {
      // Amount matches, one-off transfer — consistent with wrong transfer claim
      evidenceVerdict = 'consistent';
      reasonCodes = ['wrong_transfer', 'transaction_match', 'dispute_initiated'];
      confidence = 0.9;
    }
  } else if (caseType === 'agent_cash_in_issue') {
    // Pending cash-in + complaint about non-receipt = consistent
    if (matchedTxn.type === 'cash_in' && matchedTxn.status === 'pending') {
      evidenceVerdict = 'consistent';
      reasonCodes = ['agent_cash_in', 'pending_transaction', 'agent_ops'];
      confidence = 0.88;
    } else if (matchedTxn.type === 'cash_in') {
      evidenceVerdict = 'consistent';
      reasonCodes = ['agent_cash_in', 'transaction_match'];
      confidence = 0.8;
    } else {
      evidenceVerdict = 'insufficient_data';
      reasonCodes = ['no_cash_in_found'];
      confidence = 0.5;
    }
  } else if (caseType === 'payment_failed') {
    if (matchedTxn.status === 'failed') {
      evidenceVerdict = 'consistent';
      reasonCodes = ['payment_failed', 'potential_balance_deduction'];
      confidence = 0.9;
    } else if (matchedTxn.status === 'completed') {
      evidenceVerdict = 'inconsistent'; // payment shows completed, customer claims failed
      reasonCodes = ['payment_completed_not_failed', 'needs_verification'];
      confidence = 0.7;
    } else {
      evidenceVerdict = 'consistent';
      reasonCodes = ['payment_pending', 'possible_failure'];
      confidence = 0.75;
    }
  } else if (caseType === 'merchant_settlement_delay') {
    if (matchedTxn.type === 'settlement' && matchedTxn.status === 'pending') {
      evidenceVerdict = 'consistent';
      reasonCodes = ['merchant_settlement', 'delay', 'pending'];
      confidence = 0.92;
    } else if (matchedTxn.type === 'settlement') {
      evidenceVerdict = 'consistent';
      reasonCodes = ['merchant_settlement', 'transaction_match'];
      confidence = 0.85;
    } else {
      evidenceVerdict = 'consistent'; // amount match is enough
      reasonCodes = ['merchant_settlement', 'amount_match'];
      confidence = 0.75;
    }
  } else if (caseType === 'refund_request') {
    evidenceVerdict = 'consistent';
    reasonCodes = ['refund_request', 'merchant_policy_dependent'];
    confidence = 0.85;
  } else {
    evidenceVerdict = 'consistent';
    reasonCodes = [caseType, 'transaction_match'];
    confidence = 0.8;
  }

  return {
    caseType,
    relevantTransactionId: matchedTxn ? matchedTxn.transaction_id : null,
    evidenceVerdict,
    matchedTxn,
    isAmbiguous: false,
    allMatches: scored.map(r => r.transaction),
    userType: user_type,
    language,
    complaint,
    reasonCodes,
    confidence
  };
}

module.exports = {
  investigate,
  extractAmounts,
  classifyComplaintType,
  getRecipientTransferCount,
  findDuplicatePair,
  normalizeBanglaDigits
};
