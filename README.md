# NinjaClaw

NinjaClaw is a local-first browser IDE starter with a React frontend and an Express/WebSocket backend.

## What runs now

- JWT-based register/login flow
- Project creation and deletion
- File explorer and file CRUD
- Monaco editor with syntax highlighting
- WebSocket project refresh events
- Terminal and AI chat placeholders in the UI
- File-backed storage that works without PostgreSQL

## Structure

- `frontend`: React + Vite + Monaco browser UI
- `backend`: Express API, JWT auth, WebSocket server, filesystem project storage

## Run locally

1. Install dependencies:

```powershell
cd d:\Projects\NinjaClaw
npm.cmd install
```

2. Start both apps:

```powershell
npm.cmd run dev
```

3. Open:

- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:4000/api/health`

## Default behavior

- Uploaded and edited code files are stored under `backend/data/projects`
- Metadata is stored in JSON files under `backend/data`
- PostgreSQL can be added later by swapping the storage service implementation

