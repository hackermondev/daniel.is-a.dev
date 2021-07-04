const express = require('express')
const fetch = require('node-fetch')

const winston = require('winston')
const PORT = process.env.PORT || 3000
const path = require('path')

const cookieParser = require('cookie-parser')
const compression = require('compression')
const minify = require('./middleware/minify')

let meta = {
  links: require('./meta/links.json'),
  projects: require('./meta/projects.json'),
  analytics: require('./meta/analytics.json'),
  isProduction: process.env['NODE_ENV'] == 'production',
  meta: require('./meta/meta.json')
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'user-service' },
  transports: [
    new winston.transports.File({ filename: path.join(__dirname, `logs/error.log`), level: 'error' }),
    new winston.transports.File({ filename: path.join(__dirname, `logs/combined.log`) }),
    new winston.transports.Console({
      format: winston.format.simple(),
    })
  ],
})

const api = require('./routes/api')

let app = express()

app.use(compression())
app.use(minify)

app.use((req, res, next) => {
  // logging
  logger.log(`info`, `${req.method} ${req.path} (${req.headers['user-agent']}) ${res.getHeader('content-type')}`)

  // Enabling CORS

  res.header("x-hackermon", "yes")

  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x - client - key, x - client - token, x - client - secret, Authorization")

  next()
})

app.use('/static', express.static('static'))

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(cookieParser())

app.use('/api', api)

app.get('/', (req, res) => {
  // copy json
  var metaForPage = JSON.parse(JSON.stringify(meta))

  metaForPage['meta'] = meta['meta'][req.path]

  if (meta['isProduction'] == true && req.cookies['disable_analytics'] == undefined) {
    metaForPage['renderAnalytics'] = true
  } else {
    metaForPage['renderAnalytics'] = false
  }

  res.render(`home`, metaForPage)
})

app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, `static/robots.txt`))
})

app.get('/analytics', (req, res) => {
  res.redirect(`https://ackee-production-yukv.up.railway.app/`)
})

app.get('/scripts/science.js', async (req, res) => {
  try {
    var fetchRes = await fetch(`https://${meta.analytics.AckeeHost}/tracker.js`)

    var text = await fetchRes.text()

    res.set(`content-type`, `text/javascript`)
    res.end(text)
  }
  catch (err) {
    logger.log(`error`, `Failed to load analytics ${err}`)

    res.end(`alert('failed to load analytics');`)
  }
})

app.listen(PORT, () => {
  logger.log(`info`, `Starting app as (${process.env.NODE_ENV}) ${new Date().toString()}`)
})