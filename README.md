# QueueStorm Investigator

> **SUST CSE Carnival 2026 | Codex Community Hackathon | Online Preliminary**

An AI/API copilot for fintech support agents. Given a customer complaint and transaction history, the service investigates the evidence, classifies the case, routes to the right department, and returns a safe, structured JSON response.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check — returns `{"status":"ok"}` |
| `POST` | `/analyze-ticket` | Analyze a support ticket |

---

## Quick Start

### Option 1: Node.js

```bash
# 1. Clone and install
git clone <your-repo-url>
cd queuestorm-investigator
npm install

# 2. Configure (optional — defaults work fine)
cp .env.example .env

# 3. Start
npm start
# Server listening on http://localhost:3000
```

### Option 2: Docker

```bash
docker build -t queuestorm .
docker run -p 3000:3000 queuestorm
```

---

## Example Request

```bash
curl -X POST http://localhost:3000/analyze-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "TKT-001",
    "complaint": "I sent 5000 taka to a wrong number around 2pm today. Please help.",
    "language": "en",
    "user_type": "customer",
    "transaction_history": [
      {
        "transaction_id": "TXN-9101",
        "timestamp": "2026-04-14T14:08:22Z",
        "type": "transfer",
        "amount": 5000,
        "counterparty": "+8801719876543",
        "status": "completed"
      }
    ]
  }'
```

### Example Response

```json
{
  "ticket_id": "TKT-001",
  "relevant_transaction_id": "TXN-9101",
  "evidence_verdict": "consistent",
  "case_type": "wrong_transfer",
  "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports sending 5000 BDT via TXN-9101 to +8801719876543, which they now believe was the wrong recipient.",
  "recommended_next_action": "Verify TXN-9101 details with the customer and initiate the wrong-transfer dispute workflow per policy.",
  "customer_reply": "We have noted your concern about transaction TXN-9101. Please do not share your PIN or OTP with anyone. Our dispute team will review the case and contact you through official support channels.",
  "human_review_required": true,
  "confidence": 0.9,
  "reason_codes": ["wrong_transfer", "transaction_match", "dispute_initiated"]
}
```

---

## How It Works

### Investigation Pipeline

```
Request → Validate → Classify → Match Transaction → Evidence Verdict
       → Severity → Department → Human Review Decision
       → Generate Summary + Action + Safe Reply → Validate Safety → Response
```

### Evidence Reasoning Approach

The service uses **deterministic rule-based reasoning** — no external LLM calls required, ensuring sub-100ms response times:

1. **Amount Extraction** — Extracts numbers from complaint text (supports Bengali digits: ০-৯)
2. **Day Reference** — Detects "today/yesterday/আজ/গতকাল" for time-based matching
3. **Transaction Scoring** — Scores each transaction: exact amount (+50), day match (+20), type match (+10), counterparty mention (+30)
4. **Ambiguity Detection** — If multiple equally-scored transactions exist with different counterparties → `relevant_transaction_id = null`, verdict = `insufficient_data`
5. **Established Recipient Pattern** — If 3+ prior transfers to the same counterparty on a "wrong transfer" claim → `inconsistent`
6. **Duplicate Detection** — Two identical payments (same amount + counterparty) within 120 seconds → `consistent` duplicate claim, second transaction flagged as duplicate

### Safety Guardrails

The `customer_reply` field is generated from pre-validated safe templates and validated post-generation against:

- **-15 pts** → Never requests PIN, OTP, password, or card number
- **-10 pts** → Uses "any eligible amount will be returned through official channels" instead of "we will refund you"
- **-10 pts** → Never directs to external phone numbers or URLs
- **Adversarial** → Complaint-embedded instructions are detected and ignored — output is always deterministic

### Language Support

- **English (`en`)** → Standard English replies
- **Bangla (`bn`)** → Full Bangla reply with Bengali-native number extraction (২০০০ → 2000)
- **Mixed** → English reply (best-effort)

### Case Routing Logic

| Case Type | Department | Severity | Human Review |
|-----------|-----------|----------|-------------|
| `wrong_transfer` | `dispute_resolution` | high | ✅ Always |
| `payment_failed` | `payments_ops` | high | ❌ Auto-reverse |
| `refund_request` | `customer_support` | low/medium | ❌ |
| `duplicate_payment` | `payments_ops` | high | ✅ Always |
| `merchant_settlement_delay` | `merchant_operations` | medium | ❌ |
| `agent_cash_in_issue` | `agent_operations` | high | ✅ If pending |
| `phishing_or_social_engineering` | `fraud_risk` | critical | ✅ Always |
| `other` | `customer_support` | low | ❌ |

---

## Running Tests

```bash
# Run all tests (10 sample cases + edge cases)
npm test

# Watch mode
npm run test:watch
```

---

## API Contract

### Required Input Fields
- `ticket_id` (string, required)
- `complaint` (string, required, non-empty)

### Optional Input Fields
- `language`: `en` | `bn` | `mixed` (default: `en`)
- `channel`: `in_app_chat` | `call_center` | `email` | `merchant_portal` | `field_agent`
- `user_type`: `customer` | `merchant` | `agent` | `unknown` (default: `unknown`)
- `campaign_context` (string)
- `transaction_history` (array of transaction objects)

### Required Output Fields (all 10)
`ticket_id`, `relevant_transaction_id`, `evidence_verdict`, `case_type`, `severity`, `department`, `agent_summary`, `recommended_next_action`, `customer_reply`, `human_review_required`

### HTTP Status Codes
- `200` — Successful analysis
- `400` — Missing required fields or invalid JSON
- `422` — Valid schema but semantic error (empty complaint)
- `500` — Internal error (no stack traces exposed)

---

## Limitations

- No persistent storage — stateless per request
- No LLM calls — pure deterministic logic (fast, predictable, free)
- Bangla parsing uses keyword matching and Unicode digit mapping (not full NLP)
- Time matching uses relative day references ("today"/"yesterday") — not clock-time matching

---

## Project Structure

```
queuestorm-investigator/
├── src/
│   ├── server.js        # Express routes and pipeline orchestration
│   ├── schemas.js       # Zod request/response schemas + all enums
│   ├── investigator.js  # Evidence reasoning engine
│   ├── classifier.js    # Case type, department, severity routing
│   ├── safety.js        # Safety guardrail validation
│   └── generator.js     # Safe reply and summary generation
├── tests/
│   ├── samples.test.js  # All 10 official sample cases
│   └── edge.test.js     # Edge cases, malformed input, adversarial
├── Dockerfile
├── .env.example
└── README.md
```
