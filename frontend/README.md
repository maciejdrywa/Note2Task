# Note2Task — frontend

Aplikacja desktopowa (Tauri v2 + React + TypeScript), która wysyła notatkę do backendu i wyświetla wyciągnięte zadania (czynność + godzina).

## Uruchamianie

```
npm install
npm run tauri dev   # aplikacja desktopowa
npm run dev         # sam frontend w przeglądarce (http://localhost:1420)
npm run build       # sprawdzenie TS + build
```

## Konfiguracja (`.env`, wzór w `.env.example`)

- `VITE_API_URL` — adres backendu (domyślnie `http://127.0.0.1:8000`)
- `VITE_USE_MOCK=true` — zamiast backendu używa mocka z danych w `../Data`

Kontrakt API (typy, klient, mock) jest w `src/api/`.
