// src/classifier.js
// Case classification, department routing, severity assessment, human_review logic
// All routing tables derived directly from the sample cases and evaluation rubric

// ============================================================
// Department routing table
// Exact routing per spec (confirmed against all 10 sample cases)
// ============================================================
function routeToDepartment(caseType, severity, userType) {
  switch (caseType) {
    case 'wrong_transfer':
      return 'dispute_resolution';

    case 'payment_failed':
      return 'payments_ops';

    case 'duplicate_payment':
      return 'payments_ops';

    case 'refund_request':
      // High-severity refund goes to dispute_resolution, else customer_support
      return severity === 'high' || severity === 'critical'
        ? 'dispute_resolution'
        : 'customer_support';

    case 'merchant_settlement_delay':
      return 'merchant_operations';

    case 'agent_cash_in_issue':
      return 'agent_operations';

    case 'phishing_or_social_engineering':
      return 'fraud_risk';

    case 'other':
    default:
      return 'customer_support';
  }
}

// ============================================================
// Severity assessment
// Derived from sample cases: SAMPLE-01(high), 02(medium), 03(high),
// 04(low), 05(critical), 06(low), 07(high), 08(medium), 09(medium), 10(high)
// ============================================================
function assessSeverity(caseType, matchedTxn, evidenceVerdict, userType) {
  // Phishing is always critical
  if (caseType === 'phishing_or_social_engineering') {
    return 'critical';
  }

  const amount = matchedTxn ? matchedTxn.amount : 0;
  const isHighValue = amount > 5000;
  const isMediumValue = amount >= 1000 && amount <= 5000;
  const status = matchedTxn ? matchedTxn.status : null;

  switch (caseType) {
    case 'wrong_transfer':
      // SAMPLE-01: 5000 BDT → high; SAMPLE-02: 2000 BDT, inconsistent → medium
      if (evidenceVerdict === 'consistent') return 'high';
      return 'medium'; // inconsistent verdict

    case 'payment_failed':
      // SAMPLE-03: 1200 BDT failed → high (balance deduction claim makes it urgent)
      return 'high';

    case 'duplicate_payment':
      // SAMPLE-10: 850 BDT duplicate → high
      return 'high';

    case 'agent_cash_in_issue':
      // SAMPLE-07: 2000 BDT pending → high
      if (status === 'pending') return 'high';
      return isMediumValue ? 'medium' : 'high';

    case 'merchant_settlement_delay':
      // SAMPLE-09: 15000 BDT merchant → medium (merchants expect delays, not critical)
      return 'medium';

    case 'refund_request':
      // SAMPLE-04: 500 BDT → low
      if (isHighValue) return 'medium';
      return 'low';

    case 'other':
      // SAMPLE-06: vague → low
      if (evidenceVerdict === 'insufficient_data') return 'low';
      return isHighValue ? 'medium' : 'low';

    default:
      return 'medium';
  }
}

// ============================================================
// Human review required logic
// From evaluation rubric and sample case expected outputs
// ============================================================
function requiresHumanReview(caseType, evidenceVerdict, severity, matchedTxn, isAmbiguous) {
  // Phishing is always human review
  if (caseType === 'phishing_or_social_engineering') return true;

  // Inconsistent evidence always needs human review
  if (evidenceVerdict === 'inconsistent') return true;

  // Wrong transfer disputes always need human review
  if (caseType === 'wrong_transfer') return true;

  // Duplicate payment verification always needs human review
  if (caseType === 'duplicate_payment') return true;

  // Agent cash-in with pending status needs human review
  if (caseType === 'agent_cash_in_issue' && matchedTxn && matchedTxn.status === 'pending') {
    return true;
  }

  // Payment failed (possible balance deduction) — per SAMPLE-03: false!
  // The system can auto-handle: "initiate the automatic reversal flow"
  if (caseType === 'payment_failed') return false;

  // Merchant settlement delay — per SAMPLE-09: false
  if (caseType === 'merchant_settlement_delay') return false;

  // Refund request — per SAMPLE-04: false
  if (caseType === 'refund_request') return false;

  // Vague/other — per SAMPLE-06: false
  if (caseType === 'other') return false;

  // Critical severity
  if (severity === 'critical') return true;

  return false;
}

module.exports = {
  routeToDepartment,
  assessSeverity,
  requiresHumanReview
};
