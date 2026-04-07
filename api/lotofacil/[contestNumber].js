import { fetchLotofacilResult } from '../../shared/lotofacil.mjs'

export default async function handler(request, response) {
  try {
    response.status(200).json(
      await fetchLotofacilResult(request.query.contestNumber),
    )
  } catch (error) {
    response.status(502).json({
      message:
        error instanceof Error
          ? error.message
          : 'Nao foi possivel consultar a API da Caixa.',
    })
  }
}
