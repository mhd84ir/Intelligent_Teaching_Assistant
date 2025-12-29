/**
 * Intelligent RAG Service
 * 
 * یک سیستم RAG هوشمند با قابلیت‌های پیشرفته:
 * - Multi-Query Retrieval: تولید چند query برای پوشش بهتر
 * - Semantic Chunking: تقسیم‌بندی هوشمند با overlap
 * - Re-Ranking: رتبه‌بندی مجدد با cross-encoder logic
 * - Chain-of-Thought: استنتاج چند مرحله‌ای
 * - Hybrid Search: ترکیب semantic + keyword
 */

require('dotenv').config();
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

// Initialize OpenAI
const config = { apiKey: OPENAI_API_KEY };
if (OPENAI_BASE_URL) config.baseURL = OPENAI_BASE_URL;
const openai = new OpenAI(config);

// Data paths
const DATA_DIR = path.join(__dirname, '../../data');
const SMART_STORE_PATH = path.join(DATA_DIR, 'smartKnowledgeStore.json');

// ============================================
// Smart Knowledge Store
// ============================================

let smartStore = {
  documents: {},      // docId -> metadata
  chunks: [],         // All chunks with embeddings
  index: {            // Inverted index for keyword search
    terms: {},        // term -> [chunkIds]
    docFreq: {}       // term -> document frequency
  },
  config: {
    chunkSize: 500,
    chunkOverlap: 100,
    maxChunks: 10000
  },
  lastUpdated: null
};

// ============================================
// Intelligent Chunking
// ============================================

/**
 * تقسیم‌بندی هوشمند متن با حفظ context
 * @param {string} text - متن برای تقسیم
 * @param {number} slideNumber - شماره اسلاید
 * @param {string} docId - شناسه سند
 * @param {string} docName - نام سند
 */
function createSmartChunks(text, slideNumber, docId, docName) {
  const chunks = [];
  const sentences = splitIntoSentences(text);
  
  let currentChunk = '';
  let currentStart = 0;
  const { chunkSize, chunkOverlap } = smartStore.config;
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    // اگر جمله خیلی بلند بود، تقسیمش کن
    if (sentence.length > chunkSize) {
      if (currentChunk) {
        chunks.push(createChunkObject(currentChunk, slideNumber, docId, docName, chunks.length));
      }
      
      // تقسیم جمله بلند
      const words = sentence.split(/\s+/);
      let subChunk = '';
      for (const word of words) {
        if ((subChunk + ' ' + word).length > chunkSize) {
          chunks.push(createChunkObject(subChunk, slideNumber, docId, docName, chunks.length));
          subChunk = word;
        } else {
          subChunk = subChunk ? subChunk + ' ' + word : word;
        }
      }
      if (subChunk) {
        currentChunk = subChunk;
      }
      continue;
    }
    
    // اضافه کردن جمله به chunk فعلی
    if ((currentChunk + ' ' + sentence).length <= chunkSize) {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
    } else {
      // ذخیره chunk فعلی و شروع جدید
      if (currentChunk) {
        chunks.push(createChunkObject(currentChunk, slideNumber, docId, docName, chunks.length));
        
        // Overlap: نگه داشتن بخشی از chunk قبلی
        const overlapSentences = getLastNChars(currentChunk, chunkOverlap);
        currentChunk = overlapSentences + ' ' + sentence;
      } else {
        currentChunk = sentence;
      }
    }
  }
  
  // آخرین chunk
  if (currentChunk.trim()) {
    chunks.push(createChunkObject(currentChunk, slideNumber, docId, docName, chunks.length));
  }
  
  return chunks;
}

function createChunkObject(text, slideNumber, docId, docName, index) {
  return {
    id: `${docId}_s${slideNumber}_c${index}`,
    text: text.trim(),
    slideNumber,
    documentId: docId,
    documentName: docName,
    metadata: {
      length: text.length,
      wordCount: text.split(/\s+/).length
    }
  };
}

function splitIntoSentences(text) {
  // پشتیبانی از فارسی و انگلیسی
  return text
    .split(/(?<=[.!?؟。।])\s+|(?<=\n)\s*/)
    .filter(s => s.trim().length > 0);
}

