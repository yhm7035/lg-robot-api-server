const express = require('express')
const router = express.Router()

const { ainClient } = require('../ainetwork/ain-connect-sdk')
const { verifyToken } = require('../middlewares/auth')

router.get('/listMachines', verifyToken, async function (req, res, next) {
  try {
    const response = await ainClient.getClusterList()
    const workerList = []

    if (!response) {
      res.status(500).json({
        statusCode: 500,
        message: 'Error: Get list of clusters.'
      })
      return
    }

    for (let i = 0; i < response.length; i++) {
      const info = response[i]

      if (!info.hasOwnProperty('isDocker')) {
        continue
      }

      if (!info.address) {
        continue
      }

      workerList.push({
        address: info.address,
        name: info.clusterName ? info.clusterName : '',
        platform: info.isDocker ? 'docker' : 'kubernetes'
      })
    }

    res.status(200).json({ list: workerList })
  } catch (err) {
    console.log(`Error: POST /listMachines.\n${err}`)
    res.status(500).send(err)
  }
})

module.exports = router
