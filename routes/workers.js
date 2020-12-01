const express = require('express')
const router = express.Router()
const { ainClient } = require('../ainetwork/ain-connect-sdk')

router.get('/listMachines', async function(req, res, next) {
  try {
    const response = await ainClient.getClusterList()

    const workerList = []

    if (!response) {
      res.status(400).send('error: get cluster list')
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
    next(err)
  }
})

module.exports = router