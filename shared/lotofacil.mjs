const upstreamBaseUrl = 'https://servicebus2.caixa.gov.br/portaldeloterias/api/lotofacil'

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

export async function fetchLotofacilResult(contestNumber) {
  const url = contestNumber ? `${upstreamBaseUrl}/${contestNumber}` : upstreamBaseUrl

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
