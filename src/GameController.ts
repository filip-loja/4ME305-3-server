
import arrayShuffle from 'array-shuffle'
import cards, { fakeOrder } from './cards'
import {
	CardColor, CardEffect,
	CardMap,
	CardStateItem,
	CardType,
	CommittedTurn, GameReport, RemovePlayerDiff,
	RoundInitialState,
	TurnDiff,
	User
} from './types'
import PlayerState from './PlayerState'

export default class GameController {

	id: string;
	createdBy: string
	started: boolean

	players: PlayerState

	cardMap: CardMap = cards
	cardStack: string[] = []
	cardDeck: string[] = []
	currentColor: CardColor = null
	currentType: CardType = null
	currentEffects: CardEffect[] = []

	currentRoundNumber = -1
	gameScoreOrder: string[][] = []
	currentPlayerIndex: number = 0
	initialPlayerOrder: string[]

	timeStart: number
	timeEnd: number

	constructor (id: string, createdBy: string) {
		this.id = id
		this.players = new PlayerState()
		this.createdBy = createdBy
		this.started = false
	}

	get currentPlayerOrder (): string[] {
		if (this.currentRoundNumber -1 < 0) {
			return this.initialPlayerOrder
		} else {
			return this.gameScoreOrder[this.currentRoundNumber - 1]
		}
	}

	get currentPlayerId (): string {
		return this.currentPlayerOrder[this.currentPlayerIndex]
	}

	get currentPlayer (): CardStateItem {
		return this.players.get(this.currentPlayerId)
	}

	get gameShouldFinish (): boolean {
		return this.players.activeInGame.length <= 1
	}

	get roundShouldFinish (): boolean {
		return this.players.activeInRound.length <= 1
	}

	get pendingEffect (): CardEffect {
		if (this.currentEffects.length) {
			return this.currentEffects[0]
		}
		return null
	}

	get minStackCount (): number {
		if (this.pendingEffect === 'seven') {
			return 3 * this.currentEffects.length + 1
		}
		return 3
	}

	get cardStats (): string {
		const stack = this.cardStack.length
		const deck = this.cardDeck.length
		const players = 32 - stack - deck
		const effects = '[' + this.currentEffects.join(',') + ']'
		const orderLog = '<br>' + this.gameScoreOrder.map(o => o.map(id => this.players.get(id).name).join(' - ')).join('<br>')
		return `${this.currentRoundNumber + 1} | Stack: ${stack} | Deck: ${deck} | Players: ${players} | Effects: ${effects}${orderLog}`
	}

	get results (): GameReport {
		const report = {
			time: this.timeEnd - this.timeStart,
			rounds: this.currentRoundNumber,
			players: {} as any
		}
		for (const player of this.players.list) {
			report.players[player.id] = {
				id: player.id,
				name: player.name,
				score: 0
			}
		}
		for (const roundScore of this.gameScoreOrder) {
			for (let i = 0; i < roundScore.length; i++) {
				report.players[roundScore[i]].score += (roundScore.length - i - 1)
			}
		}
		return report
	}

	start (): void {
		this.started = true
		this.timeStart = Date.now()
		this.initialPlayerOrder = arrayShuffle(this.players.ids)
	}

	addPlayer (player: User): void {
		if (!this.started) {
			this.players.add({
				id: player.id,
				name: player.name,
				startCardCount: 2,
				cards: []
			})
		}
	}

	removePlayer (playerId: string): RemovePlayerDiff {
		const player = this.players.get(playerId)
		if (!player) {
			return null
		}

		const resp = {
			id: playerId
		} as any

		if (this.started) {
			for (const round of this.gameScoreOrder) {
				for (let i = 0; i < round.length; i++) {
					if (round[i] === playerId) {
						round.splice(i, 1)
						break
					}
				}
			}

			this.cardStack.push(...player.cards)
			resp['stackAdded'] = [...player.cards]
		}

		this.players.remove(playerId)
		this.initialPlayerOrder = this.initialPlayerOrder.filter(id => id !== playerId)

		if (this.started) {
			if (this.currentPlayerIndex >= this.players.list.length) {
				this.currentPlayerIndex = 0
			}
			resp['currentPlayer'] = this.currentPlayerOrder[this.currentPlayerIndex]
		}

		return resp
	}

