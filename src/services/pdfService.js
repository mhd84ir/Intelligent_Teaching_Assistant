const fs = require('fs');
const path = require('path');
const { PDFParse, VerbosityLevel } = require('pdf-parse');

const DATA_DIR = path.join(__dirname, '../../data');
const SLIDES_JSON_PATH = path.join(DATA_DIR, 'slides.json');

/**
 * Extract text from a PDF file
 * @param {string} pdfPath - Path to the PDF file
 * @returns {Promise<{text: string, numPages: number, pageTexts: string[]}>}
 */
async function extractTextFromPDF(pdfPath) {
  const dataBuffer = fs.readFileSync(pdfPath);
  
  const parser = new PDFParse({
    data: dataBuffer,
    verbosity: VerbosityLevel.ERRORS
  });
  
  // Get text with page information
  const result = await parser.getText({
    lineEnforce: true,
    cellSeparator: ' '
  });
  
  // Extract page texts
  const pageTexts = result.pages.map(page => page.text.trim());
  const fullText = pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
  
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
 * @returns {Promise<Array<{slideNumber: number, text: string}>>}
 */
async function extractSlides(pdfPath = path.join(DATA_DIR, 'slides.pdf')) {
  // Check if file exists
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }
  
  console.log(`📄 Reading PDF from: ${pdfPath}`);
  
  const { text, numPages, pageTexts } = await extractTextFromPDF(pdfPath);
  
  console.log(`📊 PDF has ${numPages} pages`);
  
  // Try to split by "Slide X" markers first
  let slides = splitBySlideMarker(text);
  
  if (slides) {
    console.log(`✅ Found ${slides.length} slides using "Slide X" pattern`);
  } else {
    // Fallback to page-based splitting
    console.log(`⚠️ No "Slide X" markers found, falling back to page-based splitting`);
    slides = splitByPages(pageTexts);
    console.log(`✅ Created ${slides.length} slides from ${numPages} pages`);
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

module.exports = {
  extractSlides,
  extractAndSaveSlides,
  loadSlides,
  extractTextFromPDF,
  cleanText
};
