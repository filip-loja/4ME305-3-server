import { AppSocket, AppStorage, Game, User } from './types'
import AppController from './AppController'
import GameController from './GameController'

const fs = require('fs').promises
const path = require('path')
const requestListener = function (req: any, res: any) {
	const indexPath = path.resolve('./public/index.html')
	fs.readFile(indexPath)
		.then((contents: any) => {
			res.setHeader('Content-Type', 'text/html')
			res.writeHead(200)
			res.end(contents)
		})
}

const httpServer = require('http').createServer(requestListener)
httpServer.listen(3000, () => {
	console.log(`Server is listening on 3000\n`)
})

const appStorage: AppStorage = {
	users: new Map<string, User>(),
	games: new Map<string, GameController>(),
}

const io = require('socket.io')(httpServer, {
	cors: { origin: '*' }
})

io.use((socket: AppSocket, next: any) => {
	const username = socket.handshake.auth.username
	const type = socket.handshake.auth.type
	if (!username) {
		console.log('No username provided')
		return next(new Error('invalid username'))
	}
	socket.username = username
	socket.type = type === 'logger' ? 'logger' : 'player'
	next()
})

io.on('connection', (socket: AppSocket) => {
	new AppController(socket, io, appStorage)
})