function getLastNChars(text, n) {
  if (text.length <= n) return text;
  // سعی کن از مرز جمله شروع کنی
  const substr = text.slice(-n);
  const sentenceStart = substr.search(/[.!?؟]\s+[A-Za-z\u0600-\u06FF]/);
  if (sentenceStart > 0) {
    return substr.slice(sentenceStart + 2);
  }
  return substr;
}

// ============================================
// Keyword Index (Inverted Index)
// ============================================

/**
 * ساخت index معکوس برای جستجوی کلیدواژه‌ای
 */
function buildKeywordIndex(chunks) {
  const index = { terms: {}, docFreq: {} };
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
    'و', 'در', 'به', 'از', 'که', 'این', 'را', 'با', 'برای', 'است', 'آن', 'یک'
  ]);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const terms = extractTerms(chunk.text, stopWords);
    const uniqueTerms = new Set(terms);
    
    for (const term of terms) {
      if (!index.terms[term]) {
        index.terms[term] = [];
      }
      index.terms[term].push(i);
    }
    
    for (const term of uniqueTerms) {
      index.docFreq[term] = (index.docFreq[term] || 0) + 1;
    }
  }
  
  return index;
}

function extractTerms(text, stopWords) {
  return text
    .toLowerCase()
    .split(/[\s\-_.,;:!?()[\]{}'"،؛«»]+/)
    .filter(t => t.length > 2 && !stopWords.has(t))
    .map(t => t.replace(/[^\w\u0600-\u06FF]/g, ''));
}

// ============================================
// Embedding & Similarity
// ============================================

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
      console.log('⏳ Rate limited, waiting...');
      await sleep(5000);
      return getEmbedding(text);
    }
    throw error;
  }
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Multi-Query Generation
// ============================================

/**
 * تولید چند query مختلف برای پوشش بهتر
 */
async function generateMultipleQueries(originalQuery) {
  const prompt = `Generate 3 different search queries for the following question. 
Each query should approach the topic from a different angle to retrieve comprehensive information.
Return ONLY a JSON array of strings, no explanation.

Original Question: "${originalQuery}"

Example output: ["query1", "query2", "query3"]`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200
    });
    
    const text = response.choices[0].message.content.trim();
    const queries = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] || '[]');
    
    // اضافه کردن query اصلی
    return [originalQuery, ...queries.slice(0, 3)];
  } catch (error) {
    console.warn('Multi-query generation failed, using original only');
    return [originalQuery];
  }
}

// ============================================
// Hybrid Search (Semantic + Keyword)
// ============================================

/**
 * جستجوی ترکیبی semantic + keyword با BM25
 */
async function hybridSearch(query, topK = 10) {
  if (smartStore.chunks.length === 0) {
    console.warn('⚠️ Knowledge store is empty');
    return [];
  }
  
  // 1. Semantic Search
  const queryEmbedding = await getEmbedding(query);
  const semanticScores = smartStore.chunks.map((chunk, idx) => ({
    index: idx,
    score: chunk.embedding ? cosineSimilarity(queryEmbedding, chunk.embedding) : 0,
    type: 'semantic'
  }));
  
  // 2. Keyword Search (BM25-like scoring)
  const queryTerms = extractTerms(query, new Set());
  const keywordScores = calculateBM25Scores(queryTerms, smartStore.chunks, smartStore.index);
  
  // 3. Combine scores (weighted fusion)
  const combinedScores = new Map();
  const semanticWeight = 0.7;
  const keywordWeight = 0.3;
  
  // Normalize semantic scores
  const maxSemantic = Math.max(...semanticScores.map(s => s.score));
  for (const item of semanticScores) {
    const normalized = maxSemantic > 0 ? item.score / maxSemantic : 0;
    combinedScores.set(item.index, (combinedScores.get(item.index) || 0) + normalized * semanticWeight);
  }
  
  // Add keyword scores
  const maxKeyword = Math.max(...keywordScores.map(s => s.score), 1);
  for (const item of keywordScores) {
    const normalized = item.score / maxKeyword;
    combinedScores.set(item.index, (combinedScores.get(item.index) || 0) + normalized * keywordWeight);
  }
  
  // Sort and return top K
  const results = Array.from(combinedScores.entries())
    .map(([index, score]) => ({
      ...smartStore.chunks[index],
      similarity: score,
      index
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
  
  return results;
}

function calculateBM25Scores(queryTerms, chunks, index) {
  const k1 = 1.5;
  const b = 0.75;
  const N = chunks.length;
  const avgDL = chunks.reduce((sum, c) => sum + c.metadata.wordCount, 0) / N;
  
  const scores = chunks.map((chunk, idx) => {
    let score = 0;
    const dl = chunk.metadata.wordCount;
    
    for (const term of queryTerms) {
      if (!index.terms[term]) continue;
      
      const tf = index.terms[term].filter(i => i === idx).length;
      const df = index.docFreq[term] || 0;
      const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
      
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (dl / avgDL))));
    }
    
    return { index: idx, score };
  });
  
  return scores;
}

