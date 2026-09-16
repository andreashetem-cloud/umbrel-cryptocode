#!/usr/bin/env bash
# Bouwt de drie images voor de eCash solo app. Draai dit OP je Umbrel,
# vóór je de app installeert. Duurt ongeveer 3-6 minuten.
set -euo pipefail
cd "$(dirname "$0")"

ABC_VERSION="${ABC_VERSION:-0.33.9}"
CKPOOL_PR="${CKPOOL_PR:-11}"
ABC_SHA256="${ABC_SHA256:-}"

echo "==> eCash solo app build"
echo "    Bitcoin ABC : ${ABC_VERSION}"
echo "    ckpool      : $([ -n "$CKPOOL_PR" ] && echo "pull/${CKPOOL_PR}/head (fix voor Issue #10)" || echo master)"
echo

# --- checksum ophalen (optioneel maar aangeraden) ----------------------------
# Bitcoin ABC publiceert een GPG-clearsigned bestand, niet een kale SHA256SUMS.
SUMS_URL="https://download.bitcoinabc.org/${ABC_VERSION}/fabien-sha256sums.${ABC_VERSION}.asc"
TARBALL="bitcoin-abc-${ABC_VERSION}-x86_64-linux-gnu.tar.gz"
if [ -z "$ABC_SHA256" ]; then
    echo "==> checksum ophalen van ${SUMS_URL}"
    if curl -fsSL "$SUMS_URL" -o /tmp/abc-sums.asc 2>/dev/null; then
        ABC_SHA256=$(grep -F "$TARBALL" /tmp/abc-sums.asc | head -1 | awk '{print $1}' || true)
        if [ -n "$ABC_SHA256" ]; then
            echo "    sha256: ${ABC_SHA256}"
            if command -v gpg >/dev/null 2>&1; then
                echo "    (handmatig verifiëren: gpg --verify /tmp/abc-sums.asc)"
                gpg --verify /tmp/abc-sums.asc 2>&1 | sed 's/^/    /' || true
            fi
        else
            echo "    !! checksum niet gevonden in het bestand, build gaat door zonder"
        fi
    else
        echo "    !! checksumbestand niet op te halen, build gaat door zonder verificatie"
    fi
fi

# --- images bouwen -----------------------------------------------------------
echo
echo "==> [1/3] eCash node"
docker build \
    --build-arg "ABC_VERSION=${ABC_VERSION}" \
    --build-arg "ABC_SHA256=${ABC_SHA256}" \
    -t "cryptocode/ecash-abc:${ABC_VERSION}" \
    docker/abc

echo
echo "==> [2/3] ckpool solo"
docker build \
    --build-arg "CKPOOL_PR=${CKPOOL_PR}" \
    -t "cryptocode/ecash-ckpool:pr11" \
    docker/ckpool

echo
echo "==> [3/3] dashboard"
docker build -t "cryptocode/ecash-dashboard:1.0.0" docker/dashboard

echo
echo "==> klaar. Images:"
docker images --format '    {{.Repository}}:{{.Tag}}  {{.Size}}' | grep '^    cryptocode/' || true
echo
echo "Volgende stap: zie README.md, hoofdstuk 'Installeren'."
