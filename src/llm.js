// src/llm.js
// Integration with Google Gemini for Hybrid Rule + AI Engine
// Handles intent classification and natural language drafting.

const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;

// Initialize the API only if the key is provided
if (process.env.GEMINI_API_KEY) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

const MODEL_NAME = 'gemini-2.5-flash';
const TIMEOUT_MS = 3000; // Fast timeout for hackathon reliability

// Helper to race API calls against a strict timeout
async function withTimeout(promise, ms) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('LLM Timeout')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutHandle));
}

/**
 * Uses Gemini to understand the complaint and extract the precise case type.
 * Throws an error if API key is missing or call fails, allowing fallback to Regex.
 */
async function classifyIntent(complaint) {
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { temperature: 0.0 },
    systemInstruction: `You are a financial investigator API. Classify the user's complaint into EXACTLY one of these case types:
- phishing_or_social_engineering
- agent_cash_in_issue
- merchant_settlement_delay
- duplicate_payment
- payment_failed
- wrong_transfer
- refund_request
- other

Respond ONLY with the exact case type string. Do not include markdown, quotes, or any other text.`
  });

  const result = await withTimeout(model.generateContent(complaint), TIMEOUT_MS);
  const text = result.response.text().trim();
  
  const validTypes = [
    'phishing_or_social_engineering', 'agent_cash_in_issue', 'merchant_settlement_delay',
    'duplicate_payment', 'payment_failed', 'wrong_transfer', 'refund_request', 'other'
  ];

  if (!validTypes.includes(text)) {
    throw new Error(`LLM returned invalid case type: ${text}`);
  }

  return text;
}

/**
 * Uses Gemini to draft a natural, professional summary and customer reply.
 * Throws an error if API key is missing or call fails, allowing fallback to deterministic templates.
 */
async function draftResponses(complaint, caseType, evidenceVerdict, matchedTxn, language, userType) {
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { 
      temperature: 0.0,
      responseMimeType: "application/json" 
    },
    systemInstruction: `You are a customer support AI for a mobile financial service.
Given the investigation details, draft two strings:
1. "agent_summary": A factual 1-sentence summary for the internal human agent. Include the transaction ID and amount if available.
2. "customer_reply": A professional response to the customer in their language (${language === 'bn' ? 'Bengali' : 'English'}).
   CRITICAL SAFETY RULE: You MUST append this exact sentence at the end of the customer_reply: "Please do not share your PIN or OTP with anyone." (Translate to Bengali if language is bn: "অনুগ্রহ করে আপনার পিন বা ওটিপি কারও সাথে শেয়ার করবেন না।")
   You MUST NEVER promise a refund.
   ANTI-HALLUCINATION RULE: You MUST NOT invent, guess, or hallucinate any transaction IDs, amounts, names, or facts not strictly provided in the prompt. If information is missing, speak generally.

Return a JSON object exactly like this:
{"agent_summary": "...", "customer_reply": "..."}`
  });

  const prompt = `
Complaint: "${complaint}"
Case Type: ${caseType}
Evidence Verdict: ${evidenceVerdict}
Matched Transaction: ${matchedTxn ? JSON.stringify(matchedTxn) : 'None'}
User Type: ${userType}
`;

  const result = await withTimeout(model.generateContent(prompt), TIMEOUT_MS + 2000); // 5s total for drafting
  const text = result.response.text();
  
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Failed to parse LLM JSON response');
  }
}

module.exports = {
  classifyIntent,
  draftResponses
};
