const { imageInfoArray } = require('./image.data')
const { firestore } = require('../firesbase/firebase-admin')

const updateImageManifest = async () => {
  for (let i = 0; i < imageInfoArray.length; i++) {
    const imageName = imageInfoArray[i].imageName.trim()
    const digest = imageInfoArray[i].digest.trim()
    const tag = imageInfoArray[i].tag.trim()

    try {
      if (tag.includes(',')) {
        const tags = tag.split(',')
        for (let j = 0; j < tags.length; j++) {
          const imageRef = firestore.collection(`images/${imageName}/${tags[j].trim()}`).doc('metadata')

          await imageRef.update({
            digest
          })
        }
      } else {
        const imageRef = firestore.collection(`images/${imageName}/${tag}`).doc('metadata')

        await imageRef.update({
          digest
        })
      }
    } catch (_) {
      console.log(`Error: Fail to update ${imageName}:${tag}.`)
    }
  }
}

module.exports = {
  updateImageManifest
}
