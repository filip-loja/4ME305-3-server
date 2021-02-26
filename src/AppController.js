
const log = console.log

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

		this.socket.on('client-rename', this.renameClient.bind(this))
		this.socket.on('game-create', this.createGame.bind(this))
		this.socket.on('game-join', this.joinGame.bind(this))
	}

	init () {
		const currentClient = {
			id: this.socket.id,
			username: this.socket.username,
			activeGame: null
		}
		this.userMap.set(currentClient.id, currentClient)
		this.socket.emit('connection-established', this.socket.id)
		log(`Established connection with ${this.socket.username} (${this.socket.id})`)
	}

	renameClient (newUsername) {
		const user = this.userMap.get(this.socket.id)
		user.username = newUsername
		this.userMap.set(this.socket.id, user)
		this.socket.emit('client-rename-resp', true)
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
		log(`New game created by ${client.username}:  ${gameId}`)
	}

	joinGame (gameId) {
		const RESP = 'game-join-resp'
		const client = this.userMap.get(this.socket.id)
		const game = this.gameMap.get(gameId)
		if (!game) {
			const resp = { success: false, message: 'game_not_found' }
			return this.socket.emit(RESP, resp)
		}
		if (game.players.find(player => player.id === client.id)) {
			const resp = { success: false, message: 'game_already_in' }
			return this.socket.emit(RESP, resp)
		}
		if (game.players.length >= this.playerLimit) {
			const resp = { success: false, message: 'game_session_full' }
			return this.socket.emit(RESP, resp)
		}
		game.players.push(client)
		client.activeGame = gameId
		this.userMap.set(client.id, client)
		const players = game.players.map(player => ({ id: player.id, name: player.username }))
		const resp = { success: true, players }
		this.socket.emit(RESP, resp)
		this.socket.to(gameId).emit('game-player-added', { id: client.id, name: client.username })
	}

}

module.exports = AppController
