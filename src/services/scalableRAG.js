/**
 * Scalable Intelligent RAG Service
 * Optimized for 3000+ pages with SQLite vector database
 */

require('dotenv').config();
const OpenAI = require('openai');
const vectorDB = require('./vectorDatabase');
const { getEmbedding } = require('./embeddingService');
const path = require('path');
const fs = require('fs');

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Initialize OpenAI client
const config = { apiKey: OPENAI_API_KEY };
if (OPENAI_BASE_URL) {
    config.baseURL = OPENAI_BASE_URL;
}
const openai = new OpenAI(config);

// Configuration for scalability
const CONFIG = {
    // Chunk settings
    chunkSize: 800,
    chunkOverlap: 150,
    
    // Search settings
    initialSearchK: 15,        // Get results for re-ranking
    finalK: 5,                 // Final results after re-ranking
    semanticWeight: 0.7,       // Weight for semantic vs keyword search
    
    // Query expansion - disabled for now to speed up
    maxQueries: 1,             // Number of query variants (1 = no expansion)
    
    // Re-ranking - disabled for speed
    enableReranking: false,
    rerankBatchSize: 10,
    
    // Caching
    enableCache: true,
    
    // Batch processing for large uploads
    embeddingBatchSize: 20,    // Process embeddings in batches
    
    // Response settings
    maxTokens: 1500
};

// ============================================
// Text Processing & Chunking
// ============================================

/**
 * Create smart chunks from slides with overlap
 */
function createSmartChunks(slides) {
    const chunks = [];
    
    for (const slide of slides) {
        const content = slide.content || slide.text || '';
        if (!content.trim()) continue;
        
        // For short content, keep as single chunk
        if (content.length <= CONFIG.chunkSize) {
            chunks.push({
                content: content.trim(),
                slideNumber: slide.slideNumber,
                metadata: {
                    type: 'full_slide',
                    documentName: slide.documentName
                }
            });
            continue;
        }
        
        // Split longer content into overlapping chunks
        const sentences = content.split(/[.!?؟۔。\n]+/).filter(s => s.trim());
        let currentChunk = '';
        let chunkIndex = 0;
        
        for (let i = 0; i < sentences.length; i++) {
            const sentence = sentences[i].trim();
            
            if ((currentChunk + ' ' + sentence).length > CONFIG.chunkSize && currentChunk) {
                chunks.push({
                    content: currentChunk.trim(),
                    slideNumber: slide.slideNumber,
                    metadata: {
                        type: 'partial',
                        chunkIndex: chunkIndex++,
                        documentName: slide.documentName
                    }
                });
                
                // Keep overlap from previous chunk
                const words = currentChunk.split(' ');
                const overlapWords = words.slice(-Math.floor(CONFIG.chunkOverlap / 5));
                currentChunk = overlapWords.join(' ') + ' ' + sentence;
            } else {
                currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
            }
        }
        
        // Add remaining content
        if (currentChunk.trim()) {
            chunks.push({
                content: currentChunk.trim(),
                slideNumber: slide.slideNumber,
                metadata: {
                    type: chunkIndex > 0 ? 'partial' : 'full_slide',
                    chunkIndex: chunkIndex,
                    documentName: slide.documentName
                }
            });
        }
    }
    
    return chunks;
}

// ============================================
// Batch Embedding Generation
// ============================================

/**
 * Generate embeddings in batches to avoid API limits
 */
