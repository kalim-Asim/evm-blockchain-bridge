#!/usr/bin/env python3
"""
ML Model & Dataset Validation Tests
Run: python3 test-ml-model.py
"""

import sys
import os
import pickle
import json
import numpy as np
import pandas as pd
from pathlib import Path

ML_DIR = Path(__file__).parent.absolute()

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    BLUE = '\033[94m'
    YELLOW = '\033[93m'
    RESET = '\033[0m'

def log(msg, color=''):
    print(f"{color}{msg}{Colors.RESET}")

# ─────────────────────────────────────────────────────────────
# Test Results Tracking
# ─────────────────────────────────────────────────────────────

total_tests = 0
passed_tests = 0
failed_tests = 0

def test(name, fn):
    global total_tests, passed_tests, failed_tests
    total_tests += 1
    try:
        fn()
        passed_tests += 1
        log(f"  ✅ {name}", Colors.GREEN)
    except Exception as err:
        failed_tests += 1
        log(f"  ❌ {name}", Colors.RED)
        log(f"     {str(err)}", Colors.RED)

def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)

# ─────────────────────────────────────────────────────────────
# Test 1: Model Loading
# ─────────────────────────────────────────────────────────────

def test_model_loading():
    log('\n[Test 1] Model & Scaler Loading', Colors.BLUE)
    
    def test_model_exists():
        model_path = ML_DIR / 'bridge_model.pkl'
        assert_true(model_path.exists(), f"Model not found at {model_path}")
    
    def test_scaler_exists():
        scaler_path = ML_DIR / 'bridge_scaler.pkl'
        assert_true(scaler_path.exists(), f"Scaler not found at {scaler_path}")
    
    def test_model_loads():
        with open(ML_DIR / 'bridge_model.pkl', 'rb') as f:
            model = pickle.load(f)
        assert_true(hasattr(model, 'predict'), "Model missing predict method")
        assert_true(hasattr(model, 'predict_proba'), "Model missing predict_proba method")
    
    def test_scaler_loads():
        with open(ML_DIR / 'bridge_scaler.pkl', 'rb') as f:
            scaler = pickle.load(f)
        assert_true(hasattr(scaler, 'transform'), "Scaler missing transform method")
    
    def test_model_type():
        with open(ML_DIR / 'bridge_model.pkl', 'rb') as f:
            model = pickle.load(f)
        model_name = type(model).__name__
        log(f"    Model type: {model_name}", Colors.YELLOW)
        assert_true('Voting' in model_name or 'Ensemble' in model_name or 'Forest' in model_name, 
                   f"Unexpected model type: {model_name}")
    
    test("Model file exists", test_model_exists)
    test("Scaler file exists", test_scaler_exists)
    test("Model loads without error", test_model_loads)
    test("Scaler loads without error", test_scaler_loads)
    test("Model type is ensemble-like", test_model_type)

# ─────────────────────────────────────────────────────────────
# Test 2: Inference Tests
# ─────────────────────────────────────────────────────────────

