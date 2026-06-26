// tests/security.test.js
// Comprehensive API Security Testing Suite
// Covers Input Validation, DoS (Resource Exhaustion), Method Tampering, and Information Disclosure

const request = require('supertest');
const app = require('../src/server');

describe('API Security - Method Tampering', () => {
  const methods = ['put', 'delete', 'patch'];

  for (const method of methods) {
    it(`rejects ${method.toUpperCase()} requests to /analyze-ticket with 405`, async () => {
      const res = await request(app)[method]('/analyze-ticket');
      expect(res.status).toBe(405);
      expect(res.body.error).toBe('Method Not Allowed');
    });
  }

  it('rejects GET requests to /analyze-ticket with 405', async () => {
    const res = await request(app).get('/analyze-ticket');
    expect(res.status).toBe(405);
  });
});

describe('API Security - Input Validation & Fuzzing', () => {
  it('returns 400 Bad Request for malformed JSON syntax', async () => {
    const res = await request(app)
      .post('/analyze-ticket')
      .set('Content-Type', 'application/json')
      .send('{ "ticket_id": "TKT-01", "complaint": "Missing closing brace" '); // Deliberate syntax error

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad Request');
    expect(res.body.message).toBe('Invalid JSON payload format');
    // Ensure no stack trace is leaked
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules/i);
  });

  it('handles null byte injection gracefully', async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-NULL\u0000BYTE',
      complaint: 'I sent money \u0000 to the wrong person'
    });
    
    // Zod accepts it, but ensures the system doesn't crash.
    expect(res.status).toBe(200);
    expect(res.body.ticket_id).toBe('TKT-NULL\u0000BYTE');
  });

  it('rejects type juggling (array instead of string)', async () => {
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: ['TKT-01'], // should be string
      complaint: 'Testing array injection'
    });
    
    expect([400, 422]).toContain(res.status);
  });
});

describe('API Security - Resource Exhaustion (DoS)', () => {
  it('rejects excessively large complaint strings (Regex DOS protection)', async () => {
    // 6000 characters
    const massiveString = 'A'.repeat(6000);
    
    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-DOS-01',
      complaint: massiveString
    });
    
    expect([400, 422]).toContain(res.status);
    expect(JSON.stringify(res.body)).toMatch(/too long/i);
  });

  it('rejects massive transaction_history arrays (CPU exhaustion protection)', async () => {
    const massiveTransactions = [];
    for (let i = 0; i < 200; i++) { // Limit is 100
      massiveTransactions.push({
        transaction_id: `TXN-${i}`,
        timestamp: '2026-06-26T12:00:00Z',
        type: 'transfer',
        amount: 500,
        counterparty: '+8801700000000',
        status: 'completed'
      });
    }

    const res = await request(app).post('/analyze-ticket').send({
      ticket_id: 'TKT-DOS-02',
      complaint: 'I sent money to wrong person',
      transaction_history: massiveTransactions
    });

    expect([400, 422]).toContain(res.status);
    expect(JSON.stringify(res.body)).toMatch(/too large/i);
  });
});