async function generateEmbeddingsBatch(texts) {
    const embeddings = [];
    const batchSize = CONFIG.embeddingBatchSize;
    
    console.log(`📊 Generating embeddings for ${texts.length} chunks in batches of ${batchSize}...`);
    
    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(texts.length / batchSize);
        
        console.log(`   Batch ${batchNum}/${totalBatches}...`);
        
        // Process batch in parallel
        const batchEmbeddings = await Promise.all(
            batch.map(text => getEmbedding(text))
        );
        
        embeddings.push(...batchEmbeddings);
        
        // Small delay to avoid rate limiting
        if (i + batchSize < texts.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    console.log(`✅ Generated ${embeddings.length} embeddings`);
    return embeddings;
}

// ============================================
// Document Management
// ============================================

/**
 * Add a document to the vector database
 */
async function addDocumentToStore(documentId, documentName, slides) {
    console.log(`📄 Processing document: ${documentName}`);
    
    // Create chunks
    const chunks = createSmartChunks(slides);
    console.log(`   Created ${chunks.length} chunks from ${slides.length} slides`);
    
    // Generate embeddings in batches
    const texts = chunks.map(c => c.content);
    const embeddings = await generateEmbeddingsBatch(texts);
    
    // Store in SQLite database
    const result = await vectorDB.addDocument(documentId, documentName, chunks, embeddings);
    
    return {
        ...result,
        chunksCreated: chunks.length
    };
}

/**
 * Get store statistics
 */
async function getStoreStats() {
    return await vectorDB.getStats();
}

/**
 * Delete a document
 */
async function deleteDocument(documentId) {
    await vectorDB.deleteDocument(documentId);
}

/**
 * Clear all data
 */
async function clearStore() {
    await vectorDB.clearAll();
}

// ============================================
// Query Expansion
// ============================================

/**
 * Generate multiple query variants for better retrieval
 */
async function expandQuery(originalQuery) {
    try {
        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `Generate ${CONFIG.maxQueries - 1} alternative phrasings of the given question to improve search results. 
Return ONLY a JSON array of strings, no explanation.
Keep the same meaning but use different words or perspectives.
If the question is in Persian, generate Persian alternatives.`
                },
                {
                    role: 'user',
                    content: originalQuery
                }
            ],
            temperature: 0.7,
            max_tokens: 300
        });
        
        const content = response.choices[0].message.content.trim();
        const alternatives = JSON.parse(content);
        
        return [originalQuery, ...alternatives.slice(0, CONFIG.maxQueries - 1)];
    } catch (e) {
        console.log('⚠️ Query expansion failed, using original');
        return [originalQuery];
    }
}

// ============================================
// Re-ranking
// ============================================

/**
 * Re-rank results using LLM
 */
async function rerankResults(query, results) {
    if (!CONFIG.enableReranking || results.length <= CONFIG.finalK) {
        return results.slice(0, CONFIG.finalK);
    }
    
    try {
        // Take top results for re-ranking
        const toRerank = results.slice(0, CONFIG.rerankBatchSize);
        
        const chunksText = toRerank.map((r, i) => 
            `[${i}] ${r.content.substring(0, 300)}...`
        ).join('\n\n');
        
        const response = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [
                {
                    role: 'system',
                    content: `You are a relevance judge. Given a question and numbered text chunks, return a JSON array of the most relevant chunk indices in order of relevance.
Return exactly ${CONFIG.finalK} indices as a JSON array like [2, 0, 5, 1, 4, 6, 3].
Only return the JSON array, nothing else.`
                },
                {
                    role: 'user',
                    content: `Question: ${query}\n\nChunks:\n${chunksText}`
                }
            ],
            temperature: 0,
            max_tokens: 100
        });
        
        const content = response.choices[0].message.content.trim();
        const indices = JSON.parse(content);
        
        // Reorder results based on LLM ranking
        const reranked = indices
            .filter(i => i >= 0 && i < toRerank.length)
            .map(i => toRerank[i]);
        
        return reranked;
    } catch (e) {
        console.log('⚠️ Re-ranking failed, using original order');
        return results.slice(0, CONFIG.finalK);
    }
}

// ============================================
// Answer Generation
// ============================================

/**
 * Generate intelligent answer with chain-of-thought
 */
