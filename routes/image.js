const express = require('express')
const router = express.Router()

const { firestore } = require('../firesbase/firebase-admin')
const { verifyToken } = require('../middlewares/auth')

router.get('/listImages', verifyToken, async function (req, res, next) {
  try {
    const imageSnapshot = await firestore.collection('images').get()
    const imageList = []

    imageSnapshot.forEach(doc => {
      const imageName = doc.id
      imageList.push(imageName.replaceAll('#', '/'))
    })

    res.status(200).json({
      list: imageList
    })
  } catch (err) {
    console.log(`Error: GET /listImages.\n${err}`)
    res.status(500).send(err)
  }
})

router.get('/imageTags', verifyToken, async function (req, res, next) {
  try {
    const { imageName } = req.query

    if (!imageName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nName of source image(module) is required'
      })
      return
    }

    // check existence of image in registry
    const imageRef = firestore.collection('images').doc(imageName)
    const imageDoc = await imageRef.get()
    if (!imageDoc.exists) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Image source is not exist'
      })

      return
    }

    // get tags(collections) of the image
    const collections = await firestore.collection('images').doc(imageName).listCollections()
    const collectionList = []
    for (const collection of collections) {
      collectionList.push(collection.id)
    }

    res.status(200).json({
      tags: collectionList
    })
  } catch (err) {
    console.log(`Error: GET /listImages.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
