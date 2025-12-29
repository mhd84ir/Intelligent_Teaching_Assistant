const fs = require('fs');
const path = require('path');
const { PDFParse, VerbosityLevel } = require('pdf-parse');

const DATA_DIR = path.join(__dirname, '../../data');
const SLIDES_JSON_PATH = path.join(DATA_DIR, 'slides.json');
const KNOWLEDGE_BASE_PATH = path.join(DATA_DIR, 'knowledgeBase.json');

/**
 * Extract text from a PDF file - processes ALL pages without limit
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<{text: string, numPages: number, pageTexts: string[]}>}
 */
async function extractTextFromPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  
  const parser = new PDFParse({
    data: dataBuffer,
    verbosity: VerbosityLevel.ERRORS
  });
  
  // First get info to know total pages
  const info = await parser.getInfo();
  const totalPages = info.total;
  
  console.log(`📊 PDF has ${totalPages} total pages - processing ALL pages...`);
  
  // Get text from ALL pages (no first/last limit means all pages)
  const result = await parser.getText({
    lineEnforce: true,
    cellSeparator: ' '
    // Removed first/last to process ALL pages
  });
  
  // Extract page texts
  const pageTexts = result.pages.map(page => page.text.trim());
  const fullText = pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
  
  console.log(`✅ Successfully extracted ${pageTexts.length} pages`);
  
  await parser.destroy();
  
  return {
    text: fullText,
    numPages: result.total,
    pageTexts: pageTexts
  };
}

/**
 * Clean and normalize text
 * @param {string} text - Raw text to clean
 * @returns {string} - Cleaned text
 */
function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\n{3,}/g, '\n\n')       // Remove excessive newlines
    .replace(/[ \t]+/g, ' ')          // Normalize spaces
    .replace(/^\s+|\s+$/gm, '')       // Trim each line
    .trim();
}

/**
 * Split text by "Slide X" pattern
 * @param {string} text - Full PDF text
 * @returns {Array<{slideNumber: number, text: string}>|null}
 */
function splitBySlideMarker(text) {
  // Pattern to match "Slide 1", "Slide 2", etc. (case insensitive)
  const slidePattern = /(?:^|\n)\s*(?:Slide\s*(\d+)|(\d+)\s*[.\-:]\s*(?=[A-Z]))/gi;
  
  const matches = [...text.matchAll(slidePattern)];
  
  if (matches.length < 2) {
    return null; // Not enough slide markers found
  }
  
  const slides = [];
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const slideNumber = parseInt(match[1] || match[2], 10);
    const startIndex = match.index;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index : text.length;
    
    // Clean the text and remove page break markers
    let slideText = text.slice(startIndex, endIndex);
    slideText = slideText.replace(/---\s*PAGE\s*BREAK\s*---/gi, '');
    slideText = cleanText(slideText);
    
    if (slideText) {
      slides.push({
        slideNumber: slideNumber,
        text: slideText
      });
    }
  }
  
  return slides.length > 0 ? slides : null;
}

/**
 * Split by pages (fallback method)
 * @param {string[]} pageTexts - Array of text per page
 * @returns {Array<{slideNumber: number, text: string}>}
 */
function splitByPages(pageTexts) {
  return pageTexts
    .map((text, index) => ({
      slideNumber: index + 1,
      text: cleanText(text)
    }))
    .filter(slide => slide.text.length > 0); // Remove empty slides
}

/**
 * Extract slides from a PDF file
 * @param {string} pdfPath - Path to the PDF file (default: ./data/slides.pdf)
 * @param {boolean} forcePageBased - Force page-based splitting instead of pattern matching
 * @returns {Promise<Array<{slideNumber: number, text: string}>>}
 */
async function extractSlides(pdfPath = path.join(DATA_DIR, 'slides.pdf'), forcePageBased = false) {
  // Check if file exists
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }
  
  console.log(`📄 Reading PDF from: ${pdfPath}`);
  
  const { text, numPages, pageTexts } = await extractTextFromPDF(pdfPath);
  
  console.log(`📊 PDF has ${numPages} pages`);
  
  let slides;
  
  // Force page-based splitting for large documents or when requested
  if (forcePageBased || numPages > 50) {
    console.log(`📝 Using page-based splitting (${numPages} pages)`);
    slides = splitByPages(pageTexts);
    console.log(`✅ Created ${slides.length} slides from ${numPages} pages`);
  } else {
    // Try to split by "Slide X" markers first
    slides = splitBySlideMarker(text);
    
    if (slides && slides.length > 0) {
      console.log(`✅ Found ${slides.length} slides using "Slide X" pattern`);
    } else {
      // Fallback to page-based splitting
      console.log(`⚠️ No "Slide X" markers found, falling back to page-based splitting`);
      slides = splitByPages(pageTexts);
      console.log(`✅ Created ${slides.length} slides from ${numPages} pages`);
    }
  }
  
  return slides;
}

/**
 * Extract slides and save to JSON file
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} outputPath - Path for output JSON (default: ./data/slides.json)
 * @returns {Promise<Array<{slideNumber: number, text: string}>>}
 */
