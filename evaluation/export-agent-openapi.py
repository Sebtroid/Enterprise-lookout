import argparse
import copy
import importlib.util
import json
from pathlib import Path
import sys
import urllib.request


root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "scripts"))
module_spec = importlib.util.spec_from_file_location("lookout_api", root / "scripts/lookout-api.py")
client = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(client)
parser = argparse.ArgumentParser(description="Exporta el contrato actual para un GPT privado.")
parser.add_argument("--source", default="http://localhost:4311")
parser.add_argument("--server", default="https://lookout-api.example.invalid")
parser.add_argument("--output", default=str(root / "evaluation/integrations/lookout-agent.openapi.json"))
args = parser.parse_args()
source = client.server_origin(args.source)
server = client.server_origin(args.server)
if not server.startswith("https://"):
    raise ValueError("El contrato de Custom GPT requiere una API pública con HTTPS.")
with urllib.request.urlopen(source + "/openapi.json", timeout=30) as response:
    spec = json.load(response)
selected = copy.deepcopy({path: spec["paths"][path] for path in client.READ_PATHS.values()})
selected["/rest/lookout/actions"] = copy.deepcopy(spec["paths"]["/rest/lookout/actions"])
command = selected["/rest/lookout/actions"]["post"]["requestBody"]["content"]["application/json"]["schema"]["properties"]["command"]
command["oneOf"] = [branch for branch in command["oneOf"]
                    if branch["properties"]["action"].get("const") in client.ALLOWED_ACTIONS]
if len(command["oneOf"]) != len(client.ALLOWED_ACTIONS):
    raise ValueError("Las acciones del cliente y la API no coinciden. Actualiza ambos contratos.")
summaries = {
    "workspace": "Consultar trabajos, eventos, empresas y presupuesto del trabajo seleccionado",
    "contacts": "Buscar contactos de empresas en la base compartida",
    "profile": "Consultar categorías, fuentes y estado de verificación de una empresa o contacto",
    "usage": "Consultar en qué eventos y trabajos se usa una empresa",
    "runtime": "Comprobar disponibilidad de Dom",
    "action": "Guardar un cambio solicitado o preparar un borrador sin aprobar ni enviar correos",
}
for path, methods in selected.items():
    label = next((name for name, route in client.READ_PATHS.items() if route == path), "action")
    for method, operation in methods.items():
        operation["operationId"] = f"lookout_{label}"
        operation["summary"] = summaries[label]
        operation["description"] = summaries[label]
        operation["security"] = [{"apiKey": []}]
        operation["x-openai-isConsequential"] = method != "get"
schemas = {}
available = spec.get("components", {}).get("schemas", {})


def collect(value):
    if isinstance(value, dict):
        reference = value.get("$ref", "")
        prefix = "#/components/schemas/"
        if reference.startswith(prefix):
            name = reference[len(prefix):]
            if name not in schemas:
                schemas[name] = copy.deepcopy(available[name])
                collect(schemas[name])
        for child in value.values():
            collect(child)
    elif isinstance(value, list):
        for child in value:
            collect(child)


collect(selected)
exported = {
    "openapi": "3.1.0",
    "info": {"title": "Enterprise Lookout para agentes", "version": "2.0.0",
             "description": "API privada. Cada clave actúa como su dueño. Los correos se aprueban y envían desde la sesión humana."},
    "servers": [{"url": server}],
    "security": [{"apiKey": []}],
    "paths": selected,
    "components": {"schemas": schemas,
                   "securitySchemes": {"apiKey": {"type": "apiKey", "in": "header", "name": "x-api-key"}}},
}
output = Path(args.output)
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(exported, ensure_ascii=False, separators=(",", ":")) + "\n")
print(f"Contrato exportado: {len(selected)} operaciones, {len(command['oneOf'])} acciones permitidas. {output}")