def test_inference():
    log('\n[Test 2] Inference Tests', Colors.BLUE)
    
    with open(ML_DIR / 'bridge_model.pkl', 'rb') as f:
        model = pickle.load(f)
    with open(ML_DIR / 'bridge_scaler.pkl', 'rb') as f:
        scaler = pickle.load(f)
    
    def test_normal_traffic():
        # Normal traffic: low activity, diverse senders/receivers
        features = np.array([[5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10]])
        scaled = scaler.transform(features)
        pred = model.predict(scaled)[0]
        proba = model.predict_proba(scaled)[0]
        assert_true(pred == 0, f"Expected normal (0), got {pred}")
        assert_true(max(proba) > 0.5, f"Confidence too low: {max(proba)}")
    
    def test_ddos_attack():
        # DDoS: massive transactions, 1-2 senders, very concentrated
        features = np.array([[150, 2, 3, 1, 2.5, 50, 0.01, 0.05, 0.9, 0.95, 0.3, 0.5, 0.866, 135]])
        scaled = scaler.transform(features)
        pred = model.predict(scaled)[0]
        assert_true(pred == 1, f"Expected attack (1), got {pred}")
    
    def test_sybil_attack():
        # Sybil: many senders, 1 receiver, funneling pattern
        features = np.array([[80, 40, 1, 40, 1.33, 3, 0.5, 0.8, 0.1, 0.95, 3.9, 0.5, 0.866, 50]])
        scaled = scaler.transform(features)
        pred = model.predict(scaled)[0]
        assert_true(pred == 1, f"Expected attack (1), got {pred}")
    
    def test_bot_loop():
        # Bot loop: repetitive back-and-forth between 2 addresses
        features = np.array([[60, 2, 2, 1, 1.0, 5, 0.8, 0.2, 0.95, 0.98, 0.1, 0.5, 0.866, 45]])
        scaled = scaler.transform(features)
        pred = model.predict(scaled)[0]
        assert_true(pred == 1, f"Expected attack (1), got {pred}")
    
    def test_burst_attack():
        # Burst: huge spike in single second
        features = np.array([[100, 5, 10, 15, 1.67, 95, 0.01, 0.1, 0.3, 0.25, 2.3, 0.5, 0.866, 85]])
        scaled = scaler.transform(features)
        pred = model.predict(scaled)[0]
        assert_true(pred == 1, f"Expected attack (1), got {pred}")
    
    def test_batch_prediction():
        # Test multiple predictions at once
        features = np.array([
            [5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10],  # normal
            [150, 2, 3, 1, 2.5, 50, 0.01, 0.05, 0.9, 0.95, 0.3, 0.5, 0.866, 135],  # attack
            [10, 5, 6, 10, 0.167, 3, 1.5, 1.0, 0.5, 0.4, 2.5, 0.5, 0.866, -5],  # normal
        ])
        scaled = scaler.transform(features)
        preds = model.predict(scaled)
        assert_true(len(preds) == 3, f"Expected 3 predictions, got {len(preds)}")
        assert_true(preds[0] == 0, f"First should be normal, got {preds[0]}")
        assert_true(preds[1] == 1, f"Second should be attack, got {preds[1]}")
        assert_true(preds[2] == 0, f"Third should be normal, got {preds[2]}")
    
    test("Detects normal traffic", test_normal_traffic)
    test("Detects DDoS attack", test_ddos_attack)
    test("Detects Sybil attack", test_sybil_attack)
    test("Detects bot loop attack", test_bot_loop)
    test("Detects burst attack", test_burst_attack)
    test("Batch predictions work", test_batch_prediction)

# ─────────────────────────────────────────────────────────────
# Test 3: Dataset Validation
# ─────────────────────────────────────────────────────────────

def test_dataset():
    log('\n[Test 3] Dataset Validation', Colors.BLUE)
    
    def test_dataset_exists():
        dataset_path = ML_DIR / 'bridge_anomaly_dataset.csv'
        assert_true(dataset_path.exists(), f"Dataset not found at {dataset_path}")
    
    def test_dataset_not_empty():
        df = pd.read_csv(ML_DIR / 'bridge_anomaly_dataset.csv')
        assert_true(len(df) > 0, "Dataset is empty")
        log(f"    Total samples: {len(df)}", Colors.YELLOW)
    
    def test_label_distribution():
        df = pd.read_csv(ML_DIR / 'bridge_anomaly_dataset.csv')
        normal = (df['label'] == 0).sum()
        attack = (df['label'] == 1).sum()
        log(f"    Normal: {normal}, Attack: {attack}", Colors.YELLOW)
        assert_true(normal > 0, "No normal samples in dataset")
        assert_true(attack > 0, "No attack samples in dataset")
        # Check for reasonable balance
        ratio = max(normal, attack) / min(normal, attack)
        assert_true(ratio < 10, f"Class imbalance too high: {ratio}:1")
    
    def test_attack_types():
        df = pd.read_csv(ML_DIR / 'bridge_anomaly_dataset.csv')
        if 'attack_type' in df.columns:
            attack_types = df[df['label'] == 1]['attack_type'].unique()
            log(f"    Attack types: {', '.join(attack_types)}", Colors.YELLOW)
            assert_true(len(attack_types) > 0, "No attack types in dataset")
    
    def test_required_features():
        df = pd.read_csv(ML_DIR / 'bridge_anomaly_dataset.csv')
        required = ['tx_count', 'unique_senders', 'label']
        for col in required:
            assert_true(col in df.columns, f"Missing required column: {col}")
    
    def test_feature_count():
        df = pd.read_csv(ML_DIR / 'bridge_anomaly_dataset.csv')
        # Should have at least 14 features + label + attack_type
        feature_count = len(df.columns) - 2  # minus label and attack_type
        log(f"    Feature count: {feature_count}", Colors.YELLOW)
        assert_true(feature_count >= 14, f"Expected 14+ features, got {feature_count}")
    
    def test_no_missing_values():
        df = pd.read_csv(ML_DIR / 'bridge_anomaly_dataset.csv')
        missing = df.isnull().sum().sum()
        assert_true(missing == 0, f"Dataset has {missing} missing values")
    
    test("Dataset file exists", test_dataset_exists)
    test("Dataset is not empty", test_dataset_not_empty)
    test("Label distribution is reasonable", test_label_distribution)
    test("Attack types are defined", test_attack_types)
    test("Required features exist", test_required_features)
    test("Feature count is adequate", test_feature_count)
    test("No missing values in dataset", test_no_missing_values)

