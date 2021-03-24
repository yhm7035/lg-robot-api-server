const firebaseAdmin = require('firebase-admin')
const serviceAccount = require('../keys/lg-robot-firebase-admin-config.json')

firebaseAdminConfig = {
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: 'https://lg-robot-dev-default-rtdb.firebaseio.com'
}

const admin = firebaseAdmin.initializeApp(firebaseAdminConfig, 'firebase-admin')
const auth = admin.auth()

const firestore = admin.firestore()

module.exports = {
  auth,
  firestore
}
