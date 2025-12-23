require('dotenv').config();
const OpenAI = require('openai');
const { getEmbedding, findSimilarSlides, loadVectorStore } = require('./embeddingService');

// Configuration from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Initialize OpenAI client
const config = { apiKey: OPENAI_API_KEY };
if (OPENAI_BASE_URL) {
  config.baseURL = OPENAI_BASE_URL;
}
const openai = new OpenAI(config);

// System prompt for the teaching assistant
const SYSTEM_PROMPT = `You are a teaching assistant. Answer the student's question based ONLY on the provided slides. 

IMPORTANT RULES:
1. If the answer is not in the slides, say "I cannot answer based on the provided material."
2. Always cite the slide number(s) you used at the end of your answer in the format: [Slide X] or [Slides X, Y]
3. Answer in the same language as the question (if the question is in Persian/Farsi, answer in Persian; if in English, answer in English)
4. Be concise but thorough.
5. Do not make up information that is not in the slides.`;

/**
 * Retrieve relevant slides for a query
 * @param {string} query - The user's question
 * @param {number} topK - Number of slides to retrieve
 * @returns {Promise<Array<{slideNumber: number, text: string, similarity: number}>>}
 */
async function retrieveRelevantSlides(query, topK = 3) {
  // Generate embedding for the query
  const queryEmbedding = await getEmbedding(query);
  
  // Find similar slides
  const similarSlides = findSimilarSlides(queryEmbedding, topK);
  
  return similarSlides;
}

/**
 * Build the context string from relevant slides
 * @param {Array<{slideNumber: number, text: string}>} slides 
 * @returns {string}
 */
function buildContext(slides) {
  return slides.map(slide => 
    `--- Slide ${slide.slideNumber} ---\n${slide.text}`
  ).join('\n\n');
}

/**
 * Extract citations from the answer text
 * @param {string} answer - The model's answer
 * @param {Array<{slideNumber: number}>} relevantSlides - The slides that were provided
 * @returns {number[]} - Array of slide numbers cited
 */
function extractCitations(answer, relevantSlides) {
  const citations = new Set();
  
  // Match patterns like [Slide 1], [Slides 1, 2], (Slide 1), Slide 1:, etc.
  const patterns = [
    /\[Slides?\s*([\d,\s]+)\]/gi,
    /\(Slides?\s*([\d,\s]+)\)/gi,
    /Slides?\s*([\d,\s]+):/gi,
    /اسلاید\s*([\d,\s]+)/gi,  // Persian: اسلاید
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(answer)) !== null) {
      const numbers = match[1].split(/[,\s]+/).filter(n => n.trim());
      numbers.forEach(num => {
        const slideNum = parseInt(num.trim(), 10);
        if (!isNaN(slideNum)) {
          citations.add(slideNum);
        }
      });
    }
  }
  
  // If no citations found in text, use all relevant slides
  if (citations.size === 0) {
    relevantSlides.forEach(slide => citations.add(slide.slideNumber));
  }
  
  return Array.from(citations).sort((a, b) => a - b);
}

/**
 * Generate an answer using OpenAI based on retrieved slides
 * @param {string} query - The user's question
 * @param {Array<{slideNumber: number, text: string, similarity: number}>} relevantSlides - Retrieved slides
 * @returns {Promise<{answer: string, citations: number[]}>}
 */
async function generateAnswer(query, relevantSlides) {
  // Build context from slides
  const context = buildContext(relevantSlides);
  
  // Create the user message with context and question
  const userMessage = `Here are the relevant slides from the course material:

${context}

---

Student's Question: ${query}

Please answer based ONLY on the information provided in the slides above.`;

  try {
    const response = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0,
      max_tokens: 1000
    });
    
    const answer = response.choices[0].message.content.trim();
    const citations = extractCitations(answer, relevantSlides);
    
    return {
      answer,
      citations
    };
  } catch (error) {
    console.error('Error generating answer:', error);
    throw error;
  }
}

/**
 * Main RAG function: retrieve and generate
 * @param {string} query - The user's question
 * @param {number} topK - Number of slides to retrieve
 * @returns {Promise<{answer: string, citations: number[], relevantSlides: Array}>}
 */
async function askQuestion(query, topK = 3) {
  // Ensure vector store is loaded
  loadVectorStore();
  
  // Retrieve relevant slides
  const relevantSlides = await retrieveRelevantSlides(query, topK);
  
  if (relevantSlides.length === 0) {
    return {
      answer: 'I cannot answer based on the provided material. No relevant slides were found.',
      citations: [],
      relevantSlides: []
    };
  }
  
  // Generate answer
  const { answer, citations } = await generateAnswer(query, relevantSlides);
  
  return {
    answer,
    citations,
    relevantSlides: relevantSlides.map(s => ({
      slideNumber: s.slideNumber,
      similarity: s.similarity
    }))
  };
}

module.exports = {
  retrieveRelevantSlides,
  generateAnswer,
  askQuestion,
  buildContext,
  extractCitations
};
