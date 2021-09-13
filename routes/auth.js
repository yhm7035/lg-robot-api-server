const { createSessionCookie } = require('./auth.internal')
const { auth, firestore } = require('../firesbase/firebase-admin')
const express = require('express')
const router = express.Router()

const cookieExpiresIn = 60 * 60 * 24 * 7 * 1000

router.post('/login', async function (req, res) {
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

            const cookieOptions = {
              maxAge: cookieExpiresIn,
              httpOnly: false,
              // secure: true,
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

router.post('/verifyCookie', async function (req, res) {
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
