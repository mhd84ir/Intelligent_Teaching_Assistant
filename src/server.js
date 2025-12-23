require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const askRoute = require('./routes/ask');
const { router: adminRouter } = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Simple in-memory rate limiter
const rateLimiter = {
  requests: new Map(),
  windowMs: 60000, // 1 minute
  maxRequests: 30, // 30 requests per minute
  
  check(ip) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    // Get or create request history for this IP
    let history = this.requests.get(ip) || [];
    
    // Filter to only requests in current window
    history = history.filter(time => time > windowStart);
    
    if (history.length >= this.maxRequests) {
      return false; // Rate limited
    }
    
    history.push(now);
    this.requests.set(ip, history);
    return true;
  }
};

// Rate limiter middleware for /api/ask
const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  
  if (!rateLimiter.check(ip)) {
    return res.status(429).json({
      success: false,
      error: 'Too many requests. Please wait a minute before trying again.'
    });
  }
  
  next();
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/ask', rateLimitMiddleware, askRoute);
app.use('/api/admin', adminRouter);

// Serve admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📚 RAG Teaching Assistant API ready`);
  console.log(`   POST /api/ask   - Ask a question`);
  console.log(`   GET  /admin     - Admin panel`);
  console.log(`   GET  /health    - Health check`);
});
