import {CardStateItem} from './types'

// @ts-ignore
import ObservableSlim from 'observable-slim'

type PlayerIdentifier = string | number
interface Change {
	type: string;
	property: string;
	previousValue: any;
	newValue: any;
	proxy: any;
	target: any;
	currentPath: string;
	jsonPath: string;
}

export default class PlayerState {
	list: CardStateItem[]
	playerMap: Record<string, number>
	ids: string[]
	roundFinished: Set<string>
	gameFinished: Set<string>
	activeInRound: string[]
	activeInGame: string[]
	lastDeletedId: string

	constructor () {
		this.roundFinished = new Set<string>()
		this.gameFinished = new Set<string>()
		this.activeInRound = []
		this.activeInGame = []

		this.playerMap = ObservableSlim.create({}, false, () => {
			this.ids = Object.keys(this.playerMap).filter(id => this.playerMap[id] !== undefined)
		})

		this.list = ObservableSlim.create([], false, (changes: Change[]) => {
			const change = changes[0]

			if (change.type === 'add') {
				this.playerMap[change.newValue.id] = Number(change.property)
				this.activeInRound = this.ids.filter(id => !this.roundFinished.has(id))
				this.activeInGame = this.ids.filter(id => !this.gameFinished.has(id))
			}

			if (change.type === 'delete') {
				this.playerMap[this.lastDeletedId] = undefined
				this.lastDeletedId = null
				for (let i = 0; i < change.target.length; i++) {
					if (change.target[i]) {
						this.playerMap[change.target[i].id] = i
					}
				}
				this.roundFinished.delete(change.previousValue.id)
				this.gameFinished.delete(change.previousValue.id)
				this.activeInRound = this.ids.filter(id => !this.roundFinished.has(id))
				this.activeInGame = this.ids.filter(id => !this.gameFinished.has(id))
			}

			if (change.type === 'update' && change.property === 'cards') {
				if (change.newValue.length === 0) {
					this.roundFinished.add(change.target.id)
				} else {
					this.roundFinished.delete(change.target.id)
				}
				this.activeInRound = this.ids.filter(id => !this.roundFinished.has(id))
			}

			if (change.type === 'update' && change.property === 'startCardCount') {
				if (change.newValue === 0) {
					this.gameFinished.add(change.target.id)
				} else {
					this.gameFinished.delete(change.target.id)
				}
				this.activeInGame = this.ids.filter(id => !this.gameFinished.has(id))
			}
		})
	}

	get looser (): CardStateItem {
		return this.get(this.activeInRound[0])
	}

	add (newPlayer: CardStateItem): void {
		this.list.push(newPlayer)
	}

	remove (identifier: PlayerIdentifier): boolean {
		const index = this._getPlayerIndex(identifier)
		if (index === undefined) return false
		this.lastDeletedId = this.list[index].id
		this.list.splice(index, 1)
	}

	get (identifier: PlayerIdentifier): CardStateItem {
		const index = this._getPlayerIndex(identifier)
		if (index === undefined) return null
		return this.list[index]
	}

	isInactive (id: string): boolean {
		return this.roundFinished.has(id) || this.gameFinished.has(id)
	}

	destroy () {
		ObservableSlim.remove(this.list)
		ObservableSlim.remove(this.playerMap)
	}

	_getPlayerIndex (identifier: PlayerIdentifier): number {
		if (typeof identifier === 'number') {
			if (identifier >= 0 && identifier < this.list.length) {
				return identifier
			}
			return undefined
		}
		return this.playerMap[identifier]
	}
}
