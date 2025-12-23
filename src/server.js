require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const askRoute = require('./routes/ask');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/ask', askRoute);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 RAG Teaching Assistant API ready`);
  console.log(`   POST /api/ask - Ask a question`);
  console.log(`   GET  /health  - Health check`);
});
