// Real-time database
const { firebaseDB } = require('../firesbase/firebase')
// Firestore database
const { firestore } = require('../firesbase/firebase-admin')

const refreshWorkerList = async () => {
  const ref = firebaseDB.ref('worker/info')
  const snapshot = await ref.once('value')
  const valueObject = await snapshot.val()

  const stoppedList = []
  const updatedList = []
  const currTime = Date.now()

  for (const key in valueObject) {
    if (Object.prototype.hasOwnProperty.call(valueObject, key)) {
      if (Object.prototype.hasOwnProperty.call(valueObject[key], 'updatedAt')) {
        const stoppedTime = Math.abs(currTime - valueObject[key].updatedAt) / (1000 * 60 * 60)

        // delete a worker information from database if it is stopped last 1 hour
        if (stoppedTime >= 1) {
          stoppedList.push(valueObject[key])

          const realTimeRef = firebaseDB.ref(`worker/info/${key}`)
          realTimeRef.remove()
        } else {
          updatedList.push(valueObject[key])
        }
      }
    }
  }

  // delete stopped worker
  for (const info of stoppedList) {
    const params = info.params
    const workerRef = firestore.collection(`workers/${params.clusterName}@${params.address}/info`).doc('data')
    const workerDoc = await workerRef.get()

    if (workerDoc.exists) {
      const workerData = await workerDoc.data()

      if (Object.prototype.hasOwnProperty.call(workerData, 'alias')) {
        const workerAlias = workerData.alias
        const workerAliasRef = firestore.collection('workers_metadata').doc(workerAlias)

        await workerAliasRef.delete()
      }

      await workerRef.delete()
      await firestore.collection('workers').doc(`${params.clusterName}@${params.address}`).delete()
    }
  }

  // update living worker
  for (const info of updatedList) {
    const params = info.params
    const workerRef = firestore.collection(`workers/${params.clusterName}@${params.address}/info`).doc('data')
    const workerDoc = await workerRef.get()

    if (!workerDoc.exists) {
      const alias = `${params.clusterName}@${params.address}`

      const aliasRef = firestore.collection('workers_metadata').doc(`${params.clusterName}@${params.address}`)
      await aliasRef.set({
        ref: `workers/${params.clusterName}@${params.address}/info`
      })

      await workerRef.set({
        alias,
        ...info
      }, { merge: true })
    }

    const addressRef = firestore.collection('workers').doc(`${params.clusterName}@${params.address}`)
    await addressRef.set({
      updatedAt: currTime,
      updatedTime: new Date(currTime).toISOString()
    })
  }
}

const getWorkerList = async () => {
  const workerSnapshot = await firestore.collection('workers').get()
  const workerList = []

  for (const document of workerSnapshot.docs) {
    const workerRef = firestore.collection(`workers/${document.id}/info`).doc('data')
    const workerDoc = await workerRef.get()
    const workerData = await workerDoc.data()

    workerList.push({
      address: workerData.params.address,
      name: workerData.params.clusterName,
      platform: workerData.params.isDocker ? 'docker' : 'kubernetes',
      metadata: workerData.metadata
    })
  }

  return workerList
}

const getWorkerListFromAlias = async () => {
  const workerAliasSnapshot = await firestore.collection('workers_metadata').get()
  const workerList = []

  for (const document of workerAliasSnapshot.docs) {
    const workerAliasRef = firestore.collection('workers_metadata').doc(document.id)
    const workerAliasDoc = await workerAliasRef.get()
    const workerAliasData = await workerAliasDoc.data()

    if (Object.prototype.hasOwnProperty.call(workerAliasData, 'ref')) {
      const workerRef = firestore.collection(workerAliasData.ref).doc('data')
      const workerDoc = await workerRef.get()

      if (workerDoc.exists) {
        const workerData = await workerDoc.data()

        workerList.push({
          alias: document.id,
          address: workerData.params.address,
          name: workerData.params.clusterName,
          platform: workerData.params.isDocker ? 'docker' : 'kubernetes',
          metadata: workerData.metadata
        })
      }
    }
  }

  return workerList
}

const deleteAllNamespaceData = async (clusterName, address) => {
  try {
    const workerNamespaceSnapshot = await firestore.collection(`workers/${clusterName}@${address}/namespace`).get()

    for (const document of workerNamespaceSnapshot.docs) {
      const namespaceRef = firestore.collection(`workers/${clusterName}@${address}/namespace`).doc(document.id)
      const namespaceDoc = await namespaceRef.get()
      const namespacedata = await namespaceDoc.data()

      if (Object.prototype.hasOwnProperty.call(namespacedata, 'ref')) {
        const userNamespaceRef = firestore.collection(namespacedata.ref).doc(`${clusterName}@${address}`)

        await userNamespaceRef.delete()
      }
      await namespaceRef.delete()
    }

    // return success status
    return 0
  } catch (err) {
    console.log(err)
    return 1
  }
}

module.exports = {
  getWorkerList,
  refreshWorkerList,
  getWorkerListFromAlias,
  deleteAllNamespaceData
}
