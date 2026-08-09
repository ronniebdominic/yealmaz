// Ye-Almaz — Socket.IO client.
//
// Was declared as a dependency and emitted-to throughout the backend
// (dispatch.js/delivery.js/cases.js's `io.to(room).emit(...)` calls), and
// a couple of pages already had `s.emit('join_delivery', ...)`-style code
// expecting `api.js` to export a `socket` — but nothing ever actually
// created a client instance, so every one of those was silently a no-op
// (`if (!s) return;` guards caught the undefined and bailed). Real-time
// updates across the app have always been polling-only as a result. This
// is the missing piece — connects once, to the same backend the REST API
// talks to (VITE_API_URL minus its /api suffix — Socket.IO's own path is
// separate from the Express routes, both served by the same HTTP server).
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

export const socket = io(SOCKET_URL, { autoConnect: true });
