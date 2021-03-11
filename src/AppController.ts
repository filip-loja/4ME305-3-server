import {AppSocket, AppStorage, CommittedTurn, Game, RoundInitialState, User} from './types'
import { Server } from 'socket.io'
import GameController from './GameController'

const LOGGER_CHANNEL = 'logger_channel'
const generateGameId = (): string => (String(Date.now()))

export default class AppController {
	socket: AppSocket = null
	io: Server = null
	playerLimit = 4
	userMap: Map<string, User> = null
	gameMap: Map<string, Game> = null

	constructor (socket: AppSocket, io: Server, storage: AppStorage) {
		this.socket = socket
		this.io = io
		// TODO prerobit
		this.userMap = storage.users
		this.gameMap = storage.games
		this.init()

		this.socket.on('disconnect', this.disconnectClient.bind(this))
		this.socket.on('client-rename', this.renameClient.bind(this))
		this.socket.on('game-create', this.createGame.bind(this))
		this.socket.on('game-join', this.joinGame.bind(this))
		this.socket.on('game-leave', this.leaveGame.bind(this))
		this.socket.on('game-start', this.startGame.bind(this))
		this.socket.on('game-turn-commit', this.commitTurn.bind(this))
	}

	get user (): User {
		return this.userMap.get(this.socket.id)
	}

	get userSignature (): { id: string, name: string } {
		return { id: this.user.id, name: this.user.name }
	}

	get userSignatureStr (): string {
		return this.user ? `${this.user.name} (${this.user.id})` : ''
	}

	init (): void {
		const name = this.socket.type === 'logger' ? `[LOGGER] ${this.socket.username}` : this.socket.username
		const currentClient: User = {
			id: this.socket.id,
			name: name,
			type: this.socket.type,
			activeGame: null,
			// socket: this.socket
		}
		if (currentClient.type === 'logger') {
			this.socket.join(LOGGER_CHANNEL)
		}
		this.userMap.set(currentClient.id, currentClient)
		this.socket.emit('connection-established', this.socket.id)
		this.log(`Established connection with ${name} (${this.socket.id})`)
	}

	log (...messages: any): void {
		const payload = {
			message: messages.join(' '),
			clients: [...this.userMap.values()],
			games: [...this.gameMap.values()]
		}
		this._groupBroadcast(LOGGER_CHANNEL, 'log', payload)
		// console.log(...messages)
	}

	renameClient (newUsername: string): void {
		this.user.name = newUsername
		this.socket.emit('client-rename-resp', true)
		this.log(`Client name changed to ${newUsername} (${this.user.id})`)
	}

	createGame (requestedId: string = null) {
		const RESP = 'game-create-resp'
		let gameId

		if (requestedId) {
			if ([...this.gameMap.keys()].includes(requestedId)) {
				this.log(`User (${this.user.id}) attempted to create a new game with existing ID (${requestedId})`)
				return this.socket.emit(RESP,{ success: false, message: 'id_already_used' })
			} else {
				gameId = requestedId
			}
		} else {
			gameId = generateGameId()
		}

		this.user.activeGame = gameId
		const game: Game = {
			id: gameId,
			createdBy: this.user.id,
			players: [ this.user ],
			controller: null
		}
		this.gameMap.set(gameId, game)
		this.socket.join(gameId)
		this.socket.emit(RESP,{ success: true, id: gameId })
		this._groupBroadcast(gameId, 'game-player-added', this.userSignature)
		this.log(`New game created by ${this.user.name}: ${gameId}`)
	}

	joinGame (gameId: string): any {
		const RESP = 'game-join-resp'
		const game = this.gameMap.get(gameId)
		if (!game) {
			const resp = { success: false, message: 'game_not_found' }
			this.log(`Game (${gameId}) not found; ${this.userSignatureStr})`)
			return this.socket.emit(RESP, resp)
		}
		if (gameId === this.user.activeGame) {
			const resp = { success: false, message: 'game_already_in' }
			this.log(`Player already in game (${gameId}); ${this.userSignatureStr})`)
			return this.socket.emit(RESP, resp)
		}
		if (game.players.length >= this.playerLimit) {
			const resp = { success: false, message: 'game_session_full' }
			this.log(`Game session full (${gameId}); ${this.userSignatureStr})`)
			return this.socket.emit(RESP, resp)
		}

		game.players.push(this.user)
		this.user.activeGame = gameId
		const resp = {
			success: true,
			players: game.players.map(player => ({ id: player.id, name: player.name }))
		}
		this.socket.join(gameId)
		this.socket.emit(RESP, resp)
		this.socket.to(gameId).emit('game-player-added', this.userSignature)
		this.log(`Player ${this.userSignatureStr} joined game (${gameId}) `)
	}

