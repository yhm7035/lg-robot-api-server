const express = require('express')
const router = express.Router()

const { mnemonicToAddr } = require('./auth.internal')
const { syncDeploy } = require('./run.internal')

const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { auth, firestore } = require('../firesbase/firebase-admin')
const { firebaseDB } = require('../firesbase/firebase')
const { verifyToken } = require('../middlewares/auth')

router.post('/cluster/setSync', verifyToken, async function (req, res, next) {
  try {
    const { address, email, containerId, clusterName, targets } = req.body

    if (!address || !email || !containerId || !clusterName || !targets) {
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

    const containerRef = firebaseDB.ref(`api-server/${clusterName}@${address}/containers/${containerId}`)
    const containerSnapshot = await containerRef.once('value')
    const containerValue = await containerSnapshot.val()

    if (!containerValue) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid container information.'
      })
      return
    }

    // check rigth to set sync
    if (!!containerValue.email && !containerValue.email.includes(email)) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: permission to set sync is required.'
      })
      return
    }

    const targetList = []
    const clusterList = await ainClient.getClusterList()

    for (let i = 0; i < targets.length; i++) {
      const targetCluster = clusterList.find(cluster => cluster.clusterName === targets[i].clusterName)

      if (!!targetCluster.isDocker && targetCluster.isDocker === true) {
        if (!!targets[i].address && !!targets[i].mnemonic) {
          const derivedAddr = await mnemonicToAddr(targets[i].mnemonic)

          if (derivedAddr === targets[i].address) {
            targetList.push({
              address: targets[i].address,
              clusterName: targets[i].clusterName
            })
          }
        }
      }
    }

    if (!!containerValue.params && targetList.length > 0) {
      const { imageName, port } = containerValue.params
      const result = await syncDeploy(imageName, port, targetList)

      if (result.length > 0) {
        await containerRef.update({
          targets: result
        })
      }
    }

    res.status(200).json({
      status: 'success',
    })
  } catch (err) {
    console.log(`Error: POST /cluster/setSync.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/cluster/updateDeploy', verifyToken, async function (req, res, next) {
  try {
    const { address, email, containerId, clusterName, imageName } = req.body

    if (!address || !email || !containerId || !clusterName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const prefix = 'asia-northeast1-docker.pkg.dev/lg-robot-dev/lg-ai-registry/'
    const image = imageName.replace(prefix, '')

    const containerRef = firebaseDB.ref(`api-server/${clusterName}@${address}/containers/${containerId}`)
    const containerSnapshot = await containerRef.once('value')
    const containerValue = await containerSnapshot.val()

    if (!containerValue) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid container information.'
      })
      return
    }

    // check rigth to update
    if (!!containerValue.email && !containerValue.email.includes(email)) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: permission to update is required.'
      })
      return
    }

    const namespace = containerValue.info.namespaceId

    const runResult = await ainClient.runCommand({
      targetAddress: address,
      clusterName,
      cmd: `set image deployment/${containerId} ${containerId}=${prefix}${image} -n ${namespace}`
    })

    const resultMessage = runResult?.result?.stdout

    // update api DB
    const currInfo = containerValue.info
    if (resultMessage) {
      await containerRef.update({
        info: {
          endpoint: currInfo.endpoint,
          image: image,
          namespaceId: currInfo.namespaceId
        }
      })
    }

    res.status(200).json({
      status: 'success',
      result: resultMessage
    })
  } catch (err) {
    console.log(`Error: POST /cluster/updateDeploy.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/cluster/deploy', verifyToken, async function (req, res, next) {
  try {
    const { address, email, imageName, port, clusterName, command, envs, exactPath = false } = req.body

    if (!address || !imageName || !port || !clusterName || !email) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const userRecord = await auth.getUserByEmail(email)
    const userId = userRecord.uid

    // TODO: user reference is only used for user existence check(have to improve)
    const userRef = firestore.collection('users').doc(userId)
    const userDoc = await userRef.get()

    let namespaceId
    if (userDoc.exists) {
      const userNamespaceRef = firestore.collection(`users/${userId}/namespace`).doc(`${clusterName}@${address}`)
      const userNamespaceDoc = await userNamespaceRef.get()

      if (!userNamespaceDoc.exists) {
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

        await userNamespaceRef.set({
          namespaceId
        })

        const workerRef = firestore.collection(`workers/${clusterName}@${address}/namespace`).doc(namespaceId)
        await workerRef.set({
          ref: `users/${userId}/namespace`
        })
      } else {
        const userNamespaceData = await userNamespaceDoc.data()
        namespaceId = userNamespaceData.namespaceId
      }
    } else {
      // TODO: handle user existence error
    }

    const clusterList = await ainClient.getClusterList()
    const targetCluster = clusterList ? clusterList.find(cluster => cluster.clusterName === clusterName) : null
    const targetPool = (!!targetCluster && !!targetCluster.nodePool) ? Object.keys(targetCluster.nodePool)[0] : null

    if (!targetPool) {
      console.log('Error: POST /cluster/deploy. Insufficient resouce in machine.')
      res.status(503).json({
        statusCode: 503,
        message: 'Error: POST /cluster/deploy. Insufficient resouce in machine.'
      })
      return
    }

    const imagePath = exactPath ? imageName : `asia-northeast1-docker.pkg.dev/lg-robot-dev/lg-ai-registry/${imageName}`
    const deployParams = {
      targetAddress: address,
      clusterName: clusterName,
      namespaceId: namespaceId,
      containerInfo: {
        imageName: imagePath,
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
      },
      params: {
        imageName,
        port
      }
    })

    const deploymentRef = firestore.collection(`users/${userId}/deployment`).doc(`${response.result.containerId}`)
    await deploymentRef.set({
      ...response.result
    })

    res.status(200).json(response)
  } catch (err) {
    console.log(`Error: POST /cluster/deploy.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/cluster/undeploy', verifyToken, async function (req, res, next) {
  try {
    const { address, email, containerId, clusterName } = req.body

    if (!address || !containerId || !clusterName || !email) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    const containerSnapshot = await containerRef.once('value')
    const containerValue = await containerSnapshot.val()

    const namespaceId = containerValue.info.namespaceId

    const userRecord = await auth.getUserByEmail(email)
    const userId = userRecord.uid

    // const userNamespaceRef = firestore.collection(`users/${userId}/namespace`).doc(`${clusterName}@${address}`)
    // const userNamespaceDoc = await userNamespaceRef.get()

    // let namespaceId
    // // only deployer can delete deployment
    // if (userNamespaceDoc.exists) {
    //   const userNamespaceData = await userNamespaceDoc.data()
    //   namespaceId = userNamespaceData.namespaceId
    // } else {
    //   // TODO: handle user existence error
    // }

    const unDeployParams = {
      targetAddress: address,
      clusterName: clusterName,
      namespaceId,
      containerId
    }

    const response = await ainClient.undeploy(unDeployParams)

    const deploymentRef = firestore.collection(`users/${userId}/deployment`).doc(containerId)
    deploymentRef.delete()
    containerRef.remove()

    res.status(200).json(response)
  } catch (err) {
    console.log(`Error: POST /cluster/undeploy.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/machine/deploy', verifyToken, async function (req, res, next) {
  try {
    const { address, email, imageName, isHost = false, ports, clusterName, command, envs, exactPath = false } = req.body

    if (!address || !email || !imageName || !ports || !clusterName) {
      console.log('Error: POST /machine/deploy. Invalid parameter.')
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const userRecord = await auth.getUserByEmail(email)
    const userId = userRecord.uid

    const portsJson = {}
    if (!isHost) {
      ports.forEach(port => {
        portsJson[port] = port.toString()
      })
    }

    const imagePath = exactPath ? imageName : `asia-northeast1-docker.pkg.dev/lg-robot-dev/lg-ai-registry/${imageName}`
    const deployParams = {
      // port check
      publishPorts: isHost ? null : portsJson,
      clusterName,
      targetAddress: address,
      image: imagePath
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

    const deploymentRef = firestore.collection(`users/${userId}/deployment`).doc(`${response.result.containerId}`)
    await deploymentRef.set({
      clusterName,
      port: portsJson,
      ...response.result
    })

    res.status(200).json(response)
  } catch (err) {
    console.log(`Error: POST /machine/deploy.\n${err}`)
    res.status(500).send(err)
  }
})

router.post('/machine/undeploy', verifyToken, async function (req, res, next) {
  try {
    const { address, email, containerId, clusterName } = req.body

    if (!address || !email || !containerId || !clusterName) {
      console.log('Error: POST /machine/undeploy. Invalid parameter.')
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
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
    console.log(`Error: POST /machine/undeploy.\n${err}`)
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
