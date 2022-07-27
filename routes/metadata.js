const express = require('express')
const router = express.Router()

const { firestore } = require('../firesbase/firebase-admin')
const { verifyToken } = require('../middlewares/auth')

router.get('/getMetadata', verifyToken, async function (req, res, next) {
  try {
    let { imageName, imageTag } = req.query

    if (!imageName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nName of source image(module) is required'
      })
      return
    }

    if (!imageTag) imageTag = 'latest'

    const imageRef = firestore.collection(`images/${imageName}/${imageTag}`).doc('metadata')
    const imageDoc = await imageRef.get()

    if (!imageDoc.exists) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Image source is not exist'
      })
    } else {
      res.status(200).json({
        // message: 'success'
        metadata: imageDoc.data()
      })
    }
  } catch (err) {
    console.log(`Error: GET /getMetadata.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/setMetadata', verifyToken, async function (req, res, next) {
  try {
    let { imageName, imageTag, metadata, overwrite } = req.body

    if (!imageName || !metadata) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    if (!imageTag) imageTag = 'latest'
    if (!overwrite) overwrite = false

    const imageRef = firestore.collection(`images/${imageName}/${imageTag}`).doc('metadata')
    const imageDoc = await imageRef.get()

    if (!imageDoc.exists) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Image source is not exist'
      })
    } else {
      if (typeof metadata !== 'object') {
        res.status(400).json({
          statusCode: 400,
          message: 'Error: metadata should be JSON format'
        })

        return
      }

      try {
        await imageRef.set(metadata, { merge: !overwrite })

        res.status(200).json({
          statusCode: 200
          // message: 'success'
        })
      } catch (err) {
        res.status(400).json({
          statusCode: 400,
          message: 'Error: metadata should be JSON format'
        })
      }
    }
  } catch (err) {
    console.log(`Error: POST /setMetadata.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