// ============================================
// Re-Ranking with LLM
// ============================================

/**
 * رتبه‌بندی مجدد نتایج با استفاده از LLM
 */
async function reRankResults(query, results, topK = 5) {
  if (results.length <= topK) return results;
  
  // ساده‌سازی برای سرعت: استفاده از similarity score + relevance check
  const prompt = `Rate the relevance of each text snippet to the question on a scale of 0-10.
Question: "${query}"

${results.slice(0, 15).map((r, i) => `[${i}] ${r.text.substring(0, 200)}...`).join('\n\n')}

Return ONLY a JSON object like: {"0": 8, "1": 5, "2": 9, ...}`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 200
    });
    
    const text = response.choices[0].message.content;
    const scores = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
    
    // Apply re-ranking scores
    const reranked = results.map((r, i) => ({
      ...r,
      rerankedScore: (scores[i.toString()] || 5) / 10,
      finalScore: r.similarity * 0.5 + (scores[i.toString()] || 5) / 10 * 0.5
    }));
    
    return reranked.sort((a, b) => b.finalScore - a.finalScore).slice(0, topK);
  } catch (error) {
    console.warn('Re-ranking failed, using original order');
    return results.slice(0, topK);
  }
}

// ============================================
// Intelligent Answer Generation
// ============================================

const INTELLIGENT_SYSTEM_PROMPT = `شما یک دستیار آموزشی هوشمند و متخصص هستید. وظیفه شما پاسخ‌دهی جامع و عمیق به سوالات دانشجویان است.

## قابلیت‌های شما:
1. **استنتاج و تحلیل**: از محتوای ارائه شده نتیجه‌گیری کنید، حتی اگر پاسخ مستقیماً ذکر نشده باشد
2. **توضیح مفاهیم**: مفاهیم پیچیده را با مثال و توضیحات ساده شرح دهید
3. **ارتباط‌دهی**: بین مفاهیم مختلف ارتباط برقرار کنید
4. **تکمیل اطلاعات**: اگر اطلاعات اسلایدها ناقص است، با دانش عمومی تکمیل کنید (با ذکر این نکته)

## قوانین پاسخ‌دهی:
- به زبان سوال پاسخ دهید (فارسی یا انگلیسی)
- پاسخ را ساختارمند و خوانا ارائه دهید
- از bullet points و شماره‌گذاری استفاده کنید
- مثال‌های کاربردی بزنید
- اگر سوال خارج از محتواست، این را بگویید ولی سعی کنید راهنمایی کنید

## فرمت خروجی (JSON):
{
  "thinking": "تحلیل کوتاه شما از سوال و نحوه پاسخ‌دهی",
  "answer": "پاسخ کامل و جامع",
  "keyPoints": ["نکته کلیدی 1", "نکته کلیدی 2"],
  "citations": [1, 2],
  "confidence": "high/medium/low",
  "additionalNotes": "نکات تکمیلی یا پیشنهادات برای مطالعه بیشتر"
}`;

/**
 * تولید پاسخ هوشمند با chain-of-thought
 */
