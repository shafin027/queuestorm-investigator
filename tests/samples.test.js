// tests/samples.test.js
// All 10 official sample cases as automated tests
// Verifies: relevant_transaction_id, evidence_verdict, case_type, department, safety

const request = require('supertest');
const app = require('../src/server');

// Load sample cases from the provided JSON file
const path = require('path');
const fs = require('fs');

// Helper: Check that customer_reply passes safety rules
// The rules ban REQUESTING credentials ("please share your OTP"), NOT mentioning them in warnings
function assertSafeReply(reply) {
  // Must NOT request credentials (requesting = unsafe, mentioning in a warning = safe)
  expect(reply).not.toMatch(/please\s+share\s+your\s+(otp|pin|password)/i);
  expect(reply).not.toMatch(/share\s+your\s+(otp|pin|password)\s+(to|with|for)/i);
  expect(reply).not.toMatch(/enter\s+your\s+(otp|pin|password)/i);
  expect(reply).not.toMatch(/provide\s+your\s+(otp|pin|password)/i);
  expect(reply).not.toMatch(/verify\s+with\s+your\s+(otp|pin|password)/i);
  expect(reply).not.toMatch(/confirm\s+your\s+(otp|pin|password)/i);
  // Must NOT promise unauthorized refunds
  expect(reply).not.toMatch(/we\s+will\s+refund/i);
  expect(reply).not.toMatch(/refund.*immediately/i);
  expect(reply).not.toMatch(/we\s+have\s+approved\s+the\s+refund/i);
  expect(reply).not.toMatch(/refund\s+(has\s+been|is)\s+approved/i);
  // Must NOT direct to suspicious third parties (phone numbers)
  expect(reply).not.toMatch(/call\s+\+?\d{7,}/i);
  expect(reply).not.toMatch(/contact\s+\+?\d{7,}/i);
}

// Helper: Check all 10 required fields are present
function assertRequiredFields(response) {
  const required = [
    'ticket_id',
    'relevant_transaction_id',
    'evidence_verdict',
    'case_type',
    'severity',
    'department',
    'agent_summary',
    'recommended_next_action',
    'customer_reply',
    'human_review_required'
  ];
  for (const field of required) {
    expect(response).toHaveProperty(field);
  }
}

// Helper: Assert enum values
const VALID_EVIDENCE_VERDICTS = ['consistent', 'inconsistent', 'insufficient_data'];
const VALID_CASE_TYPES = ['wrong_transfer','payment_failed','refund_request','duplicate_payment','merchant_settlement_delay','agent_cash_in_issue','phishing_or_social_engineering','other'];
const VALID_DEPARTMENTS = ['customer_support','dispute_resolution','payments_ops','merchant_operations','agent_operations','fraud_risk'];
const VALID_SEVERITIES = ['low','medium','high','critical'];

function assertValidEnums(response) {
  expect(VALID_EVIDENCE_VERDICTS).toContain(response.evidence_verdict);
  expect(VALID_CASE_TYPES).toContain(response.case_type);
  expect(VALID_DEPARTMENTS).toContain(response.department);
  expect(VALID_SEVERITIES).toContain(response.severity);
  expect(typeof response.human_review_required).toBe('boolean');
}

