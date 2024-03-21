const express = require('express')
const router = express.Router()

const { clusterDeploy, machineDeploy } = require('./run.internal')

const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { firestore } = require('../firesbase/firebase-admin')
const { firebaseDB } = require('../firesbase/firebase')
const { verifyToken } = require('../middlewares/auth')

router.get('/cluster/pool', verifyToken, async function (req, res, next) {
  try {
    const { clusterName } = req.query

    if (!clusterName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const clusterList = await ainClient.getClusterList()
    const targetCluster = clusterList ? clusterList.find(cluster => cluster.clusterName === clusterName) : null
    const targetPool = (!!targetCluster && !!targetCluster.nodePool) ? Object.keys(targetCluster.nodePool)[0] : null

    if (!targetPool) {
      console.log('Error: GET /cluster/pool. Insufficient resouce in machine.')

      res.status(200).json({
        nodePool: []
      })
      return
    }

    res.status(200).json({
      nodePool: Object.keys(targetCluster.nodePool)
    })
  } catch (err) {
    console.log(`Error: GET /cluster/pool.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/multiDeploy', verifyToken, async function (req, res, next) {
  try {
    const { targets, imageName, port, isHost = false, privileged = false } = req.body

    if (!targets || !imageName || !port) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    if (!Array.isArray(targets) || targets.length <= 0) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid target input.'
      })
      return
    }

    const tokenName = req.header('tokenName')
    const tokenRef = firestore.collection('tokens').doc(tokenName)
    const tokenDoc = await tokenRef.get()

    if (!tokenDoc.exists) {
      await tokenRef.set({
        registerDate: new Date().toISOString()
      })
    }

    const targetResult = targets.map((target) => {
      if (target.platform === 'kubernetes') return clusterDeploy(target.address, target.clusterName, imageName, port, tokenName)
      else if (target.platform === 'docker') return machineDeploy(target.address, target.clusterName, imageName, port, isHost, privileged)
      else {
        return {
          address: target.address,
          clusterName: target.clusterName,
          result: {
            status: 'fail',
            message: 'Invalid platform.'
          }
        }
      }
    })

    const result = await Promise.all(targetResult)
    res.status(200).json({
      result
    })
  } catch (err) {
    console.log(`Error: POST /cluster/multiDeploy.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/cluster/deploy', verifyToken, async function (req, res, next) {
  try {
    const { address, imageName, port, clusterName, command, envs, nodePool } = req.body

    if (!address || !imageName || !port || !clusterName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const tokenName = req.header('tokenName')
    const tokenRef = firestore.collection('tokens').doc(tokenName)
    const tokenDoc = await tokenRef.get()

    if (!tokenDoc.exists) {
      await tokenRef.set({
        registerDate: new Date().toISOString()
      })
    }

    // create namespace
    let namespaceId
    const tokenNamespaceRef = firestore.collection(`tokens/${tokenName}/namespace`).doc(`${clusterName}@${address}`)
    const tokenNamespaceDoc = await tokenNamespaceRef.get()
    if (!tokenNamespaceDoc.exists) {
      if (tokenName === 'lg_bluepearl') {
        const runResult = await ainClient.runCommand({
          targetAddress: address,
          clusterName,
          cmd: 'create namespace lge-ebme'
        })

        const resultMessage = runResult?.result?.stdout

        if (resultMessage) {
          await tokenNamespaceRef.set({
            namespaceId: 'lge-ebme'
          })
        } else {
          console.log('Error: POST /cluster/deploy. Namespace creation failed.')
          res.status(500).json({
            statusCode: 500,
            message: 'Error: POST /cluster/deploy. Namespace creation failed.'
          })

          return
        }
      } else {
        const namespaceResult = await _createNamespace(address, clusterName)
        namespaceId = namespaceResult ? namespaceResult.result.namespaceId : null

        if (!namespaceId) {
          console.log('Error: POST /cluster/deploy. Namespace creation failed.')
          res.status(500).json({
            statusCode: 500,
            message: 'Error: POST /cluster/deploy. Namespace creation failed.'
          })

          return
        }

        await tokenNamespaceRef.set({
          namespaceId
        })
      }
    } else {
      const tokenNamespaceData = await tokenNamespaceDoc.data()
      namespaceId = tokenNamespaceData.namespaceId
    }

    // get node pool
    const clusterList = await ainClient.getClusterList()
    const targetCluster = clusterList ? clusterList.find(cluster => cluster.clusterName === clusterName) : null
    const targetPool = nodePool ? nodePool : (!!targetCluster && !!targetCluster.nodePool) ? Object.keys(targetCluster.nodePool)[0] : null

    if (!targetPool) {
      console.log('Error: POST /cluster/deploy. Insufficient resouce in machine.')
      res.status(503).json({
        statusCode: 503,
        message: 'Error: POST /cluster/deploy. Insufficient resouce in machine.'
      })
      return
    }

    // make deployment
    const deployParams = {
      targetAddress: address,
      clusterName: clusterName,
      namespaceId: namespaceId,
      containerInfo: {
        imageName: `asia-northeast1-docker.pkg.dev/lg-robot-dev/lg-ai-registry/${imageName}`,
        nodePoolName: targetPool,
        hwSpec: {
          cpu: 500,
          memory: 512,
          gpu: 0
        },
        port
      }
    }

    if (command) deployParams.containerInfo.command = command
    if (envs) {
      const keys = Object.keys(envs)
      if (keys.length > 0) {
        keys.forEach(key => {
          if (typeof envs[key] !== 'string') {
            envs[key] = String(envs[key])
          }
        })
        deployParams.containerInfo.env = envs
      }
    }

    const response = await ainClient.deploy(deployParams)

    if (response && response.errMessage) {
      res.status(400).json({
        statusCode: 400,
        message: response.errMessage
      })
      return
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(response.result.containerId)

    await containerRef.set({
      info: {
        image: imageName,
        endpoint: response.result.endpoint,
        namespaceId,
        port
      },
      params: {
        imageName,
        port
      }
    })

    res.status(200).json(response)
  } catch (err) {
    console.log(`Error: POST /cluster/deploy.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/machine/deploy', verifyToken, async function (req, res, next) {
  try {
    const { address, imageName, isHost = false, ports, clusterName, command, envs, privileged = false } = req.body

    if (!address || !imageName || !ports || !clusterName) {
      console.log('Error: POST /machine/deploy. Invalid parameter.')
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    // TODO: have to write deployment record to DB
    // const tokenName = req.header('tokenName')
    // const tokenRef = firestore.collection('tokens').doc(tokenName)
    // const tokenDoc = await tokenRef.get()

    const portsJson = {}
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
      privileged,
      image: `asia-northeast1-docker.pkg.dev/lg-robot-dev/lg-ai-registry/${imageName}`
    }

    if (command) deployParams.command = [command]
    if (envs) {
      const keys = Object.keys(envs)
      if (keys.length > 0) {
        keys.forEach(key => {
          if (typeof envs[key] !== 'string') {
            envs[key] = String(envs[key])
          }
        })
        deployParams.env = envs
      }
    }

    const response = await ainClient.deployForDocker(deployParams)

    if (response && response.errMessage) {
      res.status(400).json({
        statusCode: 400,
        message: response.errMessage
      })
      return
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(response.result.containerId)

    await containerRef.set({
      info: {
        image: imageName
      }
    })

    res.status(200).json(response)
  } catch (err) {
    console.log(`Error: POST /machine/deploy.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/cluster/undeploy', verifyToken, async function (req, res, next) {
  try {
    const { address, containerId, clusterName } = req.body

    if (!address || !containerId || !clusterName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const tokenName = req.header('tokenName')
    const tokenRef = firestore.collection('tokens').doc(tokenName)
    const tokenDoc = await tokenRef.get()

    if (!tokenDoc.exists) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid request.'
      })
      return
    }

    let namespaceId
    const tokenNamespaceRef = firestore.collection(`tokens/${tokenName}/namespace`).doc(`${clusterName}@${address}`)
    const tokenNamespaceDoc = await tokenNamespaceRef.get()
    if (tokenNamespaceDoc.exists) {
      const tokenNamespaceData = await tokenNamespaceDoc.data()
      namespaceId = tokenNamespaceData.namespaceId
    } else {
      // TODO: handle user existence error
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid request.'
      })
      return
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

    res.status(200).json(response)
  } catch (err) {
    console.log(`Error: POST /ide/undeploy.\n${err}`)
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

module.exports = router
