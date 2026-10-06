import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from lookout_api_config import (
    ALLOWED_ACTIONS, MAX_COMMAND_BYTES, MAX_RESPONSE_BYTES, READ_PATHS,
    REQUEST_TIMEOUT_SECONDS,
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def server_origin(value):
    parsed = urllib.parse.urlsplit(value)
    if (not parsed.hostname or parsed.username or parsed.password
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment):
        raise ValueError("LOOKOUT_API_URL debe contener solo el origen de la API.")
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if parsed.scheme != "https" and not (local and parsed.scheme == "http"):
        raise ValueError("La API remota requiere HTTPS. HTTP solo se admite en el equipo local.")
    return value.rstrip("/")


def request(operation, query=None, command=None):
    server = server_origin(os.environ.get("LOOKOUT_API_URL", ""))
    key = os.environ.get("LOOKOUT_API_KEY", "").strip()
    if not key or "\r" in key or "\n" in key:
        raise ValueError("Configura LOOKOUT_API_KEY en el entorno del servidor.")
    if operation == "action":
        if not isinstance(command, dict) or command.get("action") not in ALLOWED_ACTIONS:
            raise ValueError("La acción no pertenece a las operaciones permitidas para agentes.")
        path = "/rest/lookout/actions"
        body = json.dumps({"command": command}, ensure_ascii=False).encode()
        if len(body) > MAX_COMMAND_BYTES:
            raise ValueError("La acción supera el tamaño permitido.")
    else:
        if operation not in READ_PATHS:
            raise ValueError("Consulta desconocida.")
        path = READ_PATHS[operation]
        body = None
    url = server + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    req = urllib.request.Request(
        url, data=body,
        headers={"x-api-key": key, "Content-Type": "application/json"},
        method="POST" if body is not None else "GET",
    )
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(req, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
    if len(raw) > MAX_RESPONSE_BYTES:
        raise ValueError("La respuesta supera el tamaño permitido. Reduce la consulta.")
    return json.loads(raw)


def main():
    parser = argparse.ArgumentParser(description="Cliente de Enterprise Lookout para agentes.")
    parser.add_argument("operation", choices=[*READ_PATHS, "action"])
    parser.add_argument("--owner-id")
    parser.add_argument("--work-area-id")
    parser.add_argument("--company-id")
    parser.add_argument("--q")
    parser.add_argument("--entity", choices=["company", "contact"])
    parser.add_argument("--id")
    parser.add_argument("--command-file", help="JSON de una acción; usa - para entrada estándar.")
    args = parser.parse_args()
    if args.operation == "contacts" and not args.company_id:
        parser.error("contacts requiere --company-id")
    if args.operation in ("profile", "usage") and (not args.entity or not args.id):
        parser.error("profile y usage requieren --entity y --id")
    parameters = {
        "workspace": {"ownerId": args.owner_id, "workAreaId": args.work_area_id},
        "contacts": {"companyId": args.company_id, "q": args.q},
        "profile": {"entity": args.entity, "id": args.id},
        "usage": {"entity": args.entity, "id": args.id},
        "runtime": {},
    }
    command = None
    if args.operation == "action":
        if not args.command_file:
            parser.error("action requiere --command-file archivo.json o --command-file -")
        if args.command_file == "-":
            raw = sys.stdin.read(MAX_COMMAND_BYTES + 1)
        else:
            with open(args.command_file, encoding="utf-8") as handle:
                raw = handle.read(MAX_COMMAND_BYTES + 1)
        if len(raw.encode()) > MAX_COMMAND_BYTES:
            raise ValueError("El archivo de la acción supera el tamaño permitido.")
        command = json.loads(raw)
    query = {key: value for key, value in parameters.get(args.operation, {}).items()
             if value is not None}
    result = request(args.operation, query=query, command=command)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print(f"La API responde HTTP {error.code}. Revisa la clave, permisos y datos de la acción.",
              file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, urllib.error.URLError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
