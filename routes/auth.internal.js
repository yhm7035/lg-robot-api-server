const { auth } = require('../firesbase/firebase-admin')

const createSessionCookie = async (idToken, expiresIn) => {
  return auth.createSessionCookie(idToken, { expiresIn })
}

module.exports = {
  createSessionCookie,
}
