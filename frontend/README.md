# Note2Task Frontend

Desktop interface built with **Tauri 2, React and TypeScript**. It sends Polish notes
to the FastAPI backend, displays recognized tasks and reports their Google Calendar
save status. Notes, task checkboxes and interface settings are stored locally.

See the [project README](../README.md) for complete setup, including Docker and Google
authorization. The [backend README](../backend/README.md) describes the HTTP contract.

## Requirements

- Node.js and npm compatible with the project's Vite version; Node.js 24 works.
- Rust and Cargo for the native desktop application.
- On Windows: stable MSVC toolchain, Visual Studio C++ tools, Windows SDK and WebView2.
- A running backend and authorized Google account for real scheduling.

Use **Developer PowerShell for Visual Studio** on Windows to make the Microsoft
linker and SDK available. Consult the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)
for other platforms. Browser preview and mock mode do not require Rust.

## Setup

Run the commands in this README from the **`frontend` directory**, unless stated otherwise.

Copy the template only if a local `.env` does not already exist:

```powershell
Copy-Item .env.example .env
npm ci
```

The frontend `.env` is separate from the root backend configuration:

```dotenv
VITE_API_URL=http://127.0.0.1:8000
VITE_USE_MOCK=false
VITE_EXTRACT_TIMEOUT_S=240
```

| Setting | Meaning |
| --- | --- |
| `VITE_API_URL` | Backend address reachable from the host application. |
| `VITE_USE_MOCK` | `false` calls the backend; `true` uses local sample data. |
| `VITE_EXTRACT_TIMEOUT_S` | Maximum wait for analysis and scheduling, in seconds; default 240. |

Restart the development process after changing `.env`. If the backend port changes,
update `VITE_API_URL`. Vite variables are included in the frontend build; Google
credentials and tokens belong in the root `secrets` directory, not in frontend settings.

## Run the desktop app

First start the backend and model from the **repository root** in another terminal:

```powershell
docker compose up --build -d
Invoke-RestMethod http://localhost:8000/health
```

Wait for `status: ok`. Google must also be authorized before scheduling; the setup
command, run from the repository root on the host, is:

```powershell
.\venv\Scripts\python.exe -m backend.tools.authorize_google
```

Then, from **`frontend`**, run:

```powershell
npm run tauri dev
```

The first run compiles Rust dependencies and may take several minutes. Wait for the
`Finished ...` / `Running ...` messages and the desktop window. Tauri starts Vite
automatically; do not also run `npm run dev` on port 1420.

There is no in-app Google sign-in screen in this prototype. The backend uses the
demo account token created by the host authorization tool.

## Browser preview and mock mode

To open the interface in a browser instead of the desktop shell:

```powershell
npm run dev
```

Visit [http://localhost:1420](http://localhost:1420). This is a development preview,
not the native desktop application.

For frontend development without a backend, set `VITE_USE_MOCK=true` and restart.
The mock uses sample notes and reference data from the repository's `Data` directory
and does not write to Google Calendar. Switch back to `false` for real integration.

## Backend integration

The real API request is:

```http
POST /schedule
Content-Type: application/json

{"text": "Jutro o 10 sklep, a od 19 do 20 kolacja."}
```

The response is a scheduling report with `calendar_id`, `status` and `results`, not
a plain event array. Each result contains an event and a status: `created`, `failed`,
`unknown` or `not_attempted`. HTTP 207 is handled as a report of incomplete or uncertain
work; the UI retains the recognized tasks and shows the calendar save summary.

- `created` confirms a Google write; IDs and links are retained in the stored report.
- `failed` means Google rejected the event.
- `unknown` means the event might have been saved, but confirmation was lost.
- `not_attempted` means processing stopped before that event was sent.

Requests are not retried automatically. Resending a note can create duplicate events.
Canceling the UI request only stops waiting; it does not guarantee cancellation of
backend writes. Deleting a local note does not delete its Google Calendar events.

## Code layout

| Directory | Responsibility |
| --- | --- |
| `src/api/` | API types, HTTP client, mapping, health checks and mock data. |
| `src/components/` | Chat, tasks, calendar and settings views. |
| `src/storage/` | Local notes and settings persistence. |
| `src/platform/` | Desktop integration, such as clipboard and global shortcuts. |
| `src-tauri/` | Rust application, Tauri configuration and capabilities. |
| `tests/` | Frontend API contract tests. |

## Tests and builds

```powershell
npm run test:api       # API contract and error handling tests
npm run build          # TypeScript checks and production web assets
npm run tauri build    # Native desktop build and packaging
```

The web build is not a desktop installer. Native build output is under
`src-tauri/target/release`; installer bundles are generated in its `bundle` directory.
For a web production-build preview, use `npm run preview` and open the URL it prints.

## Troubleshooting

- **Cargo missing:** install Rust/Cargo, reopen the terminal and check `cargo --version`.
- **`link: extra operand`:** check `where.exe link.exe`; use Microsoft's linker through
  Developer PowerShell rather than an MSYS2 executable with the same name.
- **Missing `kernel32.lib`:** install Windows SDK and reopen Developer PowerShell.
- **Application-control error 4551:** check Windows Code Integrity events or ask the
  device administrator about the generated executable being blocked.
- **Backend/CORS error:** verify `/health`, `VITE_API_URL` and the default local origin.
- **Google authorization error:** run the host authorization tool again if required.
- **No Google events:** ensure mock mode is off and inspect the scheduling report.
- **Port 1420 busy:** stop another Vite/Tauri process before starting this one.

Close the application and use **Ctrl+C** in its terminal to stop development mode.
