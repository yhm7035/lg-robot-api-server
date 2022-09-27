const express = require('express')
const router = express.Router()

const { auth, firestore } = require('../firesbase/firebase-admin')
const { createSessionCookie, generateToken } = require('./auth.internal')
const { loginBodyValidator } = require('../middlewares/paramsValidator')
const { verifyToken } = require('../middlewares/auth')

const cookieExpiresIn = 60 * 60 * 24 * 7 * 1000

router.get('/generateToken', verifyToken, function (req, res) {
  try {
    const { tokenName } = req.query

    if (!tokenName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nName of token(tokenName) is required'
      })
      return
    }

    const { tempKey, token } = generateToken(tokenName)

    res.status(200).json({
      tokenName,
      tempKey,
      token
    })
  } catch (err) {
    console.log(`Error: GET /listImages.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/login', [verifyToken, loginBodyValidator], async function (req, res) {
  const idToken = req.body.idToken

  try {
    await createSessionCookie(idToken, cookieExpiresIn)
      .then(async (sessionCookie) => {
        // checkRevoked
        const userJwt = await auth.verifySessionCookie(sessionCookie, true)

        const userId = userJwt.user_id
        const userRef = firestore.collection('users').doc(userId)
        const userDoc = await userRef.get()

        if (!userDoc.exists) {
          const userInfo = {
            email: userJwt.email,
            permission: false,
            org: null,
            signInDate: new Date().toISOString()
          }

          await userRef.set(userInfo)

          res.status(400).json({
            statusCode: 400,
            message: 'Error: permission required.'
          })
        } else {
          const userData = await userDoc.data()
          if (userData.permission) {
            // permissioned user
            const userInfo = {
              email: userData.email,
              org: userData.org,
              signInDate: userData.signInDate
            }

            // TODO: check cookie options
            const cookieOptions = {
              maxAge: cookieExpiresIn,
              // httpOnly: true,
              secure: true,
            }

            res.status(200).json({
              sessionCookie,
              cookieOptions,
              userInfo
            })
          } else {
            res.status(400).json({
              statusCode: 400,
              message: 'Error: permission required.'
            })
          }
        }
      })
  } catch (err) {
    console.log(`Error: POST /login.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/verifyCookie', verifyToken, async function (req, res) {
  try {
    const { session } = req.body

    await auth.verifySessionCookie(session, true)
      .then(_ => {
        res.status(200).json({
          status: 'valid',
        })
      })
      .catch(_ => {
        res.status(400).json({
          status: 'invalid',
          message: 'Error: Invalid session cookie.'
        })
      })
  } catch (err) {
    console.log(`Error: POST /verifyCookie.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
