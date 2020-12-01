const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { firebaseDB } = require('../firesbase/database')

router.get('/cluster/listContatinerInfo', async function(req, res, next) { 
  try {
    const { address, clusterName } = req.query

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerInfoList = []

    const snapshot = await ref.once('value')
    const containerList = await snapshot.val()

    if (!containerList) {
      res.status(400).send('there is not any container to list')
      return
    }

    const containerKeys = await Object.keys(containerList)

    for (let i = 0; i < containerKeys.length; i++) {
      const key = containerKeys[i]

      const params = {
        targetAddress: address,
        clusterName,
        containerId: key
      }

      const result = await ainClient.getContainerStatus(params)

      containerInfoList.push({
        containerId: key,
        imageName: containerList[key].info.image,
        status: result.containerStatus,
        endpoint: containerList[key].info.endpoint
      })
    }

    res.status(200).json({ list: containerInfoList })
  } catch (err) {
    next(err)
  }
})

router.get('/machine/listContatinerInfo', async function(req, res, next) { 
  try {
    const { address, clusterName } = req.query

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerInfoList = []

    const snapshot = await ref.once('value')
    const containerList = await snapshot.val()

    if (!containerList) {
      res.status(400).send('there is not any container to list')
      return
    }

    const containerKeys = await Object.keys(containerList)

    for (let i = 0; i < containerKeys.length; i++) {
      const key = containerKeys[i]

      const params = {
        targetAddress: address,
        clusterName,
        containerId: key
      }

      const result = await ainClient.getContainerStatusForDocker(params)

      containerInfoList.push({
        containerId: key,
        imageName: containerList[key].info.image,
        status: result.containerStatus
      })
    }

    res.status(200).json({ list: containerInfoList })
  } catch (err) {
    next(err)
  }
})

module.exports = router
