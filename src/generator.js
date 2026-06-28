// src/generator.js
// Safe response generator — agent summaries, next actions, customer replies
// All replies are pre-validated safe templates
// Language-matched: English (en), Bangla (bn), mixed

// ============================================================
// SAFE language fragments — used in ALL customer replies
// These are pre-approved safe closers
// ============================================================
const SAFE_CLOSER_EN = 'Please do not share your PIN or OTP with anyone.';
const SAFE_CLOSER_BN = 'অনুগ্রহ করে কারো সাথে আপনার পিন বা ওটিপি শেয়ার করবেন না।';
const SAFE_REFUND_PHRASE = 'any eligible amount will be returned through official channels';
const SAFE_REFUND_PHRASE_BN = 'যোগ্য পরিমাণ অফিসিয়াল চ্যানেলের মাধ্যমে ফেরত দেওয়া হবে';

// ============================================================
// Generate agent summary (1-2 sentences, factual, includes TXN ID)
// ============================================================
function generateAgentSummary(complaint, matchedTxn, caseType, evidenceVerdict, allMatches) {
  const txnId = matchedTxn ? matchedTxn.transaction_id : null;
  const amount = matchedTxn ? matchedTxn.amount : null;
  const counterparty = matchedTxn ? matchedTxn.counterparty : null;

  switch (caseType) {
    case 'wrong_transfer':
      if (!txnId) {
        return `Customer reports a wrong transfer but transaction history is ambiguous with ${allMatches.length} possible transactions. Further details needed.`;
      }
      if (evidenceVerdict === 'inconsistent') {
        return `Customer claims ${txnId} (${amount} BDT to ${counterparty}) was a wrong transfer, but transaction history shows multiple prior transfers to the same counterparty, suggesting an established recipient.`;
      }
      return `Customer reports sending ${amount} BDT via ${txnId} to ${counterparty}, which they now believe was the wrong recipient.`;

    case 'payment_failed':
      if (!txnId) return `Customer reports a payment failed with balance deduction. No matching transaction found.`;
      return `Customer attempted a ${amount} BDT payment (${txnId}) which failed, but reports balance was deducted. Requires payments operations investigation.`;

    case 'refund_request':
      if (!txnId) return `Customer requests a refund but no specific transaction identified.`;
      return `Customer requests refund of ${amount} BDT for ${txnId} (merchant payment) due to change of mind. Not a service failure.`;

    case 'duplicate_payment':
      if (!txnId) return `Customer reports a possible duplicate payment but could not identify specific transactions.`;
      return `Customer reports duplicate payment. Transaction ${txnId} for ${amount} BDT to ${counterparty} appears to be the duplicate based on identical timing.`;

    case 'merchant_settlement_delay':
      if (!txnId) return `Merchant reports a settlement delay but no matching settlement transaction found.`;
      return `Merchant reports ${amount ? amount + ' BDT' : ''} settlement ${txnId ? '(' + txnId + ')' : ''} is delayed beyond the standard settlement window. Settlement status is ${matchedTxn ? matchedTxn.status : 'unknown'}.`;

    case 'agent_cash_in_issue':
      if (!txnId) return `Customer reports agent cash-in not reflected in balance. No matching transaction found.`;
      return `Customer reports ${amount} BDT cash-in via ${counterparty} (${txnId}) not reflected in balance. Transaction status is ${matchedTxn.status}. Agent claims funds were sent.`;

    case 'phishing_or_social_engineering':
      return `Customer reports an unsolicited contact claiming to be from the company and asking for OTP or credentials. Customer has not shared credentials yet. Likely social engineering attempt.`;

    case 'other':
      if (!txnId) {
        return `Customer reports a vague concern without specifying transaction, amount, or issue. Insufficient detail to identify any relevant transaction.`;
      }
      return `Customer reports an unspecified issue with transaction ${txnId} for ${amount} BDT.`;

    default:
      return `Customer reports: ${complaint.substring(0, 150)}${complaint.length > 150 ? '...' : ''}`;
  }
}

