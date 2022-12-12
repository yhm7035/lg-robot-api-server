const jwt = require('jsonwebtoken')

const { firestore } = require('../firesbase/firebase-admin')

const verifyToken = async (req, res, next) => {
  const tokenName = req.header('tokenName')
  const authToken = req.header('authToken')

  if (!tokenName || !authToken) {
    return res.status(400).json({
      statusCode: 400,
      message: 'Error: invalid header.'
    })
  }

  const tokenRef = firestore.collection('api_keys').doc(tokenName)
  const tokenDoc = await tokenRef.get()

  if (!tokenDoc.exists) {
    return res.status(400).json({
      statusCode: 400,
      message: 'Error: have to register token first to use REST api.'
    })
  } else {
    const { tempKey } = await tokenDoc.data()

    try {
      jwt.verify(authToken, tempKey)
    } catch (err) {
      return res.status(400).json({
        statusCode: 400,
        message: 'Error: token is malformed.'
      })
    }
  }
  next()
}

module.exports = {
  verifyToken
}
