const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')
const fs = require('fs')

const { auth, firestore } = require('../firesbase/firebase-admin')
const { firebaseDB } = require('../firesbase/firebase')

router.post('/cluster/deploy', async function (req, res, next) {
  try {
    const { address, email, imageName, port, clusterName } = req.body
  
    if (!address || !imageName || !port || !clusterName || !email) {
      console.log('error(at deploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    const userRecord = await auth.getUserByEmail(email)
    const userId = userRecord.uid

    const userRef = firestore.collection('users').doc(userId)
    const userDoc = await userRef.get()

    let namespaceId
    if (userDoc.exists) {
      const userData = await userDoc.data()

      if (!userData.namespaceId) {
        const namespaceResult = await _createNamespace(address, clusterName)
        namespaceId = !!namespaceResult ? namespaceResult.result.namespaceId : null

        if (!namespaceId) {
          console.log('error(at deploy): create namespace')
          res.status(500).json({
            statusCode: 500,
            message: 'error: create namespace'
          })
          return
        }

        await userRef.update({
          namespaceId
        })
      } else {
        namespaceId = userData.namespaceId
      }
    } else {
      // TODO: handle user existence error
    }

    const clusterList = await ainClient.getClusterList()
    const targetCluster = !!clusterList ? clusterList.find(cluster => cluster.clusterName === clusterName) : null
    const targetPool = (!!targetCluster && !!targetCluster.nodePool) ? Object.keys(targetCluster.nodePool)[0] : null

    if (!targetPool) {
      console.log('error(at deploy): insufficient resouce in machine')
      res.status(503).json({
        statusCode: 503,
        message: 'error: insufficient resouce in machine'
      })
      return
    }

    const deployParams = {
      targetAddress: address,
      clusterName: clusterName,
      namespaceId: namespaceId,
      containerInfo: {
        imageName: `robot-registry.ainize.ai/${imageName}`,
        nodePoolName: targetPool,
        hwSpec: {
          cpu: 500,
          memory: 512,
          gpu: 0
        },
        port
      }
    }

    const response = await ainClient.deploy(deployParams)

    const statusCode = Number(response.statusCode)
    if (statusCode < 0) {
      const err = Error(`failed to deploy ${imageName}`)
      err.statusCode = statusCode
      err.errMessage = response.errMessage
      throw err
    }

    if (!response.result.containerId) {
      // TODO: making container error
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(response.result.containerId)
    
    containerRef.set({
      info: {
        image: imageName,
        endpoint: response.result.endpoint
      }
    })

    const deploymentRef = firestore.collection(`users/${userId}/deployment`).doc(`${response.result.containerId}`)
    deploymentRef.set({
      ...response.result
    })

    res.status(200).json(response)
  } catch (err) {
    console.log(`[error at deploy]\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/cluster/undeploy', async function (req, res, next) {
  try {
    const { address, email, containerId, clusterName } = req.body

    if (!address || !containerId || !clusterName || !email) {
      console.log('error(at undeploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    const userRecord = await auth.getUserByEmail(email)
    const userId = userRecord.uid

    const userRef = firestore.collection('users').doc(userId)
    const userDoc = await userRef.get()

    let namespaceId
    if (userDoc.exists) {
      const userData = await userDoc.data()
      namespaceId = userData.namespaceId
    } else {
      // TODO: handle user existence error
    }

    const unDeployParams = {
      targetAddress: address,
      clusterName: clusterName,
      namespaceId,
      containerId
    }

    const response = await ainClient.undeploy(unDeployParams)

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    containerRef.remove()

    const deploymentRef = firestore.collection(`users/${userId}/deployment`).doc(containerId)
    deploymentRef.delete()

    res.status(200).json(response)
  } catch (err) {
    console.log(`[error at undeploy]\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/machine/deploy', async function (req, res, next) {
  try {
    const { address, email, imageName, isHost = false, ports, clusterName } = req.body

    console.log(req.body)
    
    if (!address || !email || !imageName || !ports || !clusterName) {
      console.log('error(at deploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    const userRecord = await auth.getUserByEmail(email)
    const userId = userRecord.uid

    let portsJson = {}
    if (!isHost) {
      ports.forEach(port => {
        portsJson[port] = port.toString()
      })
    }

    const deployParams = {
      // port check
      publishPorts: isHost ? null : portsJson,
      clusterName,
      targetAddress: address,
      image: `robot-registry.ainize.ai/${imageName}`
    }

    const response = await ainClient.deployForDocker(deployParams)

    const statusCode = Number(response.statusCode)
    if (statusCode < 0) {
      const err = Error(`failed to deploy ${imageName}`)
      err.statusCode = statusCode
      err.errMessage = response.errMessage
      throw err
    }

    if (!response.result.containerId) {
      // TODO: making container error
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(response.result.containerId)
    containerRef.set({
      info: {
        image: imageName
      }
    })

    console.log(response)

    const deploymentRef = firestore.collection(`users/${userId}/deployment`).doc(`${response.result.containerId}`)
    deploymentRef.set({
      clusterName,
      port: portsJson,
      ...response.result
    })

    res.status(200).json(response)
  } catch (err) {
    console.log(`[error at deploy]\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/machine/undeploy', async function (req, res, next) {
  try {
    const { address, email, containerId, clusterName } = req.body

    if (!address || !email || !containerId || !clusterName) {
      console.log('error(at undeploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    const userRecord = await auth.getUserByEmail(email)
    const userId = userRecord.uid

    const unDeployParams = {
      clusterName,
      targetAddress: address,
      containerId
    }

    const response = await ainClient.undeployForDocker(unDeployParams)

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    containerRef.remove()

    const deploymentRef = firestore.collection(`users/${userId}/deployment`).doc(containerId)
    deploymentRef.delete()

    res.status(200).json(response)
  } catch (err) {
    console.log(`[error at undeploy]\n${err}`)
    res.status(500).send(err)
  }
})

async function _createNamespace (address, clusterName) {
  try {
    const namespaceParams = {
      targetAddress: address,
      clusterName
    }

    const response = await ainClient.createNamespace(namespaceParams)
    return response
  } catch (err) {
    return null
  }
}

// async function _deleteNamespace( address, clusterName, namespaceId ) {
//   const namespaceParams = {
//     targetAddress: address,
//     clusterName,
//     namespaceId
//   }

//   const response = await ainClient.deleteNamespace(namespaceParams)
//   return response
// }

module.exports = router
