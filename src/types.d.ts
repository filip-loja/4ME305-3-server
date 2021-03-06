import { Socket } from 'socket.io'
import GameController from './GameController'

export type UserType = 'logger' | 'player'
export type CardColor = 'red' | 'green' | 'ball' | 'acorn'
export type CardType = 'seven' | 'eight' | 'nine' | 'ten' | 'jack' | 'miner' | 'king' | 'ace'
export type CardEffect = 'seven' | 'ace'

export interface AppSocket extends Socket {
	username: string;
	type: UserType
}

export interface AppStorage {
	users: Map<string, User>,
	games: Map<string, GameController>
}

export interface User {
	id: string;
	name: string;
	type: UserType;
	activeGame: string;
	address: string;
}

export interface Game {
	id: string;
	createdBy: string;
	players: User[];
	controller: GameController;
}

export interface Card {
	color: CardColor;
	type: CardType;
}

export interface CardMap {
	[key: string]: Card;
}

export interface CardStateItem {
	id: string;
	name?: string;
	address: string;
	startCardCount: number;
	cards: string[];
	finished?: boolean;
}

export interface CardState {
	[key: string]: CardStateItem
}

export interface RoundInitialState {
	stack: string[];
	deck: string[];
	color: CardColor;
	type: CardType;
	currentPlayer: string;
	playerOrder: string[];
	effects: CardEffect[];
	roundNumber: number;
	cardAssignment: {
		[key: string]: string[]
	}
}

export interface CommittedTurn {
	cardsTaken: string[];
	cardsGiven: string[];
	newColor: CardColor;
	newEffects: CardEffect[];
}

export interface TurnDiff {
	stackRemoved: string[];
	deckAdded: string[];
	color: CardColor;
	effects: CardEffect[];
	currentPlayer: string;
	lastPlayer: string;
	reshuffle: string[];
}

export interface GameReport {
	time: number;
	rounds: number;
	players: {
		[key: string]: GameReportScore;
	}
}

export interface GameReportScore {
	id: string;
	name: string;
	score: number;
}

export interface RemovePlayerDiff {
	id: string;
	currentPlayer?: string;
	stackAdded?: string[]
}

export interface NewGamePayload {
	id: string;
	geo: Geo;
}

export interface Geo {
	lat: number;
	lon: number;
}
