
import arrayShuffle from 'array-shuffle'
import cards from './cards'
import {
	CardColor, CardEffect,
	CardMap,
	CardState,
	CardStateItem,
	CardType,
	CommittedTurn,
	RoundInitialState,
	TurnDiff,
	User
} from './types'
import PlayerState from './PlayerState'

export default class GameController {

	players: PlayerState

	cardMap: CardMap = cards
	cardStack: string[] = []
	cardDeck: string[] = []
	currentColor: CardColor = null
	currentType: CardType = null
	currentEffects: CardEffect[] = []

	currentPlayer: number = 0
	playerOrder: string[] = null
	playerCardState: CardState = {}

	roundOrder: string[][] = []
	roundNumber = -1

	constructor (players: User[]) {
		this.players = new PlayerState()
		this.playerOrder = arrayShuffle(players.map(player => player.id))
		this.initPlayerCardState()
	}

	get currentPlayerId (): string {
		return this.playerOrder[this.currentPlayer]
	}

	get currentPlayerCardState (): CardStateItem {
		return this.playerCardState[this.currentPlayerId]
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

	get roundShouldFinish (): boolean {
		const finishedCount = Object.values(this.playerCardState).filter(state => state.finished).length
		return finishedCount === Object.values(this.playerCardState).length - 1
	}

	get playerShouldFinish (): boolean {
		return this.currentPlayerCardState.cards.length === 0
	}

	get gameShouldFinish (): boolean {
		const finishedCount = Object.values(this.playerCardState).reduce((acc, player) => {
			if (player.startCardCount === 0) {
				acc++
			}
			return acc
		}, 0)
		return finishedCount === this.playerOrder.length - 1
	}

	get looser (): CardStateItem {
		return Object.values(this.playerCardState).find(state => !state.finished)
	}

	get cardStats (): string {
		const stack = this.cardStack.length
		const deck = this.cardDeck.length
		const players = Object.values(this.playerCardState).reduce((acc, state) => acc += state.cards.length, 0)
		const effects = '[' + this.currentEffects.join(',') + ']'
		const orderLog = '<br>' + this.roundOrder.map(o => o.join(' - ')).join('<br>')
		return `${this.roundNumber + 1} | Stack: ${stack} | Deck: ${deck} | Players: ${players} | Effects: ${effects}${orderLog}`
	}

	initPlayerCardState (): void {
		for (const playerId of this.playerOrder) {
			const obj = {
				id: playerId,
				startCardCount: 5,
				finished: false,
				cards: [] as any
			}
			this.playerCardState[playerId] = obj
			this.players.add(obj)
		}
	}

	resetPlayerCardState (): void {
		for (const playerId of this.playerOrder) {
			this.playerCardState[playerId].finished = false
			this.playerCardState[playerId].cards = []
		}
	}

	assignCards (): void {
		for (const playerId of this.playerOrder) {
			this.playerCardState[playerId].cards = this.cardStack.splice(0, this.playerCardState[playerId].startCardCount)
		}
		this.cardDeck.push(this.cardStack.splice(0, 1)[0])
		this.currentColor = this.cardMap[this.cardDeck[0]].color
		this.currentType = this.cardMap[this.cardDeck[0]].type
		this.currentEffects = []
	}

	initNewRound (): RoundInitialState {
		if (this.gameShouldFinish) {
			return null
		}

		this.roundNumber++
		this.roundOrder.push([])
		this.cardStack = arrayShuffle(Object.keys(this.cardMap))
		this.cardDeck = []
		this.resetPlayerCardState()
		this.assignCards()

		const state: RoundInitialState = {
			stack: this.cardStack,
			deck: this.cardDeck,
			color: this.currentColor,
			type: this.currentType,
			currentPlayer: this.currentPlayerId,
			cardAssignment: {} as any,
			playerOrder: this.playerOrder,
			effects: this.currentEffects,
			roundNumber: (this.roundNumber + 1)
		}
		for (const playerId in this.playerCardState) {
			state.cardAssignment[playerId] = this.playerCardState[playerId].cards
		}
		return state
	}

	shiftPlayer (): string {
		this.currentPlayer++
		if (this.currentPlayer === this.playerOrder.length) {
			this.currentPlayer = 0
		}
		if (this.playerCardState[this.playerOrder[this.currentPlayer]].finished) {
			// TODO hrozi nekonecne zacyklenie, osetrit!
			// uz by nemalo nastat funkcia sa nezavola ked bude len jeden neskonceny hrac
			return this.shiftPlayer()
		}
		return this.playerOrder[this.currentPlayer]
	}

	reshuffleCards(): string[] {
		let cards = this.cardDeck.slice()
		const upperCard = cards.pop()
		this.cardDeck = [ upperCard ]
		cards = arrayShuffle(cards)
		this.cardStack.push(...cards)
		return cards
	}

	finishWinner (): void {
		this.currentPlayerCardState.finished = true
		this.roundOrder[this.roundNumber].push(this.currentPlayerId)
	}

	finishLooser (): void {
		this.roundOrder[this.roundNumber].push(this.looser.id)
		this.looser.startCardCount = (this.looser.startCardCount > 0) ? this.looser.startCardCount - 1 : 0
		this.looser.finished = true
	}

	commitTurn (payload: CommittedTurn): TurnDiff {
		// TODO check turn validity

		this.cardStack = this.cardStack.filter(id => !payload.cardsTaken.includes(id))
		this.cardDeck.push(...payload.cardsGiven)

		this.currentPlayerCardState.cards = this.currentPlayerCardState.cards.filter(id => !payload.cardsGiven.includes(id))
		this.currentPlayerCardState.cards.push(...payload.cardsTaken)

		if (this.playerShouldFinish) {
			this.finishWinner()
		}

		if (this.roundShouldFinish) {
			this.finishLooser()
			return null
		}

		this.currentEffects = payload.newEffects
		if (payload.newColor) {
			this.currentColor = payload.newColor
		}

		/** Only N - 1 "Ace" effects can be active; N = number of players */
		if (this.pendingEffect === 'ace' && this.currentEffects.length >= this.playerOrder.length) {
			this.currentEffects.pop()
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
}