// ============================================================
// SAMPLE-01: Wrong transfer with matching evidence
// ============================================================
describe('SAMPLE-01: Wrong transfer with matching evidence', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-001',
      complaint: 'I sent 5000 taka to a wrong number around 2pm today. The number was supposed to be 01712345678 but I think I typed it wrong. The person isn\'t responding to my call. Please help me get my money back.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      campaign_context: 'boishakh_bonanza_day_1',
      transaction_history: [
        { transaction_id: 'TXN-9101', timestamp: '2026-04-14T14:08:22Z', type: 'transfer', amount: 5000, counterparty: '+8801719876543', status: 'completed' },
        { transaction_id: 'TXN-9087', timestamp: '2026-04-13T18:12:00Z', type: 'cash_in', amount: 10000, counterparty: 'AGENT-512', status: 'completed' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('returns correct ticket_id', () => expect(response.ticket_id).toBe('TKT-001'));
  it('identifies TXN-9101 as the relevant transaction', () => expect(response.relevant_transaction_id).toBe('TXN-9101'));
  it('returns evidence_verdict = consistent', () => expect(response.evidence_verdict).toBe('consistent'));
  it('returns case_type = wrong_transfer', () => expect(response.case_type).toBe('wrong_transfer'));
  it('routes to dispute_resolution', () => expect(response.department).toBe('dispute_resolution'));
  it('returns severity = high', () => expect(response.severity).toBe('high'));
  it('requires human review', () => expect(response.human_review_required).toBe(true));
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});

// ============================================================
// SAMPLE-02: Wrong transfer claim with inconsistent evidence
// ============================================================
describe('SAMPLE-02: Wrong transfer with inconsistent evidence', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-002',
      complaint: 'I sent 2000 to the wrong person by mistake. Please reverse it.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      transaction_history: [
        { transaction_id: 'TXN-9202', timestamp: '2026-04-14T11:30:00Z', type: 'transfer', amount: 2000, counterparty: '+8801812345678', status: 'completed' },
        { transaction_id: 'TXN-9180', timestamp: '2026-04-10T09:15:00Z', type: 'transfer', amount: 2500, counterparty: '+8801812345678', status: 'completed' },
        { transaction_id: 'TXN-9145', timestamp: '2026-04-05T17:45:00Z', type: 'transfer', amount: 1500, counterparty: '+8801812345678', status: 'completed' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('identifies TXN-9202 as the relevant transaction', () => expect(response.relevant_transaction_id).toBe('TXN-9202'));
  it('returns evidence_verdict = inconsistent', () => expect(response.evidence_verdict).toBe('inconsistent'));
  it('returns case_type = wrong_transfer', () => expect(response.case_type).toBe('wrong_transfer'));
  it('routes to dispute_resolution', () => expect(response.department).toBe('dispute_resolution'));
  it('requires human review (inconsistent evidence)', () => expect(response.human_review_required).toBe(true));
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});

// ============================================================
// SAMPLE-03: Failed payment with balance deducted
// ============================================================
describe('SAMPLE-03: Payment failed with balance deducted', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-003',
      complaint: 'I tried to pay 1200 taka for my mobile recharge but the app showed failed. But my balance was deducted! Please refund my money.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      transaction_history: [
        { transaction_id: 'TXN-9301', timestamp: '2026-04-14T16:00:00Z', type: 'payment', amount: 1200, counterparty: 'MERCHANT-MOBILE-OP', status: 'failed' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('identifies TXN-9301 as relevant', () => expect(response.relevant_transaction_id).toBe('TXN-9301'));
  it('returns evidence_verdict = consistent', () => expect(response.evidence_verdict).toBe('consistent'));
  it('returns case_type = payment_failed', () => expect(response.case_type).toBe('payment_failed'));
  it('routes to payments_ops', () => expect(response.department).toBe('payments_ops'));
  it('returns severity = high', () => expect(response.severity).toBe('high'));
  it('does NOT require human review (auto-reversible)', () => expect(response.human_review_required).toBe(false));
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
  it('customer_reply uses safe refund language', () => {
    expect(response.customer_reply.toLowerCase()).toMatch(/eligible|official channels/);
  });
});

// ============================================================
// SAMPLE-04: Refund request requiring safe handling
// ============================================================
describe('SAMPLE-04: Refund request (merchant policy)', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-004',
      complaint: 'I paid 500 to a merchant for a product but I changed my mind and don\'t want it anymore. Please refund my 500 taka.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      transaction_history: [
        { transaction_id: 'TXN-9401', timestamp: '2026-04-14T13:00:00Z', type: 'payment', amount: 500, counterparty: 'MERCHANT-7821', status: 'completed' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('identifies TXN-9401 as relevant', () => expect(response.relevant_transaction_id).toBe('TXN-9401'));
  it('returns case_type = refund_request', () => expect(response.case_type).toBe('refund_request'));
  it('routes to customer_support', () => expect(response.department).toBe('customer_support'));
  it('returns severity = low', () => expect(response.severity).toBe('low'));
  it('does NOT require human review', () => expect(response.human_review_required).toBe(false));
  it('customer_reply is safe (no refund promise)', () => assertSafeReply(response.customer_reply));
  it('customer_reply does not promise refund', () => {
    expect(response.customer_reply.toLowerCase()).not.toMatch(/we will refund|refund approved|you will get.*back/);
  });
});

// ============================================================
// SAMPLE-05: Phishing / social engineering
// ============================================================
describe('SAMPLE-05: Phishing report', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-005',
      complaint: 'Someone called me saying they are from bKash and asked for my OTP. They said my account will be blocked if I don\'t share it. Is this real? I haven\'t shared anything yet.',
      language: 'en',
      channel: 'call_center',
      user_type: 'customer',
      transaction_history: []
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('returns relevant_transaction_id = null', () => expect(response.relevant_transaction_id).toBeNull());
  it('returns case_type = phishing_or_social_engineering', () => expect(response.case_type).toBe('phishing_or_social_engineering'));
  it('routes to fraud_risk', () => expect(response.department).toBe('fraud_risk'));
  it('returns severity = critical', () => expect(response.severity).toBe('critical'));
  it('requires human review', () => expect(response.human_review_required).toBe(true));
  it('customer_reply warns about credentials', () => {
    expect(response.customer_reply.toLowerCase()).toMatch(/never|pin|otp|password/);
  });
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});

