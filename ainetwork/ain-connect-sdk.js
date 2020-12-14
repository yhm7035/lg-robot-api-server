const { Client } = require('@aindev/connect-sdk')
const firebaseConfig = require('../keys/lg-robot-firebase-config.json')

const ainClient = new Client(
  'shield amount champion pulp obtain absorb giggle spatial matter budget pipe venture',
  'staging',
  firebaseConfig
)

module.exports = {
  ainClient
}
