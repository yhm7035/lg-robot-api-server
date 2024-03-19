const express = require('express')
const router = express.Router()

const { firestore } = require('../firesbase/firebase-admin')
const { verifyToken } = require('../middlewares/auth')

router.post('/setHandler', verifyToken, async function (req, res, next) {
  try {
    const { org, handlerName, callback } = req.body

    if (!org || !handlerName || !callback) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const failureHandlerRef = firestore.collection(`failure/handlers/${org}`).doc(`${handlerName}`)
    await failureHandlerRef.set({
      callback
    })

    // send response
    res.status(200).json({
      status: 'success'
    })
  } catch (err) {
    console.log(`Error: POST /setHandler.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
