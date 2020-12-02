const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')

router.get('/listMachines', async function(req, res, next) {
  try {
    const response = await ainClient.getClusterList()
    const workerList = []

    if (!response) {
      console.log('error(at listMachines): get cluster list')
      res.status(500).json({
        statusCode: 500,
        message: "error: get cluster list"
      })
      return
    }

    for (let i = 0; i < response.length; i++) {
      const info = response[i]

      if (!info.address) {
        continue
      }

      workerList.push({
        address: info.address,
        name: !!info.clusterName ? info.clusterName : '',
        platform: info.isDocker ? 'docker' : 'kubernetes'
      })
    }

    res.status(200).json({ list: workerList })
  } catch (err) {
    console.log(`[error at listMachines]\n${err}`)
    res.status(500).send(err)
    return
  }
})

module.exports = router