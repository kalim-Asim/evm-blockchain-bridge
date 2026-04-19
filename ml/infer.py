#!/usr/bin/env python3
"""
SVM inference script — called by the bridge backend as a child process.
Reads JSON {"features": [f1, f2, ..., f14]} from stdin.
Writes JSON {"prediction": 0|1, "label": "NORMAL"|"ATTACK", "confidence": 0.xx} to stdout.
"""
import sys
import json
import os
import pickle
import numpy as np

ML_DIR = os.path.dirname(os.path.abspath(__file__))

def main():
    try:
        data = json.loads(sys.stdin.read())
        features = np.array(data['features'], dtype=float).reshape(1, -1)
    except Exception as e:
        json.dump({'error': f'Input parse failed: {e}'}, sys.stdout)
        sys.exit(1)

    try:
        with open(os.path.join(ML_DIR, 'bridge_svm_model.pkl'), 'rb') as f:
            model = pickle.load(f)
        with open(os.path.join(ML_DIR, 'bridge_scaler.pkl'), 'rb') as f:
            scaler = pickle.load(f)
    except Exception as e:
        json.dump({'error': f'Model load failed: {e}'}, sys.stdout)
        sys.exit(1)

    scaled = scaler.transform(features)
    pred = int(model.predict(scaled)[0])
    proba = model.predict_proba(scaled)[0]
    confidence = float(max(proba))
    label = 'ATTACK' if pred == 1 else 'NORMAL'

    json.dump({'prediction': pred, 'label': label, 'confidence': confidence}, sys.stdout)

if __name__ == '__main__':
    main()
