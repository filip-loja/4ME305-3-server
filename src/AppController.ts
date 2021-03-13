import {AppSocket, AppStorage, CommittedTurn, Game, NewGamePayload, RoundInitialState, User} from './types'
import { Server } from 'socket.io'
import GameController from './GameController'
import geocode from './geocode'

const LOGGER_CHANNEL = 'logger_channel'
const generateGameId = (): string => (String(Date.now()))

export default class AppController {
	socket: AppSocket = null
	io: Server = null
	playerLimit = 4
	userMap: Map<string, User> = null
	gameMap: Map<string, GameController> = null

	constructor (socket: AppSocket, io: Server, storage: AppStorage) {
		this.socket = socket
		this.io = io
		// TODO prerobit
		this.userMap = storage.users
		this.gameMap = storage.games
		this.init()

		this.socket.on('disconnect', this.clientDisconnected.bind(this))
		this.socket.on('client-rename', this.clientRenamed.bind(this))
		this.socket.on('game-create', this.createGame.bind(this))
		this.socket.on('game-join', this.joinGame.bind(this))
		this.socket.on('game-leave', this.leaveGame.bind(this))
		this.socket.on('game-start', this.startGame.bind(this))
		this.socket.on('game-turn-commit', this.commitTurn.bind(this))
	}

	get me (): User {
		return this.userMap.get(this.socket.id)
	}

	get mySignature (): { id: string, name: string } {
		return this.me ? { id: this.me.id, name: this.me.name } : {} as any
	}

	get mySignatureStr (): string {
		return this.me ? `${this.me.name} (${this.me.id})` : ''
	}

	get myGame (): GameController {
		if (!this.me || !this.me.activeGame) {
			return null
		}
		return this.gameMap.get(this.me.activeGame)
	}

