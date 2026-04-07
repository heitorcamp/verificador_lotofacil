const officialBaseUrl = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil'
const fallbackBaseUrl = 'https://lottolookup.com.br/api/lotofacil'
const githubFallbackUrl =
  'https://raw.githubusercontent.com/guilhermeasn/loteria.json/master/data/lotofacil.json'

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
    dataSource: 'resultado-completo',
    hasDetailedStats: true,
    prizeTiers: (payload.listaRateioPremio ?? []).map((tier) => ({
      description: tier.descricaoFaixa,
      hits: extractHitCount(tier.descricaoFaixa),
      winners: tier.numeroDeGanhadores,
      amount: tier.valorPremio,
    })),
  }
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function fetchJson(url, headers = {}) {
  return fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://loterias.caixa.gov.br/',
      'User-Agent': 'Mozilla/5.0',
      ...headers,
    },
    signal: AbortSignal.timeout(10000),
  })
}

function buildOfficialUrl(contestNumber) {
  return contestNumber ? `${officialBaseUrl}/${contestNumber}` : officialBaseUrl
}

function buildFallbackUrl(contestNumber) {
  return contestNumber ? `${fallbackBaseUrl}/${contestNumber}` : `${fallbackBaseUrl}/latest`
}

function normalizeGithubResult(drawMap, requestedContestNumber) {
  const availableContests = Object.keys(drawMap)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value))
    .sort((left, right) => left - right)

  if (availableContests.length === 0) {
    throw new Error('A base publica do GitHub nao retornou concursos validos.')
  }

  const contestNumber =
    requestedContestNumber && availableContests.includes(Number(requestedContestNumber))
      ? Number(requestedContestNumber)
      : availableContests[availableContests.length - 1]

  const drawingOrder = (drawMap[String(contestNumber)] ?? [])
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isInteger(value))

  if (drawingOrder.length === 0) {
    throw new Error(`O concurso ${contestNumber} nao existe na base publica do GitHub.`)
  }

  return {
    contestNumber,
    drawDate: '',
    nextContestDate: '',
    nextContestNumber: contestNumber + 1,
    drawLocation: 'Fonte alternativa',
    drawCity: 'GitHub raw',
    drawnNumbers: [...drawingOrder].sort((left, right) => left - right),
    drawingOrder,
    accumulated: false,
    estimatedNextPrize: 0,
    totalCollected: 0,
    checkedAt: new Date().toISOString(),
    dataSource: 'github-raw',
    hasDetailedStats: false,
    prizeTiers: [],
  }
}

export async function fetchLotofacilResult(contestNumber) {
  const errors = []

  const officialResponse = await fetchJson(buildOfficialUrl(contestNumber)).catch((error) => {
    errors.push(`CAIXA: ${getErrorMessage(error)}`)
    return null
  })

  if (officialResponse?.ok) {
    return {
      ...normalizeResult(await officialResponse.json()),
      dataSource: 'caixa-oficial',
    }
  }

  if (officialResponse && !officialResponse.ok) {
    errors.push(`CAIXA: status ${officialResponse.status}`)
  }

  const shouldTryFallback =
    officialResponse === null ||
    officialResponse.status === 401 ||
    officialResponse.status === 403 ||
    officialResponse.status >= 500

  if (shouldTryFallback) {
    const fallbackResponse = await fetchJson(buildFallbackUrl(contestNumber)).catch(
      (error) => {
        errors.push(`LottoLookup: ${getErrorMessage(error)}`)
        return null
      },
    )

    if (fallbackResponse?.ok) {
      return {
        ...normalizeResult(await fallbackResponse.json()),
        dataSource: 'lottolookup',
      }
    }

    if (fallbackResponse && !fallbackResponse.ok) {
      errors.push(`LottoLookup: status ${fallbackResponse.status}`)
    }

    const githubResponse = await fetchJson(githubFallbackUrl, {
      Accept: 'application/json',
      Referer: 'https://github.com/',
    }).catch((error) => {
      errors.push(`GitHub raw: ${getErrorMessage(error)}`)
      return null
    })

    if (githubResponse?.ok) {
      return normalizeGithubResult(await githubResponse.json(), contestNumber)
    }

    if (githubResponse && !githubResponse.ok) {
      errors.push(`GitHub raw: status ${githubResponse.status}`)
    }

    throw new Error(
      `Nao foi possivel consultar nenhuma fonte de resultados. ${errors.join(' | ')}`,
    )
  }

  throw new Error(`A API da Caixa respondeu com status ${officialResponse.status}.`)
}
