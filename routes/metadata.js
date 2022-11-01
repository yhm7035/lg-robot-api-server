const express = require('express')
const router = express.Router()

const { firestore } = require('../firesbase/firebase-admin')
const { verifyToken } = require('../middlewares/auth')

router.get('/listInformationModel', verifyToken, async function (req, res, next) {
  try {
    const { classification } = req.query

    if (!classification) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nclassification is required.'
      })
      return
    }

    const classSnapshot = await firestore.collection(`info_models/class/${classification}`).get()
    const classList = []

    classSnapshot.forEach(doc => {
      const imageName = doc.id
      classList.push(imageName.replaceAll('#', '/'))
    })

    res.status(200).json({
      list: classList
    })
  } catch (err) {
    console.log(`Error: GET /listInformationModel.\n${err}`)
    res.status(500).send(err)
  }
})

router.get('/getInformationModel', verifyToken, async function (req, res, next) {
  try {
    const { imageName, imageTag = 'latest' } = req.query

    if (!imageName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nName of source image(module) is required.'
      })
      return
    }

    const replacedImageName = imageName.replaceAll('/', '#')

    const imageRef = firestore.collection(`images/${replacedImageName}/${imageTag}`).doc('metadata')
    const imageDoc = await imageRef.get()

    const imageMetadataRef = firestore.collection(`images/${replacedImageName}/common`).doc('metadata')
    const imageMetadataDoc = await imageMetadataRef.get()

    if (!imageDoc.exists) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Image source is not exist.'
      })
    } else {
      const imageMetadataData = imageMetadataDoc.exists ? imageMetadataDoc.data() : {}
      res.status(200).json({
        // message: 'success'
        ...imageDoc.data(),
        ...imageMetadataData
      })
    }
  } catch (err) {
    console.log(`Error: GET /getInformationModel.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/setInformationModel', verifyToken, async function (req, res, next) {
  try {
    const { imageName, imageTag = 'latest', informationModel, overwrite = false, classification, moduleClass } = req.body
    const bodyData = { ...req.body }

    if (!imageName || !informationModel || !classification || !moduleClass) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nimageName, informationModel, classification, and, moduleClass are required.'
      })
      return
    }

    delete bodyData.imageName
    delete bodyData.informationModel
    delete bodyData.classification
    delete bodyData.moduleClass

    if (!Array.isArray(classification)) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: A parameter, classification, has to be array.'
      })
      return
    }

    const replacedImageName = imageName.replaceAll('/', '#')

    const imageRef = firestore.collection(`images/${replacedImageName}/${imageTag}`).doc('metadata')
    const imageDoc = await imageRef.get()

    const imageMetadataRef = firestore.collection(`images/${replacedImageName}/common`).doc('metadata')
    const imageMetadataDoc = await imageMetadataRef.get()

    if (!imageDoc.exists) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Image source is not exist'
      })
    } else {
      const classArray = imageMetadataDoc.exists ? imageMetadataDoc.data().classification : []

      const addClassList = []
      const removeClassList = []

      classification.forEach(className => {
        if (!classArray.includes(className)) {
          addClassList.push(className)
        }
      })

      classArray.forEach(className => {
        if (!classification.includes(className)) {
          removeClassList.push(className)
        }
      })

      // remove class reference
      const classRemovePromises = removeClassList.map(async className => {
        const classRef = firestore.collection(`info_models/class/${className}`).doc(replacedImageName)
        await classRef.delete()
      })
      await Promise.all(classRemovePromises)

      // set information model class reference
      const classAddPromises = addClassList.map(async className => {
        const classRef = firestore.collection(`info_models/class/${className}`).doc(replacedImageName)
        await classRef.set({
          reference: `images/${replacedImageName}/common`,
          updatedAt: new Date().toISOString()
        })
      })
      await Promise.all(classAddPromises)

      try {
        await imageRef.set({
          informationModel,
          updatedAt: new Date().toISOString(),
          ...bodyData
        }, { merge: !overwrite })

        await imageMetadataRef.set({
          moduleClass,
          classification,
          updatedAt: new Date().toISOString()
        })

        res.status(200).json({
          statusCode: 200
          // message: 'success'
        })
      } catch (err) {
        res.status(400).json({
          statusCode: 400,
          message: 'Error: fail to set information model to firebase.'
        })
      }
    }
  } catch (err) {
    console.log(`Error: POST /setInformationModel.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
