{
  description = "strings - minimal pastebin";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        
        strings = pkgs.stdenv.mkDerivation {
          pname = "strings";
          version = "0.1.0";

          src = ./.;

          nativeBuildInputs = [ pkgs.bun pkgs.makeWrapper ];

          buildPhase = ''
            runHook preBuild
            export HOME=$(mktemp -d)
            bun install
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            
            mkdir -p $out/lib/strings $out/bin
            cp -r src package.json node_modules $out/lib/strings/
            
            makeWrapper ${pkgs.bun}/bin/bun $out/bin/strings \
              --add-flags "run $out/lib/strings/src/index.ts"
            
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Minimal pastebin service";
            license = licenses.mit;
          };
        };
      in
      {
        packages.default = strings;
        packages.strings = strings;
        
        packages.cli = pkgs.writeShellScriptBin "strings-cli" (builtins.readFile ./cli/strings);

        devShells.default = pkgs.mkShell {
          buildInputs = [ pkgs.bun ];
        };
      }
    ) // {
      nixosModules.default = { config, lib, pkgs, ... }:
        with lib;
        let
          cfg = config.services.strings;
        in
        {
          options.services.strings = {
            enable = mkEnableOption "strings pastebin service";

            package = mkOption {
              type = types.package;
              default = self.packages.${pkgs.system}.default;
              description = "The strings package to use";
            };

            port = mkOption {
              type = types.port;
              default = 3000;
              description = "Port to listen on";
            };

            username = mkOption {
              type = types.str;
              default = "admin";
              description = "Username for basic auth";
            };

            password = mkOption {
              type = types.nullOr types.str;
              default = null;
              description = "Password for basic auth";
            };

            passwordFile = mkOption {
              type = types.nullOr types.path;
              default = null;
              description = "File containing the password (alternative to password)";
            };

            baseUrl = mkOption {
              type = types.str;
              default = "http://localhost:3000";
              description = "Public URL for the service";
            };

            dataDir = mkOption {
              type = types.path;
              default = "/var/lib/strings";
              description = "Directory to store the database";
            };
          };

          config = mkIf cfg.enable {
            assertions = [
              {
                assertion = cfg.password != null || cfg.passwordFile != null;
                message = "services.strings: either password or passwordFile must be set";
              }
            ];

            users.users.strings = {
              isSystemUser = true;
              group = "strings";
              home = cfg.dataDir;
              createHome = true;
            };
            users.groups.strings = { };

            systemd.services.strings = {
              description = "strings pastebin";
              after = [ "network.target" ];
              wantedBy = [ "multi-user.target" ];

              serviceConfig = {
                Type = "simple";
                User = "strings";
                Group = "strings";
                WorkingDirectory = cfg.dataDir;
                ExecStart = "${cfg.package}/bin/strings";
                Restart = "on-failure";
                RestartSec = 5;

                # Hardening
                NoNewPrivileges = true;
                PrivateTmp = true;
                ProtectSystem = "strict";
                ProtectHome = true;
                ReadWritePaths = [ cfg.dataDir ];
              };

              environment = {
                PORT = toString cfg.port;
                BASE_URL = cfg.baseUrl;
                DB_PATH = "${cfg.dataDir}/strings.db";
                AUTH_USERNAME = cfg.username;
              } // (if cfg.passwordFile != null then {
                AUTH_PASSWORD_FILE = toString cfg.passwordFile;
              } else {
                AUTH_PASSWORD = cfg.password;
              });
            };
          };
        };
    };
}
