# strings

this is a minimal pastebin I designed for Wentworth Institute of Technology's Coding Club

## Features

- Random IDs or custom slugs
- Syntax highlighting via highlight.js
- Basic auth for creating pastes
- Web form at `/new`
- SQLite storage
- Single binary via Bun
- No expiration

## Quick Start

```bash
# Install deps
bun install

# Run locally
AUTH_USERNAME=admin AUTH_PASSWORD=secret bun run dev
```

Then visit `http://localhost:3000/new` to create your first paste.

## Deploy with NixOS

Add to your flake inputs:

```nix
{
  inputs.strings.url = "github:jaspermayone/strings";
}
```

Then in your configuration:

```nix
{ inputs, ... }:
{
  imports = [ inputs.strings.nixosModules.default ];

  services.strings = {
    enable = true;
    port = 3000;
    username = "admin";
    passwordFile = "/run/secrets/strings-password"; # use sops-nix or agenix
    baseUrl = "https://strings.witcc.dev";
  };

  # Reverse proxy with nginx
  services.nginx.virtualHosts."strings.witcc.dev" = {
    enableACME = true;
    forceSSL = true;
    locations."/".proxyPass = "http://127.0.0.1:3000";
  };
}
```

## API

### Create Paste

```bash
# Plain text with random ID
curl -u admin:secret -X POST https://strings.witcc.dev/api/paste \
  -H "X-Filename: example.py" \
  -d 'print("hello")'

# With custom slug
curl -u admin:secret -X POST https://strings.witcc.dev/api/paste \
  -H "Content-Type: application/json" \
  -d '{"content": "print(1)", "filename": "test.py", "slug": "my-snippet"}'

# Pipe a file
cat myfile.rs | curl -u admin:secret -X POST https://strings.witcc.dev/api/paste \
  -H "X-Filename: myfile.rs" \
  --data-binary @-
```

Response:
```json
{
  "id": "aBc123xy",
  "url": "https://strings.witcc.dev/aBc123xy",
  "raw": "https://strings.witcc.dev/aBc123xy/raw"
}
```

### View Paste

```
GET /{id}      # HTML with syntax highlighting
GET /{id}/raw  # Plain text
```

### Delete Paste

```bash
curl -u admin:secret -X DELETE https://strings.witcc.dev/aBc123xy
```

## Web Interface

- `/` - Home page with API docs
- `/new` - Create paste form (requires auth)

## CLI

Install the CLI:

```bash
# With Nix
nix profile install .#cli

# Or just copy the script
cp cli/strings ~/.local/bin/
chmod +x ~/.local/bin/strings
```

Usage:

```bash
export STRINGS_HOST="https://strings.witcc.dev"
export STRINGS_USER="admin"
export STRINGS_PASS="secret"

# Paste a file
strings myfile.py

# With custom slug
strings myfile.py --slug my-snippet

# Pipe content
echo "hello world" | strings

# From clipboard (macOS)
pbpaste | strings
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `AUTH_USERNAME` | `admin` | Basic auth username |
| `AUTH_PASSWORD` | `changeme` | Basic auth password |
| `AUTH_PASSWORD_FILE` | - | Read password from file |
| `DB_PATH` | `./strings.db` | SQLite database path |
| `BASE_URL` | `http://localhost:3000` | Public URL (for response) |

## License
See license.md file.
