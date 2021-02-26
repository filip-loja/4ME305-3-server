
const fs = require('fs').promises
const requestListener = function (req, res) {
	fs.readFile(`${__dirname}/index.html`)
		.then(contents => {
			res.setHeader('Content-Type', 'text/html')
			res.writeHead(200)
			res.end(contents)
		})
}

const AppController = require('./AppController')
const httpServer = require('http').createServer(requestListener)
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

