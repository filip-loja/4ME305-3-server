import { Socket } from 'socket.io'

export interface AppSocket extends Socket {
	username: string;
	type: 'logger' | 'player'
}
