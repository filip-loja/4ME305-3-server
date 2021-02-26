
const httpServer = require('http').createServer()
const io = require('socket.io')(httpServer, {
	cors: {
		origin: '*',
	}
})

const log = console.log

const PLAYER_LIMIT = 4
const userMap = new Map()
const gameMap = new Map()
let socketGlobal = null

io.use((socket, next) => {
	const username = socket.handshake.auth.username
	if (!username) {
		console.log('ERROR')
		return next(new Error('invalid username'))
	}
	socket.username = username
	next()
})

function logActiveUsers () {
	console.log('')
	userMap.forEach(client => {
		console.log(`${client.id}   ${client.username}`)
	})
	console.log('')
}

function createGame () {
	const gameId = String(Date.now())
	const client = userMap.get(socketGlobal.id)
	client.activeGame = gameId
	userMap.set(client.id, client)
	const game = {
		id: gameId,
		createdBy: client.id,
		players: [ client ]
	}
	gameMap.set(gameId, game)
	socketGlobal.join(gameId)
	socketGlobal.emit('game-create-resp', gameId)
	io.to(gameId).emit('game-player-added', { id: client.id, name: client.username })
	log(`New game created by ${client.username}:  ${gameId}`)
}

function joinGame (gameId) {
	const RESP = 'game-join-resp'
	const client = userMap.get(socketGlobal.id)
	const game = gameMap.get(gameId)
	if (!game) {
		const resp = { success: false, message: 'game_not_found' }
		return socketGlobal.emit(RESP, resp)
	}
	if (game.players.find(player => player.id === client.id)) {
		const resp = { success: false, message: 'game_already_in' }
		return socketGlobal.emit(RESP, resp)
	}
	if (game.players.length >= PLAYER_LIMIT) {
		const resp = { success: false, message: 'game_session_full' }
		return socketGlobal.emit(RESP, resp)
	}
	game.players.push(client)
	client.activeGame = gameId
	userMap.set(client.id, client)
	const players = game.players.map(player => ({ id: player.id, name: player.username }))
	const resp = { success: true, players }
	socketGlobal.emit(RESP, resp)
	socketGlobal.to(gameId).emit('game-player-added', { id: client.id, name: client.username })
}


io.on('connection', (socket) => {
	socketGlobal = socket

	const currentClient = {
		id: socket.id,
		username: socket.username,
		activeGame: null
	}

	userMap.set(currentClient.id, currentClient)
	log(`Established connection with ${socket.username} (${socket.id})`)
	socket.emit('connection-established', socket.id)

	socket.on('client-rename', newUsername => {
		const user = userMap.get(socket.id)
		user.username = newUsername
		socket.emit('client-rename-resp', true)
	})

	socket.on('game-create', createGame)
	socket.on('game-join', joinGame)


	// This will be emitted to all clients except for the newly connected one
	// `io.emit("user connected", ...)` would emit to every client
	socket.broadcast.emit('user connected', {
		userID: socket.id,
		username: socket.username,
	})


	socket.on('private message', ({ content, to }) => {
		console.log(content, to)
		socket.to(to).emit('private message', {
			content,
			from: socket.id,
		})
	})

	// socket.on('game-create', () => {
	// 	const gameId = String(Date.now())
	// 	const game = {
	// 		id: gameId,
	// 		players: [
	// 			currentClient
	// 		]
	// 	}
	// 	gameMap.set(gameId, game)
	// 	socket.join(gameId)
	// 	socket.emit('game-created', gameId)
	// })

	// socket.on('game-join', (gameId) => {
	// 	const game = gameMap.get(gameId)
	// 	if (!game) {
	// 		return socket.emit('game-join-error', 'game_not_found')
	// 	}
	// 	if (game.players.length >= PLAYER_LIMIT) {
	// 		return socket.emit('game-join-error', 'game_session_full')
	// 	}
	//
	// 	game.players.push(currentClient)
	// 	socket.emit('game-joined', gameId)
	// })

	socket.on('disconnect', (reason) => {
		console.log(`Connection with ${socket.username} [${socket.id}] was terminated!`)
		console.log(reason)
		// client namespace disconnect
		// transport close
		userMap.delete(socket.id)
		logActiveUsers()
	})

})

httpServer.listen(3000, () => {
	console.log(`Server is listening on 3000\n`)
})