async function generateIntelligentAnswer(query, relevantChunks, conversationHistory = []) {
  // ساخت context از chunks
  const context = relevantChunks.map((chunk, i) => 
    `📄 [منبع ${i + 1} - اسلاید ${chunk.slideNumber}${chunk.documentName ? ` از ${chunk.documentName}` : ''}]\n${chunk.text}`
  ).join('\n\n---\n\n');
  
  // اضافه کردن تاریخچه مکالمه
  const historyText = conversationHistory.length > 0 
    ? `\n\n## تاریخچه مکالمه:\n${conversationHistory.map(h => `Q: ${h.question}\nA: ${h.answer}`).join('\n\n')}`
    : '';
  
  const userMessage = `## محتوای مرتبط از منابع درسی:

${context}
${historyText}

---

## سوال دانشجو:
${query}

لطفاً پاسخ جامع و تحلیلی ارائه دهید. از استنتاج و توضیح استفاده کنید.`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: INTELLIGENT_SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });
    
    const responseText = response.choices[0].message.content;
    return parseIntelligentResponse(responseText, relevantChunks);
    
  } catch (error) {
    console.error('Answer generation error:', error);
    throw error;
  }
}

function parseIntelligentResponse(responseText, relevantChunks) {
  try {
    // استخراج JSON
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        thinking: parsed.thinking || '',
        answer: parsed.answer || responseText,
        keyPoints: parsed.keyPoints || [],
        citations: (parsed.citations || []).map(n => parseInt(n, 10)).filter(n => !isNaN(n)),
        confidence: parsed.confidence || 'medium',
        additionalNotes: parsed.additionalNotes || '',
        sources: relevantChunks.slice(0, 5).map(c => ({
          slideNumber: c.slideNumber,
          documentName: c.documentName,
          preview: c.text.substring(0, 100) + '...'
        }))
      };
    }
  } catch (error) {
    console.warn('JSON parsing failed, extracting answer directly');
  }
  
  // Fallback
  return {
    thinking: '',
    answer: responseText,
    keyPoints: [],
    citations: [],
    confidence: 'low',
    additionalNotes: '',
    sources: []
  };
}

// ============================================
// Main RAG Pipeline
// ============================================

/**
 * پایپلاین اصلی RAG هوشمند
 */
async function intelligentRAG(query, options = {}) {
  const {
    topK = 7,
    useMultiQuery = true,
    useReRanking = true,
    conversationHistory = []
  } = options;
  
  console.log('\n🧠 Starting Intelligent RAG Pipeline...');
  console.log(`📝 Query: "${query}"`);
  
  // Load store if needed
  loadSmartStore();
  
  if (smartStore.chunks.length === 0) {
    return {
      answer: 'پایگاه دانش خالی است. لطفاً ابتدا فایل‌های PDF را آپلود کنید.',
      keyPoints: [],
      citations: [],
      confidence: 'none',
      sources: []
    };
  }
  
  // 1. Multi-Query Generation
  let queries = [query];
  if (useMultiQuery) {
    console.log('🔄 Generating multiple queries...');
    queries = await generateMultipleQueries(query);
    console.log(`   Generated ${queries.length} queries`);
  }
  
  // 2. Hybrid Search for each query
  console.log('🔍 Performing hybrid search...');
  const allResults = new Map();
  
  for (const q of queries) {
    const results = await hybridSearch(q, topK * 2);
    for (const r of results) {
      const existing = allResults.get(r.id);
      if (!existing || r.similarity > existing.similarity) {
        allResults.set(r.id, r);
      }
    }
  }
  
  let searchResults = Array.from(allResults.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK * 2);
  
  console.log(`   Found ${searchResults.length} unique chunks`);
  
  // 3. Re-Ranking
  if (useReRanking && searchResults.length > topK) {
    console.log('📊 Re-ranking results...');
    searchResults = await reRankResults(query, searchResults, topK);
  } else {
    searchResults = searchResults.slice(0, topK);
  }
  
  console.log(`   Selected top ${searchResults.length} chunks`);
  
  // 4. Generate Intelligent Answer
  console.log('💡 Generating intelligent answer...');
  const result = await generateIntelligentAnswer(query, searchResults, conversationHistory);
  
  console.log('✅ RAG Pipeline complete!\n');
  
  return result;
}

// ============================================
// Document Processing
// ============================================

/**
 * اضافه کردن سند به پایگاه دانش هوشمند
 */
