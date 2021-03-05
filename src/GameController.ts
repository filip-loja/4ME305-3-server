
import cards from './cards'
import {CardColor, CardMap, CardState, CardType, CommittedTurn, GameInitialState, TurnDiff, User} from './types'
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
	currentEffects: string[] = []

	constructor (players: User[]) {
		this.playerOrder = arrayShuffle(players.map(player => player.id))
		this.cardStack = arrayShuffle(Object.keys(this.cardMap))

		this.initPlayerCardState()
		this.assignCards()
	}

	get currentPlayerId (): string {
		return this.playerOrder[this.currentPlayer]
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
			cardAssignment: {} as any
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
			this.shiftPlayer()
		}
	}

	commitTurn (payload: CommittedTurn) {
		// TODO check turn validity
		this.currentEffects = payload.newEffects
		this.cardStack = this.cardStack.filter(id => !payload.cardsTaken.includes(id))
		this.cardDeck.unshift(...payload.cardsGiven)
		// TODO pridat karty hracovi
		if (payload.newColor) {
			this.currentColor = payload.newColor
		}
		this.shiftPlayer()
		const diff: TurnDiff = {
			stackAdded: [],
			stackRemoved: payload.cardsTaken,
			deckAdded: payload.cardsGiven,
			deckRemoved: [],
			effects: payload.newEffects,
			color: this.currentColor,
			currentPlayer: this.currentPlayerId
		}
		return diff
	}

	// get cardIds (): number[] {
	// 	return Object.values(this.cardMap)
	// }
}