// ============================================================
// Generate recommended next action (department-specific)
// ============================================================
function generateNextAction(caseType, department, matchedTxn, evidenceVerdict, isAmbiguous) {
  const txnId = matchedTxn ? matchedTxn.transaction_id : null;
  const amount = matchedTxn ? matchedTxn.amount : null;

  if (isAmbiguous || evidenceVerdict === 'insufficient_data' && !matchedTxn) {
    if (caseType === 'wrong_transfer' || caseType === 'other') {
      return 'Reply to customer asking for specific transaction details: the recipient number, the exact amount, and the approximate time of transaction.';
    }
    if (caseType === 'refund_request') {
      return 'Reply to customer asking for specific transaction details to identify the payment.';
    }
    return 'Reply to customer requesting specific transaction details: transaction ID, amount, and time.';
  }

  switch (caseType) {
    case 'wrong_transfer':
      if (evidenceVerdict === 'inconsistent') {
        return `Flag for human review. Verify with the customer whether ${txnId} was genuinely a wrong transfer given the established transaction pattern with this recipient.`;
      }
      return txnId
        ? `Verify ${txnId} details with the customer and initiate the wrong-transfer dispute workflow per policy.`
        : 'Initiate wrong-transfer dispute workflow. Request transaction ID from customer.';

    case 'payment_failed':
      return txnId
        ? `Investigate ${txnId} ledger status. If balance was deducted on a failed payment, follow the standard failed-payment correction workflow within SLA.`
        : 'Request transaction details from customer and investigate ledger status.';

    case 'refund_request':
      return `Inform the customer that eligibility depends on the merchant's own return policy. Provide guidance on contacting the merchant directly regarding their purchase.`;

    case 'duplicate_payment':
      return txnId
        ? `Verify the duplicate with ${department}. If the biller confirms only one payment was received, follow the duplicate-payment correction procedure for ${txnId}.`
        : 'Verify duplicate payment claim with payments_ops and follow duplicate-payment correction procedure if confirmed.';

    case 'merchant_settlement_delay':
      return txnId
        ? `Route to merchant_operations to verify settlement batch status for ${txnId}. If the batch is delayed, communicate a revised ETA to the merchant.`
        : 'Route to merchant_operations to verify settlement batch status and communicate ETA.';

    case 'agent_cash_in_issue':
      return txnId
        ? `Investigate ${txnId} pending status with agent operations. Confirm settlement state and resolve within the standard cash-in SLA.`
        : 'Investigate cash-in status with agent operations.';

    case 'phishing_or_social_engineering':
      return 'Escalate to fraud_risk team immediately. Confirm to customer that the company never asks for OTP. Log the reported incident for fraud pattern analysis.';

    case 'other':
      return 'Reply to customer asking for specific details: which transaction, what amount, what went wrong, and approximate time.';

    default:
      return `Route to ${department} for further investigation and action.`;
  }
}

// ============================================================
// Generate safe customer reply (language-matched)
// All replies are pre-validated against safety rules
// ============================================================
function generateCustomerReply(caseType, matchedTxn, language, userType, evidenceVerdict, isAmbiguous) {
  const txnId = matchedTxn ? matchedTxn.transaction_id : null;
  const isBangla = language === 'bn';
  const isMerchant = userType === 'merchant';

  // Route to language-specific generator
  if (isBangla) {
    return generateBanglaReply(caseType, txnId, matchedTxn, evidenceVerdict, isAmbiguous);
  }

  return generateEnglishReply(caseType, txnId, matchedTxn, evidenceVerdict, isAmbiguous, isMerchant);
}

function generateEnglishReply(caseType, txnId, matchedTxn, evidenceVerdict, isAmbiguous, isMerchant) {
  const closer = SAFE_CLOSER_EN;

  if (isAmbiguous && caseType !== 'phishing_or_social_engineering') {
    return `Thank you for reaching out. We see multiple transactions matching your description. Could you share more details (such as the recipient's number or the exact time) so we can identify the right transaction? ${closer}`;
  }

  switch (caseType) {
    case 'wrong_transfer':
      if (!txnId) {
        return `Thank you for reaching out. To help you faster, please share the recipient's number and the approximate time of the transfer. ${closer}`;
      }
      return `We have noted your concern about transaction ${txnId}. ${closer} Our dispute team will review the case and contact you through official support channels.`;

    case 'payment_failed':
      if (!txnId) {
        return `We have noted your concern about the failed payment. Our payments team will review your account and ${SAFE_REFUND_PHRASE}. ${closer}`;
      }
      return `We have noted that transaction ${txnId} may have caused an unexpected balance deduction. Our payments team will review the case and ${SAFE_REFUND_PHRASE}. ${closer}`;

    case 'refund_request':
      if (matchedTxn && matchedTxn.counterparty && matchedTxn.counterparty.startsWith('MERCHANT')) {
        return `Thank you for reaching out. Refunds for completed merchant payments depend on the merchant's own policy. We recommend contacting the merchant directly. If you need help reaching them, please reply and we will guide you. ${closer}`;
      }
      return `Thank you for reaching out. We have noted your refund request. Our team will review your case and contact you through official channels regarding eligibility. ${closer}`;

    case 'duplicate_payment':
      if (!txnId) {
        return `We have noted your concern about a possible duplicate payment. Our payments team will investigate and ${SAFE_REFUND_PHRASE}. ${closer}`;
      }
      return `We have noted the possible duplicate payment for transaction ${txnId}. Our payments team will verify with the biller and ${SAFE_REFUND_PHRASE}. ${closer}`;

    case 'merchant_settlement_delay':
      if (!txnId) {
        return `We have noted your concern about the settlement delay. Our merchant operations team will check the batch status and update you on the expected settlement time through official channels.`;
      }
      return `We have noted your concern about settlement ${txnId}. Our merchant operations team will check the batch status and update you on the expected settlement time through official channels.`;

    case 'agent_cash_in_issue':
      if (!txnId) {
        return `We have noted your concern about the cash-in. Our agent operations team will investigate and contact you through official channels. ${closer}`;
      }
      return `We have noted your concern about transaction ${txnId}. Our agent operations team will investigate and resolve this through official channels. ${closer}`;

    case 'phishing_or_social_engineering':
      return `Thank you for reaching out before sharing any information. We never ask for your PIN, OTP, or password under any circumstances. Please do not share these with anyone, even if they claim to be from us. Our fraud team has been notified of this incident.`;

    case 'other':
    default:
      return `Thank you for reaching out. To help you faster, please share the transaction ID, the amount involved, and a short description of what went wrong. ${closer}`;
  }
}