async function addDocumentToSmartStore(docId, docName, slides, progressCallback = null) {
  console.log(`\n📚 Adding document: ${docName}`);
  
  // ایجاد chunks
  let allChunks = [];
  for (const slide of slides) {
    const chunks = createSmartChunks(slide.text, slide.slideNumber, docId, docName);
    allChunks.push(...chunks);
  }
  
  console.log(`   Created ${allChunks.length} chunks from ${slides.length} slides`);
  
  // تولید embeddings
  console.log('   Generating embeddings...');
  for (let i = 0; i < allChunks.length; i++) {
    if (progressCallback) {
      progressCallback(i + 1, allChunks.length, allChunks[i].slideNumber);
    }
    
    try {
      allChunks[i].embedding = await getEmbedding(allChunks[i].text);
      
      if (i < allChunks.length - 1) {
        await sleep(200); // Rate limiting
      }
    } catch (error) {
      console.error(`   Error embedding chunk ${i}:`, error.message);
      throw error;
    }
  }
  
  // ذخیره در store
  smartStore.documents[docId] = {
    name: docName,
    slideCount: slides.length,
    chunkCount: allChunks.length,
    addedAt: new Date().toISOString()
  };
  
  // اضافه کردن chunks
  const startIndex = smartStore.chunks.length;
  smartStore.chunks.push(...allChunks);
  
  // به‌روزرسانی index
  smartStore.index = buildKeywordIndex(smartStore.chunks);
  smartStore.lastUpdated = new Date().toISOString();
  
  // ذخیره
  saveSmartStore();
  
  console.log(`✅ Document added successfully!`);
  
  return {
    documentId: docId,
    chunks: allChunks.length,
    slides: slides.length
  };
}

/**
 * حذف سند از پایگاه دانش
 */
function removeDocumentFromSmartStore(docId) {
  if (!smartStore.documents[docId]) {
    return false;
  }
  
  // حذف chunks مربوط به این سند
  smartStore.chunks = smartStore.chunks.filter(c => c.documentId !== docId);
  
  // حذف metadata
  delete smartStore.documents[docId];
  
  // بازسازی index
  smartStore.index = buildKeywordIndex(smartStore.chunks);
  smartStore.lastUpdated = new Date().toISOString();
  
  saveSmartStore();
  return true;
}

// ============================================
// Storage Functions
// ============================================

function saveSmartStore() {
  const dir = path.dirname(SMART_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(SMART_STORE_PATH, JSON.stringify(smartStore, null, 2));
  console.log(`💾 Smart store saved: ${Object.keys(smartStore.documents).length} docs, ${smartStore.chunks.length} chunks`);
}

function loadSmartStore() {
  if (!fs.existsSync(SMART_STORE_PATH)) {
    console.log('⚠️ Smart store not found, starting fresh');
    return false;
  }
  
  const data = fs.readFileSync(SMART_STORE_PATH, 'utf-8');
  smartStore = JSON.parse(data);
  console.log(`📂 Smart store loaded: ${Object.keys(smartStore.documents).length} docs, ${smartStore.chunks.length} chunks`);
  return true;
}

function clearSmartStore() {
  smartStore = {
    documents: {},
    chunks: [],
    index: { terms: {}, docFreq: {} },
    config: smartStore.config,
    lastUpdated: null
  };
  saveSmartStore();
}

function getSmartStoreStats() {
  return {
    totalDocuments: Object.keys(smartStore.documents).length,
    totalChunks: smartStore.chunks.length,
    documents: Object.entries(smartStore.documents).map(([id, meta]) => ({
      id,
      ...meta
    })),
    indexTerms: Object.keys(smartStore.index.terms).length,
    lastUpdated: smartStore.lastUpdated
  };
}

// ============================================
// Exports
// ============================================

module.exports = {
  // Main RAG
  intelligentRAG,
  
  // Document management
  addDocumentToSmartStore,
  removeDocumentFromSmartStore,
  
  // Storage
  saveSmartStore,
  loadSmartStore,
  clearSmartStore,
  getSmartStoreStats,
  
  // Search
  hybridSearch,
  generateMultipleQueries,
  reRankResults,
  
  // Utilities
  getEmbedding,
  createSmartChunks,
  buildKeywordIndex
};
