/**
 * End-to-End Tests for RAG Teaching Assistant
 * Run with: node test/e2e.test.js
 */

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

// Test configuration
const BASE_URL = 'http://localhost:3000';
const TIMEOUT = 15000; // 15 seconds max per request
const MAX_RESPONSE_TIME = 5000; // 5 seconds target

// Test cases
const testCases = [
  {
    name: 'In-scope English question (supervised learning)',
    question: 'What is supervised learning?',
    expectedCitations: true,
    expectedConfidence: ['high', 'medium'],
    shouldAnswer: true
  },
  {
    name: 'In-scope English question (neural networks)',
    question: 'Explain neural networks',
    expectedCitations: true,
    expectedConfidence: ['high', 'medium'],
    shouldAnswer: true
  },
  {
    name: 'In-scope English question (unsupervised learning)',
    question: 'What is unsupervised learning?',
    expectedCitations: true,
    expectedConfidence: ['high', 'medium'],
    shouldAnswer: true
  },
  {
    name: 'Multi-slide question (types of ML)',
    question: 'What are all the types of machine learning?',
    expectedCitations: true,
    minCitations: 1,
    shouldAnswer: true
  },
  {
    name: 'Out-of-scope question (quantum computing)',
    question: 'What is quantum computing?',
    expectedConfidence: ['none', 'low'],
    shouldAnswer: false
  },
  {
    name: 'Out-of-scope question (blockchain)',
    question: 'Explain blockchain technology',
    expectedConfidence: ['none', 'low'],
    shouldAnswer: false
  },
  {
    name: 'Persian question (machine learning)',
    question: 'یادگیری ماشین چیست؟',
    expectedCitations: true,
    shouldAnswer: true
  },
  {
    name: 'Mixed language question',
    question: 'Neural networks چیست؟',
    expectedCitations: true,
    shouldAnswer: true
  }
];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Make HTTP POST request
 */
function makeRequest(endpoint, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const data = JSON.stringify(body);
    const startTime = Date.now();

    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: TIMEOUT
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        try {
          const json = JSON.parse(responseData);
          resolve({ ...json, responseTime, statusCode: res.statusCode });
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${responseData}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(data);
    req.end();
  });
}

/**
 * Check if server is running
 */
