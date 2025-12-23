const express = require('express');
const router = express.Router();
const { askQuestion } = require('../services/ragService');

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
    
    console.log(`✅ Generated answer with ${result.citations.length} citation(s)`);
    
    res.json({
      success: true,
      question: question.trim(),
      answer: result.answer,
      citations: result.citations,
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
