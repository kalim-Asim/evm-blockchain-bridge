const detector = require('./anomaly-detector');

detector.on('classification', (data) => {
  console.log(`[Detector] classification: ${data.isAttack ? '🚨 ATTACK' : '✅ NORMAL'} (confidence: ${data.confidence.toFixed(3)})`);
  console.log(`[Detector] features: ${JSON.stringify(data)}`);
});

require('./simulate-attack.js');
