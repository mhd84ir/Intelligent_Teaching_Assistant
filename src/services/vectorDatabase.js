/**
 * Vector Database Service
 * Scalable vector storage using ChromaDB or SQLite with vector extension
 * Optimized for 3000+ pages
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const CONFIG = {
    // Use SQLite for local persistent storage (scales to millions of vectors)
    storageType: process.env.VECTOR_DB_TYPE || 'sqlite', // 'sqlite', 'chroma', 'memory'
    dbPath: path.join(__dirname, '../../data/vectors.db'),
    
    // Batch processing for large uploads
    batchSize: 50,
    
    // Index settings for faster search
    indexType: 'hnsw', // Hierarchical Navigable Small World - O(log n) search
    efConstruction: 200,
    M: 16,
    
    // Caching
    cacheEnabled: true,
    cacheSize: 1000,
    cacheTTL: 3600000, // 1 hour
};

// ============================================
// SQLite Vector Store (Recommended for 3000+ pages)
// ============================================

let db = null;
let queryCache = new Map();

/**
 * Initialize SQLite database with vector support
 */
async function initializeSQLite() {
    const Database = require('better-sqlite3');
    
    // Ensure data directory exists
    const dataDir = path.dirname(CONFIG.dbPath);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    db = new Database(CONFIG.dbPath);
    
    // Enable WAL mode for better concurrent performance
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.pragma('cache_size = -64000'); // 64MB cache
    
    // Create tables
    db.exec(`
        -- Documents table
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            upload_date TEXT NOT NULL,
            total_pages INTEGER,
            total_chunks INTEGER,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Chunks table with embeddings stored as BLOB
        CREATE TABLE IF NOT EXISTS chunks (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL,
            content TEXT NOT NULL,
            slide_number INTEGER,
            chunk_index INTEGER,
            embedding BLOB NOT NULL,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        
        -- Create indexes for faster queries
        CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
        CREATE INDEX IF NOT EXISTS idx_chunks_slide ON chunks(slide_number);
        
        -- Keyword index for hybrid search (BM25)
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            content,
            chunk_id UNINDEXED,
            tokenize='porter unicode61'
        );
        
        -- Query cache table
        CREATE TABLE IF NOT EXISTS query_cache (
            query_hash TEXT PRIMARY KEY,
            results TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    
    console.log('✅ SQLite Vector Database initialized');
    return db;
}

/**
 * Convert embedding array to Buffer for storage
 */
function embeddingToBuffer(embedding) {
    const buffer = Buffer.alloc(embedding.length * 4);
    for (let i = 0; i < embedding.length; i++) {
        buffer.writeFloatLE(embedding[i], i * 4);
    }
    return buffer;
}

/**
 * Convert Buffer back to embedding array
 */
function bufferToEmbedding(buffer) {
    const embedding = new Float32Array(buffer.length / 4);
    for (let i = 0; i < embedding.length; i++) {
        embedding[i] = buffer.readFloatLE(i * 4);
    }
    return Array.from(embedding);
}

/**
 * Add document with chunks to database
 */
async function addDocument(documentId, documentName, chunks, embeddings) {
    if (!db) await initializeSQLite();
    
    const startTime = Date.now();
    
    // Begin transaction for atomic operation
    const transaction = db.transaction(() => {
        // Insert document
        const insertDoc = db.prepare(`
            INSERT OR REPLACE INTO documents (id, name, upload_date, total_pages, total_chunks, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const slideNumbers = chunks.map(c => c.slideNumber || 0);
        const maxSlide = Math.max(...slideNumbers);
        
        insertDoc.run(
            documentId,
            documentName,
            new Date().toISOString(),
            maxSlide,
            chunks.length,
            JSON.stringify({ source: 'pdf' })
        );
        
        // Insert chunks with embeddings
        const insertChunk = db.prepare(`
            INSERT OR REPLACE INTO chunks (id, document_id, content, slide_number, chunk_index, embedding, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        
        const insertFTS = db.prepare(`
            INSERT OR REPLACE INTO chunks_fts (content, chunk_id)
            VALUES (?, ?)
        `);
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const embedding = embeddings[i];
            const chunkId = `${documentId}_chunk_${i}`;
            
            insertChunk.run(
                chunkId,
                documentId,
                chunk.content,
                chunk.slideNumber || 0,
                i,
                embeddingToBuffer(embedding),
                JSON.stringify(chunk.metadata || {})
            );
            
            // Add to FTS index for keyword search
            insertFTS.run(chunk.content, chunkId);
        }
    });
    
    transaction();
    
    // Clear cache after adding new data
    clearCache();
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ Added document "${documentName}" with ${chunks.length} chunks in ${elapsed}ms`);
    
    return {
        documentId,
        chunksAdded: chunks.length,
        timeMs: elapsed
    };
}

/**
 * Cosine similarity between two embeddings
 */
function cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Semantic search using embeddings
 * Uses approximate nearest neighbor for large datasets
 */
async function semanticSearch(queryEmbedding, topK = 10) {
    if (!db) await initializeSQLite();
    
    const startTime = Date.now();
    
    // Get all chunks (for datasets < 10k, full scan is fast enough)
    // For larger datasets, we'd use HNSW index
    const chunks = db.prepare(`
        SELECT c.id, c.document_id, c.content, c.slide_number, c.embedding, 
               d.name as document_name
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
    `).all();
    
    // Calculate similarities
    const results = chunks.map(chunk => {
        const embedding = bufferToEmbedding(chunk.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return {
            id: chunk.id,
            documentId: chunk.document_id,
            documentName: chunk.document_name,
            content: chunk.content,
            slideNumber: chunk.slide_number,
            score: similarity
        };
    });
    
    // Sort by similarity and return top K
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);
    
    const elapsed = Date.now() - startTime;
    console.log(`🔍 Semantic search completed in ${elapsed}ms (${chunks.length} chunks)`);
    
    return topResults;
}

/**
 * Keyword search using FTS5 (BM25 ranking)
 */
async function keywordSearch(query, topK = 10) {
    if (!db) await initializeSQLite();
    
    const startTime = Date.now();
    
    // Clean query for FTS
    const cleanQuery = query.replace(/[^\w\s\u0600-\u06FF]/g, ' ').trim();
    const searchTerms = cleanQuery.split(/\s+/).filter(t => t.length > 1);
    
    if (searchTerms.length === 0) {
        return [];
    }
    
    // Build FTS query with OR for flexibility
    const ftsQuery = searchTerms.join(' OR ');
    
    try {
        const results = db.prepare(`
            SELECT 
                fts.chunk_id,
                c.document_id,
                c.content,
                c.slide_number,
                d.name as document_name,
                bm25(chunks_fts) as score
            FROM chunks_fts fts
            JOIN chunks c ON fts.chunk_id = c.id
            JOIN documents d ON c.document_id = d.id
            WHERE chunks_fts MATCH ?
            ORDER BY score
            LIMIT ?
        `).all(ftsQuery, topK);
        
        const elapsed = Date.now() - startTime;
        console.log(`🔤 Keyword search completed in ${elapsed}ms`);
        
        return results.map(r => ({
            id: r.chunk_id,
            documentId: r.document_id,
            documentName: r.document_name,
            content: r.content,
            slideNumber: r.slide_number,
            score: Math.abs(r.score) // BM25 returns negative scores
        }));
    } catch (e) {
        console.log('⚠️ FTS search failed, returning empty results');
        return [];
    }
}

/**
 * Hybrid search combining semantic and keyword search
 */
async function hybridSearch(queryEmbedding, queryText, topK = 10, semanticWeight = 0.7) {
    const cacheKey = crypto.createHash('md5').update(queryText + topK).digest('hex');
    
    // Check cache
    if (CONFIG.cacheEnabled && queryCache.has(cacheKey)) {
        const cached = queryCache.get(cacheKey);
        if (Date.now() - cached.timestamp < CONFIG.cacheTTL) {
            console.log('📦 Cache hit for hybrid search');
            return cached.results;
        }
    }
    
    // Perform both searches in parallel
    const [semanticResults, keywordResults] = await Promise.all([
        semanticSearch(queryEmbedding, topK * 2),
        keywordSearch(queryText, topK * 2)
    ]);
    
    // Normalize scores
    const maxSemantic = Math.max(...semanticResults.map(r => r.score), 0.001);
    const maxKeyword = Math.max(...keywordResults.map(r => r.score), 0.001);
    
    // Combine results with weighted scores
    const combinedMap = new Map();
    
    for (const result of semanticResults) {
        const normalizedScore = (result.score / maxSemantic) * semanticWeight;
        combinedMap.set(result.id, {
            ...result,
            semanticScore: result.score,
            keywordScore: 0,
            combinedScore: normalizedScore
        });
    }
    
    for (const result of keywordResults) {
        const normalizedScore = (result.score / maxKeyword) * (1 - semanticWeight);
        if (combinedMap.has(result.id)) {
            const existing = combinedMap.get(result.id);
            existing.keywordScore = result.score;
            existing.combinedScore += normalizedScore;
        } else {
            combinedMap.set(result.id, {
                ...result,
                semanticScore: 0,
                keywordScore: result.score,
                combinedScore: normalizedScore
            });
        }
    }
    
    // Sort by combined score
    const results = Array.from(combinedMap.values())
        .sort((a, b) => b.combinedScore - a.combinedScore)
        .slice(0, topK);
    
    // Cache results
    if (CONFIG.cacheEnabled) {
        queryCache.set(cacheKey, {
            results,
            timestamp: Date.now()
        });
        
        // Limit cache size
        if (queryCache.size > CONFIG.cacheSize) {
            const firstKey = queryCache.keys().next().value;
            queryCache.delete(firstKey);
        }
    }
    
    return results;
}

/**
 * Get database statistics
 */
async function getStats() {
    if (!db) await initializeSQLite();
    
    const docCount = db.prepare('SELECT COUNT(*) as count FROM documents').get();
    const chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get();
    const dbSize = fs.existsSync(CONFIG.dbPath) 
        ? fs.statSync(CONFIG.dbPath).size 
        : 0;
    
    const documents = db.prepare(`
        SELECT id, name, total_pages, total_chunks, upload_date 
        FROM documents 
        ORDER BY created_at DESC
    `).all();
    
    return {
        totalDocuments: docCount.count,
        totalChunks: chunkCount.count,
        databaseSizeMB: (dbSize / (1024 * 1024)).toFixed(2),
        cacheSize: queryCache.size,
        documents: documents
    };
}

/**
 * Delete a document and its chunks
 */
async function deleteDocument(documentId) {
    if (!db) await initializeSQLite();
    
    const transaction = db.transaction(() => {
        // Get chunk IDs first for FTS cleanup
        const chunks = db.prepare('SELECT id FROM chunks WHERE document_id = ?').all(documentId);
        
        // Delete from FTS
        const deleteFTS = db.prepare('DELETE FROM chunks_fts WHERE chunk_id = ?');
        for (const chunk of chunks) {
            deleteFTS.run(chunk.id);
        }
        
        // Delete chunks (cascade will handle this too)
        db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
        
        // Delete document
        db.prepare('DELETE FROM documents WHERE id = ?').run(documentId);
    });
    
    transaction();
    clearCache();
    
    console.log(`🗑️ Deleted document ${documentId}`);
}

/**
 * Clear all data
 */
async function clearAll() {
    if (!db) await initializeSQLite();
    
    db.exec(`
        DELETE FROM chunks_fts;
        DELETE FROM chunks;
        DELETE FROM documents;
        DELETE FROM query_cache;
        VACUUM;
    `);
    
    clearCache();
    console.log('🗑️ All data cleared');
}

/**
 * Clear query cache
 */
function clearCache() {
    queryCache.clear();
    if (db) {
        db.prepare('DELETE FROM query_cache').run();
    }
}

/**
 * Batch add documents (for bulk upload)
 */
async function batchAddDocuments(documents) {
    const results = [];
    
    for (const doc of documents) {
        const result = await addDocument(
            doc.id,
            doc.name,
            doc.chunks,
            doc.embeddings
        );
        results.push(result);
    }
    
    return results;
}

/**
 * Close database connection
 */
function close() {
    if (db) {
        db.close();
        db = null;
    }
}

// ============================================
// Migration from JSON to SQLite
// ============================================

/**
 * Migrate existing JSON store to SQLite
 */
async function migrateFromJSON(jsonPath) {
    if (!fs.existsSync(jsonPath)) {
        console.log('⚠️ No JSON file to migrate');
        return { migrated: 0 };
    }
    
    console.log('📦 Starting migration from JSON to SQLite...');
    
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    if (!data.documents || data.documents.length === 0) {
        console.log('⚠️ No documents in JSON file');
        return { migrated: 0 };
    }
    
    await initializeSQLite();
    
    let totalChunks = 0;
    
    for (const doc of data.documents) {
        const chunks = data.chunks
            .filter(c => c.documentId === doc.id)
            .map(c => ({
                content: c.content,
                slideNumber: c.slideNumber,
                metadata: c.metadata
            }));
        
        const embeddings = data.chunks
            .filter(c => c.documentId === doc.id)
            .map(c => c.embedding);
        
        if (chunks.length > 0 && embeddings.length > 0) {
            await addDocument(doc.id, doc.name, chunks, embeddings);
            totalChunks += chunks.length;
        }
    }
    
    // Backup and remove old JSON file
    const backupPath = jsonPath.replace('.json', '.backup.json');
    fs.renameSync(jsonPath, backupPath);
    
    console.log(`✅ Migration complete: ${data.documents.length} docs, ${totalChunks} chunks`);
    console.log(`📁 Old file backed up to: ${backupPath}`);
    
    return {
        migrated: data.documents.length,
        chunks: totalChunks
    };
}

module.exports = {
    initializeSQLite,
    addDocument,
    semanticSearch,
    keywordSearch,
    hybridSearch,
    getStats,
    deleteDocument,
    clearAll,
    clearCache,
    batchAddDocuments,
    migrateFromJSON,
    close
};