async function generateAnswer(query, context, conversationHistory = []) {
    const systemPrompt = `شما یک دستیار آموزشی هوشمند برای درس هوش مصنوعی هستید.

## قوانین:
1. از اطلاعات context برای پاسخ استفاده کن
2. اگر اطلاعات کافی نیست، صادقانه بگو
3. با مثال و توضیح ساده پاسخ بده
4. نکات کلیدی را برجسته کن
5. به زبان سوال پاسخ بده (فارسی یا انگلیسی)

## ⚠️ مهم - نوشتن فرمول‌های ریاضی:
هر فرمول ریاضی را حتماً با علامت های $$ یا $ محصور کن:

✅ صحیح (فرمول بلوکی):
$$MSE = \\frac{1}{n}\\sum_{i=1}^{n}(y_i - \\hat{y}_i)^2$$

✅ صحیح (فرمول درون متن):
فرمول $f(x) = x^2$ یک تابع درجه دوم است.

❌ غلط (بدون $$ یا $):
MSE = (1/n)Σ(y_i - ŷ_i)²

قوانین LaTeX:
- کسر: \\frac{صورت}{مخرج}
- توان: x^{2} یا x^2
- جمع: \\sum_{i=1}^{n}
- ضرب نقطه: \\cdot
- کلاه: \\hat{y}
- رادیکال: \\sqrt{x}

## فرمت پاسخ:
پاسخت را به صورت JSON با این ساختار بده:
{
    "answer": "پاسخ کامل و توضیحی با فرمول های LaTeX که حتماً با $$ یا $ محصور شده باشند",
    "keyPoints": ["نکته 1", "نکته 2", "نکته 3"],
    "confidence": "high|medium|low",
    "citations": [اعداد اسلایدهای استفاده شده]
}`;

    const contextText = context.map((c, i) => 
        `[اسلاید ${c.slideNumber}] ${c.content}`
    ).join('\n\n---\n\n');
    
    const messages = [
        { role: 'system', content: systemPrompt },
        // Few-shot example for LaTeX formatting
        {
            role: 'user',
            content: 'فرمول Sigmoid چیست؟'
        },
        {
            role: 'assistant',
            content: JSON.stringify({
                answer: 'تابع سیگموید یک تابع فعال‌سازی است که خروجی را به بازه (0, 1) محدود می‌کند:\n\n$$\\sigma(x) = \\frac{1}{1 + e^{-x}}$$\n\nاین تابع در شبکه‌های عصبی برای مدل‌های دسته‌بندی دودویی استفاده می‌شود.',
                keyPoints: ['خروجی بین 0 و 1', 'مشتق پذیر و هموار', 'برای دسته‌بندی دودویی'],
                confidence: 'high',
                citations: []
            })
        },
        ...conversationHistory.slice(-4), // Keep last 2 exchanges
        {
            role: 'user',
            content: `Context:\n${contextText}\n\n---\n\nسوال: ${query}`
        }
    ];
    
    const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        temperature: 0.3,
        max_tokens: CONFIG.maxTokens
    });
    
    const content = response.choices[0].message.content;
    
    // Parse JSON response
    try {
        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        // If JSON parsing fails, return as plain answer
    }
    
    return {
        answer: content,
        keyPoints: [],
        confidence: 'medium',
        citations: []
    };
}

// ============================================
// Main RAG Pipeline
// ============================================

/**
 * Main intelligent RAG function
 */
async function intelligentRAG(query, conversationHistory = []) {
    const startTime = Date.now();
    console.log(`\n🧠 Scalable RAG Pipeline started...`);
    console.log(`📝 Query: "${query}"`);
    
    // Step 1: Expand query
    console.log('🔄 Expanding query...');
    const queries = await expandQuery(query);
    console.log(`   Generated ${queries.length} query variants`);
    
    // Step 2: Generate embeddings for all queries
    console.log('📊 Generating query embeddings...');
    const queryEmbeddings = await Promise.all(
        queries.map(q => getEmbedding(q))
    );
    
    // Step 3: Hybrid search for each query
    console.log('🔍 Performing hybrid search...');
    const allResults = new Map();
    
    for (let i = 0; i < queries.length; i++) {
        const results = await vectorDB.hybridSearch(
            queryEmbeddings[i],
            queries[i],
            CONFIG.initialSearchK,
            CONFIG.semanticWeight
        );
        
        for (const result of results) {
            if (!allResults.has(result.id)) {
                allResults.set(result.id, { ...result, queryMatches: 1 });
            } else {
                allResults.get(result.id).queryMatches++;
                allResults.get(result.id).combinedScore += result.combinedScore;
            }
        }
    }
    
    // Sort by combined score and query matches
    let searchResults = Array.from(allResults.values())
        .sort((a, b) => {
            if (b.queryMatches !== a.queryMatches) {
                return b.queryMatches - a.queryMatches;
            }
            return b.combinedScore - a.combinedScore;
        });
    
    console.log(`   Found ${searchResults.length} unique results`);
    
    // Step 4: Re-rank
    console.log('📊 Re-ranking results...');
    const rerankedResults = await rerankResults(query, searchResults);
    console.log(`   Selected top ${rerankedResults.length} results`);
    
    // Step 5: Generate answer
    console.log('💡 Generating answer...');
    const answer = await generateAnswer(query, rerankedResults, conversationHistory);
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ Pipeline complete in ${elapsed}ms`);
    
    return {
        success: true,
        ...answer,
        relevantSlides: rerankedResults.map(r => ({
            slideNumber: r.slideNumber,
            documentName: r.documentName,
            preview: r.content.substring(0, 100) + '...'
        })),
        responseTime: elapsed,
        queriesUsed: queries.length
    };
}

// ============================================
// Migration Utility
// ============================================

/**
 * Migrate from old JSON store to SQLite
 */
async function migrateFromOldStore() {
    const oldStorePath = path.join(__dirname, '../../data/smartKnowledgeStore.json');
    return await vectorDB.migrateFromJSON(oldStorePath);
}

module.exports = {
    addDocumentToStore,
    getStoreStats,
    deleteDocument,
    clearStore,
    intelligentRAG,
    migrateFromOldStore,
    createSmartChunks,
    generateEmbeddingsBatch
};
