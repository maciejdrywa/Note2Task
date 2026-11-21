"""Jednorazowa autoryzacja desktopowa na hoście, poza kontenerem."""

import sys

from google_auth_oauthlib.flow import InstalledAppFlow

from backend.core.config import get_settings
from backend.core.google_auth import GOOGLE_SCOPES, save_credentials


def main() -> int:
    try:
        settings = get_settings()
        flow = InstalledAppFlow.from_client_secrets_file(
            str(settings.google_oauth_client_file), scopes=GOOGLE_SCOPES,
            autogenerate_code_verifier=True,
        )
        credentials = flow.run_local_server(
            host="127.0.0.1", port=0, open_browser=True, access_type="offline", prompt="consent",
            timeout_seconds=300, authorization_prompt_message="Complete Google authorization in your browser.",
            success_message="Google Calendar connected. You may close this window.",
        )
        if not credentials.refresh_token or not credentials.has_scopes(GOOGLE_SCOPES):
            print("Google did not grant offline Calendar access. Run authorization again.", file=sys.stderr)
            return 1
        save_credentials(credentials, settings.google_token_file)
        print("Google Calendar authorization saved. You can now use POST /schedule.")
        return 0
    except Exception:
        # Do not print SDK exceptions: they can contain OAuth URLs or credentials.
        print("Authorization failed. Check the Desktop app credentials file and try again.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
