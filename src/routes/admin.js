const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractAndSaveSlides, loadSlides } = require('../services/pdfService');
const { addSlide, saveVectorStore, loadVectorStore, getEmbedding } = require('../services/embeddingService');

// Configure multer for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../pdfs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Keep original name or use timestamp
    const uniqueName = `upload_${Date.now()}_${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB max
  }
});

// In-memory question logs (could be persisted to file/database)
const questionLogs = [];
const MAX_LOGS = 100;

/**
 * Add a question to the log
 */
function logQuestion(question, responseTime, confidence, citations) {
  questionLogs.unshift({
    timestamp: new Date().toISOString(),
    question,
    responseTime,
    confidence,
    citations
  });
  
  // Keep only last MAX_LOGS entries
  if (questionLogs.length > MAX_LOGS) {
    questionLogs.pop();
  }
}

/**
 * POST /api/admin/upload
 * Upload a new PDF and process it
 */
router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded'
      });
    }

    console.log(`📤 Received PDF upload: ${req.file.originalname}`);

    const pdfPath = req.file.path;
    
    // Extract slides from PDF
    console.log('📄 Extracting slides from PDF...');
    const slides = await extractAndSaveSlides(pdfPath);
    
    console.log(`📊 Extracted ${slides.length} slides`);

    // Generate embeddings for each slide
    console.log('🔢 Generating embeddings...');
    for (const slide of slides) {
      console.log(`   Processing slide ${slide.slideNumber}...`);
      const embedding = await getEmbedding(slide.text);
      addSlide(slide.slideNumber, slide.text, embedding);
    }

    // Save vector store
    saveVectorStore();
    console.log('💾 Vector store saved');

    res.json({
      success: true,
      message: `Successfully processed ${slides.length} slides from ${req.file.originalname}`,
      slidesCount: slides.length
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/stats
 * Get system statistics
 */
router.get('/stats', (req, res) => {
  try {
    // Load current data
    const slides = loadSlides();
    loadVectorStore();

    // Calculate stats
    const today = new Date().toISOString().split('T')[0];
    const questionsToday = questionLogs.filter(log => 
      log.timestamp.startsWith(today)
    ).length;

    const avgResponseTime = questionLogs.length > 0
      ? Math.round(questionLogs.reduce((sum, log) => sum + log.responseTime, 0) / questionLogs.length)
      : 0;

    res.json({
      totalSlides: slides.length,
      questionsToday,
      totalQuestions: questionLogs.length,
      avgResponseTime,
      vectorDimensions: 1536
    });

  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/reindex
 * Re-index all slides from the current slides.json
 */
router.post('/reindex', async (req, res) => {
  try {
    console.log('🔄 Starting re-indexing...');
    
    const slides = loadSlides();
    
    if (slides.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No slides found to index'
      });
    }

    // Clear and rebuild vector store
    for (const slide of slides) {
      console.log(`   Processing slide ${slide.slideNumber}...`);
      const embedding = await getEmbedding(slide.text);
      addSlide(slide.slideNumber, slide.text, embedding);
    }

    saveVectorStore();
    console.log('✅ Re-indexing complete');

    res.json({
      success: true,
      message: `Re-indexed ${slides.length} slides`,
      slidesCount: slides.length
    });

  } catch (error) {
    console.error('❌ Re-index error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/logs
 * Get recent question logs
 */
router.get('/logs', (req, res) => {
  res.json(questionLogs);
});

/**
 * DELETE /api/admin/logs
 * Clear all question logs
 */
router.delete('/logs', (req, res) => {
  questionLogs.length = 0;
  res.json({ success: true, message: 'Logs cleared' });
});

// Export both router and logQuestion function
module.exports = {
  router,
  logQuestion
};
