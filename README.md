# Note2Task

Note2Task is a desktop application that converts unstructured Polish notes into
timed Google Calendar events. Its React interface runs inside Tauri. A FastAPI
backend analyzes notes using the local Ollama model `qwen2.5:3b` and creates events
in the connected Google account.

```text
Desktop app (Tauri + React)
    → Backend (FastAPI, http://127.0.0.1:8000)
        → Local model (Ollama, http://model:11434 inside Docker)
        → Google Calendar API
```

Docker Compose runs two services: `backend` and `model`. The desktop frontend runs
on the host. AI inference stays local; initial downloads and Google Calendar access
require an internet connection.

## Project structure

```text
Note2Task/
├── README.md
├── docker-compose.yml
├── requirements.txt
├── .env.example                 # Backend and Compose configuration
├── backend/
│   ├── Dockerfile
│   ├── main.py
│   ├── controllers/              # HTTP endpoints
│   ├── services/                 # Analysis, dates and scheduling
│   ├── clients/                  # Ollama and Google Calendar clients
│   ├── models/                   # Request and response schemas
│   ├── core/                     # Settings, dependencies and authorization
│   ├── prompts/
│   ├── tools/                    # Authorization and evaluation
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── .env.example
│   ├── src/                      # React interface and API integration
│   ├── src-tauri/                # Native desktop application
│   └── tests/
├── Data/                         # Sample notes and reference annotations
└── secrets/                      # Local OAuth files; ignored by Git
```

## Prerequisites

The instructions below use **Windows PowerShell**. Start in the repository root
unless a different directory is specified.

- **Docker Desktop** with Linux containers and the WSL 2 backend on Windows.
- **NVIDIA GPU and a compatible driver** for the default `gpus: all` Compose setup.
  To run on CPU, remove `gpus: all` from the `model` service. Inference will generally
  be slower. No native Ollama installation is required.
- **Node.js and npm**: use a supported LTS version compatible with Vite. The current
  dependency accepts Node.js 20.19+ in the 20.x line, or 22.12+; Node.js 24 works.
- **Rust and Cargo**, using the stable MSVC toolchain on Windows.
- **Visual Studio C++ tools**, **Windows SDK** and **Microsoft Edge WebView2 Runtime**
  for the Windows desktop build.
- **Python 3.12+** on the host for Google authorization, the CLI and backend tests.
  The backend container installs its own Python dependencies.
- A Google account with Google Calendar and a Google Cloud OAuth client.

In Visual Studio Installer, select **Desktop development with C++** and include a
Windows SDK, such as Windows 11 SDK. Open a new terminal after installing build tools.
Use **Developer PowerShell for Visual Studio** for desktop build commands so the
Microsoft linker and SDK paths are available.

