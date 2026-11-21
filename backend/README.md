# Note2Task Backend

FastAPI backend for converting Polish notes into structured events with local Ollama
and optionally creating those events in Google Calendar.

See the [project README](../README.md) for full desktop setup and the
[frontend README](../frontend/README.md) for Tauri development.

**Run all commands below from the repository root**, not from this directory.

## Responsibilities and structure

```text
Request → Controller → NoteService → ExtractionService → OllamaClient
                                → Date conversion → Calendar events

POST /schedule also adds:
Google authorization → Note analysis → Validation → Google Calendar writes → Report
```

| Directory | Responsibility |
| --- | --- |
| `controllers/` | HTTP endpoints and response status selection. |
| `services/` | Extraction, date conversion, readiness and sequential scheduling. |
| `clients/` | HTTP communication with Ollama and Google Calendar. |
| `models/` | Pydantic request, event and scheduling-report schemas. |
| `core/` | Settings, dependency injection, OAuth tokens and error mapping. |
| `prompts/` | Instructions sent to the local model. |
| `tools/` | Host OAuth authorization and developer evaluation commands. |
| `tests/` | Unit tests and local HTTP integration tests. |

`main.py` assembles the FastAPI application and permits the default local Vite and
Tauri origins through CORS. The backend has no application-user database; the current
Google integration uses one locally authorized demo account.

## Configuration

Copy the root `.env.example` to `.env` only if `.env` does not already exist:

```powershell
Copy-Item .env.example .env
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `OLLAMA_HOST` | `http://model:11434` | Ollama address inside the Compose network. |
| `NOTE2TASK_MODEL` | `qwen2.5:3b` | Model to download and use for extraction. |
| `OLLAMA_TIMEOUT` | `180` | Model request timeout in seconds. |
| `DEFAULT_TIMEZONE` | `Europe/Warsaw` | Time zone for relative dates and event timestamps. |
| `DEFAULT_DURATION_MINUTES` | `60` | Duration when the note does not specify one. |
| `NOTE2TASK_API_PORT` | `8000` | Backend port exposed on the host. |
| `NOTE2TASK_API_URL` | Derived from the port | Optional backend URL override for the host CLI. |
| `GOOGLE_CALENDAR_ID` | `primary` | Target calendar of the demo account. |
| `GOOGLE_OAUTH_CLIENT_FILE` | `secrets/google_client.json` | Downloaded Desktop OAuth client configuration. |
| `GOOGLE_TOKEN_FILE` | `secrets/google_token.json` | Local access and refresh token state. |
| `GOOGLE_CALENDAR_TIMEOUT` | `15` | Google request timeout in seconds. |

Python settings use environment variables before the root `.env`, then defaults.
Relative OAuth paths are resolved from the repository root. Compose passes the root
`.env` through `env_file`; arbitrary host shell variables do not automatically
override those container settings. Change `.env` to configure the backend container.

`NOTE2TASK_API_PORT` and `NOTE2TASK_MODEL` are also interpolated by Compose, so shell
variables of those names can override the Compose template values. Keep the chosen
model and port consistent with the backend and frontend configuration.

## Start with Docker

Requirements: Docker with Linux containers and NVIDIA GPU support for the default
Compose file. On Windows, Docker Desktop should use its WSL 2 backend. For CPU-only
operation, remove `gpus: all` from the `model` service.

```powershell
docker compose up --build -d
docker compose ps
docker compose logs --tail 30 model
Invoke-RestMethod http://localhost:8000/health
```

Compose runs only `backend` and `model`. The Ollama startup command checks whether
`NOTE2TASK_MODEL` exists and downloads it if necessary. The named `ollama_data` volume
persists models. `depends_on` sets startup order, but does not wait for download
completion; wait until `/health` returns `status: ok`.

Only backend port 8000 is exposed to the host by default, bound to `127.0.0.1`.
Ollama is accessible to the backend at `http://model:11434`, not at the backend's
`localhost`. The backend image installs dependencies and runs as a non-root user.

## Google authorization

Google authorization is needed for `/schedule`, not for `/extract` or startup.
Create a Google Cloud project, enable Calendar API, configure the consent screen
and create OAuth credentials of type **Desktop app**. For a personal Gmail account
in Testing mode, choose an external audience and add that account as a test user.
Use the scope `https://www.googleapis.com/auth/calendar.events.owned`.

Download the client configuration to `secrets/google_client.json`, then run these
commands **on the host, outside Docker**:

```powershell
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m backend.tools.authorize_google
```

Skip virtual-environment creation if it already exists. Complete authorization in
the system browser. The tool saves `secrets/google_token.json`; Compose mounts the
directory at `/app/secrets` with write access for token refresh.

Do not commit OAuth files. The directory is excluded from Git and Docker images.
The default relative paths work on the host and in the container. If you customize
them, adjust mounts and paths so the container can access the same files.

