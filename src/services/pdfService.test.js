/**
 * Test script for pdfService
 * Run with: node src/services/pdfService.test.js
 */

const path = require('path');
const { extractAndSaveSlides } = require('./pdfService');

const PDF_PATH = path.join(__dirname, '../../data/slides.pdf');

async function testExtractSlides() {
  console.log('🧪 Testing PDF Slide Extraction\n');
  console.log('='.repeat(50));
  
  try {
    const slides = await extractAndSaveSlides(PDF_PATH);
    
    console.log('\n' + '='.repeat(50));
    console.log('📋 EXTRACTION RESULTS:');
    console.log('='.repeat(50));
    console.log(`Total slides extracted: ${slides.length}\n`);
    
    // Print first two slides
    const previewCount = Math.min(2, slides.length);
    console.log(`📖 Preview of first ${previewCount} slide(s):\n`);
    
    for (let i = 0; i < previewCount; i++) {
      const slide = slides[i];
      console.log('-'.repeat(50));
      console.log(`📌 Slide ${slide.slideNumber}:`);
      console.log('-'.repeat(50));
      
      // Truncate long text for display
      const displayText = slide.text.length > 500 
        ? slide.text.substring(0, 500) + '...[truncated]'
        : slide.text;
      
      console.log(displayText);
      console.log('\n');
    }
    
    // Validation checks
    console.log('='.repeat(50));
    console.log('✅ VALIDATION CHECKS:');
    console.log('='.repeat(50));
    
    let allValid = true;
    
    for (const slide of slides) {
      const hasNumber = typeof slide.slideNumber === 'number' && slide.slideNumber > 0;
      const hasText = typeof slide.text === 'string' && slide.text.length > 0;
      const noExcessiveWhitespace = !/\s{3,}/.test(slide.text);
      
      if (!hasNumber || !hasText) {
        console.log(`❌ Slide ${slide.slideNumber}: Invalid structure`);
        allValid = false;
      }
      
      if (!noExcessiveWhitespace) {
        console.log(`⚠️ Slide ${slide.slideNumber}: Contains excessive whitespace`);
      }
    }
    
    if (allValid) {
      console.log('✅ All slides have valid structure (number + text)');
    }
    
    console.log('\n🎉 Test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure you have placed a PDF file at: ./data/slides.pdf');
    process.exit(1);
  }
}

testExtractSlides();
