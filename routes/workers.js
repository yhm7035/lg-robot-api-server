const express = require('express')
const router = express.Router()

// const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { firestore } = require('../firesbase/firebase-admin')
const { verifyToken } = require('../middlewares/auth')
const { getWorkerList, getWorkerListFromAlias, refreshWorkerList, deleteAllNamespaceData } = require('./workers.internal')

router.get('/listMachines', verifyToken, async function (req, res, next) {
  try {
    const { refresh = 'false', alias = 'false' } = req.query

    if (refresh === 'true') await refreshWorkerList()
    const workerList = alias === 'true' ? await getWorkerListFromAlias() : await getWorkerList()

    res.status(200).json({ list: workerList })
  } catch (err) {
    console.log(`Error: GET /listMachines.\n${err}`)
    res.status(500).send(err)
  }
})

router.get('/getMachineMetadata', verifyToken, async function (req, res, next) {
  try {
    const { alias } = req.query

    if (!alias) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter. alias is required.'
      })
      return
    }

    const workerAliasRef = firestore.collection('workers_metadata').doc(`${alias}`)
    const workerAliasDoc = await workerAliasRef.get()

    if (workerAliasDoc.exists) {
      const workerAliasData = await workerAliasDoc.data()

      const workerRef = firestore.collection(workerAliasData.ref).doc('data')
      const workerDoc = await workerRef.get()

      if (workerDoc.exists) {
        const workerData = await workerDoc.data()

        res.status(200).json({
          alias,
          address: workerData.params.address,
          name: workerData.params.clusterName,
          platform: workerData.params.isDocker ? 'docker' : 'kubernetes',
          metadata: workerData.metadata
        })
      } else {
        res.status(500).json({
          statusCode: 500,
          message: 'Error: Document error.'
        })

        return
      }
    } else {
      res.status(404).json({
        statusCode: 404,
        message: 'Error: Invalid alias.'
      })

      return
    }
  } catch (err) {
    console.log(`Error: GET /getMachineMetadata.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/setMachineMetadata', verifyToken, async function (req, res, next) {
  try {
    const { currAlias, nextAlias, address, clusterName } = req.body
    const bodyData = req.body

    if ((!address || !clusterName) && !currAlias) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    if (Object.prototype.hasOwnProperty.call(bodyData, 'address')) delete bodyData.address
    if (Object.prototype.hasOwnProperty.call(bodyData, 'clusterName')) delete bodyData.clusterName
    if (Object.prototype.hasOwnProperty.call(bodyData, 'currAlias')) delete bodyData.currAlias
    if (Object.prototype.hasOwnProperty.call(bodyData, 'nextAlias')) delete bodyData.nextAlias

    if (Object.prototype.hasOwnProperty.call(bodyData, 'type')) {
      if (bodyData.type !== 'central_cloud' && bodyData.type !== 'edge_server' && bodyData.type !== 'edge_cloud' && bodyData.type !== 'robot') {
        res.status(400).json({
          statusCode: 400,
          message: 'Error: Type should be one of [central_cloud, edge_server, edge_cloud, robot].'
        })
        return
      }
    }

    if (!currAlias) {
      const workerRef = firestore.collection(`workers/${clusterName}@${address}/info`).doc('data')
      const workerDoc = await workerRef.get()

      if (workerDoc.exists) {
        await workerRef.update({
          metadata: bodyData
        })

        res.status(200).json({
          statusCode: 200
          // message: 'success'
        })
      } else {
        res.status(404).json({
          statusCode: 404,
          message: 'Error: Invalid address and cluster name.'
        })
      }
    } else {
      const workerAliasRef = firestore.collection('workers_metadata').doc(currAlias)
      const workerAliasDoc = await workerAliasRef.get()

      if (workerAliasDoc.exists) {
        const workerAliasData = workerAliasDoc.data()
        const workerRef = firestore.collection(workerAliasData.ref).doc('data')

        if (!nextAlias) {
          await workerRef.update({
            metadata: bodyData
          })
        } else {
          const nextAliasRef = firestore.collection('workers_metadata').doc(nextAlias)
          const nextAliasDoc = await nextAliasRef.get()

          if (nextAliasDoc.exists) {
            res.status(400).json({
              statusCode: 400,
              message: 'Error: Alias is already exist.'
            })

            return
          }

          await workerRef.update({
            alias: nextAlias,
            metadata: bodyData
          })

          await nextAliasRef.set({
            ref: workerAliasData.ref
          })

          await workerAliasRef.delete()
        }

        res.status(200).json({
          statusCode: 200
          // message: 'success'
        })
      } else {
        res.status(404).json({
          statusCode: 404,
          message: 'Error: Invalid alias.'
        })
      }
    }
  } catch (err) {
    console.log(`Error: POST /setMachineMetadata.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/deleteAllNamespaceData', verifyToken, async function (req, res, next) {
  try {
    const { address, clusterName } = req.body

    if (!address || !clusterName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const result = await deleteAllNamespaceData(clusterName, address)

    if (result) {
      res.status(500).json({
        message: 'failed to delete'
      })
    } else {
      res.status(200).json({
        message: 'deleted successfully'
      })
    }
  } catch (err) {
    console.log(`Error: POST /deleteAllNamespaceData.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
