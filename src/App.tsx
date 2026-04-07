import type { FormEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

const GAMES_STORAGE_KEY = 'lotofacil-games'
const LEGACY_GAME_STORAGE_KEY = 'lotofacil-fixed-game'
const SELECTED_GAME_STORAGE_KEY = 'lotofacil-selected-game'
const CHECK_STORAGE_KEY = 'lotofacil-last-check'
const LOTTERY_NUMBERS = Array.from({ length: 25 }, (_, index) => index + 1)
const FIXED_PRIZE_BY_HITS: Record<number, number> = {
  11: 7,
  12: 14,
  13: 35,
}

type PrizeTier = {
  description: string
  hits: number
  winners: number
  amount: number | null
  source?: 'draw' | 'rules' | 'unavailable'
}

type LotofacilResult = {
  contestNumber: number
  drawDate: string
  nextContestDate: string
  nextContestNumber: number
  drawLocation: string
  drawCity: string
  drawnNumbers: number[]
  drawingOrder: number[]
  accumulated: boolean
  estimatedNextPrize: number
  totalCollected: number
  prizeTiers: PrizeTier[]
  checkedAt: string
}

type Checkpoint = {
  contestNumber: number
  checkedAt: string
}

type SavedGame = {
  id: string
  name: string
  numbers: number[]
}

type GameSummary = {
  game: SavedGame
  valid: boolean
  matchedNumbers: number[]
  missedNumbers: number[]
  prizeTier: PrizeTier | null
}

function sanitizeNumbers(values: unknown): number[] {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 25)
    .filter((value, index, list) => list.indexOf(value) === index)
    .sort((left, right) => left - right)
    .slice(0, 15)
}