function generateBanglaReply(caseType, txnId, matchedTxn, evidenceVerdict, isAmbiguous) {
  const closer = SAFE_CLOSER_BN;

  if (isAmbiguous) {
    return `আপনার অনুরোধের জন্য ধন্যবাদ। আপনার বর্ণনার সাথে একাধিক লেনদেন পাওয়া গেছে। সঠিক লেনদেন চিহ্নিত করতে প্রাপকের নম্বর বা লেনদেনের সময় জানাবেন কি? ${closer}`;
  }

  switch (caseType) {
    case 'wrong_transfer':
      if (!txnId) {
        return `আপনার অনুরোধের জন্য ধন্যবাদ। দ্রুত সহায়তার জন্য প্রাপকের নম্বর এবং লেনদেনের আনুমানিক সময় জানান। ${closer}`;
      }
      return `আপনার লেনদেন ${txnId} এর বিষয়ে আমরা অবগত হয়েছি। ${closer} আমাদের বিরোধ নিষ্পত্তি দল এটি পর্যালোচনা করবে এবং অফিসিয়াল চ্যানেলে আপনাকে জানাবে।`;

    case 'payment_failed':
      if (!txnId) {
        return `আপনার ব্যর্থ পেমেন্টের বিষয়ে আমরা অবগত হয়েছি। আমাদের টিম পর্যালোচনা করবে এবং ${SAFE_REFUND_PHRASE_BN}। ${closer}`;
      }
      return `আপনার লেনদেন ${txnId} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের পেমেন্ট টিম পর্যালোচনা করবে এবং ${SAFE_REFUND_PHRASE_BN}। ${closer}`;

    case 'refund_request':
      return `আপনার অনুরোধের জন্য ধন্যবাদ। মার্চেন্ট পেমেন্টের রিফান্ড মার্চেন্টের নিজস্ব নীতির উপর নির্ভর করে। সরাসরি মার্চেন্টের সাথে যোগাযোগ করার পরামর্শ দেওয়া হচ্ছে। ${closer}`;

    case 'duplicate_payment':
      if (!txnId) {
        return `সম্ভাব্য ডুপ্লিকেট পেমেন্টের বিষয়ে আমরা অবগত। আমাদের টিম যাচাই করবে এবং ${SAFE_REFUND_PHRASE_BN}। ${closer}`;
      }
      return `লেনদেন ${txnId} এর সম্ভাব্য ডুপ্লিকেট পেমেন্টের বিষয়ে আমরা অবগত। আমাদের পেমেন্ট টিম বিলারের সাথে যাচাই করবে এবং ${SAFE_REFUND_PHRASE_BN}। ${closer}`;

    case 'merchant_settlement_delay':
      if (!txnId) {
        return `সেটেলমেন্ট বিলম্বের বিষয়ে আমরা অবগত হয়েছি। আমাদের মার্চেন্ট অপারেশন্স দল ব্যাচ স্ট্যাটাস যাচাই করে অফিসিয়াল চ্যানেলে জানাবে।`;
      }
      return `সেটেলমেন্ট ${txnId} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের মার্চেন্ট অপারেশন্স দল ব্যাচ স্ট্যাটাস যাচাই করে প্রত্যাশিত সেটেলমেন্ট সময় অফিসিয়াল চ্যানেলে জানাবে।`;

    case 'agent_cash_in_issue':
      if (!txnId) {
        return `আপনার ক্যাশ ইন এর বিষয়ে আমরা অবগত হয়েছি। আমাদের এজেন্ট অপারেশন্স দল দ্রুত তদন্ত করবে। ${closer}`;
      }
      return `আপনার লেনদেন ${txnId} এর বিষয়ে আমরা অবগত হয়েছি। আমাদের এজেন্ট অপারেশন্স দল এটি দ্রুত যাচাই করবে এবং অফিসিয়াল চ্যানেলে আপনাকে জানাবে। ${closer}`;

    case 'phishing_or_social_engineering':
      return `তথ্য শেয়ার করার আগে যোগাযোগ করার জন্য ধন্যবাদ। আমরা কখনো আপনার পিন, ওটিপি বা পাসওয়ার্ড চাই না। কেউ আমাদের পক্ষ থেকে দাবি করলেও এই তথ্য কারো সাথে শেয়ার করবেন না। আমাদের ফ্রড টিমকে এই ঘটনা সম্পর্কে অবহিত করা হয়েছে।`;

    case 'other':
    default:
      return `আপনার অনুরোধের জন্য ধন্যবাদ। দ্রুত সহায়তার জন্য লেনদেনের আইডি, পরিমাণ এবং সমস্যার বিবরণ জানান। ${closer}`;
  }
}

module.exports = {
  generateAgentSummary,
  generateNextAction,
  generateCustomerReply
};
