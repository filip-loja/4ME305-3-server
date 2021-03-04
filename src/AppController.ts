import { AppSocket, AppStorage, Game, User } from './types'
import { Server } from 'socket.io'

const LOGGER_CHANNEL = 'logger_channel'

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
	}

	init () {
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

	log (...messages: any) {
		const payload = {
			message: messages.join(' '),
			clients: [...this.userMap.values()],
			games: [...this.gameMap.values()]
		}
		this.io.to(LOGGER_CHANNEL).emit('log', payload)
		// console.log(...messages)
	}

	resetClients (gameId: string, reason: string) {
		this.log(`Sending "reset" signal to all clients in ${gameId}`)
		this.io.to(gameId).emit('reset', reason)
	}

	renameClient (newUsername: string) {
		const user = this.userMap.get(this.socket.id)
		user.name = newUsername
		this.userMap.set(this.socket.id, user)
		this.socket.emit('client-rename-resp', true)
		this.log(`Client name changed to ${newUsername} (${user.id})`)
	}

	createGame () {
		const gameId = String(Date.now())
		const client = this.userMap.get(this.socket.id)
		client.activeGame = gameId
		this.userMap.set(client.id, client)
		const game = {
			id: gameId,
			createdBy: client.id,
			players: [ client ]
		}
		this.gameMap.set(gameId, game)
		this.socket.join(gameId)
		this.socket.emit('game-create-resp', gameId)
		this.io.to(gameId).emit('game-player-added', { id: client.id, name: client.name })
		this.log(`New game created by ${client.name}:  ${gameId}`)
	}

	joinGame (gameId: string) {
		const RESP = 'game-join-resp'
		const client = this.userMap.get(this.socket.id)
		const game = this.gameMap.get(gameId)
		if (!game) {
			const resp = { success: false, message: 'game_not_found' }
			this.log(`Game (${gameId}) not found; ${client.name} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		if (gameId === client.activeGame) {
			const resp = { success: false, message: 'game_already_in' }
			this.log(`Player already in game (${gameId}); ${client.name} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		if (game.players.length >= this.playerLimit) {
			const resp = { success: false, message: 'game_session_full' }
			this.log(`Game session full (${gameId}); ${client.name} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		game.players.push(client)
		client.activeGame = gameId
		this.userMap.set(client.id, client)
		const players = game.players.map(player => ({ id: player.id, name: player.name }))
		const resp = { success: true, players }
		this.socket.join(gameId)
		this.socket.emit(RESP, resp)
		this.socket.to(gameId).emit('game-player-added', { id: client.id, name: client.name })
		this.log(`Player ${client.name} (${client.id}) joined game (${gameId}) `)
	}

	leaveGame (gameId: string) {
		const RESP = 'game-leave-resp'
		const client = this.userMap.get(this.socket.id)
		const game = this.gameMap.get(gameId)
		if (!game) {
			const resp = { success: false, message: 'game_not_found' }
			this.log(`Game (${gameId}) not found; ${client.name} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		if (game.id !== client.activeGame) {
			const resp = { success: false, message: 'game_not_in' }
			this.log(`Player not in game (${gameId}); ${client.name} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		const isCreator = this.removeFromGame(client, game)
		const resp = { success: true }
		this.socket.emit(RESP, resp)
		if (isCreator) {
			this.removeGame(gameId)
		}
	}

	removeFromGame (client: User, game: Game) {
		const index = game.players.findIndex((player: User) => player.id === client.id)
		game.players.splice(index, 1)
		this.gameMap.set(game.id, game)
		client.activeGame = null
		this.userMap.set(client.id, client)
		this.socket.leave(game.id)
		this.io.to(game.id).emit('game-player-removed', client.id)
		this.log(`${client.name} (${client.id}) was disconnected from game ${game.id}`)
		return game.createdBy === client.id
	}

	removeGame (gameId: string) {
		this.gameMap.delete(gameId)
		this.resetClients(gameId, 'game_creator_disconnected')
		this.log(`Game ${gameId} was deleted and all its clients were disconnected`)
	}

	disconnectClient (reason: string) {
		const client = this.userMap.get(this.socket.id)
		const game = client.activeGame && this.gameMap.get(client.activeGame)
		const clientName = client.name
		let isCreator
		let gameId
		if (client.activeGame && game) {
			gameId = game.id
			isCreator = this.removeFromGame(client, game)
		}
		if (client.type === 'logger') {
			this.socket.leave(LOGGER_CHANNEL)
		}
		this.userMap.delete(client.id)
		this.log(`Connection terminated with ${clientName}: ${reason}`)
		if (isCreator) {
			this.removeGame(gameId)
		}
	}

}
