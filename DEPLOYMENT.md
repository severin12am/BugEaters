# BugEaters Deployment Guide

BugEaters is split into two deployable repositories/folders:
1. **Frontend (Vite + Phaser)** -> Deployed to **Vercel**
2. **Backend (Node.js + Colyseus)** -> Deployed to **Railway**

---

### Step 1: Deploying the Backend (Railway)
1. Push your server (Colyseus folder) code to a GitHub repository.
2. Sign in to [Railway.app](https://railway.app/) and click **New Project**.
3. Select **Deploy from GitHub repo** and choose your backend repository.
4. Railway will automatically detect Node.js and build your Colyseus app.
5. Go to the **Settings** tab of your deployed Railway service:
   - Scroll down to **Domains**.
   - Click **Generate Domain**. It will give you a public URL (e.g., `bugeaters-production.up.railway.app`).
6. **Important:** Your WebSocket URL will be `wss://bugeaters-production.up.railway.app` (note the `wss://` instead of `https://`). Copy this.

---

### Step 2: Deploying the Frontend (Vercel)
1. Push your frontend (Vite/Phaser folder) code to a GitHub repository.
2. Sign in to [Vercel.com](https://vercel.com/) and click **Add New... -> Project**.
3. Import your frontend repository.
4. Vercel will automatically detect **Vite** as the Framework Preset.
5. Expand the **Environment Variables** section before deploying:
   - Add a new variable named `VITE_SERVER_URL`.
   - Set its value to the WebSocket URL you copied from Railway (e.g., `wss://bugeaters-production.up.railway.app`).
6. Click **Deploy**.
7. Once deployed, Vercel will give you a live HTTPS link where users can access the game. 
   *(Because Vite builds the PWA manifest/service workers statically, it natively acts as a PWA on mobile browsers from Vercel).*