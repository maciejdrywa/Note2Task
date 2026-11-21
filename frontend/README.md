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

## Google Calendar

W trybie `VITE_USE_MOCK=false` frontend wysyła `POST /schedule` z polem `text`.
Backend analizuje notatkę i zapisuje wydarzenia w Google Calendar. Odpowiedź zawiera
raport zapisu; częściowe błędy i niepewne wyniki są pokazywane nad zadaniami.
Autoryzację Google wykonaj wcześniej: `python -m backend.tools.authorize_google`
z głównego katalogu projektu. Ponowne wysłanie notatki może utworzyć duplikaty.
Tryb mock nie zapisuje wydarzeń w Google. Po zmianie `.env` uruchom frontend ponownie.

Test kontraktu API: `npm run test:api`.