# ─────────────────────────────────────────────────────────────
# Test 4: Feature Extraction
# ─────────────────────────────────────────────────────────────

def test_feature_extraction():
    log('\n[Test 4] Feature Extraction', Colors.BLUE)
    
    def test_feature_ranges():
        # Normal traffic should have reasonable ranges
        features = np.array([[5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10]])
        
        # tx_count should be positive
        assert_true(features[0, 0] > 0, "tx_count should be positive")
        
        # unique_senders/receivers should be <= tx_count
        assert_true(features[0, 1] <= features[0, 0], "unique_senders > tx_count")
        
        # entropy should be between 0 and log2(unique_senders)
        entropy = features[0, 10]
        assert_true(0 <= entropy <= 4, f"Entropy out of range: {entropy}")
    
    def test_temporal_features():
        # sin/cos hour should be between -1 and 1
        features = np.array([[5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10]])
        assert_true(-1 <= features[0, 11] <= 1, "sin_hour out of range")
        assert_true(-1 <= features[0, 12] <= 1, "cos_hour out of range")
    
    def test_ratio_features():
        # top_sender_share and same_pair_ratio should be 0-1
        features = np.array([[5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10]])
        assert_true(0 <= features[0, 8] <= 1, "top_sender_share out of range")
        assert_true(0 <= features[0, 9] <= 1, "same_pair_ratio out of range")
    
    test("Feature ranges are valid", test_feature_ranges)
    test("Temporal features are normalized", test_temporal_features)
    test("Ratio features are between 0-1", test_ratio_features)

# ─────────────────────────────────────────────────────────────
# Test 5: Infer Script
# ─────────────────────────────────────────────────────────────

def test_infer_script():
    log('\n[Test 5] Inference Script', Colors.BLUE)
    
    def test_infer_exists():
        infer_path = ML_DIR / 'infer.py'
        assert_true(infer_path.exists(), f"infer.py not found at {infer_path}")
    
    def test_infer_json_io():
        from subprocess import Popen, PIPE
        
        infer_path = ML_DIR / 'infer.py'
        features = [5, 3, 4, 8, 0.083, 2, 2.5, 1.2, 0.4, 0.3, 2.1, 0.5, 0.866, -10]
        input_data = json.dumps({'features': features})
        
        proc = Popen(['python3', str(infer_path)], stdin=PIPE, stdout=PIPE, stderr=PIPE)
        stdout, stderr = proc.communicate(input_data.encode())
        
        assert_true(proc.returncode == 0, f"infer.py failed: {stderr.decode()}")
        
        result = json.loads(stdout.decode())
        assert_true('prediction' in result, "Missing 'prediction' in output")
        assert_true('label' in result, "Missing 'label' in output")
        assert_true('confidence' in result, "Missing 'confidence' in output")
        assert_true(result['prediction'] in [0, 1], f"Invalid prediction: {result['prediction']}")
    
    test("infer.py file exists", test_infer_exists)
    test("infer.py JSON I/O works", test_infer_json_io)

# ─────────────────────────────────────────────────────────────
# Main Test Runner
# ─────────────────────────────────────────────────────────────

def run_all_tests():
    log('\n╔════════════════════════════════════════════════════════════╗', Colors.BLUE)
    log('║     ML Model & Dataset — Test Suite                      ║', Colors.BLUE)
    log('╚════════════════════════════════════════════════════════════╝', Colors.BLUE)
    
    try:
        test_model_loading()
        test_inference()
        test_dataset()
        test_feature_extraction()
        test_infer_script()
    except Exception as err:
        log(f"\nFatal error: {err}", Colors.RED)
        return False
    
    # Summary
    log('\n╔════════════════════════════════════════════════════════════╗', Colors.BLUE)
    status_color = Colors.GREEN if failed_tests == 0 else Colors.YELLOW
    log(f'║ Total: {total_tests} | ✅ Passed: {passed_tests} | ❌ Failed: {failed_tests}{" " * (total_tests.__str__().__len__() + passed_tests.__str__().__len__() - 8)} ║', status_color)
    log('╚════════════════════════════════════════════════════════════╝', Colors.BLUE)
    
    return failed_tests == 0

if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
