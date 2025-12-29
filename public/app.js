/**
 * RAG Teaching Assistant - Frontend JavaScript
 * Intelligent Version with Multi-Query & Re-Ranking
 */

// DOM Elements
const questionInput = document.getElementById('question');
const askBtn = document.getElementById('askBtn');
const answerSection = document.getElementById('answerSection');
const answerText = document.getElementById('answerText');
const citationsList = document.getElementById('citationsList');
const similarityList = document.getElementById('similarityList');
const errorMessage = document.getElementById('errorMessage');
const confidenceBadge = document.getElementById('confidenceBadge');
const warningsSection = document.getElementById('warningsSection');
const warningsList = document.getElementById('warningsList');

// Session management
let sessionId = localStorage.getItem('sessionId') || generateSessionId();
localStorage.setItem('sessionId', sessionId);

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Confidence level labels and colors
const confidenceLabels = {
    high: { text: '🟢 بالا / High', class: 'confidence-high' },
    medium: { text: '🟡 متوسط / Medium', class: 'confidence-medium' },
    low: { text: '🟠 پایین / Low', class: 'confidence-low' },
    none: { text: '🔴 یافت نشد / Not Found', class: 'confidence-none' }
};

/**
 * Main function to ask a question
 */
async function askQuestion() {
    const question = questionInput.value.trim();

    // Validate input
    if (!question) {
        showError('لطفاً یک سوال وارد کنید / Please enter a question');
        return;
    }

    // Show loading state
    setLoading(true);
    hideError();
    hideAnswer();

    try {
        // Send request to API with intelligent mode enabled
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                question,
                sessionId,
                useIntelligent: true  // Use new intelligent RAG
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'خطا در دریافت پاسخ / Error getting response');
        }

        if (!data.success) {
            throw new Error(data.error || 'خطای نامشخص / Unknown error');
        }

        // Display the answer
        displayAnswer(data);

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'خطا در ارتباط با سرور / Server connection error');
    } finally {
        setLoading(false);
    }
}

/**
 * Display the answer and citations
 */
function displayAnswer(data) {
    // Format answer with markdown-like styling
    let formattedAnswer = data.answer;
    
    // Convert markdown-style formatting to HTML
    formattedAnswer = formattedAnswer
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)$/gm, '• $1')
        .replace(/^(\d+)\. (.*)$/gm, '$1. $2')
        .replace(/\n/g, '<br>');
    
    answerText.innerHTML = formattedAnswer;

    // Show confidence badge
    const confidence = data.confidence || 'low';
    const confInfo = confidenceLabels[confidence] || confidenceLabels.low;
    confidenceBadge.textContent = confInfo.text;
    confidenceBadge.className = `confidence-badge ${confInfo.class}`;

    // Show key points if available
    if (data.keyPoints && data.keyPoints.length > 0) {
        const keyPointsDiv = document.createElement('div');
        keyPointsDiv.className = 'key-points';
        keyPointsDiv.innerHTML = `
            <h4>📌 نکات کلیدی / Key Points:</h4>
            <ul>
                ${data.keyPoints.map(point => `<li>${point}</li>`).join('')}
            </ul>
        `;
        answerText.appendChild(keyPointsDiv);
    }

    // Show additional notes if available
    if (data.additionalNotes) {
        const notesDiv = document.createElement('div');
        notesDiv.className = 'additional-notes';
        notesDiv.innerHTML = `
            <h4>📚 برای مطالعه بیشتر / Additional Notes:</h4>
            <p>${data.additionalNotes}</p>
        `;
        answerText.appendChild(notesDiv);
    }

    // Show response time
    if (data.responseTime) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'response-time';
        timeDiv.innerHTML = `⏱️ زمان پاسخ: ${data.responseTime}ms`;
        answerText.appendChild(timeDiv);
    }

    // Show warnings if any
    warningsList.innerHTML = '';
    if (data.warnings && data.warnings.length > 0) {
        data.warnings.forEach(warning => {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'warning-item';
            warningDiv.textContent = warning;
            warningsList.appendChild(warningDiv);
        });
        warningsSection.classList.add('visible');
    } else {
        warningsSection.classList.remove('visible');
    }

    // Show citations
    citationsList.innerHTML = '';
    if (data.citations && data.citations.length > 0) {
        data.citations.forEach(slideNum => {
            const badge = document.createElement('span');
            badge.className = 'citation-badge';
            badge.textContent = `📄 اسلاید ${slideNum}`;
            citationsList.appendChild(badge);
        });
    } else {
        citationsList.innerHTML = '<span style="color: #999;">بدون منبع / No citations</span>';
    }

    // Show similarity scores with document names
    similarityList.innerHTML = '';
    if (data.relevantSlides && data.relevantSlides.length > 0) {
        data.relevantSlides.forEach(slide => {
            const li = document.createElement('li');
            const docName = slide.documentName ? ` (${slide.documentName.substring(0, 30)}...)` : '';
            li.innerHTML = `
                <span>📑 اسلاید ${slide.slideNumber}${docName}</span>
                <span class="preview">${slide.preview || ''}</span>
            `;
            similarityList.appendChild(li);
        });
    }

    // Show the answer section
    answerSection.classList.add('visible');
}

/**
 * Set loading state
 */
function setLoading(isLoading) {
    askBtn.disabled = isLoading;
    if (isLoading) {
        askBtn.classList.add('loading');
        askBtn.textContent = '🔄 در حال پردازش...';
    } else {
        askBtn.classList.remove('loading');
        askBtn.textContent = '🚀 پرسش / Ask';
    }
}

/**
 * Show error message
 */
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.add('visible');
}

/**
 * Hide error message
 */
function hideError() {
    errorMessage.classList.remove('visible');
}

/**
 * Hide answer section
 */
function hideAnswer() {
    answerSection.classList.remove('visible');
}

/**
 * Toggle RTL/LTR language direction
 */
function toggleLanguage() {
    document.body.classList.toggle('ltr');
}

/**
 * Clear conversation history
 */
async function clearHistory() {
    try {
        await fetch('/api/ask/clear-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
        });
        sessionId = generateSessionId();
        localStorage.setItem('sessionId', sessionId);
        alert('تاریخچه پاک شد / History cleared');
    } catch (error) {
        console.error('Error clearing history:', error);
    }
}

/**
 * Allow submitting with Enter key (Ctrl+Enter for multiline)
 */
questionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        askQuestion();
    }
});

// Focus on input when page loads
window.addEventListener('load', () => {
    questionInput.focus();
});
