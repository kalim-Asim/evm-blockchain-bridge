const { expect } = require('chai')

const { ethers } = require('hardhat')

// Import utilities from Test Helpers
const {
  BN,
  expectEvent,
  expectRevert,
  constants,
} = require('@openzeppelin/test-helpers')

let tokenFactory, AKADollarsContract, owner, user1, user2, user3

const NAME = 'AKADollars'
const SYMBOL = 'CHSD'
const TOTAL_SUPPLY = '100'
const TOTAL_SUPPLY_DECIMALS = '100000000000000000000'

// Start test block
describe('AKADollars contract', function () {
  before(async function () {
    tokenFactory = await ethers.getContractFactory('AKADollars')
    ;[owner, user1, user2, user3] = await ethers.getSigners()
    AKADollarsContract = await tokenFactory.deploy(
      NAME,
      SYMBOL,
      TOTAL_SUPPLY
    )
    await AKADollarsContract.deployed()
  })

  it('retrieve returns a value previously stored', async function () {
    // Use large integer comparisons
    expect(await AKADollarsContract.totalSupply()).to.be.equal(
      ethers.BigNumber.from(TOTAL_SUPPLY_DECIMALS)
    )
  })

  it('has a name', async function () {
    expect(await AKADollarsContract.name()).to.be.equal(NAME)
  })

  it('has a symbol', async function () {
    expect(await AKADollarsContract.symbol()).to.be.equal(SYMBOL)
  })

  it('assigns the initial total supply to the creator', async function () {
    expect(
      await AKADollarsContract.balanceOf(owner.address)
    ).to.be.equal(ethers.BigNumber.from(TOTAL_SUPPLY_DECIMALS))
  })
})