// ============================================================
// SAMPLE-06: Vague complaint, insufficient evidence
// ============================================================
describe('SAMPLE-06: Vague complaint', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-006',
      complaint: 'Something is wrong with my money. Please check.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      transaction_history: [
        { transaction_id: 'TXN-9601', timestamp: '2026-04-13T10:00:00Z', type: 'cash_in', amount: 3000, counterparty: 'AGENT-220', status: 'completed' },
        { transaction_id: 'TXN-9602', timestamp: '2026-04-12T15:30:00Z', type: 'transfer', amount: 800, counterparty: '+8801911223344', status: 'completed' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('returns relevant_transaction_id = null (vague)', () => expect(response.relevant_transaction_id).toBeNull());
  it('returns evidence_verdict = insufficient_data', () => expect(response.evidence_verdict).toBe('insufficient_data'));
  it('returns case_type = other', () => expect(response.case_type).toBe('other'));
  it('routes to customer_support', () => expect(response.department).toBe('customer_support'));
  it('returns severity = low', () => expect(response.severity).toBe('low'));
  it('does NOT require human review', () => expect(response.human_review_required).toBe(false));
  it('asks for clarification', () => {
    expect(response.customer_reply.toLowerCase()).toMatch(/detail|transaction|amount|description/);
  });
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});

