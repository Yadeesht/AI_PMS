# Skyline AI Hotel Ops

Frontend (Vercel), FastAPI backend (Railway), Supabase database.

## Local Development

### Backend

1. Create a `.env` file in `backend/` with:

```
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_KEY=YOUR_SUPABASE_KEY
AZURE_AI_ENDPOINT=YOUR_AZURE_ENDPOINT
AZURE_AI_CREDENTIAL=YOUR_AZURE_KEY
CORS_ORIGINS=http://localhost:5173
```

2. Install and run:

```
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend

1. Create `frontend/.env` with:

```
VITE_API_URL=http://localhost:8000
```

2. Install and run:

```
cd frontend
npm install
npm run dev
```

## Deployment

### Backend on Railway

- Add environment variables:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
  - `AZURE_AI_ENDPOINT`
  - `AZURE_AI_CREDENTIAL`
  - `CORS_ORIGINS=https://your-vercel-app.vercel.app`
- Railway start command is defined in `backend/Procfile`:

```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Frontend on Vercel

- Add environment variable:
  - `VITE_API_URL=https://your-railway-app.up.railway.app`

## API Reference

- Health: `GET /health`
- Dashboard: `GET /dashboard`
- Chat: `POST /chat`
- Documents upload: `POST /documents/upload`

## Data Loader (Supabase)

```
cd backend
python load_supabase.py
```
