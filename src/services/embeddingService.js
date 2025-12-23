require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Configuration from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

// Initialize OpenAI client (supports custom base URL for Liara or other providers)
const config = { apiKey: OPENAI_API_KEY };
if (OPENAI_BASE_URL) {
  config.baseURL = OPENAI_BASE_URL;
}
const openai = new OpenAI(config);
console.log(`🔗 OpenAI client configured with base URL: ${OPENAI_BASE_URL || 'default'}`);

const DATA_DIR = path.join(__dirname, '../../data');
const VECTOR_STORE_PATH = path.join(DATA_DIR, 'vectorStore.json');

// Embedding dimensions for text-embedding-3-small
const EMBEDDING_DIMENSIONS = 1536;

// In-memory vector store
let vectorStore = [];

/**
 * Generate embedding for a text using OpenAI's embedding model
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} - The embedding vector (1536 dimensions)
 */
async function getEmbedding(text) {
  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
      encoding_format: 'float'
    });
    
    return response.data[0].embedding;
  } catch (error) {
    if (error.status === 429) {
      console.log('⏳ Rate limited, waiting 5 seconds...');
      await sleep(5000);
      return getEmbedding(text); // Retry
    }
    throw error;
  }
}

/**
 * Sleep utility for rate limiting
 * @param {number} ms - Milliseconds to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Add a slide to the vector store
 * @param {number} slideNumber - The slide number
 * @param {string} text - The slide text
 * @param {number[]} embedding - The embedding vector
 */
function addSlide(slideNumber, text, embedding) {
  vectorStore.push({
    slideNumber,
    text,
    embedding
  });
}

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} - Cosine similarity (-1 to 1)
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) {
    return 0;
  }
  
  return dotProduct / (normA * normB);
}

/**
 * Find the most similar slides to a query embedding
 * @param {number[]} queryEmbedding - The query embedding vector
 * @param {number} topK - Number of top results to return
 * @returns {Array<{slideNumber: number, text: string, similarity: number}>}
 */
function findSimilarSlides(queryEmbedding, topK = 3) {
  const similarities = vectorStore.map(slide => ({
    slideNumber: slide.slideNumber,
    text: slide.text,
    similarity: cosineSimilarity(queryEmbedding, slide.embedding)
  }));
  
  // Sort by similarity (descending) and return top K
  similarities.sort((a, b) => b.similarity - a.similarity);
  
  return similarities.slice(0, topK);
}

/**
 * Save the vector store to a JSON file
 * @param {string} filePath - Path to save the file (default: ./data/vectorStore.json)
 */
function saveVectorStore(filePath = VECTOR_STORE_PATH) {
  const outputDir = path.dirname(filePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(filePath, JSON.stringify(vectorStore, null, 2), 'utf-8');
  console.log(`💾 Vector store saved to: ${filePath}`);
}

/**
 * Load the vector store from a JSON file
 * @param {string} filePath - Path to load from (default: ./data/vectorStore.json)
 * @returns {boolean} - True if loaded successfully
 */
function loadVectorStore(filePath = VECTOR_STORE_PATH) {
  if (!fs.existsSync(filePath)) {
    console.log('⚠️ Vector store file not found, starting with empty store');
    vectorStore = [];
    return false;
  }
  
  const data = fs.readFileSync(filePath, 'utf-8');
  vectorStore = JSON.parse(data);
  console.log(`📂 Loaded ${vectorStore.length} slides from vector store`);
  return true;
}

/**
 * Clear the vector store
 */
function clearVectorStore() {
  vectorStore = [];
}

/**
 * Get the current vector store
 * @returns {Array} - The vector store array
 */
function getVectorStore() {
  return vectorStore;
}

/**
 * Search for similar slides using a text query
 * @param {string} query - The text query
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array<{slideNumber: number, text: string, similarity: number}>>}
 */
async function searchSlides(query, topK = 3) {
  const queryEmbedding = await getEmbedding(query);
  return findSimilarSlides(queryEmbedding, topK);
}

module.exports = {
  getEmbedding,
  addSlide,
  findSimilarSlides,
  cosineSimilarity,
  saveVectorStore,
  loadVectorStore,
  clearVectorStore,
  getVectorStore,
  searchSlides,
  sleep,
  EMBEDDING_DIMENSIONS
};
