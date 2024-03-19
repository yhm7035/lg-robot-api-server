const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const ainUtil = require('@ainblockchain/ain-util');
const bip39 = require('bip39')
const HDKey = require('hdkey')

const { auth } = require('../firesbase/firebase-admin')

const createSessionCookie = async (idToken, expiresIn) => {
  return auth.createSessionCookie(idToken, { expiresIn })
}

const generateToken = (tokenName) => {
  const tempKey = crypto.randomBytes(32).toString('hex')
  const token = jwt.sign({ tokenName }, tempKey)

  return { tempKey, token }
}

const mnemonicToAddr = async (mnemonic) => {
  const seed = await bip39.mnemonicToSeed(mnemonic)
  const key = await HDKey.fromMasterSeed(seed)
  const wallet = await key.derive("m/44'/412'/0'/0/0")

  const tempAddr = await ainUtil.pubToAddress(wallet.publicKey, true).toString('hex')
  const derivedAddr = await ainUtil.toChecksumAddress(`0x${tempAddr}`)

  return derivedAddr
}

module.exports = {
  generateToken,
  createSessionCookie,
  mnemonicToAddr,
}
