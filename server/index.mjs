import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cors from 'cors'
import express from 'express'
import { fetchLotofacilResult } from '../shared/lotofacil.mjs'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDirectory = path.resolve(__dirname, '../dist')
const app = express()
const port = Number(process.env.PORT ?? 3001)

app.disable('x-powered-by')
app.use(cors())

app.get('/api/lotofacil/latest', async (_request, response) => {
  try {
    response.json(await fetchLotofacilResult())
  } catch (error) {
    response.status(502).json({
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel consultar a API da Caixa.',
    })
  }
})

app.get('/api/lotofacil/:contestNumber', async (request, response) => {
  try {
    response.json(await fetchLotofacilResult(request.params.contestNumber))
  } catch (error) {
    response.status(502).json({
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel consultar a API da Caixa.',
    })
  }
})

app.use(express.static(distDirectory))

app.use((request, response, next) => {
  if (request.path.startsWith('/api')) {
    next()
    return
  }

  response.sendFile(path.join(distDirectory, 'index.html'), (error) => {
    if (error) {
      next(error)
    }
  })
})

app.listen(port, () => {
  console.log(`Servidor Lotofacil ativo em http://localhost:${port}`)
})
