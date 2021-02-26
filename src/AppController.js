
class AppController {
	socket = null
	io = null
	playerLimit = 4
	userMap = null
	gameMap = null

	constructor (socket, io, userMap, gameMap) {
		this.socket = socket
		this.io = io
		this.userMap = userMap
		this.gameMap = gameMap
		this.init()

		this.socket.on('disconnect', this.disconnectClient.bind(this))
		this.socket.on('client-rename', this.renameClient.bind(this))
		this.socket.on('game-create', this.createGame.bind(this))
		this.socket.on('game-join', this.joinGame.bind(this))
		this.socket.on('game-leave', this.leaveGame.bind(this))
	}

	init () {
		const currentClient = {
			id: this.socket.id,
			username: this.socket.username,
			activeGame: null
		}
		this.userMap.set(currentClient.id, currentClient)
		this.socket.emit('connection-established', this.socket.id)
		this.log(`Established connection with ${this.socket.username} (${this.socket.id})`)
	}

	log (...messages) {
		const payload = {
			message: messages.join(' '),
			clients: [...this.userMap.values()],
			games: [...this.gameMap.values()]
		}
		this.io.emit('log', payload)
		console.log(...messages)
	}

	resetClients (gameId, reason) {
		this.log(`Sending "reset" signal to all clients in ${gameId}`)
		this.io.to(gameId).emit('reset', reason)
	}

	renameClient (newUsername) {
		const user = this.userMap.get(this.socket.id)
		user.username = newUsername
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
		this.io.to(gameId).emit('game-player-added', { id: client.id, name: client.username })
		this.log(`New game created by ${client.username}:  ${gameId}`)
	}

	joinGame (gameId) {
		const RESP = 'game-join-resp'
		const client = this.userMap.get(this.socket.id)
		const game = this.gameMap.get(gameId)
		if (!game) {
			const resp = { success: false, message: 'game_not_found' }
			this.log(`Game (${gameId}) not found; ${client.username} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		if (gameId === client.activeGame) {
			const resp = { success: false, message: 'game_already_in' }
			this.log(`Player already in game (${gameId}); ${client.username} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		if (game.players.length >= this.playerLimit) {
			const resp = { success: false, message: 'game_session_full' }
			this.log(`Game session full (${gameId}); ${client.username} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		game.players.push(client)
		client.activeGame = gameId
		this.userMap.set(client.id, client)
		const players = game.players.map(player => ({ id: player.id, name: player.username }))
		const resp = { success: true, players }
		this.socket.join(gameId)
		this.socket.emit(RESP, resp)
		this.socket.to(gameId).emit('game-player-added', { id: client.id, name: client.username })
		this.log(`Player ${client.username} (${client.id}) joined game (${gameId}) `)
	}

	leaveGame (gameId) {
		const RESP = 'game-leave-resp'
		const client = this.userMap.get(this.socket.id)
		const game = this.gameMap.get(gameId)
		if (!game) {
			const resp = { success: false, message: 'game_not_found' }
			this.log(`Game (${gameId}) not found; ${client.username} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		if (game.id !== client.activeGame) {
			const resp = { success: false, message: 'game_not_in' }
			this.log(`Player not in game (${gameId}); ${client.username} (${client.id})`)
			return this.socket.emit(RESP, resp)
		}
		const isCreator = this.removeFromGame(client, game)
		const resp = { success: true }
		this.socket.emit(RESP, resp)
		if (isCreator) {
			this.removeGame(gameId)
		}
	}

	removeFromGame (client, game) {
		const index = game.players.findIndex(player => player.id === client.id)
		game.players.splice(index, 1)
		this.gameMap.set(game.id, game)
		client.activeGame = null
		this.userMap.set(client.id, client)
		this.socket.leave(game.id)
		this.io.to(game.id).emit('game-player-removed', client.id)
		this.log(`${client.username} (${client.id}) was disconnected from game ${game.id}`)
		return game.createdBy === client.id
	}

	removeGame (gameId) {
		this.gameMap.delete(gameId)
		this.resetClients(gameId, 'game_creator_disconnected')
		this.log(`Game ${gameId} was deleted and all its clients were disconnected`)
	}

	disconnectClient (reason) {
		const client = this.userMap.get(this.socket.id)
		const game = client.activeGame && this.gameMap.get(client.activeGame)
		const clientName = client.username
		let isCreator
		let gameId
		if (client.activeGame && game) {
			gameId = game.id
			isCreator = this.removeFromGame(client, game)
		}
		this.userMap.delete(client.id)
		this.log(`Connection terminated with ${clientName}: ${reason}`)
		if (isCreator) {
			this.removeGame(gameId)
		}
	}

}

module.exports = AppController
