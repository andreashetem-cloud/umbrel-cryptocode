#!/bin/sh
# ckpool solo entrypoint. Wacht tot de node bruikbaar is, schrijft config, start.
set -eu

CK=/ckpool
RPC_HOST="${RPC_HOST:-node}"
RPC_PORT="${RPC_PORT:-8332}"

mkdir -p "$CK/logs" "$CK/sock"
cat /BUILD_COMMIT 2>/dev/null || true

# --- 1. wachten op de credentials die de node genereert ----------------------
echo "[ckpool] wachten op /abc/rpc.creds ..."
while [ ! -s /abc/rpc.creds ]; do sleep 2; done
U=$(sed -n 1p /abc/rpc.creds)
P=$(sed -n 2p /abc/rpc.creds)

rpc() {
    curl -s --max-time 10 --user "$U:$P" \
        --data-binary "{\"method\":\"$1\",\"params\":[]}" \
        -H 'content-type: text/plain;' \
        "http://${RPC_HOST}:${RPC_PORT}/"
}

# --- 2. wachten tot de node uit initial block download is --------------------
# Mine je tijdens IBD, dan faalt getblocktemplate en draait ckpool voor niets.
while :; do
    OUT=$(rpc getblockchaininfo || true)
    if [ -n "$OUT" ]; then
        IBD=$(echo "$OUT" | jq -r '.result.initialblockdownload // empty' 2>/dev/null || true)
        PROG=$(echo "$OUT" | jq -r '(.result.verificationprogress // 0) * 100 | floor' 2>/dev/null || echo 0)
        BLK=$(echo "$OUT" | jq -r '.result.blocks // 0' 2>/dev/null || echo 0)
        if [ "$IBD" = "false" ]; then
            echo "[ckpool] node gesynchroniseerd op blok $BLK, ckpool start"
            break
        fi
        echo "[ckpool] node synchroniseert: blok $BLK (${PROG}%) - nog even geduld"
    else
        echo "[ckpool] node nog niet bereikbaar op ${RPC_HOST}:${RPC_PORT}"
    fi
    sleep 20
done

# --- 3. config wegschrijven --------------------------------------------------
# LET OP: donation MOET een double zijn. "donation": 0 wordt door ckpool
# geweigerd met 'Json entry donation is not a double'. Dus 0.0.
cat > "$CK/ckpool.conf" <<EOF
{
"btcd" : [
	{
		"url" : "${RPC_HOST}:${RPC_PORT}",
		"auth" : "${U}",
		"pass" : "${P}",
		"notify" : true
	}
],
"zmqblock" : "tcp://${RPC_HOST}:28332",
"btcsig" : "${CK_BTCSIG:-/cryptocode solo/}",
"donation" : ${CK_DONATION:-0.0},
"blockpoll" : 100,
"update_interval" : 30,
"serverurl" : [ "0.0.0.0:3333" ],
"mindiff" : ${CK_MINDIFF:-1000},
"startdiff" : ${CK_STARTDIFF:-5000},
"maxdiff" : 0,
"logdir" : "${CK}/logs"
}
EOF

chown -R 1000:1000 "$CK"

# -B = btcsolo (miner-username is het uitbetaaladres), -x = eCash-regels,
# -k = oude socket opruimen na een herstart.
exec setpriv --reuid=1000 --regid=1000 --clear-groups \
    ckpool -B -x -k -c "$CK/ckpool.conf" -s "$CK/sock" -l 5
