// src/server.js
// Express entry point — all routes and middleware

'use strict';

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { AnalyzeTicketRequestSchema, AnalyzeTicketResponseSchema } = require('./schemas');
const { investigate } = require('./investigator');
const { routeToDepartment, assessSeverity, requiresHumanReview } = require('./classifier');
const { validateSafety, detectAdversarialInjection } = require('./safety');
const { generateAgentSummary, generateNextAction, generateCustomerReply } = require('./generator');
const llm = require('./llm');

const app = express();
const PORT = process.env.PORT || 3000;
const REQUEST_TIMEOUT_MS = 29000; // 29s — leave 1s buffer under 30s limit

// ============================================================
// Middleware
// ============================================================
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Request logging (no secrets logged)
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================
// GET /health
// Must respond within 60s of service start
// ============================================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ============================================================
// GET /
// Root endpoint to verify API is running
// ============================================================
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'QueueStorm Investigator API',
    status: 'running',
    endpoints: ['GET /health', 'POST /analyze-ticket']
  });
});

// ============================================================
// POST /analyze-ticket
// Main investigation pipeline
// ============================================================
app.all('/analyze-ticket', (req, res, next) => {
  if (req.method === 'POST') {
    return next();
  }
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'The /analyze-ticket endpoint requires a POST request with a JSON body. Please use tools like Postman or cURL to send a POST request.'
  });
});

app.post('/analyze-ticket', async (req, res) => {
  // Set timeout guard
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Request timed out. Please try again.' });
    }
  }, REQUEST_TIMEOUT_MS);

  try {
    // ─── Step 1: Parse & validate request ─────────────────────────────
    let validatedRequest;
    try {
      validatedRequest = AnalyzeTicketRequestSchema.parse(req.body);
    } catch (zodError) {
      clearTimeout(timeout);
      const missingRequired = zodError.errors.some(
        e => e.path.includes('ticket_id') || e.path.includes('complaint')
      );
      return res.status(missingRequired ? 400 : 422).json({
        error: 'Invalid request',
        details: zodError.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }

    // ─── Step 2: Check for adversarial injection in complaint ─────────
    const isAdversarial = detectAdversarialInjection(validatedRequest.complaint);
    // If adversarial, we still process normally — just log it
    // The investigation engine is deterministic and won't be swayed
    if (isAdversarial) {
      console.warn(`[SECURITY] Adversarial injection detected in ticket ${validatedRequest.ticket_id}`);
    }

    // ─── Step 3: Run investigation ─────────────────────────────────────
    let externalCaseType = null;
    try {
      if (process.env.GEMINI_API_KEY) {
        externalCaseType = await llm.classifyIntent(validatedRequest.complaint);
      }
    } catch (llmErr) {
      console.warn('[LLM Fallback] Intent Classification failed:', llmErr.message);
    }
    const investigation = investigate(validatedRequest, externalCaseType);

    // ─── Step 4: Assess severity ───────────────────────────────────────
    const severity = assessSeverity(
      investigation.caseType,
      investigation.matchedTxn,
      investigation.evidenceVerdict,
      investigation.userType
    );

    // ─── Step 5: Route to department ───────────────────────────────────
    const department = routeToDepartment(
      investigation.caseType,
      severity,
      investigation.userType
    );

    // ─── Step 6: Human review decision ────────────────────────────────
    const humanReviewRequired = requiresHumanReview(
      investigation.caseType,
      investigation.evidenceVerdict,
      severity,
      investigation.matchedTxn,
      investigation.isAmbiguous
    );

    // ─── Step 7: Generate responses ────────────────────────────────────
    let agentSummary, customerReply;
    try {
      if (process.env.GEMINI_API_KEY) {
        const llmDrafts = await llm.draftResponses(
          validatedRequest.complaint,
          investigation.caseType,
          investigation.evidenceVerdict,
          investigation.matchedTxn,
          investigation.language,
          investigation.userType
        );
        agentSummary = llmDrafts.agent_summary;
        customerReply = llmDrafts.customer_reply;
      } else {
        throw new Error('No API Key');
      }
    } catch (llmErr) {
      if (process.env.GEMINI_API_KEY) {
        console.warn('[LLM Fallback] Response Drafting failed:', llmErr.message);
      }
      agentSummary = generateAgentSummary(
        validatedRequest.complaint,
        investigation.matchedTxn,
        investigation.caseType,
        investigation.evidenceVerdict,
        investigation.allMatches
      );
      customerReply = generateCustomerReply(
        investigation.caseType,
        investigation.matchedTxn,
        investigation.language,
        investigation.userType,
        investigation.evidenceVerdict,
        investigation.isAmbiguous
      );
    }

    const recommendedNextAction = generateNextAction(
      investigation.caseType,
      department,
      investigation.matchedTxn,
      investigation.evidenceVerdict,
      investigation.isAmbiguous
    );

    // ─── Step 8: Safety validation ─────────────────────────────────────
    const safetyCheck = validateSafety(customerReply, recommendedNextAction);
    if (!safetyCheck.isSafe) {
      console.error(`[SAFETY VIOLATION] Ticket ${validatedRequest.ticket_id}:`, safetyCheck.violations);
      // Fallback to the safest possible deterministic reply
      customerReply = generateCustomerReply(
        investigation.caseType,
        investigation.matchedTxn,
        investigation.language,
        investigation.userType,
        investigation.evidenceVerdict,
        investigation.isAmbiguous
      );
    }

    // ─── Step 9: Build final response ──────────────────────────────────
    const response = {
      ticket_id: validatedRequest.ticket_id,
      relevant_transaction_id: investigation.relevantTransactionId,
      evidence_verdict: investigation.evidenceVerdict,
      case_type: investigation.caseType,
      severity,
      department,
      agent_summary: agentSummary,
      recommended_next_action: recommendedNextAction,
      customer_reply: customerReply,
      human_review_required: humanReviewRequired,
      confidence: investigation.confidence,
      reason_codes: investigation.reasonCodes
    };

    // ─── Step 10: Validate output schema ───────────────────────────────
    try {
      AnalyzeTicketResponseSchema.parse(response);
    } catch (outputError) {
      // Schema validation of our own output failed — internal error
      console.error('[OUTPUT SCHEMA ERROR]', outputError.errors);
      clearTimeout(timeout);
      return res.status(500).json({
        error: 'Internal processing error',
        message: 'Output schema validation failed'
      });
    }

    clearTimeout(timeout);
    return res.status(200).json(response);

  } catch (err) {
    clearTimeout(timeout);
    // Never expose stack traces or internal details
    console.error('[UNHANDLED ERROR]', err.message);
    if (!res.headersSent) {
      return res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      });
    }
  }
});

// ============================================================
// 404 handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.path });
});

// ============================================================
// Global error handler — must never expose stack traces
// ============================================================
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    // Malformed JSON caught by express.json()
    console.error('[MALFORMED JSON]', err.message);
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid JSON payload format'
    });
  }

  console.error('[GLOBAL ERROR]', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// Start server
// ============================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`╔═══════════════════════════════════════════╗`);
    console.log(`║  QueueStorm Investigator API — Running     ║`);
    console.log(`║  Port: ${PORT}                              ║`);
    console.log(`║  GET  /health                              ║`);
    console.log(`║  POST /analyze-ticket                      ║`);
    console.log(`╚═══════════════════════════════════════════╝`);
  });
}

module.exports = app; // Export for tests