`primary` selects the signed-in account's main calendar. Another configured calendar
must be owned by that account for the requested scope. Reauthorize after revoked
consent or an expired refresh token. External OAuth apps in Testing normally receive
Calendar refresh tokens valid for seven days. See the official
[Google setup guide](https://developers.google.com/workspace/calendar/api/quickstart/python)
and [token lifecycle](https://developers.google.com/identity/protocols/oauth2).

## HTTP endpoints

### `GET /health`

Checks Ollama availability and the presence of the configured model:

```json
{"status": "ok", "model": "qwen2.5:3b"}
```

This does not check Google authorization. Interactive Swagger and ReDoc pages are
disabled; the generated API schema remains available at `/openapi.json`.

### `POST /extract`

Returns an event array without writing to Google. Request body:

```json
{"text": "Jutro o 10 sklep, a od 19 do 20 kolacja."}
```

Events contain `summary`, optional `description`, `start` and `end`. Timed event
boundaries use `dateTime` and `timeZone`. An unspecified start time defaults to 12:00;
unspecified duration defaults to 60 minutes. The response is returned directly;
event JSON output files are not created.

### `POST /schedule`

Accepts the same body and checks Google authorization before analysis. All returned
event dates are validated before any Calendar write. Events are then inserted
sequentially, preserving the analysis order. No attendees are added.

Example report shape:

```json
{
  "calendar_id": "primary",
  "status": "completed",
  "results": [
    {
      "event": {
        "summary": "Sklep",
        "start": {"dateTime": "2026-11-23T10:00:00+01:00", "timeZone": "Europe/Warsaw"},
        "end": {"dateTime": "2026-11-23T11:00:00+01:00", "timeZone": "Europe/Warsaw"}
      },
      "status": "created",
      "google_event_id": "example-id",
      "html_link": "https://calendar.google.com/calendar/event?eid=example"
    }
  ]
}
```

The example date is illustrative; actual dates depend on the note and processing day.

| HTTP code | Meaning |
| --- | --- |
| 200 | All events confirmed, or no tasks found (`results: []`). |
| 207 | A Calendar write failed or its outcome is unknown; inspect all results. |
| 422 | Missing, empty or invalid request body. |
| 502 | Invalid model output before scheduling. |
| 503 | Ollama unavailable, or missing/invalid Google authorization. |
| 504 | Model request timed out. |

Google authorization errors include `code: google_auth_required` and a `detail`
instructing the operator to run the host authorization tool.

Per-event report statuses:

- `created`: Google confirmed the event and returned its ID and link.
- `failed`: Google explicitly rejected the request.
- `unknown`: a network failure, timeout, server error or malformed response prevented
  confirmation; the event might already exist.
- `not_attempted`: processing stopped before the event was sent.

The first write failure stops remaining writes. Report `status` is `partial` if any
event was confirmed, or `failed` if none were confirmed. The latter does not guarantee
that Google saved nothing when an entry is `unknown`.

There is no rollback, database or idempotency key. Writes are not automatically
retried. Sending the full note again can create duplicates; inspect the calendar
after an uncertain outcome. Client disconnection does not guarantee cancellation.

## CLI and Postman

```powershell
# Extract only
.\venv\Scripts\python.exe -m backend.cli --text "Jutro o 10 sklep"

# Extract and save to Google
.\venv\Scripts\python.exe -m backend.cli --schedule --text "Jutro o 10 sklep"

# Read a note from a file
.\venv\Scripts\python.exe -m backend.cli --input Data/TXT/test.txt
```

Without input arguments, the CLI accepts one interactive note followed by Enter.
JSON goes to stdout, errors to stderr. Scheduling returns a nonzero exit code when
the report is incomplete. The CLI's HTTP timeout is 200 seconds.

In Postman, select **POST**, `http://localhost:8000/schedule`, and **Body → raw → JSON**.
Use the `text` field shown above. `/extract` can be used for previews without writes.

## Tests and evaluation

```powershell
.\venv\Scripts\python.exe -m pytest -c backend/pytest.ini -q
```

The default suite tests date conversion, extraction, configuration, CORS and scheduling
using local HTTP servers and fake credentials. It does not create Google events.
Tests marked `integration` are excluded by default.

Developer evaluation reads the existing `Data` directory. With Compose running,
mount it read-only into a temporary backend container:

```powershell
docker compose run --rm --no-deps -v "${PWD}/Data:/app/Data:ro" backend python -m backend.tools.evaluate --limit 5
```

This prints metrics and does not save events to Google. It creates a temporary
evaluation container, not an additional persistent Compose service.

## Logs and shutdown

```powershell
docker compose logs --tail 100 backend model
docker compose down
```

`down` preserves the downloaded model and host credentials. `down -v` removes the
model volume and requires another download. After backend code or dependency changes,
rebuild with `docker compose up --build -d`.
