const officialBaseUrl = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil'
const fallbackBaseUrl = 'https://lottolookup.com.br/api/lotofacil'

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

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://loterias.caixa.gov.br/',
      'User-Agent': 'Mozilla/5.0',
    },
    signal: AbortSignal.timeout(10000),
  })

  return response
}

function buildOfficialUrl(contestNumber) {
  return contestNumber ? `${officialBaseUrl}/${contestNumber}` : officialBaseUrl
}

function buildFallbackUrl(contestNumber) {
  return contestNumber ? `${fallbackBaseUrl}/${contestNumber}` : `${fallbackBaseUrl}/latest`
}

export async function fetchLotofacilResult(contestNumber) {
  const officialResponse = await fetchJson(buildOfficialUrl(contestNumber)).catch(
    () => null,
  )

  if (officialResponse?.ok) {
    return normalizeResult(await officialResponse.json())
  }

  const shouldTryFallback =
    officialResponse === null ||
    officialResponse.status === 401 ||
    officialResponse.status === 403 ||
    officialResponse.status >= 500

  if (shouldTryFallback) {
    const fallbackResponse = await fetchJson(buildFallbackUrl(contestNumber))

    if (!fallbackResponse.ok) {
      throw new Error(
        `A API alternativa respondeu com status ${fallbackResponse.status}.`,
      )
    }

    return normalizeResult(await fallbackResponse.json())
  }

  throw new Error(`A API da Caixa respondeu com status ${officialResponse.status}.`)
}
