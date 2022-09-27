const { initializeApp, cert } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore } = require('firebase-admin/firestore')
const serviceAccount = require('../keys/lg-robot-firebase-admin-config.json')

firebaseAdminConfig = {
  credential: cert(serviceAccount),
  databaseURL: 'https://lg-robot-dev-default-rtdb.firebaseio.com'
}

const app = initializeApp(firebaseAdminConfig, 'firebase-admin')
const auth = getAuth(app)
const firestore = getFirestore(app)

module.exports = {
  auth,
  firestore
}
