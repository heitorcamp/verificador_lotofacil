import path from 'node:path'
import { fileURLToPath } from 'node:url'

import cors from 'cors'
import express from 'express'

const upstreamBaseUrl = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDirectory = path.resolve(__dirname, '../dist')
const app = express()
const port = Number(process.env.PORT ?? 3001)

app.disable('x-powered-by')
app.use(cors())

function toNumber(value) {
  return Number.parseInt(String(value), 10)
}

function extractHitCount(description) {
  const matchedValue = String(description).match(/\d+/)
  return matchedValue ? Number.parseInt(matchedValue[0], 10) : 0
}

function normalizeResult(payload) {
  return {
    contestNumber: payload.numero,
    drawDate: payload.dataApuracao,
    nextContestDate: payload.dataProximoConcurso,
    nextContestNumber: payload.numeroConcursoProximo,
    drawLocation: payload.localSorteio,
    drawCity: payload.nomeMunicipioUFSorteio,
    drawnNumbers: (payload.listaDezenas ?? []).map(toNumber),
    drawingOrder: (payload.dezenasSorteadasOrdemSorteio ?? []).map(toNumber),
    accumulated: Boolean(payload.acumulado),
    estimatedNextPrize: payload.valorEstimadoProximoConcurso ?? 0,
    totalCollected: payload.valorArrecadado ?? 0,
    checkedAt: new Date().toISOString(),
    prizeTiers: (payload.listaRateioPremio ?? []).map((tier) => ({
      description: tier.descricaoFaixa,
      hits: extractHitCount(tier.descricaoFaixa),
      winners: tier.numeroDeGanhadores,
      amount: tier.valorPremio,
    })),
  }
}

async function fetchLotofacilResult(contestNumber) {
  const url = contestNumber
    ? `${upstreamBaseUrl}/${contestNumber}`
    : upstreamBaseUrl

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://loterias.caixa.gov.br/',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!response.ok) {
    throw new Error(`A API da Caixa respondeu com status ${response.status}.`)
  }

  return normalizeResult(await response.json())
}

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
