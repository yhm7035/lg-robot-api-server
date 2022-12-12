const jwt = require('jsonwebtoken')
const crypto = require('crypto')

const { auth } = require('../firesbase/firebase-admin')

const createSessionCookie = async (idToken, expiresIn) => {
  return auth.createSessionCookie(idToken, { expiresIn })
}

const generateToken = (tokenName) => {
  const tempKey = crypto.randomBytes(32).toString('hex')
  const token = jwt.sign({ tokenName }, tempKey)

  return { tempKey, token }
}

module.exports = {
  generateToken,
  createSessionCookie,
}
