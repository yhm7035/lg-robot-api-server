var createError = require('http-errors')
var express = require('express')
var path = require('path')
var cookieParser = require('cookie-parser')
var logger = require('morgan')

const indexRouter = require('./routes/index')
const runRouter = require('./routes/run')
const workerRouter = require('./routes/workers')
const containerRouter = require('./routes/container')
const authRouter = require('./routes/auth')
const imageRouter = require('./routes/image')
const metadataRouter = require('./routes/metadata')
const ideRouter = require('./routes/ide')
const failureRouter = require('./routes/failure')

const { refreshWorkerList } = require('./routes/workers.internal')

const app = express()

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'jade')

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

app.use('/', indexRouter)
app.use('/run', runRouter)
app.use('/workers', workerRouter)
app.use('/container', containerRouter)
app.use('/auth', authRouter)
app.use('/image', imageRouter)
app.use('/informationModel', metadataRouter)
app.use('/ide', ideRouter)
app.use('/failure', failureRouter)

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404))
})

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

// updated worker list every 10 minutes
setInterval(refreshWorkerList, 1000 * 60 * 15)
// const intervalID = setInterval(refreshWorkerList, 500)

module.exports = app
