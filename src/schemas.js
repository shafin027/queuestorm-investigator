// src/schemas.js
// All Zod schemas and enum constants — exact case-sensitive values per spec

const z = require('zod');

// ============================================================
// Enum constant arrays (exact spec values)
// ============================================================
const EVIDENCE_VERDICTS = ['consistent', 'inconsistent', 'insufficient_data'];
const CASE_TYPES = [
  'wrong_transfer',
  'payment_failed',
  'refund_request',
  'duplicate_payment',
  'merchant_settlement_delay',
  'agent_cash_in_issue',
  'phishing_or_social_engineering',
  'other'
];
const DEPARTMENTS = [
  'customer_support',
  'dispute_resolution',
  'payments_ops',
  'merchant_operations',
  'agent_operations',
  'fraud_risk'
];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const LANGUAGES = ['en', 'bn', 'mixed'];
const CHANNELS = ['in_app_chat', 'call_center', 'email', 'merchant_portal', 'field_agent'];
const USER_TYPES = ['customer', 'merchant', 'agent', 'unknown'];
const TRANSACTION_TYPES = ['transfer', 'payment', 'cash_in', 'cash_out', 'settlement', 'refund'];
const TRANSACTION_STATUSES = ['completed', 'failed', 'pending', 'reversed'];

// ============================================================
// Transaction schema
// ============================================================
const TransactionSchema = z.object({
  transaction_id: z.string(),
  timestamp: z.string(), // ISO string — we parse manually
  type: z.enum(TRANSACTION_TYPES),
  amount: z.number().positive(),
  counterparty: z.string(),
  status: z.enum(TRANSACTION_STATUSES)
}).strict();

// ============================================================
// Request schema — only ticket_id and complaint are required
// ============================================================
const AnalyzeTicketRequestSchema = z.object({
  ticket_id: z.string().min(1, 'ticket_id is required'),
  complaint: z.string().min(1, 'complaint cannot be empty').max(5000, 'complaint is too long'),
  language: z.enum(LANGUAGES).optional().default('en'),
  channel: z.enum(CHANNELS).optional(),
  user_type: z.enum(USER_TYPES).optional().default('unknown'),
  campaign_context: z.string().optional(),
  transaction_history: z.array(TransactionSchema).max(100, 'transaction_history too large').optional().default([]),
  metadata: z.record(z.any()).optional()
}).strict();

// ============================================================
// Response schema — all 10 required fields
// ============================================================
const AnalyzeTicketResponseSchema = z.object({
  ticket_id: z.string(),
  relevant_transaction_id: z.string().nullable(),
  evidence_verdict: z.enum(EVIDENCE_VERDICTS),
  case_type: z.enum(CASE_TYPES),
  severity: z.enum(SEVERITIES),
  department: z.enum(DEPARTMENTS),
  agent_summary: z.string(),
  recommended_next_action: z.string(),
  customer_reply: z.string(),
  human_review_required: z.boolean(),
  confidence: z.number().min(0).max(1).optional(),
  reason_codes: z.array(z.string()).optional()
});

module.exports = {
  AnalyzeTicketRequestSchema,
  AnalyzeTicketResponseSchema,
  TransactionSchema,
  EVIDENCE_VERDICTS,
  CASE_TYPES,
  DEPARTMENTS,
  SEVERITIES,
  LANGUAGES,
  CHANNELS,
  USER_TYPES,
  TRANSACTION_TYPES,
  TRANSACTION_STATUSES
};
