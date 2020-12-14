const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')
const fs = require('fs')

const { firebaseDB } = require('../firesbase/database')

router.post('/cluster/deploy', async function (req, res, next) {
  try {
    const { address, imageName, port, clusterName } = req.body
    if (!address || !imageName || !port || !clusterName) {
      console.log('error(at deploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    require('dotenv').config()

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

    let namespaceId
    if (!process.env.NAMESPACE) {
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
        port: [port]
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
    console.log(`[error at deploy]\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/cluster/undeploy', async function (req, res, next) {
  try {
    const { address, containerId, clusterName } = req.body
    if (!address || !containerId || !clusterName) {
      console.log('error(at undeploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    require('dotenv').config()

    let namespaceId
    if (!process.env.NAMESPACE) {
      console.log('error(at undeploy): no container to undeploy')
      res.status(400).json({
        statusCode: 400,
        message: 'error: no container to undeploy'
      })
      return
    } else {
      namespaceId = process.env.NAMESPACE
    }

    const deployParams = {
      targetAddress: address,
      clusterName: clusterName,
      namespaceId,
      containerId
    }

    const response = await ainClient.undeploy(deployParams)

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    containerRef.remove()

    res.status(200).json(response)
  } catch (err) {
    console.log(`[error at undeploy]\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/machine/deploy', async function (req, res, next) {
  try {
    const { address, imageName, clusterName } = req.body
    if (!address || !imageName || !clusterName) {
      console.log('error(at deploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

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
    console.log(`[error at deploy]\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/machine/undeploy', async function (req, res, next) {
  try {
    const { address, containerId, clusterName } = req.body
    if (!address || !containerId || !clusterName) {
      console.log('error(at undeploy): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    const deployParams = {
      clusterName,
      targetAddress: address,
      containerId
    }

    const response = await ainClient.undeployForDocker(deployParams)

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    containerRef.remove()

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
