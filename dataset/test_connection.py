from web3 import Web3
import time

# PASTE YOUR FULL RPC URL HERE
RPC_URL = "https://ethereum-sepolia.core.chainstack.com/e79eef8ce296c3118a329cfd17801ce9" 

print("1. Attempting to connect to:", RPC_URL)

try:
    # Add a 5-second timeout so it doesn't hang forever
    w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 5}))
    
    if w3.is_connected():
        print("✅ SUCCESS! Connected.")
        print(f"   Current Block Number: {w3.eth.block_number}")
        print(f"   Chain ID: {w3.eth.chain_id} (Should be 11155111 for Sepolia)")
    else:
        print("❌ CONNECTED, BUT FAILED check.")
        
except Exception as e:
    print(f"❌ ERROR: Could not connect.")
    print(f"   Reason: {e}")