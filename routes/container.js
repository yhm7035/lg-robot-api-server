const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { firebaseDB } = require('../firesbase/database')

router.get('/cluster/listContatinerInfo', async function (req, res) {
  try {
    const { address, clusterName } = req.query

    if (!address || !clusterName) {
      console.log('error(at listContatinerInfo): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerInfoList = []

    const snapshot = await ref.once('value')
    const containerList = await snapshot.val()

    if (!containerList) {
      console.log('error(at listContatinerInfo): no container')
      res.status(404).json({
        statusCode: 404,
        message: 'error: no container'
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

      containerInfoList.push({
        containerId: key,
        imageName: containerList[key].info.image,
        status: result.containerStatus,
        endpoint: containerList[key].info.endpoint
      })
    }

    res.status(200).json({ list: containerInfoList })
  } catch (err) {
    console.log(`[error at listContatinerInfo]\n${err}`)
    res.status(500).send(err)
  }
})

router.get('/machine/listContatinerInfo', async function (req, res, next) {
  try {
    const { address, clusterName } = req.query

    if (!address || !clusterName) {
      console.log('error(at listContatinerInfo): invalid parameter')
      res.status(400).json({
        statusCode: 400,
        message: 'error: invalid parameter'
      })
      return
    }

    const ref = firebaseDB.ref(`api-server/${clusterName}@${address}/containers`)
    const containerInfoList = []

    const snapshot = await ref.once('value')
    const containerList = await snapshot.val()

    if (!containerList) {
      console.log('error(at listContatinerInfo): no container')
      res.status(404).json({
        statusCode: 404,
        message: 'error: no container'
      })
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

      console.log(result)

      if (!result || !result.params || !result.params.status || !containerList[key].info.image) continue

      containerInfoList.push({
        containerId: key,
        imageName: containerList[key].info.image,
        status: result.params.status
      })
    }

    res.status(200).json({ list: containerInfoList })
  } catch (err) {
    console.log(`[error at listContatinerInfo]\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
