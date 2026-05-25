require('dotenv').config()

const express = require('express')
const multer = require('multer')
const unzipper = require('unzipper')
const mongoose = require('mongoose')
const bodyParser = require('body-parser')
const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')

const app = express()

// MongoDB
mongoose.connect(process.env.MONGODB_URI)

const tokenSchema = new mongoose.Schema({
  username: String,
  token: String
})

const Token = mongoose.model('Token', tokenSchema)

app.use(bodyParser.json())
app.use(express.static(path.join(__dirname, '../public')))

// multer memory
const upload = multer({
  dest: '/tmp'
})

// Home
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'))
})

// Save Token
app.post('/save-token', async (req, res) => {

  try {

    const { username, token } = req.body

    if (!username || !token) {
      return res.json({
        status: false,
        error: 'Data tidak lengkap'
      })
    }

    const existing = await Token.findOne({ username })

    if (existing) {

      existing.token = token
      await existing.save()

    } else {

      await Token.create({
        username,
        token
      })

    }

    res.json({
      status: true
    })

  } catch (err) {

    res.json({
      status: false,
      error: err.toString()
    })

  }

})

// Upload ZIP
app.post('/upload', upload.single('zip'), async (req, res) => {

  try {

    const username = req.body.username
    const repo = req.body.repo

    const tokenData = await Token.findOne({ username })

    if (!tokenData) {
      return res.json({
        status: false,
        error: 'Token tidak ditemukan'
      })
    }

    const token = tokenData.token

    const extractPath =
      path.join('/tmp', Date.now().toString())

    fs.mkdirSync(extractPath, {
      recursive: true
    })

    await fs.createReadStream(req.file.path)
      .pipe(unzipper.Extract({
        path: extractPath
      }))
      .promise()

    const remoteUrl =
`https://${encodeURIComponent(token)}@github.com/${username}/${repo}.git`

    const cmd = `
cd "${extractPath}"

git init

git config user.name "Auto Push"
git config user.email "push@local.com"

git add .

git commit -m "Upload ZIP" || true

git branch -M main

git remote remove origin 2>/dev/null || true

git remote add origin "${remoteUrl}"

git push -u origin main --force
`

    exec(cmd, {
      maxBuffer: 1024 * 1024 * 20
    }, (err, stdout, stderr) => {

      if (err) {
        return res.json({
          status: false,
          error: stderr || err.message
        })
      }

      res.json({
        status: true,
        output: stdout
      })

    })

  } catch (err) {

    res.json({
      status: false,
      error: err.toString()
    })

  }

})

module.exports = app
