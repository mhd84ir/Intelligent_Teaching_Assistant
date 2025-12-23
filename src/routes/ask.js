const express = require('express');
const router = express.Router();
const { askQuestion } = require('../services/ragService');
const { logQuestion } = require('./admin');

/**
 * POST /api/ask
 * Ask a question and get an answer based on the slides
 * 
 * Request body:
 * {
 *   "question": "What is machine learning?"
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
    const { question } = req.body;
    
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
    
    console.log(`📝 Received question: "${question}"`);
    
    // Get answer from RAG service
    const result = await askQuestion(question.trim());
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ Generated answer with ${result.citations.length} citation(s) [confidence: ${result.confidence}] in ${responseTime}ms`);
    
    // Log the question for admin panel
    logQuestion(question.trim(), responseTime, result.confidence, result.citations);
    
    res.json({
      success: true,
      question: question.trim(),
      answer: result.answer,
      citations: result.citations,
      confidence: result.confidence,
      warnings: result.warnings,
      relevantSlides: result.relevantSlides
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

module.exports = router;
