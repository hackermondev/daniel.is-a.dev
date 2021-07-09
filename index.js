const express = require('express')
const fetch = require('node-fetch')

const winston = require('winston')
const PORT = process.env.PORT || 3000
const path = require('path')

const cookieParser = require('cookie-parser')
const compression = require('compression')
const minify = require('./middleware/minify')

const helmet = require("helmet")
const bodyParser = require('body-parser')
const limit = require('express-limit').limit

let meta = {
  links: require('./meta/links.json'),
  projects: require('./meta/projects.json'),
  analytics: require('./meta/analytics.json'),
  isProduction: process.env['NODE_ENV'] == 'production',
  meta: require('./meta/meta.json'),
  blogs: []
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

const blogApi = require('./routes/blog')

let app = express()

// Security & Improvment Middleware

app.use(compression())

app.use(helmet({
  contentSecurityPolicy: false
}))

// app.use(limit({
//   max: 100,
//   period: 60 * 1000
// }))


// Logging Middleware

app.use('/static', express.static('static'))

app.use((req, res, next) => {
  // logging
  logger.log(`info`, `${req.method} ${req.path} (${req.headers['user-agent']}) ${res.getHeader('content-type')}`)

  // Enabling CORS
  res.header("x-hackermon", "yes")

  next()
})


app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Parsers
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser(process.env.COOKIE_SECRET))

// Routes 

app.use('/blog', blogApi)

app.get('/', async (req, res) => {
  // copy json
  var metaForPage = JSON.parse(JSON.stringify(meta))

  metaForPage['meta'] = meta['meta'][req.path]

  if (meta['isProduction'] == true && req.cookies['disable_analytics'] == undefined) {
    metaForPage['renderAnalytics'] = true
  } else {
    metaForPage['renderAnalytics'] = false
  }
  
  if(req.header('dnt') == 1){
    metaForPage['renderAnalytics'] = false
  }

  try{
    var showHiddenBlogs = false

    if(req.signedCookies['sid']){
      showHiddenBlogs = true
    }
    
    var websiteBlogs = null

    if(showHiddenBlogs == false){
      websiteBlogs = await blogApi.fetchBlogs({
        hidden: false
      })
    } else {
      websiteBlogs = await blogApi.fetchBlogs()
    }

    metaForPage['blogs'] = websiteBlogs
  } catch (err) {
    logger.log(`error`, `Could not fetch blogs: `, err)
    
    metaForPage['blogs'] = []
  }
  
  if(meta.isProduction == true){
    metaForPage['cache'] = true
  }

  res.render(`home`, metaForPage)
})

app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, `static/robots.txt`))
})

app.get('/github', (req, res)=>{
  res.redirect(`https://github.com/hackermondev`)
})

app.get('/twitter', (req, res)=>{
  res.redirect(`https://twitter.com/hackermondev`)
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