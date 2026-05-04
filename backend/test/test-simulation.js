const detector = require('./anomaly-detector');

detector.on('classification', (data) => {
  console.log(`[Detector] Window classification: ${data.isAttack ? '🚨 ATTACK' : '✅ NORMAL'} (confidence: ${data.confidence.toFixed(1)}%)`);
});

require('./simulate-attack.js');
