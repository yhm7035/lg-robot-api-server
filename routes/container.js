const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { firebaseDB } = require('../firesbase/firebase')

router.get('/cluster/listContatinerInfo', async function (req, res) {
  try {
    const { address, clusterName } = req.query

    if (!address || !clusterName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerInfoList = []

    const snapshot = await ref.once('value')
    const containerList = await snapshot.val()

    if (!containerList) {
      res.status(404).json({
        statusCode: 404,
        message: 'Error: No container.'
      })
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

      if (!result || !result.containerStatus || !containerList[key].info.image || !containerList[key].info.endpoint) continue

      const portKeys = await Object.keys(containerList[key].info.endpoint)

      portKeys.forEach(element => {
        containerInfoList.push({
          containerId: key,
          imageName: containerList[key].info.image,
          status: result.containerStatus,
          endpoint: containerList[key].info.endpoint[element]
        })
      })
    }

    res.status(200).json({ list: containerInfoList })
  } catch (err) {
    console.log(`Error: POST /cluster/listContatinerInfo.\n${err}`)
    res.status(500).send(err)
  }
})

router.get('/machine/listContatinerInfo', async function (req, res) {
  try {
    const { address, clusterName } = req.query

    if (!address || !clusterName) {
      res.status(400).json({
        statusCode: 400,
        message: 'Error: Invalid parameter.'
      })
      return
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerInfoList = []

    const snapshot = await ref.once('value')
    const containerList = await snapshot.val()

    if (!containerList) {
      res.status(404).json({
        statusCode: 404,
        message: 'Error: No container.'
      })
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

      if (!result || !result.params || !result.params.status || !containerList[key].info.image) continue

      containerInfoList.push({
        containerId: key,
        imageName: containerList[key].info.image,
        status: result.params.status
      })
    }

    res.status(200).json({ list: containerInfoList })
  } catch (err) {
    console.log(`Error: POST /machine/listContatinerInfo.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