async function checkServer() {
  return new Promise((resolve) => {
    const url = new URL('/health', BASE_URL);
    const req = http.get(url, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    if (await checkServer()) {
      return true;
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Run a single test case
 */
async function runTest(testCase, index) {
  const testNum = `[${index + 1}/${testCases.length}]`;
  log(`\n${testNum} Testing: ${testCase.name}`, 'cyan');
  log(`   Question: "${testCase.question}"`, 'blue');

  try {
    const result = await makeRequest('/api/ask', { question: testCase.question });
    
    const checks = [];
    let passed = true;

    // Check 1: Response time
    const timeCheck = result.responseTime < MAX_RESPONSE_TIME;
    checks.push({
      name: 'Response time',
      passed: timeCheck,
      detail: `${result.responseTime}ms (max: ${MAX_RESPONSE_TIME}ms)`
    });
    if (!timeCheck) passed = false;

    // Check 2: Success response
    const successCheck = result.success === true;
    checks.push({
      name: 'API success',
      passed: successCheck,
      detail: result.success ? 'true' : 'false'
    });
    if (!successCheck) passed = false;

    // Check 3: Has answer
    const hasAnswer = result.answer && result.answer.length > 0;
    checks.push({
      name: 'Has answer',
      passed: hasAnswer,
      detail: hasAnswer ? `${result.answer.length} chars` : 'No answer'
    });
    if (!hasAnswer) passed = false;

    // Check 4: Citations (if expected)
    if (testCase.expectedCitations) {
      const hasCitations = result.citations && result.citations.length > 0;
      const minCitations = testCase.minCitations || 1;
      const citationCheck = hasCitations && result.citations.length >= minCitations;
      checks.push({
        name: 'Citations',
        passed: citationCheck,
        detail: hasCitations ? `[${result.citations.join(', ')}]` : 'None'
      });
      if (!citationCheck) passed = false;
    }

    // Check 5: Confidence level (if expected)
    if (testCase.expectedConfidence) {
      const confidenceCheck = testCase.expectedConfidence.includes(result.confidence);
      checks.push({
        name: 'Confidence',
        passed: confidenceCheck,
        detail: `${result.confidence} (expected: ${testCase.expectedConfidence.join('/')})`
      });
      if (!confidenceCheck) passed = false;
    }

    // Check 6: Should answer or refuse
    if (testCase.shouldAnswer !== undefined) {
      const refusalPhrases = ['cannot answer', 'can\'t answer', 'not in the', 'نمی‌توانم'];
      const isRefusal = refusalPhrases.some(p => result.answer.toLowerCase().includes(p.toLowerCase()));
      const answerCheck = testCase.shouldAnswer ? !isRefusal : isRefusal;
      checks.push({
        name: testCase.shouldAnswer ? 'Provides answer' : 'Refuses (out of scope)',
        passed: answerCheck,
        detail: isRefusal ? 'Refused' : 'Answered'
      });
      if (!answerCheck) passed = false;
    }

    // Print results
    for (const check of checks) {
      const icon = check.passed ? '✅' : '❌';
      const color = check.passed ? 'green' : 'red';
      log(`   ${icon} ${check.name}: ${check.detail}`, color);
    }

    return { passed, checks, result };

  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
    return { passed: false, error: error.message };
  }
}

/**
 * Run concurrent stress test
 */
async function runStressTest(concurrency = 5) {
  log('\n' + '='.repeat(60), 'yellow');
  log('🔥 STRESS TEST: Concurrent Requests', 'yellow');
  log('='.repeat(60), 'yellow');

  const questions = [
    'What is machine learning?',
    'Explain supervised learning',
    'What are neural networks?',
    'یادگیری ماشین چیست؟',
    'What is unsupervised learning?'
  ];

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < concurrency; i++) {
    const question = questions[i % questions.length];
    promises.push(makeRequest('/api/ask', { question }));
  }

  try {
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    const avgTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length;
    const allSuccess = results.every(r => r.success);

    log(`\n   📊 Results:`, 'cyan');
    log(`   - Concurrent requests: ${concurrency}`, 'blue');
    log(`   - Total time: ${totalTime}ms`, 'blue');
    log(`   - Average response time: ${Math.round(avgTime)}ms`, 'blue');
    log(`   - All successful: ${allSuccess ? '✅ Yes' : '❌ No'}`, allSuccess ? 'green' : 'red');

    return { passed: allSuccess, totalTime, avgTime };
  } catch (error) {
    log(`   ❌ Stress test failed: ${error.message}`, 'red');
    return { passed: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function main() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 RAG Teaching Assistant - E2E Tests', 'cyan');
  log('='.repeat(60), 'cyan');

  // Check if server is running
  log('\n⏳ Checking server status...', 'yellow');
  const serverRunning = await checkServer();

  if (!serverRunning) {
    log('⚠️  Server not running. Please start it with: node src/server.js', 'yellow');
    log('   Waiting for server...', 'yellow');
    
    const ready = await waitForServer(15);
    if (!ready) {
      log('❌ Server not available. Exiting.', 'red');
      process.exit(1);
    }
  }

  log('✅ Server is running', 'green');

  // Run individual tests
  log('\n' + '='.repeat(60), 'yellow');
  log('📝 FUNCTIONAL TESTS', 'yellow');
  log('='.repeat(60), 'yellow');

  let passedCount = 0;
  let failedCount = 0;
  const results = [];

  for (let i = 0; i < testCases.length; i++) {
    const result = await runTest(testCases[i], i);
    results.push(result);
    if (result.passed) {
      passedCount++;
    } else {
      failedCount++;
    }
    // Small delay between tests
    await new Promise(r => setTimeout(r, 500));
  }

  // Run stress test
  const stressResult = await runStressTest(5);

  // Print summary
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');

  log(`\n   Functional Tests: ${passedCount}/${testCases.length} passed`, passedCount === testCases.length ? 'green' : 'red');
  log(`   Stress Test: ${stressResult.passed ? 'PASSED' : 'FAILED'}`, stressResult.passed ? 'green' : 'red');

  const overallPassed = passedCount === testCases.length && stressResult.passed;
  
  log('\n' + '='.repeat(60), overallPassed ? 'green' : 'red');
  log(overallPassed ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED', overallPassed ? 'green' : 'red');
  log('='.repeat(60), overallPassed ? 'green' : 'red');

  process.exit(overallPassed ? 0 : 1);
}

// Run tests
main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  process.exit(1);
});
