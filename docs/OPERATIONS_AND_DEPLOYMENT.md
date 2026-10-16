# Operations & Deployment Guide: Remix Online Multiplayer Card Game

**Version:** 3.0  
**Runtime:** Node.js 18.x or 20.x LTS  
**Primary Build Output:** `dist/` (Client static assets + `dist/server.cjs`)

---

## 1. Prerequisites & Runtime Requirements

* **Node.js**: Version 18.18+ or 20.x LTS.
* **Package Manager**: npm 9+ or Bun 1.1+.
* **Network / Ports**: Inbound TCP port for HTTP/WebSocket traffic (defaults to `PORT=3000`, binds to `0.0.0.0`).
* **Microphone Access**: HTTPS required in production for browser `navigator.mediaDevices.getUserMedia` WebRTC permissions.

---

## 2. Environment Variables & Configuration

The application reads configuration from environment variables (via `dotenv` and Vite's `import.meta.env`).

| Variable | Scope | Required | Default | Description |
|---|---|---|---|---|
| `PORT` | Server | Optional | `3000` | Port for Express HTTP & WebSocket server |
| `NODE_ENV` | Server | Optional | `development` | When set to `production`, server serves static files from `dist/` |
| `GEMINI_API_KEY` | Server | Optional | None | Google Gemini API key for `gemini-3.1-flash-lite` AI strategy optimization |
| `VITE_GOOGLE_CLIENT_ID`| Client | Optional | None | Google Identity Services OAuth 2.0 Client ID for Google Sign-In |
| `VITE_API_URL` | Client | Optional | `""` (origin) | Base URL for REST API calls |
| `VITE_WS_URL` | Client | Optional | `ws(s)://origin` | Full WebSocket URL |
| `DISABLE_HMR` | Client | Optional | `false` | Disables Vite file watching and HMR during agent editing sessions |

### Safe Configuration Example (`.env.example`)
```env
# Google Identity Services Client ID (Web Application)
VITE_GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"

# Google Gemini API Key for Strategy Optimization
GEMINI_API_KEY="your-gemini-api-key"

# Application Hosting URL
APP_URL="http://localhost:3000"
```

> [!CAUTION]
> Never commit real API keys or credentials to version control. Always keep production `.env` files in `.gitignore`.

---

## 3. Build & Packaging Pipeline

### 3.1 Build Command
```bash
npm run build
```

Under the hood, this executes:
```bash
vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs
```

1. **Step 1: Vite Frontend Build (`vite build`)**:
   * Compiles React 19 TypeScript files into optimized static JS, CSS, and HTML in the `dist/` directory.
   * Processes Tailwind CSS v4 styles via `@tailwindcss/vite`.
2. **Step 2: Server Bundle (`esbuild server.ts`)**:
   * Bundles `server.ts` into a CommonJS production file `dist/server.cjs`.
   * Retains external node packages (`--packages=external`).
   * Emits source maps (`--sourcemap`).

### 3.2 Production Run Command
```bash
NODE_ENV=production node dist/server.cjs
```

---

## 4. Hosting & Infrastructure Architecture

### 4.1 Critical Deployment Finding: Vercel Incompatibility
The repository includes a `vercel.json` configuration file:
```json
{
  "buildCommand": "vite build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

> [!WARNING]
> **Static Vercel Hosting Limitation**:  
> `vercel.json` configures static front-end hosting for Vite. However, Remix requires the stateful Node.js backend (`server.ts`) to manage long-lived WebSockets (`ws`), in-memory game state, AI bot turns, and WebRTC signaling.  
> Deploying strictly via static Vercel hosting will cause WebSocket connections and REST endpoints (`/api/*`) to fail.

### 4.2 Recommended Production Hosting Targets

#### Option A: Google Cloud Run (Recommended Container Deployment)
The application includes AI Studio metadata configured for Cloud Run hosting.
1. Build a Docker container using Node 20 LTS:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/server.cjs"]
```
2. Enable WebSockets session affinity in Cloud Run settings.

#### Option B: Render / Railway / Fly.io / VPS
* Configure a persistent Node.js web service.
* Build Command: `npm install && npm run build`
* Start Command: `npm run start`

---

## 5. Operations, Health & Troubleshooting

### 5.1 Health Check Monitoring
* Ping `GET /api/health` to verify server liveness and current timestamp.
* HTTP 200 response indicates the Express server is accepting requests.

### 5.2 Common Operational Issues & Mitigations

| Issue | Root Cause | Solution |
|---|---|---|
| WebSocket connection fails (`1006`) | Client cannot reach backend port or SSL termination blocked WS | Verify `VITE_WS_URL` or ensure reverse proxy supports `Upgrade: websocket` |
| Google Sign-In button doesn't render | Missing or invalid `VITE_GOOGLE_CLIENT_ID` | Verify Client ID and ensure host origin is added to Google Cloud Console Authorized Origins |
| Voice Chat fails to connect | Microphone permissions denied or firewall blocking STUN | Ensure site is on HTTPS; verify firewall allows outbound UDP traffic to `stun.l.google.com:19302` |
| Rooms reset after restart | In-memory ephemeral storage model | Expected behavior in current architecture; room persistence requires future database integration |
