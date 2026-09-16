#!/bin/sh
# eCash node entrypoint. Draait als root, zet rechten goed, dropt naar uid 1000.
set -eu

DATA=/data
mkdir -p "$DATA"

# --- RPC credentials: één keer genereren, daarna hergebruiken -----------------
if [ ! -f "$DATA/rpc.creds" ]; then
    PASS=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    printf 'ecash\n%s\n' "$PASS" > "$DATA/rpc.creds"
fi
chmod 644 "$DATA/rpc.creds"
RPCUSER=$(sed -n 1p "$DATA/rpc.creds")
RPCPASS=$(sed -n 2p "$DATA/rpc.creds")

# --- bitcoin.conf ------------------------------------------------------------
# Elke regel hieronder staat er met een reden; zie README voor de onderbouwing.
{
    echo "server=1"
    echo "listen=1"
    echo "port=8433"                       # 8333 is bezet door je BCH-node
    echo "discover=1"
    echo "rpcbind=0.0.0.0"
    echo "rpcallowip=0.0.0.0/0"            # alleen bereikbaar binnen dit docker-netwerk
    echo "rpcuser=${RPCUSER}"
    echo "rpcpassword=${RPCPASS}"
    echo "rpcthreads=8"
    echo "zmqpubhashblock=tcp://0.0.0.0:28332"  # ckpool krijgt zo direct nieuwe blokken
    echo "persistrecentheaderstime=1"      # verplicht voor correcte Real Time Target na herstart
    echo "avalanche=1"                     # zonder avalanche geen geldige templates
    echo "avalanchestakingrewards=1"       # zet stakingrewards in getblocktemplate
    echo "dbcache=${ABC_DBCACHE:-2000}"
    if [ "${ABC_PRUNE:-0}" != "0" ]; then echo "prune=${ABC_PRUNE}"; fi
} > "$DATA/bitcoin.conf"

chown -R 1000:1000 "$DATA"

echo "[ecash] Bitcoin ABC start, datadir=$DATA prune=${ABC_PRUNE:-0}"
exec setpriv --reuid=1000 --regid=1000 --clear-groups \
    bitcoind -datadir="$DATA" -conf="$DATA/bitcoin.conf" -printtoconsole
