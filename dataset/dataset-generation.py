from web3 import Web3
import pandas as pd
import time
import sys

# --- CONFIGURATION ---
RPC_URL = "https://ethereum-sepolia.core.chainstack.com/3947f6864fca9eb65d71d4ff33e45528" 
CONTRACT_ADDRESS = "0xcE4a34A5309D32946d3a0e7eefE22A0450eb221D" 
# ---------------------

def fetch_contract_history():
    print("------------------------------------------------")
    print("🚀 STARTING SAFE MODE DATA COLLECTOR")
    print("------------------------------------------------")

    # 1. Connect
    w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 60}))
    if not w3.is_connected():
        print("❌ Error: Could not connect to Sepolia.")
        return
    
    current_block = w3.eth.block_number
    print(f"✅ Connected! Current Block: {current_block}")

    # 2. Scanning Strategy: ULTRA SAFE CHUNKING
    # We scan 20,000 blocks (approx 2 days of history)
    # CHUNK_SIZE is set to 100 to satisfy strict Free Tier limits.
    TOTAL_BLOCKS_TO_SCAN = 100000 
    CHUNK_SIZE = 100 
    
    start_block = current_block - TOTAL_BLOCKS_TO_SCAN
    if start_block < 0: start_block = 0
    
    all_logs = []
    
    print(f"\n🔍 Scanning from block {start_block} to {current_block}...")
    print(f"   (Chunk size: {CHUNK_SIZE} blocks - This allows about 10 scans per second)\n")

    # Loop through the range
    for batch_start in range(start_block, current_block, CHUNK_SIZE):
        batch_end = min(batch_start + CHUNK_SIZE, current_block)
        
        # Print progress on the same line so it doesn't spam your terminal
        print(f"   Scanning {batch_start} -> {batch_end} | Found so far: {len(all_logs)}", end="\r")
        
        try:
            logs = w3.eth.get_logs({
                'address': CONTRACT_ADDRESS,
                'fromBlock': batch_start,
                'toBlock': batch_end
            })
            if logs:
                all_logs.extend(logs)
            
            # Tiny sleep to prevent "Rate Limit" errors
            time.sleep(0.05) 
            
        except Exception as e:
            # If 100 is STILL too big, we just print a small 'x' and keep going
            print(f"x", end="")
            continue

    print(f"\n\n✅ Scan Complete! Found {len(all_logs)} log entries.")

    if len(all_logs) == 0:
        print("⚠️  No interactions found.")
        print("   If you just deployed, run your 'generate_hacks.py' script NOW to create some data!")
        return

    # 3. Extract Unique Transactions
    tx_hashes = set(log['transactionHash'].hex() for log in all_logs)
    print(f"🔗 Found {len(tx_hashes)} unique transactions. Downloading details...")

    # 4. Fetch Details
    dataset = []
    for i, tx_hash in enumerate(tx_hashes):
        print(f"   [{i+1}/{len(tx_hashes)}] Downloading {tx_hash}...", end="\r")
        
        try:
            tx = w3.eth.get_transaction(tx_hash)
            receipt = w3.eth.get_transaction_receipt(tx_hash)
            
            input_data = tx['input'].hex()
            input_len = (len(input_data) - 2) / 2 if input_data.startswith('0x') else 0
            gas_ratio = receipt['gasUsed'] / tx['gas'] if tx['gas'] > 0 else 0
            
            row = {
                'tx_hash': tx_hash,
                'block': tx['blockNumber'],
                'from_address': tx['from'],
                'to_address': tx['to'],
                'value': tx['value'],
                'gas_limit': tx['gas'],
                'gas_used': receipt['gasUsed'],
                'gas_ratio': gas_ratio,
                'nonce': tx['nonce'],
                'input_length': input_len,
                'status': 1 if receipt['status'] == 1 else 0,
                'label': 0 
            }
            dataset.append(row)
            
        except Exception as e:
            print(f"\n❌ Error downloading {tx_hash}: {e}")

    # 5. Save
    # 5. Save (APPEND MODE)
    print("\n\n💾 Saving to CSV...")
    df = pd.DataFrame(dataset)
    
    # Check if file exists so we know whether to write headers
    try:
        with open("contract_history.csv", "a") as f:
            df.to_csv(f, header=f.tell()==0, index=False)
    except FileNotFoundError:
         df.to_csv("contract_history.csv", index=False)
         
    print(f"✅ SUCCESS! Added {len(df)} new rows to 'contract_history.csv'")

if __name__ == "__main__":
    fetch_contract_history()