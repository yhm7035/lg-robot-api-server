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

    const classSnapshot = await firestore.collection(`modules/class/${classification}`).get()
    const classList = []

    for (const document of classSnapshot.docs) {
      const moduleId = document.id
      const moduleData = await document.data()

      const imageName = 'imageName' in moduleData ? moduleData.imageName : null
      const imageTag = 'imageTag' in moduleData ? moduleData.imageTag : null
      const moduleName = 'moduleName' in moduleData ? moduleData.moduleName : null

      classList.push({
        moduleId,
        moduleName,
        imageName,
        imageTag
      })
    }

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
    const { imageName, imageTag = 'latest', moduleId } = req.query

    if (!moduleId && !imageName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nmoduleId(or imageName and imageTag) is required.'
      })
      return
    }

    if (moduleId) {
      const moduleRef = firestore.collection('modules').doc(moduleId)
      const moduleDoc = await moduleRef.get()

      if (!moduleDoc.exists) {
        res.status(400).json({
          statusCode: 400,
          message: 'Error: Module with given ID is not exist.'
        })
      } else {
        const moduleData = await moduleDoc.data()

        res.status(200).json({
          ...moduleData
        })
      }
    } else {
      const replacedImageName = imageName.replaceAll('/', '#')

      const imageRef = firestore.collection(`images/${replacedImageName}/${imageTag}`).doc('metadata')
      const imageDoc = await imageRef.get()

      if (!imageDoc.exists) {
        res.status(400).json({
          statusCode: 400,
          message: 'Error: Image source is not exist.'
        })
      } else {
        let moduleData = {}
        const imageData = await imageDoc.data()

        if (imageData.moduleId) {
          const moduleRef = firestore.collection('modules').doc(imageData.moduleId)
          const moduleDoc = await moduleRef.get()

          moduleData = await moduleDoc.data()
        }
        res.status(200).json({
          ...imageData,
          ...moduleData
        })
      }
    }
  } catch (err) {
    console.log(`Error: GET /getInformationModel.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/setInformationModel', verifyToken, async function (req, res, next) {
  try {
    const { imageName, imageTag = 'latest', informationModel, overwrite = false, classification, moduleClass, moduleId, moduleName } = req.body
    const bodyData = { ...req.body }

    if (!moduleId || !moduleName || !imageName || !informationModel || !classification || !moduleClass) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.\nmoduleId, moduleName, imageName, informationModel, classification, and, moduleClass are required.'
      })
      return
    }

    if (bodyData.imageTag) delete bodyData.imageTag
    delete bodyData.imageName
    delete bodyData.moduleId
    delete bodyData.moduleName
    delete bodyData.informationModel
    delete bodyData.overwrite

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

    if (!imageDoc.exists) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Image source is not exist'
      })
    } else {
      const moduleRef = firestore.collection('modules').doc(moduleId)
      const classRef = firestore.collection(`modules/class/${classification}`).doc(moduleId)

      try {
        const timestamp = new Date().toISOString()

        await moduleRef.set({
          imageName,
          imageTag,
          moduleName,
          informationModel,
          updatedAt: timestamp,
          ...bodyData
        }, { merge: !overwrite })

        await imageRef.set({
          moduleId,
          updatedAt: timestamp
        })

        await classRef.set({
          imageName,
          imageTag,
          moduleName,
          updatedAt: timestamp
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