// ============================================================
// SAMPLE-07: Agent cash-in issue, Bangla complaint
// ============================================================
describe('SAMPLE-07: Agent cash-in (Bangla complaint)', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-007',
      complaint: 'আমি আজ সকালে এজেন্টের কাছে ২০০০ টাকা ক্যাশ ইন করেছি কিন্তু আমার ব্যালেন্সে টাকা আসেনি। এজেন্ট বলছে টাকা পাঠিয়েছে কিন্তু আমি দেখছি না।',
      language: 'bn',
      channel: 'call_center',
      user_type: 'customer',
      transaction_history: [
        { transaction_id: 'TXN-9701', timestamp: '2026-04-14T09:30:00Z', type: 'cash_in', amount: 2000, counterparty: 'AGENT-318', status: 'pending' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('identifies TXN-9701 as relevant', () => expect(response.relevant_transaction_id).toBe('TXN-9701'));
  it('returns evidence_verdict = consistent', () => expect(response.evidence_verdict).toBe('consistent'));
  it('returns case_type = agent_cash_in_issue', () => expect(response.case_type).toBe('agent_cash_in_issue'));
  it('routes to agent_operations', () => expect(response.department).toBe('agent_operations'));
  it('returns severity = high (pending)', () => expect(response.severity).toBe('high'));
  it('requires human review (pending cash-in)', () => expect(response.human_review_required).toBe(true));
  it('customer_reply is in Bangla', () => {
    // Bangla reply should contain Bengali characters
    expect(response.customer_reply).toMatch(/[\u0980-\u09FF]/);
  });
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});

// ============================================================
// SAMPLE-08: Multiple plausible transactions, ambiguous
// ============================================================
describe('SAMPLE-08: Ambiguous multiple matches', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-008',
      complaint: 'I sent 1000 to my brother yesterday but he says he didn\'t get it. Please check.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      transaction_history: [
        { transaction_id: 'TXN-9801', timestamp: '2026-04-13T11:20:00Z', type: 'transfer', amount: 1000, counterparty: '+8801712001122', status: 'completed' },
        { transaction_id: 'TXN-9802', timestamp: '2026-04-13T19:45:00Z', type: 'transfer', amount: 1000, counterparty: '+8801812334455', status: 'completed' },
        { transaction_id: 'TXN-9803', timestamp: '2026-04-13T20:10:00Z', type: 'transfer', amount: 1000, counterparty: '+8801712001122', status: 'failed' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('returns relevant_transaction_id = null (ambiguous)', () => expect(response.relevant_transaction_id).toBeNull());
  it('returns evidence_verdict = insufficient_data', () => expect(response.evidence_verdict).toBe('insufficient_data'));
  it('does NOT require human review yet (ask for details first)', () => expect(response.human_review_required).toBe(false));
  it('asks for brother\'s number or more details', () => {
    expect(response.customer_reply.toLowerCase()).toMatch(/detail|number|identify|which/);
  });
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});

// ============================================================
// SAMPLE-09: Merchant settlement delay
// ============================================================
describe('SAMPLE-09: Merchant settlement delay', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-009',
      complaint: 'I am a merchant. My yesterday\'s sales of 15000 taka have not been settled to my account. Settlement usually happens by 11am next day. Please check.',
      language: 'en',
      channel: 'merchant_portal',
      user_type: 'merchant',
      transaction_history: [
        { transaction_id: 'TXN-9901', timestamp: '2026-04-13T18:00:00Z', type: 'settlement', amount: 15000, counterparty: 'MERCHANT-SELF', status: 'pending' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('identifies TXN-9901 as relevant', () => expect(response.relevant_transaction_id).toBe('TXN-9901'));
  it('returns evidence_verdict = consistent', () => expect(response.evidence_verdict).toBe('consistent'));
  it('returns case_type = merchant_settlement_delay', () => expect(response.case_type).toBe('merchant_settlement_delay'));
  it('routes to merchant_operations', () => expect(response.department).toBe('merchant_operations'));
  it('returns severity = medium', () => expect(response.severity).toBe('medium'));
  it('does NOT require human review', () => expect(response.human_review_required).toBe(false));
  it('customer_reply mentions settlement', () => {
    expect(response.customer_reply.toLowerCase()).toMatch(/settlement|batch|merchant/);
  });
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});

// ============================================================
// SAMPLE-10: Duplicate payment claim
// ============================================================
describe('SAMPLE-10: Duplicate payment', () => {
  let response;
  beforeAll(async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-010',
      complaint: 'I paid my electricity bill 850 taka but it deducted twice from my account. Please check, I only paid once.',
      language: 'en',
      channel: 'in_app_chat',
      user_type: 'customer',
      transaction_history: [
        { transaction_id: 'TXN-10001', timestamp: '2026-04-14T08:15:30Z', type: 'payment', amount: 850, counterparty: 'BILLER-DESCO', status: 'completed' },
        { transaction_id: 'TXN-10002', timestamp: '2026-04-14T08:15:42Z', type: 'payment', amount: 850, counterparty: 'BILLER-DESCO', status: 'completed' }
      ]
    });
    response = res.body;
    expect(res.status).toBe(200);
  });

  it('has all required fields', () => assertRequiredFields(response));
  it('has valid enum values', () => assertValidEnums(response));
  it('identifies TXN-10002 (the duplicate) as relevant', () => expect(response.relevant_transaction_id).toBe('TXN-10002'));
  it('returns evidence_verdict = consistent', () => expect(response.evidence_verdict).toBe('consistent'));
  it('returns case_type = duplicate_payment', () => expect(response.case_type).toBe('duplicate_payment'));
  it('routes to payments_ops', () => expect(response.department).toBe('payments_ops'));
  it('returns severity = high', () => expect(response.severity).toBe('high'));
  it('requires human review', () => expect(response.human_review_required).toBe(true));
  it('customer_reply mentions TXN-10002', () => {
    expect(response.customer_reply).toContain('TXN-10002');
  });
  it('customer_reply uses safe refund language', () => {
    expect(response.customer_reply.toLowerCase()).toMatch(/eligible|official channels/);
  });
  it('customer_reply is safe', () => assertSafeReply(response.customer_reply));
});
