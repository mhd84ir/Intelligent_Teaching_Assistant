require('dotenv').config();
const OpenAI = require('openai');
const { getEmbedding, findSimilarSlides, loadVectorStore, cosineSimilarity } = require('./embeddingService');

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

// System prompt for the teaching assistant with structured output
const SYSTEM_PROMPT = `You are a teaching assistant. Answer the student's question based ONLY on the provided slides.

You MUST respond with a valid JSON object in this exact format:
{
  "answer": "Your answer here",
  "citations": [1, 2],
  "confidence": "high"
}

RULES:
1. "answer": Answer the question based ONLY on the slides. If the answer is not in the slides, say "I cannot answer based on the provided material."
2. "citations": Array of slide numbers you used (e.g., [1, 2]). Empty array [] if no slides were used.
3. "confidence": 
   - "high": Answer is directly stated in the slides with clear evidence
   - "medium": Answer is inferred from slide content but not explicitly stated
   - "low": Answer is loosely related to slides, requires interpretation
   - "none": Answer cannot be found in the slides

ADDITIONAL RULES:
- Answer in the SAME language as the question (Persian question → Persian answer, English question → English answer)
- Be concise but thorough
- Do NOT make up information not in the slides
- Do NOT include markdown formatting or code blocks, just the raw JSON

RESPOND WITH ONLY THE JSON OBJECT, NO OTHER TEXT.`;

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
 * Validate citations by checking if answer content appears in cited slides
 * @param {string} answer - The generated answer
 * @param {number[]} citations - Array of cited slide numbers
 * @param {Array<{slideNumber: number, text: string}>} relevantSlides - The slides provided
 * @returns {{validatedCitations: number[], warnings: string[]}}
 */
function validateCitations(answer, citations, relevantSlides) {
  const validatedCitations = [];
  const warnings = [];
  
  // Create a map of slide number to text
  const slideMap = new Map();
  relevantSlides.forEach(slide => {
    slideMap.set(slide.slideNumber, slide.text.toLowerCase());
  });
  
  // Extract key terms from the answer (words longer than 4 chars)
  const answerLower = answer.toLowerCase();
  const answerWords = answerLower
    .split(/[\s,.;:!?()[\]{}'"]+/)
    .filter(word => word.length > 4)
    .filter(word => !['based', 'about', 'which', 'their', 'there', 'these', 'those', 'would', 'could', 'should'].includes(word));
  
  for (const slideNum of citations) {
    const slideText = slideMap.get(slideNum);
    
    if (!slideText) {
      warnings.push(`⚠️ Slide ${slideNum} was cited but not in context`);
      continue;
    }
    
    // Check if significant words from answer appear in slide
    let matchCount = 0;
    const matchedWords = [];
    
    for (const word of answerWords) {
      if (slideText.includes(word)) {
        matchCount++;
        matchedWords.push(word);
      }
    }
    
    // Require at least 30% of answer words to be in the slide, or at least 3 matches
    const matchRatio = answerWords.length > 0 ? matchCount / answerWords.length : 0;
    
    if (matchRatio >= 0.3 || matchCount >= 3) {
      validatedCitations.push(slideNum);
    } else {
      warnings.push(`⚠️ Citation [Slide ${slideNum}] could not be fully verified (${matchCount}/${answerWords.length} terms matched)`);
      // Still include citation but with warning
      validatedCitations.push(slideNum);
    }
  }
  
  return { validatedCitations, warnings };
}

/**
 * Parse JSON response from the model, handling potential formatting issues
 * @param {string} responseText - The raw response from the model
 * @returns {{answer: string, citations: number[], confidence: string}}
 */
function parseStructuredResponse(responseText) {
  // Default response if parsing fails
  const defaultResponse = {
    answer: responseText,
    citations: [],
    confidence: 'low'
  };
  
  try {
    // Try to extract JSON from the response
    let jsonStr = responseText.trim();
    
    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }
    
    // Find JSON object in the response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    
    const parsed = JSON.parse(jsonStr);
    
    return {
      answer: parsed.answer || responseText,
      citations: Array.isArray(parsed.citations) ? parsed.citations.map(n => parseInt(n, 10)).filter(n => !isNaN(n)) : [],
      confidence: ['high', 'medium', 'low', 'none'].includes(parsed.confidence) ? parsed.confidence : 'low'
    };
  } catch (error) {
    console.warn('Failed to parse structured response, using fallback extraction');
    
    // Fallback: try to extract citations from text
    const citationMatch = responseText.match(/\[Slides?\s*([\d,\s]+)\]/gi);
    const citations = [];
    if (citationMatch) {
      citationMatch.forEach(match => {
        const nums = match.match(/\d+/g);
        if (nums) {
          nums.forEach(n => citations.push(parseInt(n, 10)));
        }
      });
    }
    
    return {
      ...defaultResponse,
      citations: [...new Set(citations)]
    };
  }
}

/**
 * Generate an answer using OpenAI based on retrieved slides
 * @param {string} query - The user's question
 * @param {Array<{slideNumber: number, text: string, similarity: number}>} relevantSlides - Retrieved slides
 * @returns {Promise<{answer: string, citations: number[], confidence: string, warnings: string[]}>}
 */
async function generateAnswer(query, relevantSlides) {
  // Build context from slides
  const context = buildContext(relevantSlides);
  
  // Create the user message with context and question
  const userMessage = `Here are the relevant slides from the course material:

${context}

---

Student's Question: ${query}

Remember: Respond with ONLY a JSON object containing "answer", "citations", and "confidence".`;

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
    
    const responseText = response.choices[0].message.content.trim();
    
    // Parse structured response
    const { answer, citations, confidence } = parseStructuredResponse(responseText);
    
    // Validate citations
    const { validatedCitations, warnings } = validateCitations(answer, citations, relevantSlides);
    
    // Add warning if confidence is none but citations exist
    if (confidence === 'none' && validatedCitations.length > 0) {
      warnings.push('⚠️ Model indicates low confidence but provided citations');
    }
    
    // Add warning if "cannot answer" but has citations
    const cannotAnswerPhrases = [
      'cannot answer',
      'can\'t answer',
      'نمی‌توانم پاسخ',
      'امکان پاسخ',
      'not in the slides',
      'not found in'
    ];
    
    const seemsLikeRefusal = cannotAnswerPhrases.some(phrase => 
      answer.toLowerCase().includes(phrase.toLowerCase())
    );
    
    if (seemsLikeRefusal && validatedCitations.length > 0) {
      // Clear citations if it's a refusal
      return {
        answer,
        citations: [],
        confidence: 'none',
        warnings: []
      };
    }
    
    return {
      answer,
      citations: validatedCitations,
      confidence,
      warnings
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
 * @returns {Promise<{answer: string, citations: number[], confidence: string, warnings: string[], relevantSlides: Array}>}
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
      confidence: 'none',
      warnings: [],
      relevantSlides: []
    };
  }
  
  // Check if any slides have reasonable similarity
  const maxSimilarity = Math.max(...relevantSlides.map(s => s.similarity));
  const warnings = [];
  
  if (maxSimilarity < 0.3) {
    warnings.push('⚠️ Low relevance: No slides closely match your question');
  }
  
  // Generate answer
  const result = await generateAnswer(query, relevantSlides);
  
  return {
    answer: result.answer,
    citations: result.citations,
    confidence: result.confidence,
    warnings: [...warnings, ...result.warnings],
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
  validateCitations,
  parseStructuredResponse
};
