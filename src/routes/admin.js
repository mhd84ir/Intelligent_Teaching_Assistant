const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
  extractAndSaveSlides, 
  extractSlides,
  loadSlides, 
  loadKnowledgeBase, 
  saveKnowledgeBase,
  addToKnowledgeBase 
} = require('../services/pdfService');
const { 
  addSlide, 
  saveVectorStore, 
  loadVectorStore, 
  getEmbedding,
  addDocumentToKnowledge,
  removeDocumentFromKnowledge,
  saveKnowledgeVectorStore,
  loadKnowledgeVectorStore,
  getKnowledgeStats,
  clearKnowledgeVectorStore
} = require('../services/embeddingService');

// Import SCALABLE RAG system (optimized for 3000+ pages)
const scalableRAG = require('../services/scalableRAG');
const vectorDB = require('../services/vectorDatabase');

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
    fileSize: 100 * 1024 * 1024 // 100MB max for larger lecture PDFs
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

// ============================================
// Knowledge Base Multi-Document APIs
// ============================================

/**
 * POST /api/admin/knowledge/upload
 * Upload a PDF to the knowledge base (supports multiple documents)
 */
router.post('/knowledge/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded'
      });
    }

    console.log(`📤 Adding to Knowledge Base: ${req.file.originalname}`);

    const pdfPath = req.file.path;
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Extract slides from PDF
    console.log('📄 Extracting all slides from PDF...');
    const slides = await extractSlides(pdfPath);
    
    console.log(`📊 Extracted ${slides.length} slides from ${req.file.originalname}`);

    // Add to knowledge base with progress
    console.log('🔢 Generating embeddings for all slides...');
    const processedCount = await addDocumentToKnowledge(
      docId, 
      req.file.originalname, 
      slides,
      (current, total, slideNum) => {
        console.log(`   Processing slide ${current}/${total} (slide #${slideNum})...`);
      }
    );

    // Save knowledge vector store
    saveKnowledgeVectorStore();
    console.log('💾 Knowledge base saved');

    // Get updated stats
    const stats = getKnowledgeStats();

    res.json({
      success: true,
      message: `Successfully added ${processedCount} slides from ${req.file.originalname}`,
      documentId: docId,
      slidesCount: processedCount,
      totalDocuments: stats.totalDocuments,
      totalSlides: stats.totalSlides
    });

  } catch (error) {
    console.error('❌ Knowledge upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/knowledge/stats
 * Get knowledge base statistics
 */
router.get('/knowledge/stats', (req, res) => {
  try {
    loadKnowledgeVectorStore();
    const stats = getKnowledgeStats();
    
    // Add question logs stats
    const today = new Date().toISOString().split('T')[0];
    const questionsToday = questionLogs.filter(log => 
      log.timestamp.startsWith(today)
    ).length;

    res.json({
      ...stats,
      questionsToday,
      totalQuestions: questionLogs.length,
      avgResponseTime: questionLogs.length > 0
        ? Math.round(questionLogs.reduce((sum, log) => sum + log.responseTime, 0) / questionLogs.length)
        : 0
    });

  } catch (error) {
    console.error('❌ Knowledge stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/knowledge/documents
 * List all documents in the knowledge base
 */
router.get('/knowledge/documents', (req, res) => {
  try {
    loadKnowledgeVectorStore();
    const stats = getKnowledgeStats();
    
    res.json({
      success: true,
      documents: stats.documents,
      totalSlides: stats.totalSlides
    });

  } catch (error) {
    console.error('❌ List documents error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/knowledge/documents/:docId
 * Remove a document from the knowledge base
 */
router.delete('/knowledge/documents/:docId', (req, res) => {
  try {
    const { docId } = req.params;
    
    loadKnowledgeVectorStore();
    const removed = removeDocumentFromKnowledge(docId);
    
    if (!removed) {
      return res.status(404).json({
        success: false,
        error: `Document ${docId} not found`
      });
    }
    
    saveKnowledgeVectorStore();
    const stats = getKnowledgeStats();
    
    res.json({
      success: true,
      message: `Document ${docId} removed`,
      totalDocuments: stats.totalDocuments,
      totalSlides: stats.totalSlides
    });

  } catch (error) {
    console.error('❌ Delete document error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/knowledge/clear
 * Clear entire knowledge base
 */
router.delete('/knowledge/clear', (req, res) => {
  try {
    clearKnowledgeVectorStore();
    saveKnowledgeVectorStore();
    
    // Also clear PDFs folder
    const pdfsDir = path.join(__dirname, '../../pdfs');
    if (fs.existsSync(pdfsDir)) {
      const files = fs.readdirSync(pdfsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(pdfsDir, file));
      }
    }
    
    res.json({
      success: true,
      message: 'Knowledge base cleared'
    });

  } catch (error) {
    console.error('❌ Clear knowledge error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// Smart Knowledge Base APIs (SCALABLE - SQLite Backend)
// ============================================

/**
 * POST /api/admin/smart/upload
 * Upload a PDF to the scalable knowledge base (SQLite)
 */
router.post('/smart/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No PDF file uploaded'
      });
    }

    console.log(`📤 Adding to Scalable Knowledge Base: ${req.file.originalname}`);

    const pdfPath = req.file.path;
    const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Extract slides from PDF (force page-based for accuracy)
    console.log('📄 Extracting all pages from PDF...');
    const slides = await extractSlides(pdfPath, true); // Force page-based
    
    console.log(`📊 Extracted ${slides.length} pages from ${req.file.originalname}`);

    // Add to SQLite-backed knowledge base
    console.log('🧠 Processing with SQLite vector database...');
    const result = await scalableRAG.addDocumentToStore(
      docId, 
      req.file.originalname, 
      slides
    );

    // Get updated stats
    const stats = await scalableRAG.getStoreStats();

    res.json({
      success: true,
      message: `Successfully processed ${slides.length} slides into ${result.chunksCreated} chunks`,
      documentId: docId,
      slidesCount: slides.length,
      chunksCount: result.chunksCreated,
      totalDocuments: stats.totalDocuments,
      totalChunks: stats.totalChunks,
      databaseSizeMB: stats.databaseSizeMB
    });

  } catch (error) {
    console.error('❌ Smart upload error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/smart/stats
 * Get scalable knowledge base statistics
 */
router.get('/smart/stats', async (req, res) => {
  try {
    const stats = await scalableRAG.getStoreStats();
    
    // Add question logs stats
    const today = new Date().toISOString().split('T')[0];
    const questionsToday = questionLogs.filter(log => 
      log.timestamp.startsWith(today)
    ).length;

    res.json({
      ...stats,
      questionsToday,
      totalQuestions: questionLogs.length,
      avgResponseTime: questionLogs.length > 0
        ? Math.round(questionLogs.reduce((sum, log) => sum + log.responseTime, 0) / questionLogs.length)
        : 0
    });

  } catch (error) {
    console.error('❌ Smart stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/smart/documents
 * List all documents in scalable knowledge base
 */
router.get('/smart/documents', async (req, res) => {
  try {
    const stats = await scalableRAG.getStoreStats();
    
    res.json({
      success: true,
      documents: stats.documents,
      totalChunks: stats.totalChunks,
      databaseSizeMB: stats.databaseSizeMB
    });

  } catch (error) {
    console.error('❌ List smart documents error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/smart/documents/:docId
 * Remove a document from scalable knowledge base
 */
router.delete('/smart/documents/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    
    await scalableRAG.deleteDocument(docId);
    const stats = await scalableRAG.getStoreStats();
    
    res.json({
      success: true,
      message: `Document ${docId} removed`,
      totalDocuments: stats.totalDocuments,
      totalChunks: stats.totalChunks
    });

  } catch (error) {
    console.error('❌ Delete smart document error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/smart/clear
 * Clear entire scalable knowledge base
 */
router.delete('/smart/clear', async (req, res) => {
  try {
    await scalableRAG.clearStore();
    
    // Also clear PDFs folder
    const pdfsDir = path.join(__dirname, '../../pdfs');
    if (fs.existsSync(pdfsDir)) {
      const files = fs.readdirSync(pdfsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(pdfsDir, file));
      }
    }
    
    res.json({
      success: true,
      message: 'Scalable knowledge base cleared'
    });

  } catch (error) {
    console.error('❌ Clear smart knowledge error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/smart/migrate
 * Migrate from old JSON store to SQLite
 */
router.post('/smart/migrate', async (req, res) => {
  try {
    console.log('🔄 Starting migration from JSON to SQLite...');
    const result = await scalableRAG.migrateFromOldStore();
    
    res.json({
      success: true,
      message: `Migration complete: ${result.migrated} documents, ${result.chunks || 0} chunks`,
      ...result
    });

  } catch (error) {
    console.error('❌ Migration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Export both router and logQuestion function
module.exports = {
  router,
  logQuestion
};
