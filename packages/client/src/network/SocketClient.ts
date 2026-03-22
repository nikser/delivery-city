/// <reference types="vite/client" />
import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@delivery-city/shared'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: GameSocket | null = null

export function getSocket(): GameSocket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SERVER_URL || 'http://localhost:3001')
  }
  return socket
}
