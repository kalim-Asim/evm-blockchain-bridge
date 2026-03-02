from web3 import Web3
from eth_account import Account
import time
import random
import sys

# --- CONFIGURATION ---
RPC_URL = "https://ethereum-sepolia.core.chainstack.com/3947f6864fca9eb65d71d4ff33e45528" 
CONTRACT_ADDRESS = "0xcE4a34A5309D32946d3a0e7eefE22A0450eb221D" 
PRIVATE_KEY = "a5e59cb365a3324dd115640f1aaa6b13f0d5f503a530230e70115617a6e3c8a6" 
# ---------------------

def generate_normal_traffic():
    print("------------------------------------------------")
    print("😇 STARTING NORMAL TRAFFIC GENERATOR (Class 0)")
    print("------------------------------------------------")

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    account = Account.from_key(PRIVATE_KEY)
    
    # Contract ABI - We only need the 'deposit' function definition
    # If your function is named 'lock' or something else, change it below!
    abi = [
        {
            "constant": False,
            "inputs": [],
            "name": "deposit", # <--- Assumes your function is named 'deposit'
            "outputs": [],
            "payable": True,
            "stateMutability": "payable",
            "type": "function"
        }
    ]
    
    contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=abi)

    print(f"🔹 Wallet: {account.address}")
    print(f"🔹 Target: {CONTRACT_ADDRESS}")

    # Generate 20 Normal Transactions
    for i in range(20):
        try:
            print(f"\n[{i+1}/20] Sending Normal Deposit...", end=" ")
            
            # 1. Random "Normal" Amount (e.g. 0.001 to 0.01 ETH)
            amount = random.uniform(0.001, 0.01)
            value_wei = w3.to_wei(amount, 'ether')
            
            # 2. Build Transaction
            # Normal users usually let MetaMask estimate gas, or use standard defaults.
            tx = contract.functions.deposit().build_transaction({
                'from': account.address,
                'nonce': w3.eth.get_transaction_count(account.address),
                'value': value_wei,
                'gas': 100000, # A standard, reasonable gas limit
                'gasPrice': w3.eth.gas_price
            })

            # 3. Sign & Send
            signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            
            print(f"✅ Sent! Hash: {tx_hash.hex()[:10]}...")
            
            # 4. Wait a bit (Real users don't click once per millisecond)
            time.sleep(random.randint(2, 5))
            
        except Exception as e:
            print(f"❌ Error: {e}")
            # If 'deposit' doesn't exist, try sending raw ETH (fallback)
            if "Could not find function" in str(e):
                print("   ⚠️ 'deposit' function not found. Sending raw ETH instead.")
                tx = {
                    'to': CONTRACT_ADDRESS,
                    'value': value_wei,
                    'gas': 21000,
                    'gasPrice': w3.eth.gas_price,
                    'nonce': w3.eth.get_transaction_count(account.address),
                    'chainId': 11155111
                }
                signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
                w3.eth.send_raw_transaction(signed_tx.raw_transaction)
                print("   ✅ Sent Raw ETH.")

    print("\n🎉 DONE! Generated 20 normal transactions.")
    print("👉 NOW: Run 'dataset-generation.py' again to capture them.")

if __name__ == "__main__":
    generate_normal_traffic()