	init (): void {
		const name = this.socket.type === 'logger' ? `[LOGGER] ${this.socket.username}` : this.socket.username
		const currentClient: User = {
			id: this.socket.id,
			name: name,
			type: this.socket.type,
			activeGame: null,
			address: null,
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
		const games = [...this.gameMap.values()].map(game => ({
			id: game.id,
			players: game.players.list,
			createdBy: game.createdBy
		}))
		const payload = {
			message: messages.join(' '),
			clients: [...this.userMap.values()],
			games
		}
		this._groupBroadcast(LOGGER_CHANNEL, 'log', payload)
		// console.log(...messages)
	}

	clientRenamed (newUsername: string): void {
		this.me.name = newUsername
		this.socket.emit('client-rename-resp', true)
		this.log(`Client name changed to ${newUsername} (${this.me.id})`)
	}

	clientDisconnected (reason: string): void {
		if (this.myGame) {
			this._removeMeFromGame()
		}
		if (this.me.type === 'logger') {
			this.socket.leave(LOGGER_CHANNEL)
		}
		this.userMap.delete(this.me.id)
		this.log(`Connection terminated with ${this.mySignatureStr}: ${reason}`)
	}

	async createGame (payload: NewGamePayload) {
		const RESP = 'game-create-resp'
		let gameId

		if (payload.id) {
			if ([...this.gameMap.keys()].includes(payload.id)) {
				this.log(`User (${this.me.id}) attempted to create a new game with existing ID (${payload.id})`)
				return this.socket.emit(RESP,{ success: false, message: 'id_already_used' })
			} else {
				gameId = payload.id
			}
		} else {
			gameId = generateGameId()
		}

		this.me.address = await geocode(payload.geo)
		const game = new GameController(gameId, this.me.id)
		game.addPlayer(this.me)
		this.me.activeGame = gameId
		this.gameMap.set(gameId, game)
		this.socket.join(gameId)
		this.socket.emit(RESP,{ success: true, id: gameId })
		this._groupBroadcast(gameId, 'game-player-added', { ...this.mySignature, address: this.me.address })
		this.log(`New game created by ${this.mySignatureStr} => ${gameId}`)
	}

	async joinGame (payload: NewGamePayload) {
		const RESP = 'game-join-resp'
		const game = this.gameMap.get(payload.id)
		if (!game || game.started) {
			const resp = { success: false, message: 'game_not_found' }
			this.log(`Game (${payload.id}) not found; ${this.mySignatureStr})`)
			return this.socket.emit(RESP, resp)
		}
		if (payload.id === this.me.activeGame) {
			const resp = { success: false, message: 'game_already_in' }
			this.log(`Player already in game (${payload.id}); ${this.mySignatureStr})`)
			return this.socket.emit(RESP, resp)
		}
		if (game.players.list.length >= this.playerLimit) {
			const resp = { success: false, message: 'game_session_full' }
			this.log(`Game session full (${payload.id}); ${this.mySignatureStr})`)
			return this.socket.emit(RESP, resp)
		}

		this.me.address = await geocode(payload.geo)
		game.addPlayer(this.me)
		this.me.activeGame = payload.id
		const resp = {
			success: true,
			players: game.players.list.map(player => ({ id: player.id, name: player.name, address: player.address }))
		}
		this.socket.join(payload.id)
		this.socket.emit(RESP, resp)
		this.socket.to(payload.id).emit('game-player-added', { ...this.mySignature, address: this.me.address })
		this.log(`Player ${this.mySignatureStr} joined game (${payload.id}) `)
	}

	leaveGame (gameId: string): any {
		const game = this.gameMap.get(gameId)
		if (!game) {
			this.me.activeGame = null
			this.log(`Player tried to leave non-existent game (${gameId}); ${this.mySignatureStr}`)
			return
		}

		if (gameId === this.me.activeGame) {
			this._removeMeFromGame()
		}
	}

	_removeMeFromGame (): void {
		const isCreator = this.myGame.createdBy === this.me.id
		const tooFewPlayers = this.myGame.players.list.length === 2
		if (isCreator || (this.myGame.started && tooFewPlayers)) {
			this.socket.to(this.myGame.id).emit('game-terminated', isCreator ? 'creator_left' : 'too_few_players')
			this._removeGame(this.myGame)
			return
		}

		const gameId = this.myGame.id
		const diff = this.myGame.removePlayer(this.me.id)
		this.me.activeGame = null
		this.socket.leave(gameId)
		this._groupBroadcast(gameId, 'game-player-removed', diff)
		this.log(`Player left the game ${gameId}; ${this.mySignatureStr}`)
	}

	_groupBroadcast (groupId: string, event: string, payload: any = null): void {
		this.io.to(groupId).emit(event, payload)
	}

	startGame (gameId: string): void {
		if (gameId === this.me.activeGame) {
			this.myGame.start()
			const initialState: RoundInitialState = this.myGame.initNewRound()
			this._groupBroadcast(gameId, 'game-round-new', initialState)
			this.log(`Game (${gameId}) started by ${this.mySignatureStr}. Initial state generated and sent to all players.`)
		} else {
			this.log(`Player attempted to start a game which he is not a part of: ${this.mySignatureStr}; ${gameId} vs ${this.me.activeGame}`)
		}
	}

	commitTurn (data: { id: string; payload: CommittedTurn }) {
		// TODO nejaky check prav a ci tam naozaj je
		// aj je krok nevalidny tak success false

		const RESP = 'game-turn-commit-resp'
		const game = this.gameMap.get(data.id)

		const stateChange = game.commitTurn(data.payload)
		const resp = { success: true }
		this.socket.emit(RESP, resp)

		if (stateChange) {
			this.log(game.cardStats)
			return this._groupBroadcast(data.id, 'game-new-turn', stateChange)
		}

		const roundInitialState: RoundInitialState = game.initNewRound()
		if (roundInitialState) {
			this.log(`New round initiated (${game.id})`)
			this.log(game.cardStats)
			return this._groupBroadcast(data.id, 'game-round-new', roundInitialState)
		}

		this._finishGame(game)
	}

	_finishGame (game: GameController): void {
		this._groupBroadcast(game.id, 'game-finish', game.results)
		this._removeGame(game)
		this.log(`Game (${game.id}) finished and results sent to all players`)
	}

	_removeGame (game: GameController): void {
		this._removePlayers(game)
		game.removeObservers()
		this.gameMap.delete(game.id)
		this.log(`Game was deleted (${game.id})`)
	}

	_removePlayers (game: GameController): void {
		for (const playerId of game.players.ids) {
			const sckt = this.io.sockets.sockets.get(playerId)
			if (sckt) sckt.leave(game.id)
			this.userMap.get(playerId).activeGame = null
		}
		this.log(`All players removed from game (${game.id})`)
	}

	// shows all rooms
	// console.log(this.io.sockets.adapter.rooms)
}
