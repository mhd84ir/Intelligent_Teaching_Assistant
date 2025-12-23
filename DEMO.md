# RAG Teaching Assistant - Demo Script

## 🎯 Overview

This is an intelligent teaching assistant that answers student questions based **only** on course slide content. It uses RAG (Retrieval-Augmented Generation) to ensure answers are faithful to the source material.

---

## 🚀 Quick Start

### 1. Start the Server
```bash
cd Intelligent_Teaching_Assistant
node src/server.js
```

### 2. Open the App
- **Student Interface**: http://localhost:3000
- **Admin Panel**: http://localhost:3000/admin

---

## 📋 Demo Walkthrough

### Step 1: Student Interface Demo

1. Open http://localhost:3000
2. Try these questions:

| Question | Expected Result |
|----------|----------------|
| "What is supervised learning?" | ✅ Answer with citation [Slide 2], confidence: high |
| "Explain neural networks" | ✅ Answer with citation [Slide 4], confidence: high |
| "یادگیری ماشین چیست؟" | ✅ Answer in Persian, shows RTL support |
| "What is blockchain?" | ❌ "Cannot answer" - not in slides |

3. Notice:
   - **Confidence Badge**: Green (high), Yellow (medium), Red (low), Gray (none)
   - **Citations**: Shows which slides were used
   - **Warnings**: Appears if citations couldn't be verified

### Step 2: Admin Panel Demo

1. Open http://localhost:3000/admin
2. Features:
   - **Upload PDF**: Drag & drop a new PDF to update course materials
   - **System Stats**: See total slides, questions today, avg response time
   - **Question Logs**: View all recent questions with their confidence/citations
   - **Re-index**: Manually trigger re-embedding of all slides

### Step 3: API Demo (for developers)

```bash
# Ask a question
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is machine learning?"}'

# Get system stats
curl http://localhost:3000/api/admin/stats

# View question logs
curl http://localhost:3000/api/admin/logs
```

---

## 🔒 Safety Features

1. **Citation Validation**: Each citation is verified by checking if answer content appears in the cited slide
2. **Confidence Levels**: Model reports its confidence (high/medium/low/none)
3. **Refusal for Unknown**: Questions not covered in slides get "Cannot answer"
4. **Rate Limiting**: 30 requests/minute to prevent abuse
5. **Warnings**: System warns when citations can't be verified

---

## 📊 Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Student   │────▶│   Express    │────▶│  RAG Service │
│  Frontend   │◀────│   Server     │◀────│             │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                │
                    ┌──────────────┐     ┌──────▼──────┐
                    │  Vector Store │◀───│  Embedding  │
                    │  (JSON file)  │    │   Service   │
                    └──────────────┘     └──────┬──────┘
                                                │
                                         ┌──────▼──────┐
                                         │  OpenAI API │
                                         │ (via Liara) │
                                         └─────────────┘
```

---

## 🧪 Testing

Run end-to-end tests:
```bash
node test/e2e.test.js
```

Tests include:
- In-scope questions (should answer with citations)
- Out-of-scope questions (should refuse)
- Persian questions (should answer in Persian)
- Stress test (5 concurrent requests)

---

## 📁 Project Structure

```
Intelligent_Teaching_Assistant/
├── src/
│   ├── server.js          # Express server
│   ├── routes/
│   │   ├── ask.js         # Q&A endpoint
│   │   └── admin.js       # Admin endpoints
│   └── services/
│       ├── pdfService.js      # PDF extraction
│       ├── embeddingService.js # Embeddings
│       └── ragService.js      # RAG logic
├── public/
│   ├── index.html         # Student UI
│   ├── app.js
│   ├── admin.html         # Admin UI
│   └── admin.js
├── data/
│   ├── slides.json        # Extracted text
│   └── vectorStore.json   # Embeddings
├── pdfs/                  # PDF files
└── test/
    └── e2e.test.js        # E2E tests
```

---

## 🎓 For Professors

1. **Upload New Material**: Use the admin panel to upload a new PDF
2. **Monitor Usage**: Check question logs to see what students are asking
3. **Quality Assurance**: Review confidence levels and warnings
4. **Update Content**: Re-index after making changes to slides

---

## ⚠️ Limitations

- Only answers from uploaded slides (no external knowledge)
- Persian text extraction may vary by PDF quality
- Requires internet for OpenAI API calls
- Vector store is file-based (not production-ready for large scale)

---

## 📞 Support

For issues or questions, please contact the development team.