See the official [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for platform-specific installation instructions. On Linux/macOS, replace the Windows
virtual-environment paths below with `venv/bin/python` and install the matching Tauri
dependencies. The default Compose GPU configuration targets NVIDIA hardware.

## First-time setup

### 1. Prepare environment files

Copy these templates from the repository root **only if the destination files do
not already exist**:

```powershell
Copy-Item .env.example .env
Copy-Item frontend/.env.example frontend/.env
```

The root `.env` configures the backend and Compose:

```dotenv
OLLAMA_HOST=http://model:11434
NOTE2TASK_MODEL=qwen2.5:3b
OLLAMA_TIMEOUT=180
DEFAULT_TIMEZONE=Europe/Warsaw
DEFAULT_DURATION_MINUTES=60
NOTE2TASK_API_PORT=8000

GOOGLE_CALENDAR_ID=primary
GOOGLE_OAUTH_CLIENT_FILE=secrets/google_client.json
GOOGLE_TOKEN_FILE=secrets/google_token.json
GOOGLE_CALENDAR_TIMEOUT=15
```

The frontend has a separate `frontend/.env`:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
VITE_USE_MOCK=false
VITE_EXTRACT_TIMEOUT_S=240
```

`model` is a Compose service name reachable from the backend container. The host
frontend calls `127.0.0.1:8000` instead. If you change `NOTE2TASK_API_PORT`, update
`VITE_API_URL` to match. Restart the frontend after changing its `.env`; reapply backend
configuration with `docker compose up -d`.

### 2. Install host Python dependencies

From the repository root:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

Skip virtual-environment creation if you already have a working `venv`. Using its
Python directly avoids the need to activate it in PowerShell.

### 3. Connect Google Calendar

The prototype uses **one demo account**. There is no sign-in screen in the frontend;
authorize the account once on the host before using calendar scheduling.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable **Google Calendar API** under **APIs & Services → Library**.
3. Configure **Google Auth Platform**. For a personal Gmail account, select an
   **External** audience and add the demo email under **Test users** while the app is in Testing.
4. Configure the scope `https://www.googleapis.com/auth/calendar.events.owned`.
5. Under **Google Auth Platform → Clients**, create an OAuth client of type **Desktop app**.
6. Download the client JSON file. Create a `secrets` directory in the repository root
   if necessary, and save the file as `secrets/google_client.json`.

Run the authorization tool **on the host, outside Docker**, from the repository root:

```powershell
.\venv\Scripts\python.exe -m backend.tools.authorize_google
```

Complete sign-in and consent in the system browser. The tool creates
`secrets/google_token.json`. Compose mounts `secrets` into the backend, which refreshes
access tokens automatically. Credentials, tokens and local `.env` files stay outside
Git and Docker images.

`GOOGLE_CALENDAR_ID=primary` selects the signed-in account's main calendar. You may
instead use the ID of another calendar owned by that account. Reauthorize if access
is revoked or the refresh token expires. For an external Google application in Testing,
Calendar refresh tokens normally expire after seven days.

Provider references: [Google Calendar Python quickstart](https://developers.google.com/workspace/calendar/api/quickstart/python)
and [OAuth token lifecycle](https://developers.google.com/identity/protocols/oauth2).

### 4. Start the backend and local model

From the repository root:

```powershell
docker compose up --build -d
```

The `model` service starts Ollama and downloads `NOTE2TASK_MODEL` only if it is missing.
Models are stored in the named `ollama_data` volume and reused after container
recreation. The first startup can take several minutes.

Check readiness:

```powershell
docker compose ps
docker compose logs --tail 30 model
Invoke-RestMethod http://localhost:8000/health
```

Expected health response:

```json
{"status": "ok", "model": "qwen2.5:3b"}
```

`depends_on` controls startup order but does not wait for the download. Wait for
`/health` to return `ok` before sending notes. This endpoint checks Ollama and the
selected model; it does not verify Google authorization.

### 5. Launch the desktop frontend

In another **Developer PowerShell for Visual Studio** terminal, starting from the
repository root:

```powershell
cd frontend
npm ci
npm run tauri dev
```

`npm ci` installs dependencies from the committed lockfile. The first desktop run
downloads Rust dependencies and compiles the native application. Wait for Cargo's
`Finished ...` and `Running ...` messages and for the application window to open.
Vite's `Local: http://localhost:1420/` message alone does not mean the native build
is finished.

Keep the terminal open. Tauri starts Vite automatically, so do not also run
`npm run dev` in another terminal on port 1420.

### 6. Try a note

Enter a Polish note in the app, for example:

```text
Jutro o 10 mam test integracji kalendarza przez 15 minut.
```

Analyze it. With `VITE_USE_MOCK=false`, the app calls `/schedule`, displays the tasks
and reports how many events were saved. Check the connected Google Calendar for an
event tomorrow at 10:00–10:15.

Each submission is a new operation and can create duplicate events if repeated.
After a partial or unknown result, inspect the report and calendar before resending.
Canceling a frontend request does not guarantee that backend writes stopped. Deleting
a local note does not delete events already saved in Google Calendar.

## Starting the project again

With dependencies installed, environment files present and a valid Google token,
you do not need to repeat authorization or download an existing model.

**Terminal 1 — repository root:**

```powershell
docker compose up -d
```

**Terminal 2 — Developer PowerShell, frontend directory:**

```powershell
npm run tauri dev
```

Use `docker compose up --build -d` after changing backend code or Python dependencies.
Run `npm ci` again when the frontend lockfile changes.

## Browser preview and mock mode

To run only the web interface, execute this from `frontend`:

```powershell
npm run dev
```

Open [http://localhost:1420](http://localhost:1420). This is a development preview;
`npm run tauri dev` opens the actual desktop application.

To develop the UI without Docker, a GPU or Google authorization, set this in
`frontend/.env` and restart the frontend:

```dotenv
VITE_USE_MOCK=true
```

Mock mode uses local sample data and does not create Google events. Switch back to
`false` to use the real backend.

## HTTP API and CLI

| Endpoint | Behavior |
| --- | --- |
| `GET /health` | Check Ollama and the presence of the selected model. |
| `POST /extract` | Analyze a note and return events without writing to Google. |
| `POST /schedule` | Analyze a note and save events in the connected Google Calendar. |

Both POST endpoints accept `Content-Type: application/json` and this body:

```json
{"text": "Jutro o 10 idę do sklepu, a od 19 do 20 mam kolację z dziewczyną."}
```

In Postman, choose **POST**, `http://localhost:8000/schedule`, and **Body → raw → JSON**.
A successful scheduling response has HTTP 200, `status: completed`, and a `results`
array. Created entries include `google_event_id` and `html_link`.

HTTP 207 reports an incomplete or uncertain write. Inspect the per-event statuses
`created`, `failed`, `unknown` and `not_attempted`. Processing stops at the first write
error and does not roll back already created events. HTTP 503 with
`code: google_auth_required` means Google authorization must be checked or renewed.

The CLI offers both operations from the repository root:

```powershell
# Preview only; no Google writes
.\venv\Scripts\python.exe -m backend.cli --text "Jutro o 10 sklep"

# Analyze and save to Google Calendar
.\venv\Scripts\python.exe -m backend.cli --schedule --text "Jutro o 10 sklep"
```

Responses are JSON; the app does not generate event output files. OAuth files hold
authorization state separately. If a note omits a start time, the default is 12:00;
an unspecified duration defaults to 60 minutes.

## Tests and builds

Backend tests, from the repository root:

```powershell
.\venv\Scripts\python.exe -m pytest -c backend/pytest.ini -q
```

These tests use local test doubles and do not create real Google Calendar events.
Tests marked `integration` are excluded by default.

Frontend API tests and production web build, from `frontend`:

```powershell
npm run test:api
npm run build
```

To compile and package the desktop application on the host platform:

```powershell
npm run tauri build
```

The web build alone is not a desktop installer. Desktop packaging also needs the
platform-specific dependencies described in the Tauri prerequisites.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `cargo metadata ... program not found` | Install Rust/Cargo, open a new terminal and check `cargo --version`. |
| `link: extra operand` during a Rust build | Another `link.exe`, such as MSYS2, may precede MSVC in `PATH`. Use Developer PowerShell and check `where.exe link.exe`. |
| `LNK1181` for `kernel32.lib` | Install Windows SDK through Visual Studio Installer, then reopen Developer PowerShell. |
| `os error 4551` / application control blocked a build script | Windows policy blocked a generated executable. Review Windows Security / Code Integrity events or contact the device administrator. |
| Frontend connection or CORS error | Verify `/health`, the backend port and `VITE_API_URL`. The backend permits the default local Vite/Tauri origins. |
| `google_auth_required` | Check the files in `secrets`, rerun authorization on the host and verify access to the selected calendar. |
| No events appear in Google | Check `VITE_USE_MOCK=false`, the connected account/calendar and the scheduling report. |
| Model not ready | Wait for the first download and inspect the model logs. |
| Port 1420 already in use | Stop the other Vite/Tauri development process before starting the frontend. |

Backend and model logs:

```powershell
docker compose logs --tail 100 backend model
```

## Stopping the project

Close the app and stop its development command with **Ctrl+C** if needed. From the
repository root, stop the containers:

```powershell
docker compose down
```

The model volume, host OAuth files and locally stored frontend notes remain.
`docker compose down -v` also removes the model volume, requiring the model to be
downloaded again on the next startup.
