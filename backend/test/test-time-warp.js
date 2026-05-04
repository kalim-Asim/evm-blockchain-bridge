const Web3 = require('web3')
const web3 = new Web3('http://127.0.0.1:8545')

async function test() {
  const block1 = await web3.eth.getBlock('latest')
  console.log("Block 1 timestamp:", block1.timestamp)
  
  await new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_increaseTime',
      params: [3600],
      id: 1
    }, (err, res) => err ? reject(err) : resolve(res))
  })
  
  await new Promise((resolve, reject) => {
    web3.currentProvider.send({
      jsonrpc: '2.0',
      method: 'evm_mine',
      params: [],
      id: 2
    }, (err, res) => err ? reject(err) : resolve(res))
  })
  
  const block2 = await web3.eth.getBlock('latest')
  console.log("Block 2 timestamp:", block2.timestamp)
  console.log("Difference:", block2.timestamp - block1.timestamp)
}
test().catch(console.error)
