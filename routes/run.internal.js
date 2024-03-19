const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { firestore } = require('../firesbase/firebase-admin')
const { firebaseDB } = require('../firesbase/firebase')

async function clusterDeploy (address, clusterName, imageName, port, tokenName) {
  // get namespace of token
  let namespaceId
  const tokenNamespaceRef = firestore.collection(`tokens/${tokenName}/namespace`).doc(`${clusterName}@${address}`)
  const tokenNamespaceDoc = await tokenNamespaceRef.get()
  if (!tokenNamespaceDoc.exists) {
    const namespaceResult = await _createNamespace(address, clusterName)
    namespaceId = namespaceResult ? namespaceResult.result.namespaceId : null

    if (!namespaceId) {
      return {
        address,
        clusterName,
        result: {
          status: 'fail',
          message: 'Namespace creation failed.'
        }
      }
    }

    await tokenNamespaceRef.set({
      namespaceId
    })
  } else {
    const tokenNamespaceData = await tokenNamespaceDoc.data()
    namespaceId = tokenNamespaceData.namespaceId
  }

  // get node pool
  const clusterList = await ainClient.getClusterList()
  const targetCluster = clusterList ? clusterList.find(cluster => cluster.clusterName === clusterName) : null
  const targetPool = (!!targetCluster && !!targetCluster.nodePool) ? Object.keys(targetCluster.nodePool)[0] : null

  if (!targetPool) {
    return {
      address,
      clusterName,
      result: {
        status: 'fail',
        message: 'Insufficient resouce in machine.'
      }
    }
  }

  // create deployment
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

  const response = await ainClient.deploy(deployParams)

  if (response && response.errMessage) {
    return {
      address,
      clusterName,
      result: {
        status: 'fail',
        message: response.errMessage
      }
    }
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

  return {
    address,
    clusterName,
    result: {
      status: 'success',
      response
    }
  }
}

async function machineDeploy (address, clusterName, imageName, ports, isHost, privileged) {
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

  const response = await ainClient.deployForDocker(deployParams)

  if (response && response.errMessage) {
    return {
      address,
      clusterName,
      result: {
        status: 'fail',
        message: response.errMessage
      }
    }
  }

  const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
  const containerRef = ref.child(response.result.containerId)

  await containerRef.set({
    info: {
      image: imageName
    }
  })

  return {
    address,
    clusterName,
    result: {
      status: 'success',
      response
    }
  }
}

async function syncDeploy (imageName, ports, targets) {
  const targetPromises = targets.map((target) => {
    return machineDeploy(target.address, target.clusterName, imageName, ports, true, false)
    // return machineDeploy(target.address, target.clusterName, imageName, ports, false, false)
  })

  const results = await Promise.all(targetPromises)

  const targetResult = results.map(data => {
    if (data.result.status === 'success') {
      return {
        address: data.address,
        clusterName: data.clusterName,
        containerId: data.result.response.result.containerId
      }
    }
  })

  return targetResult
}

async function syncDelete (targets) {
  const targetPromises = targets.map((target) => {
    return _machineUndeploy(target.address, target.clusterName, target.containerId)
  })

  const deletedResult = await Promise.all(targetPromises)
}

async function _machineUndeploy (address, clusterName, containerId) {
  try {
    const unDeployParams = {
      clusterName,
      targetAddress: address,
      containerId
    }

    await ainClient.undeployForDocker(unDeployParams)

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerRef = ref.child(containerId)
    containerRef.remove()

    return true
  } catch (_) {
    return false
  }
}

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

module.exports = {
  clusterDeploy,
  machineDeploy,
  syncDeploy,
  syncDelete
}