async function extractAndSaveSlides(pdfPath, outputPath = SLIDES_JSON_PATH) {
  const slides = await extractSlides(pdfPath);
  
  // Ensure data directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save to JSON
  fs.writeFileSync(outputPath, JSON.stringify(slides, null, 2), 'utf-8');
  console.log(`💾 Saved ${slides.length} slides to: ${outputPath}`);
  
  return slides;
}

/**
 * Load previously extracted slides from JSON
 * @param {string} jsonPath - Path to the JSON file
 * @returns {Array<{slideNumber: number, text: string}>}
 */
function loadSlides(jsonPath = SLIDES_JSON_PATH) {
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`Slides JSON not found: ${jsonPath}. Run extractAndSaveSlides() first.`);
  }
  
  const data = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(data);
}

// ============================================
// Knowledge Base Management (Multi-PDF Support)
// ============================================

/**
 * Load the knowledge base
 * @returns {Object} Knowledge base object
 */
function loadKnowledgeBase() {
  if (!fs.existsSync(KNOWLEDGE_BASE_PATH)) {
    return {
      documents: [],
      totalSlides: 0,
      lastUpdated: null
    };
  }
  const data = fs.readFileSync(KNOWLEDGE_BASE_PATH, 'utf-8');
  return JSON.parse(data);
}

/**
 * Save the knowledge base
 * @param {Object} kb - Knowledge base object
 */
function saveKnowledgeBase(kb) {
  const outputDir = path.dirname(KNOWLEDGE_BASE_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  kb.lastUpdated = new Date().toISOString();
  fs.writeFileSync(KNOWLEDGE_BASE_PATH, JSON.stringify(kb, null, 2), 'utf-8');
  console.log(`💾 Knowledge base saved with ${kb.documents.length} documents`);
}

/**
 * Add a document to the knowledge base
 * @param {string} pdfPath - Path to the PDF file
 * @param {string} originalName - Original filename
 * @returns {Promise<Object>} Document info
 */
async function addToKnowledgeBase(pdfPath, originalName) {
  const kb = loadKnowledgeBase();
  
  // Extract slides from PDF
  const slides = await extractSlides(pdfPath);
  
  // Generate unique document ID
  const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Calculate global slide number offset
  const slideOffset = kb.totalSlides;
  
  // Add document info with slide offset
  const docInfo = {
    id: docId,
    filename: originalName,
    pdfPath: pdfPath,
    addedAt: new Date().toISOString(),
    slideCount: slides.length,
    slideRange: {
      start: slideOffset + 1,
      end: slideOffset + slides.length
    }
  };
  
  // Map slides with global numbering
  const globalSlides = slides.map((slide, index) => ({
    slideNumber: slideOffset + index + 1,
    localSlideNumber: slide.slideNumber,
    documentId: docId,
    documentName: originalName,
    text: slide.text
  }));
  
  kb.documents.push(docInfo);
  kb.totalSlides += slides.length;
  
  saveKnowledgeBase(kb);
  
  return {
    docInfo,
    slides: globalSlides
  };
}

/**
 * Remove a document from the knowledge base
 * @param {string} docId - Document ID to remove
 * @returns {boolean} True if removed
 */
function removeFromKnowledgeBase(docId) {
  const kb = loadKnowledgeBase();
  const index = kb.documents.findIndex(d => d.id === docId);
  
  if (index === -1) {
    return false;
  }
  
  const removedDoc = kb.documents.splice(index, 1)[0];
  kb.totalSlides -= removedDoc.slideCount;
  
  // Recalculate slide ranges for remaining documents
  let offset = 0;
  for (const doc of kb.documents) {
    doc.slideRange = {
      start: offset + 1,
      end: offset + doc.slideCount
    };
    offset += doc.slideCount;
  }
  
  saveKnowledgeBase(kb);
  return true;
}

/**
 * Get all slides from knowledge base
 * @returns {Array} All slides with global numbering
 */
function getAllKnowledgeBaseSlides() {
  const kb = loadKnowledgeBase();
  const allSlides = [];
  
  for (const doc of kb.documents) {
    try {
      // Load slides from the stored PDF
      const { pageTexts } = extractTextFromPDFSync(doc.pdfPath);
      const slides = splitByPages(pageTexts);
      
      slides.forEach((slide, index) => {
        allSlides.push({
          slideNumber: doc.slideRange.start + index,
          localSlideNumber: slide.slideNumber,
          documentId: doc.id,
          documentName: doc.filename,
          text: slide.text
        });
      });
    } catch (error) {
      console.error(`Error loading slides from ${doc.filename}:`, error.message);
    }
  }
  
  return allSlides;
}

/**
 * Synchronous version for knowledge base loading (uses cached JSON)
 */
function extractTextFromPDFSync(pdfPath) {
  // This is a placeholder - in practice, slides are cached in knowledgeBase
  // and we reload from there, not from PDF
  throw new Error('Use async version or load from cache');
}

module.exports = {
  extractSlides,
  extractAndSaveSlides,
  loadSlides,
  extractTextFromPDF,
  cleanText,
  // Knowledge Base exports
  loadKnowledgeBase,
  saveKnowledgeBase,
  addToKnowledgeBase,
  removeFromKnowledgeBase,
  getAllKnowledgeBaseSlides,
  KNOWLEDGE_BASE_PATH
};
