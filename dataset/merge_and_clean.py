import pandas as pd
import numpy as np

def process_dataset():
    print("------------------------------------------------")
    print("🧪 PREPARING FINAL DATASET")
    print("------------------------------------------------")

    # 1. Load the two datasets
    try:
        df_normal = pd.read_csv("contract_history.csv")
        df_hacks = pd.read_csv("training_data_hacks.csv")
        print(f"✅ Loaded Normal Data: {len(df_normal)} rows")
        print(f"✅ Loaded Hack Data:   {len(df_hacks)} rows")
    except FileNotFoundError:
        print("❌ Error: Could not find one of the CSV files.")
        print("   Make sure 'contract_history.csv' and 'training_data_hacks.csv' are in this folder.")
        return

    # 2. Add Labels (Truth Columns)
    # 0 = Normal, 1 = Fraud
    df_normal['label'] = 0
    df_hacks['label'] = 1
    
    # 3. Standardize Columns
    # We only keep the numeric columns that the AI can actually learn from.
    # We drop 'tx_hash', 'from_address', 'to_address' because they are just IDs, not behaviors.
    
    keep_columns = [
        'value',          # How much ETH moved?
        'gas_limit',      # Max gas allowed?
        'gas_used',       # Actual gas used?
        'gas_ratio',      # Efficiency (Used / Limit)
        'input_length',   # Size of the payload (bytes)
        'label'           # The Answer Key
    ]

    # Ensure both dataframes have these columns
    # (If your scripts had slightly different names, this ensures consistency)
    try:
        df_normal = df_normal[keep_columns]
        df_hacks = df_hacks[keep_columns]
    except KeyError as e:
        print(f"❌ Column Mismatch Error: {e}")
        print("   Check your CSV files. They must both have: value, gas_limit, gas_used, gas_ratio, input_length")
        return

    # 4. Combine and Shuffle
    # Concatenate them
    full_dataset = pd.concat([df_normal, df_hacks], ignore_index=True)
    
    # SHUFFLE (Crucial! We don't want the AI to learn "First 100 are good, next 100 are bad")
    full_dataset = full_dataset.sample(frac=1).reset_index(drop=True)

    # 5. Handle Missing Data
    # Fill any NaNs (Not a Number) with 0
    full_dataset = full_dataset.fillna(0)

    # 6. Save
    full_dataset.to_csv("final_dataset.csv", index=False)
    
    print("\n------------------------------------------------")
    print("🎉 SUCCESS! Generated 'final_dataset.csv'")
    print(f"📊 Total Rows: {len(full_dataset)}")
    print(f"🦠 Fraud Cases: {len(df_hacks)}")
    print(f"🟢 Normal Cases: {len(df_normal)}")
    print("------------------------------------------------")
    print("Preview of data sent to AI:")
    print(full_dataset.head())

if __name__ == "__main__":
    process_dataset()