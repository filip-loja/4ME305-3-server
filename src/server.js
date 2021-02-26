
const AppController = require('./AppController')
const httpServer = require('http').createServer()
const io = require('socket.io')(httpServer, {
	cors: {
		origin: '*',
	}
})

const userMap = new Map()
const gameMap = new Map()

io.use((socket, next) => {
	const username = socket.handshake.auth.username
	if (!username) {
		console.log('ERROR')
		return next(new Error('invalid username'))
	}
	socket.username = username
	next()
})

io.on('connection', (socket) => {
	new AppController(socket, io, userMap, gameMap)
})

httpServer.listen(3000, () => {
	console.log(`Server is listening on 3000\n`)
})

