/**
 * Test script for embedding service and similarity search
 * 
 * Run with: node src/scripts/testSimilaritySearch.js
 */

require('dotenv').config();
const {
  loadVectorStore,
  findSimilarSlides,
  searchSlides,
  getVectorStore
} = require('../services/embeddingService');

async function testSimilaritySearch() {
  console.log('🧪 Testing Similarity Search\n');
  console.log('='.repeat(50));
  
  // Load the vector store
  const loaded = loadVectorStore();
  if (!loaded) {
    console.error('❌ Could not load vector store. Run populateVectorStore.js first.');
    process.exit(1);
  }
  
  const store = getVectorStore();
  console.log(`\n📊 Vector store contains ${store.length} slides`);
  
  // Verify embedding dimensions
  console.log('\n📏 Embedding dimensions check:');
  for (const item of store) {
    const isValid = Array.isArray(item.embedding) && item.embedding.length === 1536;
    console.log(`   Slide ${item.slideNumber}: ${item.embedding.length} dimensions ${isValid ? '✅' : '❌'}`);
  }
  
  // Test with a dummy query (using the first slide's embedding as query)
  console.log('\n' + '='.repeat(50));
  console.log('🔍 Test 1: Using first slide embedding as query');
  console.log('='.repeat(50));
  
  const dummyQueryEmbedding = store[0].embedding;
  const results = findSimilarSlides(dummyQueryEmbedding, 3);
  
  console.log('\nTop 3 similar slides:');
  results.forEach((result, index) => {
    console.log(`\n${index + 1}. Slide ${result.slideNumber} (similarity: ${result.similarity.toFixed(4)})`);
    console.log(`   Preview: ${result.text.substring(0, 100)}...`);
  });
  
  // Test with actual text query (if API key is valid)
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
    console.log('\n' + '='.repeat(50));
    console.log('🔍 Test 2: Text query search');
    console.log('='.repeat(50));
    
    const testQueries = [
      'What is supervised learning?',
      'Tell me about neural networks',
      'How does clustering work?'
    ];
    
    for (const query of testQueries) {
      console.log(`\n📝 Query: "${query}"`);
      try {
        const searchResults = await searchSlides(query, 2);
        console.log('   Top results:');
        searchResults.forEach((result, index) => {
          console.log(`   ${index + 1}. Slide ${result.slideNumber} (similarity: ${result.similarity.toFixed(4)})`);
        });
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
    }
  }
  
  console.log('\n🎉 Test completed!');
}

testSimilaritySearch().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
