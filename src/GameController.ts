
import cards from './cards'
import {
	CardColor, CardEffect,
	CardMap,
	CardState,
	CardStateItem,
	CardType,
	CommittedTurn,
	GameInitialState,
	TurnDiff,
	User
} from './types'
import arrayShuffle from 'array-shuffle'

export default class GameController {

	cardMap: CardMap = cards
	playerOrder: string[] = null
	playerCardState: CardState = {}
	cardStack: string[] = []
	cardDeck: string[] = []
	currentPlayer: number = 0
	currentColor: CardColor = null
	currentType: CardType = null
	currentEffects: CardEffect[] = []

	constructor (players: User[]) {
		this.playerOrder = arrayShuffle(players.map(player => player.id))
		this.cardStack = arrayShuffle(Object.keys(this.cardMap))

		this.initPlayerCardState()
		this.assignCards()
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

	get roundFinished (): boolean {
		const finishedCount = Object.values(this.playerCardState).filter(state => state.finished).length
		return finishedCount === Object.values(this.playerCardState).length - 1
	}

	get looser (): CardStateItem {
		return Object.values(this.playerCardState).find(state => !state.finished)
	}

	initPlayerCardState () {
		for (const playerId of this.playerOrder) {
			this.playerCardState[playerId] = {
				startCardCount: 5,
				finished: false,
				cards: []
			}
		}
	}

	assignCards () {
		for (const playerId of this.playerOrder) {
			this.playerCardState[playerId].cards = this.cardStack.splice(0, this.playerCardState[playerId].startCardCount)
		}
		this.cardDeck.push(this.cardStack.splice(0, 1)[0])
		this.currentColor = this.cardMap[this.cardDeck[0]].color
		this.currentType = this.cardMap[this.cardDeck[0]].type
	}

	getInitialState (): GameInitialState {
		const resp: GameInitialState = {
			stack: this.cardStack,
			deck: this.cardDeck,
			color: this.currentColor,
			type: this.currentType,
			currentPlayer: this.currentPlayerId,
			cardAssignment: {} as any,
			playerOrder: this.playerOrder,
			effects: []	// TODO pridat zaciatocne efekty
		}
		for (const playerId in this.playerCardState) {
			resp.cardAssignment[playerId] = this.playerCardState[playerId].cards
		}
		return resp
	}

	shiftPlayer () {
		this.currentPlayer++
		if (this.currentPlayer === this.playerOrder.length) {
			this.currentPlayer = 0
		}
		if (this.playerCardState[this.playerOrder[this.currentPlayer]].finished) {
			// TODO hrozi nekonecne zacyklenie, osetrit!
			// uz by nemalo nastat funkcia sa nezavola ked bude len jeden neskonceny hrac
			this.shiftPlayer()
		}
	}

	reshuffleCards(): string[] {
		let cards = this.cardDeck.slice()
		const upperCard = cards.pop()
		this.cardDeck = [ upperCard ]
		cards = arrayShuffle(cards)
		this.cardStack.push(...cards)
		return cards
	}

	commitTurn (payload: CommittedTurn) {
		// TODO check turn validity

		this.cardStack = this.cardStack.filter(id => !payload.cardsTaken.includes(id))
		this.cardDeck.push(...payload.cardsGiven)

		this.currentPlayerCardState.cards = this.currentPlayerCardState.cards.filter(id => !payload.cardsGiven.includes(id))
		this.currentPlayerCardState.cards.push(...payload.cardsTaken)
		if (this.currentPlayerCardState.cards.length === 0) {
			this.currentPlayerCardState.finished = true
		}
		console.log(this.currentPlayerCardState, this.roundFinished)

		if (this.roundFinished) {
			// TODO zabezpecit aby to nekleslo pod nulu
			this.looser.startCardCount -= 1
			return null
		}

		this.currentEffects = payload.newEffects
		if (payload.newColor) {
			this.currentColor = payload.newColor
		}

		let shuffledCards: string[] = []
		if (this.cardStack.length < this.minStackCount) {
			while (this.cardDeck.length + 1 < this.minStackCount && this.currentEffects.length) {
				this.currentEffects.pop()
			}
			shuffledCards = this.reshuffleCards()
		}

		const lastPlayerId = this.currentPlayerId
		this.shiftPlayer()
		const currentPlayerId = this.currentPlayerId

		const diff: TurnDiff = {
			stackRemoved: payload.cardsTaken,
			deckAdded: payload.cardsGiven,
			effects: payload.newEffects,
			color: this.currentColor,
			currentPlayer: currentPlayerId,
			lastPlayer: lastPlayerId,
			reshuffle: shuffledCards
		}

		return diff
	}
}
