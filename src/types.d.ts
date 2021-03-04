import { Socket } from 'socket.io'

export type UserType = 'logger' | 'player'

export interface AppSocket extends Socket {
	username: string;
	type: UserType
}

export interface AppStorage {
	users: Map<string, User>,
	games: Map<string, Game>
}

export interface User {
	id: string;
	name: string;
	type: UserType;
	activeGame: string;
}

export interface Game {
	id: string;
	createdBy: string;
	players: User[];
}
