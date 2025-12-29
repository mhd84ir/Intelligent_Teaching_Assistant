const express = require('express');
const router = express.Router();
const { askQuestion } = require('../services/ragService');
// Use SCALABLE RAG system (SQLite backend - handles 3000+ pages)
const scalableRAG = require('../services/scalableRAG');
const { logQuestion } = require('./admin');

// Conversation history for context (per session - simple in-memory)
const conversationHistory = new Map();
const MAX_HISTORY = 5;

/**
 * POST /api/ask
 * Ask a question and get an answer based on the slides
 * 
 * Request body:
 * {
 *   "question": "What is machine learning?",
 *   "sessionId": "optional-session-id",
 *   "useIntelligent": true  // Use scalable RAG system
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "answer": "...",
 *   "citations": [1, 2],
 *   "relevantSlides": [...]
 * }
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { question, sessionId, useIntelligent = true } = req.body;
    
    // Validate input
    if (!question || typeof question !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid "question" field in request body'
      });
    }
    
    if (question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Question cannot be empty'
      });
    }
    
    console.log(`\n📝 Received question: "${question}"`);
    console.log(`   Mode: ${useIntelligent ? 'Scalable RAG (SQLite)' : 'Legacy RAG'}`);
    
    let result;
    
    if (useIntelligent) {
      // Use scalable RAG system with SQLite backend
      
      // Get conversation history for this session
      const history = sessionId ? (conversationHistory.get(sessionId) || []) : [];
      
      result = await scalableRAG.intelligentRAG(question.trim(), history);
      
      // Update conversation history
      if (sessionId && result.answer) {
        const newHistory = [
          ...history, 
          { role: 'user', content: question.trim() },
          { role: 'assistant', content: result.answer }
        ];
        // Keep only last N exchanges
        while (newHistory.length > MAX_HISTORY * 2) newHistory.shift();
        conversationHistory.set(sessionId, newHistory);
      }
      
    } else {
      // Use legacy RAG service
      result = await askQuestion(question.trim());
    }
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Generated answer with ${result.citations?.length || 0} citation(s) [confidence: ${result.confidence}] in ${responseTime}ms`);
    
    // Log the question for admin panel
    logQuestion(question.trim(), responseTime, result.confidence, result.citations || []);
    
    res.json({
      success: true,
      question: question.trim(),
      answer: result.answer,
      citations: result.citations || [],
      confidence: result.confidence,
      warnings: result.warnings || [],
      relevantSlides: result.relevantSlides || [],
      keyPoints: result.keyPoints || [],
      additionalNotes: result.additionalNotes || '',
      responseTime
    });
    
  } catch (error) {
    console.error('❌ Error processing question:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process question',
      details: error.message
    });
  }
});

/**
 * POST /api/ask/clear-history
 * Clear conversation history for a session
 */
router.post('/clear-history', (req, res) => {
  const { sessionId } = req.body;
  
  if (sessionId) {
    conversationHistory.delete(sessionId);
  } else {
    conversationHistory.clear();
  }
  
  res.json({ success: true, message: 'History cleared' });
});

module.exports = router;