	leaveGame (gameId: string): any {
		const RESP = 'game-leave-resp'
		const game = this.gameMap.get(gameId)
		if (!game) {
			const resp = { success: false, message: 'game_not_found' }
			this.log(`Game (${gameId}) not found; ${this.userSignatureStr}`)
			return this.socket.emit(RESP, resp)
		}
		if (game.id !== this.user.activeGame) {
			const resp = { success: false, message: 'game_not_in' }
			this.log(`Player not in game (${gameId}); ${this.userSignatureStr}`)
			return this.socket.emit(RESP, resp)
		}
		const isCreator = this.removeFromGame(this.user, game)
		const resp = { success: true }
		this.socket.emit(RESP, resp)
		if (isCreator) {
			this.removeGame(gameId)
		}
	}

	removeFromGame (client: User, game: Game): boolean {
		const index = game.players.findIndex((player: User) => player.id === client.id)
		game.players.splice(index, 1)
		client.activeGame = null
		this.socket.leave(game.id)
		this.io.to(game.id).emit('game-player-removed', client.id)
		this.log(`${client.name} (${client.id}) was disconnected from game ${game.id}`)
		return game.createdBy === client.id
	}

	disconnectClient (reason: string): void {
		const game = this.user.activeGame && this.gameMap.get(this.user.activeGame)
		let isCreator, gameId
		if (this.user.activeGame && game) {
			gameId = game.id
			isCreator = this.removeFromGame(this.user, game)
		}
		if (this.user.type === 'logger') {
			this.socket.leave(LOGGER_CHANNEL)
		}
		this.userMap.delete(this.user.id)
		this.log(`Connection terminated with ${this.userSignatureStr}: ${reason}`)
		if (isCreator) {
			this.removeGame(gameId)
		}
	}

	_groupBroadcast (groupId: string, event: string, payload: any = null): void {
		this.io.to(groupId).emit(event, payload)
	}

	startGame (gameId: string): void {
		// TODO nejaky check prav a ci tam naozaj je

		const game = this.gameMap.get(gameId)
		game.controller = new GameController(game.players)
		const initialState: RoundInitialState = game.controller.initNewRound()
		this._groupBroadcast(gameId, 'game-round-new', initialState)
		this.log(`Game (${gameId}) started by ${this.userSignatureStr}. Initial state generated and sent to all players.`)
	}

	commitTurn (data: { id: string; payload: CommittedTurn }) {
		// TODO nejaky check prav a ci tam naozaj je
		// aj je krok nevalidny tak success false

		const RESP = 'game-turn-commit-resp'
		const game = this.gameMap.get(data.id)

		const stateChange = game.controller.commitTurn(data.payload)
		const resp = { success: true }
		this.socket.emit(RESP, resp)

		if (stateChange) {
			this.log(game.controller.cardStats)
			return this._groupBroadcast(data.id, 'game-new-turn', stateChange)
		}

		const roundInitialState: RoundInitialState = game.controller.initNewRound()
		if (roundInitialState) {
			this.log(`New round initiated (${game.id})`)
			this.log(game.controller.cardStats)
			return this._groupBroadcast(data.id, 'game-round-new', roundInitialState)
		}

		this._finishGame(game)
	}

	_finishGame (game: Game): void {
		// shows all rooms
		// console.log(this.io.sockets.adapter.rooms)

		const report = game.controller.results
		this._groupBroadcast(game.id, 'game-finish', report)
		this.log(`Game (${game.id}) finished and results sent to all players`)

		this._removePlayers(game)
		this._removeGame(game)
	}

	_removePlayers (game: Game): void {
		const playerIds = game.controller.players.ids
		for (const playerId of playerIds) {
			this.io.sockets.sockets.get(playerId).leave(game.id)
			this.userMap.get(playerId).activeGame = null
		}
		this.log(`All players removed from game (${game.id})`)
	}

	_removeGame (game: Game): void {
		game.controller.removeObservers()
		this.gameMap.delete(game.id)
		this.log(`Game was deleted (${game.id})`)
	}

	resetClients (gameId: string, reason: string): void {
		this.log(`Sending "reset" signal to all clients in ${gameId}`)
		this.io.to(gameId).emit('reset', reason)
	}

	removeGame (gameId: string): void {
		this.gameMap.delete(gameId)
		this.resetClients(gameId, 'game_creator_disconnected')
		this.log(`Game ${gameId} was deleted and all its clients were disconnected`)
	}
}
