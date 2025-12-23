/**
 * Populate Vector Store Script
 * 
 * This script loads slides from slides.json, generates embeddings using OpenAI,
 * and saves the results to vectorStore.json for later retrieval.
 * 
 * Run with: node src/scripts/populateVectorStore.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  getEmbedding,
  addSlide,
  saveVectorStore,
  clearVectorStore,
  getVectorStore,
  sleep
} = require('../services/embeddingService');

const DATA_DIR = path.join(__dirname, '../../data');
const SLIDES_PATH = path.join(DATA_DIR, 'slides.json');
const DELAY_MS = 500; // Delay between API calls to avoid rate limits

async function populateVectorStore() {
  console.log('🚀 Starting vector store population...\n');
  
  // Check if slides.json exists
  if (!fs.existsSync(SLIDES_PATH)) {
    console.error('❌ slides.json not found. Please run pdfService first.');
    console.log('   Expected path:', SLIDES_PATH);
    process.exit(1);
  }
  
  // Load slides
  const slidesData = fs.readFileSync(SLIDES_PATH, 'utf-8');
  const slides = JSON.parse(slidesData);
  console.log(`📖 Loaded ${slides.length} slides from slides.json\n`);
  
  // Clear existing vector store
  clearVectorStore();
  
  // Process each slide
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    console.log(`🔄 Processing slide ${slide.slideNumber}/${slides.length}...`);
    
    try {
      // Generate embedding
      const embedding = await getEmbedding(slide.text);
      
      // Add to vector store
      addSlide(slide.slideNumber, slide.text, embedding);
      
      console.log(`   ✅ Embedding generated (${embedding.length} dimensions)`);
      
      // Add delay between requests to avoid rate limits
      if (i < slides.length - 1) {
        await sleep(DELAY_MS);
      }
    } catch (error) {
      console.error(`   ❌ Error processing slide ${slide.slideNumber}:`, error.message);
      process.exit(1);
    }
  }
  
  // Save vector store
  console.log('\n💾 Saving vector store...');
  saveVectorStore();
  
  // Verify the saved file
  const vectorStore = getVectorStore();
  console.log(`\n✅ Vector store populated with ${vectorStore.length} slides`);
  
  // Print summary
  console.log('\n📊 Summary:');
  vectorStore.forEach(item => {
    console.log(`   Slide ${item.slideNumber}: ${item.embedding.length} dimensions`);
  });
  
  console.log('\n🎉 Done!');
}

populateVectorStore().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
