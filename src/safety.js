// src/safety.js
// Safety guardrails — the most critical compliance layer
// Penalties: -15 for credential request, -10 for refund promise, -10 for third-party
// Adversarial injection detection also included

// ============================================================
// Patterns that MUST NEVER appear in customer_reply
// ============================================================

const CREDENTIAL_REQUEST_PATTERNS = [
  // Explicit request phrases — these are the unsafe patterns
  /please\s+share\s+your\s+(otp|pin|password|card\s+number|cvv|security\s+code)/i,
  /share\s+your\s+(otp|pin|password|card|cvv)\s+(to|with|for|so)/i,
  /enter\s+your\s+(otp|pin|password|card\s+number|cvv)/i,
  /provide\s+your\s+(otp|pin|password|card\s+number|cvv)/i,
  /send\s+your\s+(otp|pin|password|code)/i,
  /confirm\s+your\s+(otp|pin|password)/i,
  /verify\s+with\s+your\s+(otp|pin|password)/i,
  /can\s+you\s+share\s+your\s+(otp|pin|password)/i,
  /i\s+need\s+your\s+(otp|pin|password)/i,
  /we\s+need\s+your\s+(otp|pin|password)/i,
  // Bangla credential requests
  /\u0993টিপি\s+\u09b6েয়ার/i,
  /\u09aaিন\s+\u09a6িন/i
];

const REFUND_PROMISE_PATTERNS = [
  /we\s+will\s+refund/i,
  /you\s+will\s+(get|receive)\s+(your\s+money|the\s+amount|refund)\s+back/i,
  /we\s+(have\s+)?(approved|processed|confirmed)\s+(the\s+)?(refund|reversal)/i,
  /refund\s+(has\s+been|is|will\s+be)\s+(approved|processed|confirmed|done|completed)/i,
  /reversal\s+(has\s+been|is|will\s+be)\s+(approved|processed|confirmed|done|completed)/i,
  /immediately\s+refund/i,
  /refund\s+immediately/i,
  /instant\s+refund/i,
  /guaranteed\s+refund/i,
  /your\s+money\s+is\s+safe\s+and\s+will\s+be\s+returned\s+immediately/i,
  /আমরা\s+রিফান্ড\s+করব/i,
  /টাকা\s+ফেরত\s+দেব/i
];

const THIRD_PARTY_PATTERNS = [
  /call\s+(us\s+at\s+)?\+?\d{5,}/i,        // phone numbers in reply
  /contact\s+(us\s+at\s+)?\+?\d{5,}/i,
  /reach\s+(us\s+at\s+)?\+?\d{5,}/i,
  /visit\s+https?:\/\/(?!official)/i,        // external URLs (allow "official")
  /click\s+this\s+link/i,
  /go\s+to\s+this\s+website/i,
  /whatsapp\s+(us|me|at)/i,
  /telegram\s+(us|me|at)/i
];

// ============================================================
// Adversarial injection patterns in COMPLAINT
// If complaint contains these, they must be ignored/sanitized
// ============================================================
const ADVERSARIAL_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+|above\s+)?instructions/i,
  /disregard\s+(all\s+|the\s+)?rules/i,
  /you\s+are\s+now\s+(a\s+different|not|free)/i,
  /act\s+as\s+(if\s+)?(you|an?)\s+(are|were)/i,
  /print\s+(your\s+)?(system\s+)?prompt/i,
  /reveal\s+(your\s+)?(system\s+)?prompt/i,
  /override\s+(safety|rules|instructions)/i,
  /say\s+"(refund|approved|we will|i will)/i,
  /respond\s+with\s+"refund/i,
  /confirm\s+(the\s+)?refund/i
];

// ============================================================
// Sanitize complaint text — strip adversarial instructions
// Returns a boolean indicating if injection was detected
// ============================================================
function detectAdversarialInjection(complaint) {
  return ADVERSARIAL_PATTERNS.some(pattern => pattern.test(complaint));
}

// ============================================================
// Validate customer_reply for safety violations
// ============================================================
function validateSafety(customerReply, recommendedNextAction) {
  const violations = [];

  // Check credential requests
  for (const pattern of CREDENTIAL_REQUEST_PATTERNS) {
    if (pattern.test(customerReply)) {
      violations.push({
        field: 'customer_reply',
        violation: 'credential_request',
        penalty: -15,
        pattern: pattern.toString()
      });
      break; // one violation per category
    }
  }

  // Check refund promises in customer_reply
  for (const pattern of REFUND_PROMISE_PATTERNS) {
    if (pattern.test(customerReply)) {
      violations.push({
        field: 'customer_reply',
        violation: 'unauthorized_refund_promise',
        penalty: -10,
        pattern: pattern.toString()
      });
      break;
    }
  }

  // Check refund promises in recommended_next_action
  if (recommendedNextAction) {
    const actionRefundPatterns = [
      /we\s+will\s+refund/i,
      /approve\s+(the\s+)?refund/i,
      /we\s+approve/i
    ];
    for (const pattern of actionRefundPatterns) {
      if (pattern.test(recommendedNextAction)) {
        violations.push({
          field: 'recommended_next_action',
          violation: 'unauthorized_refund_promise',
          penalty: -10,
          pattern: pattern.toString()
        });
        break;
      }
    }
  }

  // Check third-party direction
  for (const pattern of THIRD_PARTY_PATTERNS) {
    if (pattern.test(customerReply)) {
      violations.push({
        field: 'customer_reply',
        violation: 'third_party_direction',
        penalty: -10,
        pattern: pattern.toString()
      });
      break;
    }
  }

  return {
    isSafe: violations.length === 0,
    violations,
    totalPenalty: violations.reduce((sum, v) => sum + v.penalty, 0)
  };
}

module.exports = {
  validateSafety,
  detectAdversarialInjection,
  CREDENTIAL_REQUEST_PATTERNS,
  REFUND_PROMISE_PATTERNS,
  ADVERSARIAL_PATTERNS
};
