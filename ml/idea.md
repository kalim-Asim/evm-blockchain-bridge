What I Built — Simple Summary
The Core Idea
A real bridge dataset doesn't exist (our bridge has like 3 transactions). We simulated what traffic would look like — both normal usage and attacks.

Each Row = One 60-Second Window
The bridge is monitored every 60 seconds. Each row captures what happened in that window — how many transactions, how fast, from how many wallets, etc.

How Normal Traffic Was Generated
Random number of transactions based on time of day (busy at noon, quiet at 4am)
Many different senders → many different receivers
Humans are slow and irregular → high interarrival time, high std deviation
No single wallet dominates
How Each Attack Was Generated
Attack	What it simulates	Key signal
DDoS	1-5 wallets spamming thousands of txs	tx_count explodes, unique_senders = 1
Sybil	100s of fake wallets all sending to 1 target	unique_receivers = 1, same_pair_ratio ≈ 1
Bot Loop	Script looping same pairs back and forth	std_interarrival ≈ 0 (perfectly regular)
Burst	200 txs in 1 second, then silence	max_tx_in_1sec huge, min_interarrival ≈ 0
Final Numbers
3000 rows total
1500 normal + 1500 attack (balanced — important for SVM)
14 features (exactly from your PDF)
1 label column — 0 = normal, 1 = attack
