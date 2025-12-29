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
const KNOWLEDGE_VECTOR_STORE_PATH = path.join(DATA_DIR, 'knowledgeVectorStore.json');

// Embedding dimensions for text-embedding-3-small
const EMBEDDING_DIMENSIONS = 1536;

// In-memory vector store
let vectorStore = [];

// Knowledge vector store (multi-document support)
let knowledgeVectorStore = {
  documents: {},  // docId -> { slides: [...], metadata: {...} }
  allSlides: [],  // Flattened for search
  lastUpdated: null
};

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

// ============================================
// Knowledge Vector Store (Multi-Document Support)
// ============================================

/**
 * Add a document to the knowledge vector store
 * @param {string} docId - Document ID
 * @param {string} docName - Document filename
 * @param {Array<{slideNumber: number, text: string}>} slides - Slides array
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Promise<number>} Number of slides processed
 */
async function addDocumentToKnowledge(docId, docName, slides, progressCallback = null) {
  const docSlides = [];
  
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    
    if (progressCallback) {
      progressCallback(i + 1, slides.length, slide.slideNumber);
    }
    
    try {
      const embedding = await getEmbedding(slide.text);
      
      const slideWithEmbedding = {
        slideNumber: slide.slideNumber,
        localSlideNumber: slide.localSlideNumber || slide.slideNumber,
        documentId: docId,
        documentName: docName,
        text: slide.text,
        embedding: embedding
      };
      
      docSlides.push(slideWithEmbedding);
      
      // Rate limiting
      if (i < slides.length - 1) {
        await sleep(300);
      }
    } catch (error) {
      console.error(`Error embedding slide ${slide.slideNumber}:`, error.message);
      throw error;
    }
  }
  
  // Store document slides
  knowledgeVectorStore.documents[docId] = {
    slides: docSlides,
    metadata: {
      name: docName,
      slideCount: docSlides.length,
      addedAt: new Date().toISOString()
    }
  };
  
  // Rebuild flattened array
  rebuildAllSlides();
  
  return docSlides.length;
}

/**
 * Rebuild the flattened allSlides array from documents
 */
function rebuildAllSlides() {
  knowledgeVectorStore.allSlides = [];
  
  for (const docId of Object.keys(knowledgeVectorStore.documents)) {
    const doc = knowledgeVectorStore.documents[docId];
    knowledgeVectorStore.allSlides.push(...doc.slides);
  }
  
  knowledgeVectorStore.lastUpdated = new Date().toISOString();
}

/**
 * Remove a document from knowledge vector store
 * @param {string} docId - Document ID to remove
 * @returns {boolean} True if removed
 */
function removeDocumentFromKnowledge(docId) {
  if (!knowledgeVectorStore.documents[docId]) {
    return false;
  }
  
  delete knowledgeVectorStore.documents[docId];
  rebuildAllSlides();
  return true;
}

/**
 * Find similar slides in knowledge store
 * @param {number[]} queryEmbedding - Query embedding
 * @param {number} topK - Number of results
 * @returns {Array<{slideNumber: number, text: string, similarity: number, documentName: string}>}
 */
function findSimilarSlidesInKnowledge(queryEmbedding, topK = 5) {
  const similarities = knowledgeVectorStore.allSlides.map(slide => ({
    slideNumber: slide.slideNumber,
    localSlideNumber: slide.localSlideNumber,
    documentId: slide.documentId,
    documentName: slide.documentName,
    text: slide.text,
    similarity: cosineSimilarity(queryEmbedding, slide.embedding)
  }));
  
  similarities.sort((a, b) => b.similarity - a.similarity);
  
  return similarities.slice(0, topK);
}

/**
 * Search knowledge store with text query
 * @param {string} query - Text query
 * @param {number} topK - Number of results
 * @returns {Promise<Array>}
 */
async function searchKnowledge(query, topK = 5) {
  const queryEmbedding = await getEmbedding(query);
  return findSimilarSlidesInKnowledge(queryEmbedding, topK);
}

/**
 * Save knowledge vector store to file
 */
function saveKnowledgeVectorStore(filePath = KNOWLEDGE_VECTOR_STORE_PATH) {
  const outputDir = path.dirname(filePath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  knowledgeVectorStore.lastUpdated = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(knowledgeVectorStore, null, 2), 'utf-8');
  
  const totalSlides = knowledgeVectorStore.allSlides.length;
  const totalDocs = Object.keys(knowledgeVectorStore.documents).length;
  console.log(`💾 Knowledge vector store saved: ${totalDocs} documents, ${totalSlides} slides`);
}

/**
 * Load knowledge vector store from file
 * @returns {boolean} True if loaded
 */
function loadKnowledgeVectorStore(filePath = KNOWLEDGE_VECTOR_STORE_PATH) {
  if (!fs.existsSync(filePath)) {
    console.log('⚠️ Knowledge vector store not found, starting fresh');
    knowledgeVectorStore = {
      documents: {},
      allSlides: [],
      lastUpdated: null
    };
    return false;
  }
  
  const data = fs.readFileSync(filePath, 'utf-8');
  knowledgeVectorStore = JSON.parse(data);
  
  const totalSlides = knowledgeVectorStore.allSlides.length;
  const totalDocs = Object.keys(knowledgeVectorStore.documents).length;
  console.log(`📂 Knowledge vector store loaded: ${totalDocs} documents, ${totalSlides} slides`);
  
  return true;
}

/**
 * Clear knowledge vector store
 */
function clearKnowledgeVectorStore() {
  knowledgeVectorStore = {
    documents: {},
    allSlides: [],
    lastUpdated: null
  };
}

/**
 * Get knowledge store stats
 * @returns {Object} Statistics
 */
function getKnowledgeStats() {
  const docs = Object.keys(knowledgeVectorStore.documents).map(docId => ({
    id: docId,
    ...knowledgeVectorStore.documents[docId].metadata
  }));
  
  return {
    totalDocuments: docs.length,
    totalSlides: knowledgeVectorStore.allSlides.length,
    documents: docs,
    lastUpdated: knowledgeVectorStore.lastUpdated
  };
}

/**
 * Get the knowledge vector store
 * @returns {Object} Knowledge vector store
 */
function getKnowledgeVectorStore() {
  return knowledgeVectorStore;
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
  EMBEDDING_DIMENSIONS,
  // Knowledge store exports
  addDocumentToKnowledge,
  removeDocumentFromKnowledge,
  findSimilarSlidesInKnowledge,
  searchKnowledge,
  saveKnowledgeVectorStore,
  loadKnowledgeVectorStore,
  clearKnowledgeVectorStore,
  getKnowledgeStats,
  getKnowledgeVectorStore,
  KNOWLEDGE_VECTOR_STORE_PATH
};
