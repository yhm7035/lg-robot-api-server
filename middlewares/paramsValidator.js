const Joi = require('joi')

const loginBodySchema = Joi.object({
  idToken: Joi.required()
})

function generateBodyValidator (schema) {
  return (req, res, next) => {
    const result = schema.validate(req.body)

    if (result.error) return res.status(400).send(result.error)

    req.body = result.value
    next()
  }
}

function generateQueryValidator (schema) {
  return (req, res, next) => {
    const result = schema.validate(req.query)

    if (result.error) return res.status(400).send(result.error)

    req.query = result.value
    next()
  }
}

module.exports = {
  // for auth.js
  loginBodyValidator: generateBodyValidator(loginBodySchema),
}
