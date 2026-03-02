// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract VulnerableBridge {
    address public owner;
    uint256 public balance;

    event BridgeDeposit(address indexed sender, uint256 amount);
    event BridgeWithdraw(address indexed receiver, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    // 1. Normal Deposit (Generates Class 0 Data)
    function deposit() public payable {
        balance += msg.value;
        emit BridgeDeposit(msg.sender, msg.value);
    }

    // 2. Vulnerable Withdraw (THE BUG: No signature verification!)
    // A real bridge would check a cryptographic signature here.
    // This one just trusts the input.
    function withdraw(uint256 amount, address recipient) public {
        require(address(this).balance >= amount, "Insufficient funds");
        
        // VULNERABILITY: Anyone can call this! 
        // A secure bridge would have: require(verifySignature(msg.sender, amount), "Invalid Sig");
        
        payable(recipient).transfer(amount);
        balance -= amount;
        emit BridgeWithdraw(recipient, amount);
    }
}