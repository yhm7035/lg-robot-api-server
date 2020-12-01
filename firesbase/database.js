const firebase = require('firebase')
const app = firebase.app();
const firebaseConfig = require('../keys/lg-robot-firebase-config.json')

require('dotenv').config()

app.auth().signInWithEmailAndPassword(process.env.EMAIL, process.env.PASSWD)
firebase.initializeApp(firebaseConfig, 'api-server')

const firebaseDB = firebase.database(app)

module.exports = { firebaseDB }