function createGame(index: number, numbers: number[] = []): SavedGame {
  return {
    id: `game-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: `Jogo ${index}`,
    numbers,
  }
}

function loadGames(): SavedGame[] {
  if (typeof window === 'undefined') {
    return [createGame(1)]
  }

  try {
    const rawGames = window.localStorage.getItem(GAMES_STORAGE_KEY)

    if (rawGames) {
      const parsedGames = JSON.parse(rawGames)

      if (Array.isArray(parsedGames)) {
        const normalizedGames = parsedGames
          .map((game, index) => {
            if (typeof game !== 'object' || game === null) {
              return null
            }

            const id =
              typeof game.id === 'string' && game.id.length > 0
                ? game.id
                : createGame(index + 1).id

            const name =
              typeof game.name === 'string' && game.name.trim().length > 0
                ? game.name.trim()
                : `Jogo ${index + 1}`

            return {
              id,
              name,
              numbers: sanitizeNumbers(game.numbers),
            }
          })
          .filter((game): game is SavedGame => game !== null)

        if (normalizedGames.length > 0) {
          return normalizedGames
        }
      }
    }

    const rawLegacyGame = window.localStorage.getItem(LEGACY_GAME_STORAGE_KEY)

    if (rawLegacyGame) {
      const legacyGame = sanitizeNumbers(JSON.parse(rawLegacyGame))

      if (legacyGame.length > 0) {
        return [createGame(1, legacyGame)]
      }
    }
  } catch {
    return [createGame(1)]
  }

  return [createGame(1)]
}

function loadSelectedGameId(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(SELECTED_GAME_STORAGE_KEY)
}

function loadCheckpoint(): Checkpoint | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const rawValue = window.localStorage.getItem(CHECK_STORAGE_KEY)

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)

    if (
      typeof parsedValue?.contestNumber !== 'number' ||
      typeof parsedValue?.checkedAt !== 'string'
    ) {
      return null
    }

    return parsedValue
  } catch {
    return null
  }
}

function formatNumber(value: number) {
  return value.toString().padStart(2, '0')
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatDate(value: string) {
  const [day, month, year] = value.split('/')

  if (!day || !month || !year) {
    return value
  }

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Number(year), Number(month) - 1, Number(day)))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function getPrizeHeadline(prizeTier: PrizeTier | null, validGame: boolean) {
  if (!validGame) {
    return 'Sem faixa premiada'
  }

  if (!prizeTier) {
    return 'Sem faixa premiada'
  }

  if (prizeTier.amount === null) {
    return 'Faixa premiada'
  }

  return formatCurrency(prizeTier.amount)
}

function getPrizeDetails(prizeTier: PrizeTier | null, validGame: boolean) {
  if (!validGame) {
    return 'A Lotofacil paga de 11 a 15 acertos.'
  }

  if (!prizeTier) {
    return 'A Lotofacil paga de 11 a 15 acertos.'
  }

  if (prizeTier.source === 'rules') {
    return `${prizeTier.description} com premio fixo oficial da Lotofacil.`
  }

  if (prizeTier.source === 'unavailable') {
    return `${prizeTier.description} premiado, mas o valor nao veio na fonte alternativa.`
  }

  return `${prizeTier.description} com ${prizeTier.winners} apostas ganhadoras`
}

function getSummaryPrizeText(summary: GameSummary) {
  if (!summary.valid) {
    return 'Complete 15 dezenas para entrar na conferencia'
  }

  if (!summary.prizeTier) {
    return 'Sem premiacao neste concurso'
  }

  if (summary.prizeTier.amount === null) {
    return `${summary.prizeTier.description} com valor indisponivel nesta fonte`
  }

  if (summary.prizeTier.source === 'rules') {
    return `${summary.prizeTier.description} com premio fixo oficial de ${formatCurrency(summary.prizeTier.amount)}`
  }

  return `${summary.prizeTier.description} de ${formatCurrency(summary.prizeTier.amount)}`
}

function describeHitCount(hitCount: number) {
  if (hitCount >= 15) {
    return 'Cartela perfeita. Hora de separar o comprovante.'
  }

  if (hitCount >= 11) {
    return 'Aposta premiada. Vale conferir o comprovante com calma.'
  }

  if (hitCount >= 8) {
    return 'Bateu perto. Esse jogo merece continuar no radar.'
  }

  return 'Desta vez nao encaixou, mas o jogo ja fica pronto para a proxima conferencia.'
}

function buildGameSummary(game: SavedGame, result: LotofacilResult | null): GameSummary {
  const drawnNumbers = new Set(result?.drawnNumbers ?? [])
  const matchedNumbers = game.numbers.filter((value) => drawnNumbers.has(value))
  const missedNumbers = game.numbers.filter((value) => !drawnNumbers.has(value))
  const matchedHits = matchedNumbers.length
  const prizeTierFromResult =
    result?.prizeTiers.find((tier) => tier.hits === matchedHits) ?? null

  let prizeTier: PrizeTier | null = prizeTierFromResult
    ? {
        ...prizeTierFromResult,
        source: 'draw' as const,
      }
    : null

  if (!prizeTier && FIXED_PRIZE_BY_HITS[matchedHits]) {
    prizeTier = {
      description: `${matchedHits} acertos`,
      hits: matchedHits,
      winners: 0,
      amount: FIXED_PRIZE_BY_HITS[matchedHits],
      source: 'rules',
    }
  }

  if (!prizeTier && matchedHits >= 14) {
    prizeTier = {
      description: `${matchedHits} acertos`,
      hits: matchedHits,
      winners: 0,
      amount: null,
      source: 'unavailable',
    }
  }

  return {
    game,
    valid: game.numbers.length === 15,
    matchedNumbers,
    missedNumbers,
    prizeTier,
  }
}

export default function App() {
  const [games, setGames] = useState<SavedGame[]>(() => loadGames())
  const [selectedGameId, setSelectedGameId] = useState<string | null>(() => loadSelectedGameId())
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(() => loadCheckpoint())
  const [result, setResult] = useState<LotofacilResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasFreshContest, setHasFreshContest] = useState(false)
  const [contestInput, setContestInput] = useState('')
  const [selectedContest, setSelectedContest] = useState<number | null>(null)
  const checkpointRef = useRef<Checkpoint | null>(checkpoint)

  useEffect(() => {
    window.localStorage.setItem(GAMES_STORAGE_KEY, JSON.stringify(games))
  }, [games])

  useEffect(() => {
    checkpointRef.current = checkpoint
  }, [checkpoint])

  useEffect(() => {
    if (games.length === 0) {
      return
    }

    const currentSelectionExists = games.some((game) => game.id === selectedGameId)

    if (!currentSelectionExists) {
      setSelectedGameId(games[0].id)
    }
  }, [games, selectedGameId])

  useEffect(() => {
    if (!selectedGameId) {
      return
    }

    window.localStorage.setItem(SELECTED_GAME_STORAGE_KEY, selectedGameId)
  }, [selectedGameId])

  useEffect(() => {
    let active = true

    const fetchResult = async () => {
      try {
        setLoading(true)

        const endpoint =
          selectedContest === null
            ? '/api/lotofacil/latest'
            : `/api/lotofacil/${selectedContest}`

        const response = await fetch(endpoint)

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { message?: string }
            | null

          throw new Error(
            payload?.message ?? 'Nao foi possivel carregar o concurso solicitado.',
          )
        }

        const data = (await response.json()) as LotofacilResult

        if (!active) {
          return
        }

        setResult(data)
        setError(null)

        if (selectedContest === null) {
          const nextCheckpoint = {
            contestNumber: data.contestNumber,
            checkedAt: new Date().toISOString(),
          }

          setHasFreshContest(
            checkpointRef.current !== null &&
              checkpointRef.current.contestNumber !== data.contestNumber,
          )
          setCheckpoint(nextCheckpoint)
          window.localStorage.setItem(CHECK_STORAGE_KEY, JSON.stringify(nextCheckpoint))
        } else {
          setHasFreshContest(false)
        }
      } catch (fetchError) {
        if (!active) {
          return
        }

        setResult(null)
        setHasFreshContest(false)
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : 'Nao foi possivel consultar a API da Caixa.',
        )
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void fetchResult()

    if (selectedContest !== null) {
      return () => {
        active = false
      }
    }

    const refreshTimer = window.setInterval(() => {
      void fetchResult()
    }, 30 * 60 * 1000)

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void fetchResult()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      active = false
      window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [selectedContest])

  const activeGame = useMemo(() => {
    return games.find((game) => game.id === selectedGameId) ?? games[0]
  }, [games, selectedGameId])

  const gameSummaries = useMemo(() => {
    return games.map((game) => buildGameSummary(game, result))
  }, [games, result])

  const activeSummary = useMemo(() => {
    if (!activeGame) {
      return null
    }

    return gameSummaries.find((summary) => summary.game.id === activeGame.id) ?? null
  }, [activeGame, gameSummaries])

  const handleContestSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextContest = Number.parseInt(contestInput.trim(), 10)

    if (!Number.isInteger(nextContest) || nextContest <= 0) {
      setError('Digite um numero de concurso valido para consultar o historico.')
      return
    }

    setSelectedContest(nextContest)
  }

  const handleLatestContest = () => {
    setContestInput('')
    setSelectedContest(null)
  }

  const handlePreviousContest = () => {
    if (!result || result.contestNumber <= 1) {
      return
    }

    const previousContest = result.contestNumber - 1
    setContestInput(String(previousContest))
    setSelectedContest(previousContest)
  }

  const handleNextContest = () => {
    if (!result) {
      return
    }

    const nextContest = result.contestNumber + 1
    setContestInput(String(nextContest))
    setSelectedContest(nextContest)
  }

  const handleAddGame = () => {
    const nextGame = createGame(games.length + 1)

    setGames((currentGames) => [...currentGames, nextGame])
    setSelectedGameId(nextGame.id)
  }

  const handleRemoveGame = (gameId: string) => {
    if (games.length === 1) {
      return
    }

    setGames((currentGames) => currentGames.filter((game) => game.id !== gameId))

    if (selectedGameId === gameId) {
      const fallbackGame = games.find((game) => game.id !== gameId)
      setSelectedGameId(fallbackGame?.id ?? null)
    }
  }

  const handleRenameGame = (gameId: string, nextName: string) => {
    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === gameId
          ? {
              ...game,
              name: nextName,
            }
          : game,
      ),
    )
  }

  const toggleNumber = (value: number) => {
    if (!activeGame) {
      return
    }

    setGames((currentGames) =>
      currentGames.map((game) => {
        if (game.id !== activeGame.id) {
          return game
        }

        if (game.numbers.includes(value)) {
          return {
            ...game,
            numbers: game.numbers.filter((item) => item !== value),
          }
        }

        if (game.numbers.length >= 15) {
          return game
        }

        return {
          ...game,
          numbers: [...game.numbers, value].sort((left, right) => left - right),
        }
      }),
    )
  }

  const clearActiveGame = () => {
    if (!activeGame) {
      return
    }

    setGames((currentGames) =>
      currentGames.map((game) =>
        game.id === activeGame.id
          ? {
              ...game,
              numbers: [],
            }
          : game,
      ),
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Conferidor diario Lotofacil</p>
          <h1>Agora com varios jogos e busca por concursos antigos.</h1>
          <p className="hero-text">
            Salve quantos jogos quiser, escolha o jogo ativo para editar e confira
            todos eles no concurso mais recente ou em qualquer concurso anterior da
            Lotofacil.
          </p>
        </div>

        <div className="hero-status">
          <span
            className={`status-pill ${
              selectedContest === null
                ? hasFreshContest
                  ? 'live'
                  : 'quiet'
                : 'history'
            }`}
          >
            {selectedContest === null
              ? hasFreshContest
                ? 'Novo concurso encontrado'
                : 'Acompanhamento em dia'
              : `Historico do concurso ${selectedContest}`}
          </span>
          <p>
            {checkpoint
              ? `Ultima conferencia automatica em ${formatDateTime(checkpoint.checkedAt)}`
              : 'Primeira conferencia aguardando resultado.'}
          </p>
          <p>
            {result
              ? `Concurso ${result.contestNumber} apurado em ${formatDate(result.drawDate)}`
              : 'Buscando o concurso selecionado...'}
          </p>
        </div>
      </section>

      <section className="content-grid">
        <article className="panel">
          <div className="panel-head">
            <div>
              <p className="panel-label">Seus jogos</p>
              <h2>Monte uma carteira de apostas</h2>
            </div>
            <button
              className="ghost-button desktop-only-action"
              type="button"
              onClick={handleAddGame}
            >
              Adicionar jogo
            </button>
          </div>

          <div className="mobile-games-toolbar mobile-only">
            <div>
              <strong>{games.length}</strong>
              <span>{games.length === 1 ? ' jogo salvo' : ' jogos salvos'}</span>
            </div>
            <button className="primary-button" type="button" onClick={handleAddGame}>
              Novo jogo
            </button>
          </div>

          <div className="games-list">
            {games.map((game) => {
              const summary = gameSummaries.find((item) => item.game.id === game.id)

              return (
                <button
                  key={game.id}
                  type="button"
                  className={`game-card ${game.id === activeGame?.id ? 'active' : ''}`}
                  onClick={() => setSelectedGameId(game.id)}
                >
                  <div className="game-card-header">
                    <strong>{game.name.trim() || 'Jogo sem nome'}</strong>
                    <span>{game.numbers.length}/15</span>
                  </div>
                  <p>
                    {summary?.valid
                      ? `${summary.matchedNumbers.length} acertos no concurso atual`
                      : 'Complete 15 numeros para conferir'}
                  </p>
                </button>
              )
            })}

            <button
              type="button"
              className="game-card add-game-card mobile-only-card"
              onClick={handleAddGame}
            >
              <div className="game-card-header">
                <strong>Novo jogo</strong>
                <span>+</span>
              </div>
              <p>Crie outra aposta sem subir ate o topo da pagina.</p>
            </button>
          </div>

          {activeGame ? (
            <div className="editor-card">
              <div className="editor-head">
                <div>
                  <p className="panel-label">Jogo ativo</p>
                  <input
                    className="text-input"
                    type="text"
                    maxLength={40}
                    value={activeGame.name}
                    onChange={(event) =>
                      handleRenameGame(activeGame.id, event.target.value)
                    }
                    placeholder="Nome do jogo"
                  />
                </div>
                <div className="editor-actions">
                  <button className="ghost-button" type="button" onClick={clearActiveGame}>
                    Limpar
                  </button>
                  <button
                    className="ghost-button danger-button"
                    type="button"
                    onClick={() => handleRemoveGame(activeGame.id)}
                    disabled={games.length === 1}
                  >
                    Excluir
                  </button>
                </div>
              </div>

              <div className="game-summary compact">
                <div>
                  <strong>{activeGame.numbers.length}</strong>
                  <span> numeros marcados</span>
                </div>
                <div
                  className={
                    activeGame.numbers.length === 15 ? 'summary-ok' : 'summary-warn'
                  }
                >
                  {activeGame.numbers.length === 15
                    ? 'Jogo pronto para conferir'
                    : 'Faltam numeros para fechar a aposta'}
                </div>
              </div>

              <div className="number-grid">
                {LOTTERY_NUMBERS.map((value) => {
                  const selected = activeGame.numbers.includes(value)

                  return (
                    <button
                      key={value}
                      type="button"
                      className={`number-ball ${selected ? 'selected' : ''}`}
                      onClick={() => toggleNumber(value)}
                      aria-pressed={selected}
                    >
                      {formatNumber(value)}
                    </button>
                  )
                })}
              </div>

              <div className="saved-game">
                <p className="panel-label">Numeros salvos</p>
                <div className="chips">
                  {activeGame.numbers.length > 0 ? (
                    activeGame.numbers.map((value) => (
                      <span key={value} className="chip">
                        {formatNumber(value)}
                      </span>
                    ))
                  ) : (
                    <span className="empty-copy">
                      Marque seus numeros para deixar este jogo salvo.
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel result-panel">
          <div className="panel-head">
            <div>
              <p className="panel-label">Concursos</p>
              <h2>Confira o ultimo sorteio ou volte no historico</h2>
            </div>
          </div>

          <div className="contest-toolbar">
            <button className="ghost-button" type="button" onClick={handleLatestContest}>
              Ultimo concurso
            </button>

            <form className="contest-form" onSubmit={handleContestSubmit}>
              <input
                className="text-input"
                type="number"
                min="1"
                inputMode="numeric"
                value={contestInput}
                onChange={(event) => setContestInput(event.target.value)}
                placeholder="Numero do concurso"
              />
              <button className="primary-button" type="submit">
                Buscar concurso
              </button>
            </form>
          </div>

          <div className="contest-nav">
            <button className="ghost-button" type="button" onClick={handlePreviousContest}>
              Concurso anterior
            </button>
            <button className="ghost-button" type="button" onClick={handleNextContest}>
              Proximo concurso
            </button>
          </div>

          {loading && !result ? <p className="empty-copy">Buscando dados da Caixa...</p> : null}
          {error ? <p className="error-box">{error}</p> : null}

          {result ? (
            <>
              <div className="result-meta">
                <div>
                  <span>Concurso</span>
                  <strong>{result.contestNumber}</strong>
                </div>
                <div>
                  <span>Data</span>
                  <strong>{formatDate(result.drawDate)}</strong>
                </div>
                <div>
                  <span>Proximo</span>
                  <strong>{formatDate(result.nextContestDate)}</strong>
                </div>
              </div>

              <div className="result-numbers">
                {result.drawnNumbers.map((value) => {
                  const matched = activeSummary?.matchedNumbers.includes(value) ?? false

                  return (
                    <span
                      key={value}
                      className={`result-ball ${matched ? 'matched' : ''}`}
                    >
                      {formatNumber(value)}
                    </span>
                  )
                })}
              </div>

              {activeSummary ? (
                <>
                  <div className="result-highlight">
                    <div>
                      <p className="panel-label">{activeSummary.game.name || 'Jogo ativo'}</p>
                      <h3>
                        {activeSummary.valid
                          ? `${activeSummary.matchedNumbers.length} acertos`
                          : 'Complete 15 numeros'}
                      </h3>
                      <p>
                        {activeSummary.valid
                          ? describeHitCount(activeSummary.matchedNumbers.length)
                          : 'A conferencia fica precisa assim que o jogo ativo tiver 15 dezenas.'}
                      </p>
                    </div>

                    <div className="prize-card">
                      <span>Premiacao do jogo ativo</span>
                      <strong>
                        {getPrizeHeadline(activeSummary.prizeTier, activeSummary.valid)}
                      </strong>
                      <small>{getPrizeDetails(activeSummary.prizeTier, activeSummary.valid)}</small>
                    </div>
                  </div>

                  <div className="comparison-grid">
                    <div>
                      <p className="panel-label">Acertos do jogo ativo</p>
                      <div className="chips">
                        {activeSummary.matchedNumbers.length > 0 ? (
                          activeSummary.matchedNumbers.map((value) => (
                            <span key={value} className="chip chip-hit">
                              {formatNumber(value)}
                            </span>
                          ))
                        ) : (
                          <span className="empty-copy">Nenhum numero batido ainda.</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="panel-label">Numeros que faltaram</p>
                      <div className="chips">
                        {activeSummary.missedNumbers.length > 0 ? (
                          activeSummary.missedNumbers.map((value) => (
                            <span key={value} className="chip chip-miss">
                              {formatNumber(value)}
                            </span>
                          ))
                        ) : (
                          <span className="empty-copy">
                            Quando sair tudo aqui, voce acertou os 15.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : null}

              <div className="saved-game">
                <p className="panel-label">Resumo de todos os jogos neste concurso</p>
                <div className="summary-cards">
                  {gameSummaries.map((summary) => (
                    <article
                      key={summary.game.id}
                      className={`summary-card ${
                        summary.game.id === activeGame?.id ? 'active' : ''
                      }`}
                    >
                      <div className="summary-card-header">
                        <strong>{summary.game.name.trim() || 'Jogo sem nome'}</strong>
                        <span>{summary.game.numbers.length}/15</span>
                      </div>
                      <h4>
                        {summary.valid
                          ? `${summary.matchedNumbers.length} acertos`
                          : 'Jogo incompleto'}
                      </h4>
                      <p>{getSummaryPrizeText(summary)}</p>
                      <div className="chips mini">
                        {summary.game.numbers.length > 0 ? (
                          summary.game.numbers.map((value) => (
                            <span
                              key={value}
                              className={`chip ${
                                summary.matchedNumbers.includes(value)
                                  ? 'chip-hit'
                                  : 'chip-miss'
                              }`}
                            >
                              {formatNumber(value)}
                            </span>
                          ))
                        ) : (
                          <span className="empty-copy">Sem numeros neste jogo.</span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="stats-strip">
                <div>
                  <span>Local</span>
                  <strong>{result.drawLocation}</strong>
                  <small>{result.drawCity}</small>
                </div>
                <div>
                  <span>Acumulou</span>
                  <strong>{result.accumulated ? 'Sim' : 'Nao'}</strong>
                  <small>Estimativa {formatCurrency(result.estimatedNextPrize)}</small>
                </div>
                <div>
                  <span>Arrecadacao</span>
                  <strong>{formatCurrency(result.totalCollected)}</strong>
                  <small>Atualizado em {formatDateTime(result.checkedAt)}</small>
                </div>
              </div>
            </>
          ) : null}
        </article>
      </section>
    </main>
  )
}
