const express = require('express')
const router = express.Router()

const { firestore } = require('../firesbase/firebase-admin')
const { verifyToken } = require('../middlewares/auth')

router.get('/listInformationModel', verifyToken, async function (req, res, next) {
  
})

router.get('/getInformationModel', verifyToken, async function (req, res, next) {
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
        informationModel: imageDoc.data()
      })
    }
  } catch (err) {
    console.log(`Error: GET /getInformationModel.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/setInformationModel', verifyToken, async function (req, res, next) {
  try {
    let { imageName, imageTag, informationModel, overwrite } = req.body

    if (!imageName || !informationModel) {
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
      // if (typeof metadata !== 'object') {
      //   res.status(400).json({
      //     statusCode: 400,
      //     message: 'Error: metadata should be JSON format'
      //   })

      //   return
      // }

      try {
        await imageRef.set({
          informationModel,
          updatedAt: new Date().toISOString()
        }, { merge: !overwrite })

        res.status(200).json({
          statusCode: 200
          // message: 'success'
        })
      } catch (err) {
        res.status(400).json({
          statusCode: 400,
          message: 'Error: fail to set information model to firebase'
        })
      }
    }
  } catch (err) {
    console.log(`Error: POST /setInformationModel.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
