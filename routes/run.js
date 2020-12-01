const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')
const fs = require('fs')

const { firebaseDB } = require('../firesbase/database')

router.post('/cluster/deploy', async function(req, res, next) {
  try {
    const { address, imageName, port, clusterName } = req.body
    require('dotenv').config()

    const clusterList = await ainClient.getClusterList()
    const targetCluster = clusterList.find(cluster => cluster.clusterName === clusterName)

    const targetPool = Object.keys(targetCluster.nodePool)[0]

    let namespaceId
    if (!process.env.NAMESPACE) {
      namespaceResult = await _createNamespace(address, clusterName)
      namespaceId = namespaceResult.result.namespaceId
    
      await fs.appendFile('.env', `NAMESPACE=${namespaceId}\n`, (err) => {
        if (err) throw err
      })
    } else {
      namespaceId = process.env.NAMESPACE
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
        port: [ port ]
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

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(response.result.containerId)
    containerRef.set({
      info: {
        image: imageName,
        endpoint: response.result.endpoint[port]
      }
    })

    res.status(200).json(response)
  } catch (err) {
    next(err)
  }
})

router.post('/cluster/undeploy', async function(req, res, next) {
  try {
    const { address, containerId, clusterName } = req.body
    require('dotenv').config()
  
    let namespaceId
    if (!process.env.NAMESPACE) {
      const err = Error('nothing to undeploy: namespace does not exist')
      throw err
    } else {
      namespaceId = process.env.NAMESPACE
    }
  
    const deployParams = {
      targetAddress: address,
      clusterName: clusterName,
      namespaceId,
      containerId
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    containerRef.remove()
  
    const response = await ainClient.undeploy(deployParams)
    res.status(200).json(response)
  } catch (err) {
    throw(err)
  }
})

router.post('/machine/deploy', async function(req, res, next) {
  try {
    const { address, imageName, clusterName } = req.body

    const deployParams = {
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

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(response.result.containerId)
    containerRef.set({
      info: {
        image: imageName
      }
    })

    res.status(200).json(response)
  } catch (err) {
    next(err)
  }
})

router.post('/machine/undeploy', async function(req, res, next) {
  try {
    const { address, containerId, clusterName } = req.body
  
    const deployParams = {
      clusterName,
      targetAddress: address,
      containerId
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    containerRef.remove()
  
    const response = await ainClient.undeployForDocker(deployParams)
    res.status(200).json(response)
  } catch (err) {
    throw(err)
  }
})

async function _createNamespace( address, clusterName ) {
  try {
    const namespaceParams = {
      targetAddress: address,
      clusterName
    }

    const response = await ainClient.createNamespace(namespaceParams)
    return response
  } catch (err) {
    throw(err)
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
