/**
 * RAG Teaching Assistant - Frontend JavaScript
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

// Confidence level labels and colors
const confidenceLabels = {
    high: { text: 'بالا / High', class: 'confidence-high' },
    medium: { text: 'متوسط / Medium', class: 'confidence-medium' },
    low: { text: 'پایین / Low', class: 'confidence-low' },
    none: { text: 'یافت نشد / Not Found', class: 'confidence-none' }
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
        // Send request to API
        const response = await fetch('/api/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question }),
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
    // Show answer text
    answerText.textContent = data.answer;

    // Show confidence badge
    const confidence = data.confidence || 'low';
    const confInfo = confidenceLabels[confidence] || confidenceLabels.low;
    confidenceBadge.textContent = confInfo.text;
    confidenceBadge.className = `confidence-badge ${confInfo.class}`;

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
            badge.textContent = `اسلاید ${slideNum} / Slide ${slideNum}`;
            citationsList.appendChild(badge);
        });
    } else {
        citationsList.innerHTML = '<span style="color: #999;">بدون منبع / No citations</span>';
    }

    // Show similarity scores (optional details)
    similarityList.innerHTML = '';
    if (data.relevantSlides && data.relevantSlides.length > 0) {
        data.relevantSlides.forEach(slide => {
            const li = document.createElement('li');
            const similarity = (slide.similarity * 100).toFixed(1);
            li.innerHTML = `
                <span>اسلاید ${slide.slideNumber}</span>
                <span>شباهت: ${similarity}%</span>
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
    } else {
        askBtn.classList.remove('loading');
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
