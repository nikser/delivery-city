/// <reference types="vite/client" />
import { io, Socket } from 'socket.io-client'
import type { ServerToClientEvents, ClientToServerEvents } from '@delivery-city/shared'

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>

let socket: GameSocket | null = null

export function getSocket(): GameSocket {
  if (!socket) {
    // In dev the client runs on :5173 while the server is on :3001 — use explicit URL.
    // In production both are served from the same origin, so io() auto-connects correctly.
    const url = import.meta.env.VITE_SERVER_URL
      ?? (import.meta.env.DEV ? 'http://localhost:3001' : undefined)
    socket = io(url as string)
  }
  return socket
}
