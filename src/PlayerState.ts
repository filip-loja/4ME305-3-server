import {CardStateItem} from './types'

// @ts-ignore
import ObservableSlim from 'observable-slim'

type PlayerIdentifier = string | number

export default class PlayerState {
	list: CardStateItem[]
	playerMap: Map<string, number>
	roundFinished: Set<string>
	gameFinished: Set<string>

	constructor () {
		this.playerMap = new Map<string, number>()
		this.roundFinished = new Set<string>()
		this.gameFinished = new Set<string>()

		this.list = ObservableSlim.create([], false, (changes: any) => {
			console.log(JSON.stringify(changes));
		});
	}

	add (newPlayer: CardStateItem): void {
		this.list.push(newPlayer)
	}

	remove (identifier: PlayerIdentifier): boolean {
		const index = this._getPlayerIndex(identifier)
		if (index === undefined) return false
		this.list.splice(index, 0)
	}

	get (identifier: PlayerIdentifier): CardStateItem {
		const index = this._getPlayerIndex(identifier)
		if (index === undefined) return null
		return this.list[index]
	}

	_getPlayerIndex (identifier: PlayerIdentifier): number {
		if (typeof identifier === 'number') {
			if (identifier >= 0 && identifier < this.list.length) {
				return identifier
			}
			return undefined
		}
		return this.playerMap.get(identifier)
	}
}
