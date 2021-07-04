let express = require('express')
let router = express.Router()

router.get('/cached_at', (req, res)=>{

  // cache for 30 seconds for test
  res.set(`Cache-Control`, `public, max-age=30, immutable`)

  res.end(new Date().toString())
})

module.exports = router