	removePlayersCards (): void {
		for (const player of this.players.list) {
			player.cards = []
		}
	}

	assignCards (): void {
		// this.cardStack = arrayShuffle(Object.keys(this.cardMap))
		this.cardStack = [...fakeOrder]
		this.cardDeck = []
		for (const player of this.players.list) {
			player.cards = this.cardStack.splice(0, player.startCardCount)
		}
		this.cardDeck.push(this.cardStack.splice(0, 1)[0])
		this.currentColor = this.cardMap[this.cardDeck[0]].color
		this.currentType = this.cardMap[this.cardDeck[0]].type
		this.currentEffects = []
	}

	initNewRound (): RoundInitialState {
		if (this.gameShouldFinish) {
			this.timeEnd = Date.now()
			return null
		}

		this.currentRoundNumber++
		this.currentPlayerIndex = 0
		this.gameScoreOrder.push([])
		this.removePlayersCards()
		this.assignCards()

		const state: RoundInitialState = {
			stack: this.cardStack,
			deck: this.cardDeck,
			color: this.currentColor,
			type: this.currentType,
			currentPlayer: this.currentPlayerId,
			playerOrder: this.currentPlayerOrder,
			effects: this.currentEffects,
			roundNumber: (this.currentRoundNumber + 1),
			cardAssignment: {} as any
		}
		for (const player of this.players.list) {
			state.cardAssignment[player.id] = player.cards
		}
		return state
	}

	shiftPlayer (): string {
		this.currentPlayerIndex++
		if (this.currentPlayerIndex === this.currentPlayerOrder.length) {
			this.currentPlayerIndex = 0
		}
		if (this.players.isInactive(this.currentPlayerId)) {
			return this.shiftPlayer()
		}
		return this.currentPlayerId
	}

	reshuffleCards (): string[] {
		let cards = this.cardDeck.slice()
		const upperCard = cards.pop()
		this.cardDeck = [ upperCard ]
		cards = arrayShuffle(cards)
		this.cardStack.push(...cards)
		return cards
	}

	scoreLooser (): void {
		this.gameScoreOrder[this.currentRoundNumber].push(this.players.looser.id)
		this.gameScoreOrder[this.currentRoundNumber].push(...this.players.gameFinished.values())
		this.players.looser.startCardCount = (this.players.looser.startCardCount > 0) ? this.players.looser.startCardCount - 1 : 0
	}

	commitTurn (payload: CommittedTurn): TurnDiff {
		// TODO check turn validity

		this.cardStack = this.cardStack.filter(id => !payload.cardsTaken.includes(id))
		this.cardDeck.push(...payload.cardsGiven)

		const playerCards = this.currentPlayer.cards.filter(id => !payload.cardsGiven.includes(id))
		playerCards.push(...payload.cardsTaken)
		this.currentPlayer.cards = playerCards
		if (this.currentPlayer.cards.length === 0) {
			this.gameScoreOrder[this.currentRoundNumber].push(this.currentPlayerId)
		}

		if (this.roundShouldFinish) {
			this.scoreLooser()
			return null
		}

		this.currentEffects = payload.newEffects
		if (payload.newColor) {
			this.currentColor = payload.newColor
		}

		/** Only N - 1 "Ace" effects can be active; N = number of active players */
		if (this.pendingEffect === 'ace') {
			while (this.currentEffects.length >= this.players.activeInRound.length) {
				this.currentEffects.pop()
			}
		}

		let shuffledCards: string[] = []
		// TODO sposobuje bugy, opravit
		if (this.cardStack.length < this.minStackCount) {
			while ((this.cardStack.length + this.cardDeck.length + 1) < this.minStackCount && this.currentEffects.length) {
				this.currentEffects.pop()
			}
			shuffledCards = this.reshuffleCards()
		}

		const lastPlayerId = this.currentPlayerId
		const currentPlayerId = this.shiftPlayer()

		return {
			stackRemoved: payload.cardsTaken,
			deckAdded: payload.cardsGiven,
			effects: this.currentEffects,
			color: this.currentColor,
			currentPlayer: currentPlayerId,
			lastPlayer: lastPlayerId,
			reshuffle: shuffledCards
		}
	}

	removeObservers (): void {
		this.players.destroy()
	}
}
