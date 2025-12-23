/**
 * Admin Panel JavaScript
 */

// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

const totalSlides = document.getElementById('totalSlides');
const totalQuestions = document.getElementById('totalQuestions');
const avgResponseTime = document.getElementById('avgResponseTime');
const vectorDimensions = document.getElementById('vectorDimensions');
const refreshStatsBtn = document.getElementById('refreshStats');
const reindexBtn = document.getElementById('reindexBtn');
const statsStatus = document.getElementById('statsStatus');

const logsContainer = document.getElementById('logsContainer');
const refreshLogsBtn = document.getElementById('refreshLogs');
const clearLogsBtn = document.getElementById('clearLogs');

let selectedFile = null;

// File Upload Handlers
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length && files[0].type === 'application/pdf') {
        handleFileSelect(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFileSelect(e.target.files[0]);
    }
});

function handleFileSelect(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    fileInfo.classList.add('visible');
    uploadBtn.disabled = false;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// Upload Handler
uploadBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<span class="spinner"></span> Processing...';
    progressBar.classList.add('visible');
    showStatus(uploadStatus, 'loading', 'Uploading PDF...');

    const formData = new FormData();
    formData.append('pdf', selectedFile);

    try {
        // Simulate progress
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress = Math.min(progress + 10, 90);
            progressFill.style.width = progress + '%';
        }, 500);

        const response = await fetch('/api/admin/upload', {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);
        progressFill.style.width = '100%';

        const result = await response.json();

        if (result.success) {
            showStatus(uploadStatus, 'success', `✅ ${result.message}`);
            refreshStats();
        } else {
            showStatus(uploadStatus, 'error', `❌ ${result.error}`);
        }
    } catch (error) {
        showStatus(uploadStatus, 'error', `❌ Upload failed: ${error.message}`);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '📤 Upload & Process';
        setTimeout(() => {
            progressBar.classList.remove('visible');
            progressFill.style.width = '0%';
        }, 1000);
    }
});

// Stats Handlers
refreshStatsBtn.addEventListener('click', refreshStats);

async function refreshStats() {
    try {
        const response = await fetch('/api/admin/stats');
        const stats = await response.json();

        totalSlides.textContent = stats.totalSlides || 0;
        totalQuestions.textContent = stats.questionsToday || 0;
        avgResponseTime.textContent = stats.avgResponseTime || '-';
        vectorDimensions.textContent = stats.vectorDimensions || 1536;

        showStatus(statsStatus, 'success', '✅ Stats refreshed');
        setTimeout(() => statsStatus.classList.remove('visible'), 2000);
    } catch (error) {
        showStatus(statsStatus, 'error', `❌ Failed to load stats: ${error.message}`);
    }
}

// Re-index Handler
reindexBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to re-index all slides? This may take a while.')) {
        return;
    }

    reindexBtn.disabled = true;
    reindexBtn.innerHTML = '<span class="spinner"></span> Re-indexing...';
    showStatus(statsStatus, 'loading', 'Re-indexing slides...');

    try {
        const response = await fetch('/api/admin/reindex', { method: 'POST' });
        const result = await response.json();

        if (result.success) {
            showStatus(statsStatus, 'success', `✅ ${result.message}`);
            refreshStats();
        } else {
            showStatus(statsStatus, 'error', `❌ ${result.error}`);
        }
    } catch (error) {
        showStatus(statsStatus, 'error', `❌ Re-index failed: ${error.message}`);
    } finally {
        reindexBtn.disabled = false;
        reindexBtn.innerHTML = '🔄 Re-index All';
    }
});

// Logs Handlers
refreshLogsBtn.addEventListener('click', refreshLogs);

async function refreshLogs() {
    try {
        const response = await fetch('/api/admin/logs');
        const logs = await response.json();

        if (logs.length === 0) {
            logsContainer.innerHTML = '<div class="empty-logs">No questions logged yet</div>';
            return;
        }

        logsContainer.innerHTML = logs.map(log => `
            <div class="log-entry">
                <div class="log-time">${formatTime(log.timestamp)}</div>
                <div class="log-question">"${escapeHtml(log.question)}"</div>
                <div class="log-meta">
                    <span>⏱️ ${log.responseTime}ms</span>
                    <span>📊 ${log.confidence || 'N/A'}</span>
                    <span>📚 ${log.citations ? log.citations.join(', ') : 'None'}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        logsContainer.innerHTML = `<div class="empty-logs">Failed to load logs: ${error.message}</div>`;
    }
}

clearLogsBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to clear all logs?')) {
        return;
    }

    try {
        await fetch('/api/admin/logs', { method: 'DELETE' });
        refreshLogs();
    } catch (error) {
        console.error('Failed to clear logs:', error);
    }
});

// Utility Functions
function showStatus(element, type, message) {
    element.textContent = message;
    element.className = `status visible ${type}`;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
window.addEventListener('load', () => {
    refreshStats();
    refreshLogs();
});
