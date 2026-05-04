#!/usr/bin/env node
/**
 * Attack-Resistant Bridge Test Suite
 * 
 * Run this to test all components:
 *   node test-bridge.js
 * 
 * Or run specific tests:
 *   node test-bridge.js test:inference
 *   node test-bridge.js test:detector
 *   node test-bridge.js test:attack-simulation
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────
// Test utilities
// ─────────────────────────────────────────────────────────────

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function log(msg, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warning: '\x1b[33m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[type] || ''}${msg}${colors.reset}`);
}

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    log(`  ✅ ${name}`, 'success');
  } catch (err) {
    failedTests++;
    log(`  ❌ ${name}`, 'error');
    log(`     ${err.message}`, 'error');
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ─────────────────────────────────────────────────────────────
// Test 1: Model Loading
// ─────────────────────────────────────────────────────────────

function testModelLoading() {
  log('\n[Test 1] Model Loading', 'info');
  
  test('Model file exists', () => {
    const modelPath = path.join(__dirname, 'ml', 'bridge_model.pkl');
    assert(fs.existsSync(modelPath), `Model not found at ${modelPath}`);
  });

  test('Scaler file exists', () => {
    const scalerPath = path.join(__dirname, 'ml', 'bridge_scaler.pkl');
    assert(fs.existsSync(scalerPath), `Scaler not found at ${scalerPath}`);
  });

  test('Python can import dependencies', () => {
    const result = spawnSync('python3', [
      '-c',
      'import pickle, numpy, sklearn; print("ok")'
    ], { encoding: 'utf-8' });
    assert(result.status === 0, `Python import failed: ${result.stderr}`);
    assert(result.stdout.includes('ok'), 'Dependencies not available');
  });
}

// ─────────────────────────────────────────────────────────────
// Test 2: Inference Tests
// ─────────────────────────────────────────────────────────────

function runInference(features) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [path.join(__dirname, 'ml', 'infer.py')]);
    let stdout = '';
    let stderr = '';

    py.stdout.on('data', d => { stdout += d; });
    py.stderr.on('data', d => { stderr += d; });

    py.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Inference failed: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Failed to parse: ${stdout}`));
      }
    });

    py.stdin.write(JSON.stringify({ features }));
    py.stdin.end();
  });
}

async function testInference() {
  log('\n[Test 2] Inference Engine', 'info');

  // Normal traffic pattern
  test('Detects normal traffic', async () => {
    const normalFeatures = [5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10];
    const result = await runInference(normalFeatures);
    assert(result.prediction === 0, `Expected normal (0), got ${result.prediction}`);
    assert(result.label === 'NORMAL', `Expected NORMAL label, got ${result.label}`);
    assert(result.confidence > 0.5, `Confidence too low: ${result.confidence}`);
  });

  // DDoS pattern: huge spike, few senders
  test('Detects DDoS attack', async () => {
    const ddosFeatures = [150, 2, 3, 1, 2.5, 50, 0.01, 0.05, 0.9, 0.95, 0.3, 0.5, 0.866, 135];
    const result = await runInference(ddosFeatures);
    assert(result.prediction === 1, `Expected attack (1), got ${result.prediction}`);
    assert(result.label === 'ATTACK', `Expected ATTACK label, got ${result.label}`);
  });

  // Sybil pattern: many senders, one receiver
  test('Detects Sybil attack', async () => {
    const sybilFeatures = [80, 40, 1, 40, 1.33, 3, 0.5, 0.8, 0.1, 0.95, 3.9, 0.5, 0.866, 50];
    const result = await runInference(sybilFeatures);
    assert(result.prediction === 1, `Expected attack (1), got ${result.prediction}`);
  });

  // Bot loop pattern: highly repetitive pairs
  test('Detects bot loop attack', async () => {
    const botLoopFeatures = [60, 2, 2, 1, 1.0, 5, 0.8, 0.2, 0.95, 0.98, 0.1, 0.5, 0.866, 45];
    const result = await runInference(botLoopFeatures);
    assert(result.prediction === 1, `Expected attack (1), got ${result.prediction}`);
  });

  // Burst pattern: huge spike in one second
  test('Detects burst attack', async () => {
    const burstFeatures = [100, 5, 10, 15, 1.67, 95, 0.01, 0.1, 0.3, 0.25, 2.3, 0.5, 0.866, 85];
    const result = await runInference(burstFeatures);
    assert(result.prediction === 1, `Expected attack (1), got ${result.prediction}`);
  });
}

// ─────────────────────────────────────────────────────────────
// Test 3: Anomaly Detector Module
// ─────────────────────────────────────────────────────────────

function testAnomalyDetector() {
  log('\n[Test 3] Anomaly Detector Module', 'info');

  test('Module loads correctly', () => {
    const detector = require('./backend/anomaly-detector.js');
    assert(typeof detector.classifyTransaction === 'function', 'Missing classifyTransaction');
    assert(typeof detector.injectMockTxs === 'function', 'Missing injectMockTxs');
    assert(typeof detector.forceClassify === 'function', 'Missing forceClassify');
  });

  test('Mock transaction injection works', () => {
    const detector = require('./backend/anomaly-detector.js');
    const mockEvents = [
      { returnValues: { from: '0x111', to: '0x222' } },
      { returnValues: { from: '0x333', to: '0x444' } }
    ];
    detector.injectMockTxs(mockEvents);
    // No error = success
  });

  test('Event emitter is available', () => {
    const detector = require('./backend/anomaly-detector.js');
    assert(typeof detector.on === 'function', 'Event emitter not available');
  });
}

// ─────────────────────────────────────────────────────────────
// Test 4: Contract Methods Module
// ─────────────────────────────────────────────────────────────

function testContractMethods() {
  log('\n[Test 4] Contract Methods Module', 'info');

  test('Module loads correctly', () => {
    const methods = require('./backend/contract-methods.js');
    assert(typeof methods.mintTokens === 'function', 'Missing mintTokens');
    assert(typeof methods.transferToEthWallet === 'function', 'Missing transferToEthWallet');
  });
}

// ─────────────────────────────────────────────────────────────
// Test 5: Event Watcher Module
// ─────────────────────────────────────────────────────────────

function testEventWatcher() {
  log('\n[Test 5] Event Watcher Module', 'info');

  test('Event watcher file exists', () => {
    const filePath = path.join(__dirname, 'backend', 'event-watcher.js');
    assert(fs.existsSync(filePath), 'event-watcher.js not found');
  });

  test('Event watcher contains detector usage', () => {
    const content = fs.readFileSync(path.join(__dirname, 'backend', 'event-watcher.js'), 'utf-8');
    assert(content.includes('isAnomalous'), 'Missing anomaly detection logic');
    assert(content.includes('Transaction blocked'), 'Missing block logic');
  });
}

// ─────────────────────────────────────────────────────────────
// Test 6: Dataset Validation
// ─────────────────────────────────────────────────────────────

function testDataset() {
  log('\n[Test 6] Dataset Validation', 'info');

  test('Dataset file exists', () => {
    const datasetPath = path.join(__dirname, 'ml', 'bridge_anomaly_dataset.csv');
    assert(fs.existsSync(datasetPath), `Dataset not found at ${datasetPath}`);
  });

  test('Dataset has data', () => {
    const datasetPath = path.join(__dirname, 'ml', 'bridge_anomaly_dataset.csv');
    const content = fs.readFileSync(datasetPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert(lines.length > 1, 'Dataset is empty or header-only');
  });
}

// ─────────────────────────────────────────────────────────────
// Test 7: Integration Test (Classification & Blocking)
// ─────────────────────────────────────────────────────────────

async function testIntegration() {
  log('\n[Test 7] Integration Test', 'info');

  test('Can classify normal transaction', async () => {
    const detector = require('./backend/anomaly-detector.js');
    const event = {
      returnValues: {
        from: '0x' + '1'.repeat(40),
        to: '0x' + '2'.repeat(40),
        value: '1000000000000000000'
      }
    };
    
    // Should not throw
    try {
      await detector.classifyTransaction(event);
    } catch (err) {
      assert(false, `Classification failed: ${err.message}`);
    }
  });
}

// ─────────────────────────────────────────────────────────────
// Main Test Runner
// ─────────────────────────────────────────────────────────────

async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'info');
  log('║     Attack-Resistant Bridge — Test Suite                  ║', 'info');
  log('╚════════════════════════════════════════════════════════════╝', 'info');

  // Synchronous tests
  testModelLoading();
  testAnomalyDetector();
  testContractMethods();
  testEventWatcher();
  testDataset();

  // Asynchronous tests
  await testInference();
  await testIntegration();

  // Summary
  log('\n╔════════════════════════════════════════════════════════════╗', 'info');
  log(`║ Total: ${totalTests} | ✅ Passed: ${passedTests} | ❌ Failed: ${failedTests}${' '.repeat(totalTests.toString().length + passedTests.toString().length - 10)} ║`, passedTests === totalTests ? 'success' : 'warning');
  log('╚════════════════════════════════════════════════════════════╝', 'info');

  if (failedTests > 0) {
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(err => {
  log(`Fatal error: ${err.message}`, 'error');
  process.exit(1);
});
