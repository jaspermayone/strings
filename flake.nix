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

        # Pre-fetch node_modules as a fixed-output derivation
        nodeModules = pkgs.stdenv.mkDerivation {
          name = "strings-node-modules";
          src = ./.;

          nativeBuildInputs = [ pkgs.bun pkgs.cacert ];

          # Fixed-output derivation - allows network access but requires hash
          outputHashMode = "recursive";
          outputHashAlgo = "sha256";
          outputHash = "sha256-yS8Mf/SZNuOMJPBFqvHF7qTk7lWNQZLb1KWkwPCDdBQ=";

          buildPhase = ''
            runHook preBuild
            export HOME=$(mktemp -d)
            export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
            bun install --frozen-lockfile
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r node_modules $out/
            runHook postInstall
          '';
        };

        strings = pkgs.stdenv.mkDerivation {
          pname = "strings";
          version = "0.1.0";

          src = ./.;

          nativeBuildInputs = [ pkgs.makeWrapper ];

          # No build phase needed - deps are pre-fetched
          dontBuild = true;

          installPhase = ''
            runHook preInstall

            mkdir -p $out/lib/strings $out/bin
            cp -r src package.json $out/lib/strings/
            ln -s ${nodeModules}/node_modules $out/lib/strings/node_modules

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
        let
          cfg = config.services.strings;

          instanceOptions = { name, ... }: {
            options = {
              enable = lib.mkEnableOption "strings pastebin instance";

              package = lib.mkOption {
                type = lib.types.package;
                default = self.packages.${pkgs.system}.default;
                description = "The strings package to use";
              };

              port = lib.mkOption {
                type = lib.types.port;
                default = 3000;
                description = "Port to listen on";
              };

              username = lib.mkOption {
                type = lib.types.str;
                default = "admin";
                description = "Username for basic auth";
              };

              password = lib.mkOption {
                type = lib.types.nullOr lib.types.str;
                default = null;
                description = "Password for basic auth (not recommended, use passwordFile)";
              };

              passwordFile = lib.mkOption {
                type = lib.types.nullOr lib.types.path;
                default = null;
                description = "File containing AUTH_PASSWORD=<password>";
              };

              baseUrl = lib.mkOption {
                type = lib.types.str;
                description = "Public URL for the service (e.g., https://paste.example.com)";
              };

              dataDir = lib.mkOption {
                type = lib.types.path;
                default = "/var/lib/strings-${name}";
                description = "Directory to store the database";
              };
            };
          };

          enabledInstances = lib.filterAttrs (_: inst: inst.enable) cfg.instances;
        in
        {
          options.services.strings = {
            instances = lib.mkOption {
              type = lib.types.attrsOf (lib.types.submodule instanceOptions);
              default = { };
              description = "Strings pastebin instances";
              example = lib.literalExpression ''
                {
                  main = {
                    enable = true;
                    baseUrl = "https://paste.example.com";
                    port = 3000;
                    username = "admin";
                    passwordFile = config.age.secrets.strings-main.path;
                  };
                  secondary = {
                    enable = true;
                    baseUrl = "https://paste2.example.com";
                    port = 3001;
                    username = "user";
                    passwordFile = config.age.secrets.strings-secondary.path;
                  };
                }
              '';
            };
          };

          config = lib.mkIf (enabledInstances != { }) {
            assertions = lib.mapAttrsToList (name: inst: {
              assertion = inst.password != null || inst.passwordFile != null;
              message = "services.strings.instances.${name}: either password or passwordFile must be set";
            }) enabledInstances;

            users.users = lib.mapAttrs' (name: inst: {
              name = "strings-${name}";
              value = {
                isSystemUser = true;
                group = "strings-${name}";
                home = inst.dataDir;
                createHome = true;
              };
            }) enabledInstances;

            users.groups = lib.mapAttrs' (name: _: {
              name = "strings-${name}";
              value = { };
            }) enabledInstances;

            systemd.services = lib.mapAttrs' (name: inst: {
              name = "strings-${name}";
              value = {
                description = "strings pastebin (${name})";
                after = [ "network.target" ];
                wantedBy = [ "multi-user.target" ];

                serviceConfig = {
                  Type = "simple";
                  User = "strings-${name}";
                  Group = "strings-${name}";
                  WorkingDirectory = inst.dataDir;
                  ExecStart = "${inst.package}/bin/strings";
                  Restart = "on-failure";
                  RestartSec = 5;

                  # Hardening
                  NoNewPrivileges = true;
                  PrivateTmp = true;
                  ProtectSystem = "strict";
                  ProtectHome = true;
                  ReadWritePaths = [ inst.dataDir ];
                } // lib.optionalAttrs (inst.passwordFile != null) {
                  EnvironmentFile = inst.passwordFile;
                };

                environment = {
                  PORT = toString inst.port;
                  BASE_URL = inst.baseUrl;
                  DB_PATH = "${inst.dataDir}/strings.db";
                  AUTH_USERNAME = inst.username;
                } // lib.optionalAttrs (inst.password != null) {
                  AUTH_PASSWORD = inst.password;
                };
              };
            }) enabledInstances;
          };
        };
    };
}
