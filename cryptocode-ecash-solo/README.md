# eCash Solo Mining voor umbrelOS

Volledige Bitcoin ABC (eCash / XEC) node + `ecash-ckpool-solo` stratum server +
dashboard, als één Umbrel-app. Je miners verbinden met je eigen machine; vind je
een blok, dan gaat de miner-portie rechtstreeks naar jouw adres.

---

## 1. Wat er draait

| Service | Image | Poort | Rol |
|---|---|---|---|
| `node` | `cryptocode/ecash-abc:0.33.9` | 8433 (P2P) | volledige eCash node, bouwt block templates |
| `ckpool` | `cryptocode/ecash-ckpool:pr11` | 3333 (stratum) | solo stratum voor je ASICs |
| `dashboard` | `cryptocode/ecash-dashboard:1.0.0` | 3036 (web) | status, workers, verwachte tijd tot blok |

**Poort 8433, niet 8333.** eCash gebruikt standaard 8333, precies zoals je
BCH-node op deze Umbrel. De node draait daarom op 8433 zodat er geen botsing is.
Forward 8433 in je router als je inbound peers wil (aanbevolen door e.cash).

---

## 2. Installeren

Docker-images die alleen lokaal bestaan zijn **niet betrouwbaar** via de
community-app-store-flow: umbrelOS kan een `docker compose pull` forceren, en die
overrulet `pull_policy: never`. Daarom eerst bouwen, dan installeren.

### Stap 1 — bouwen op de Umbrel

```bash
ssh umbrel@umbrel.local
git clone <deze-repo> ~/cryptocode-umbrel-app-store
cd ~/cryptocode-umbrel-app-store/cryptocode-ecash-solo
./build.sh
```

Duurt 3-6 minuten. `build.sh` haalt eerst de GPG-clearsigned checksum van
Bitcoin ABC op (`fabien-sha256sums.0.33.9.asc`) en geeft die als build-arg mee,
zodat de tarball geverifieerd wordt tijdens de build.

### Stap 2 — installeren

**Optie A, community app store (UI).**
Instellingen → App Store → Community App Stores → repo-URL toevoegen → app
installeren. Werkt zolang Umbrel de al aanwezige image-tags accepteert. Zo niet:
optie B.

**Optie B, handmatig (het meest voorspelbaar).**

```bash
APP=cryptocode-ecash-solo
mkdir -p ~/umbrel/app-data/$APP
cp -r ~/cryptocode-umbrel-app-store/$APP/* ~/umbrel/app-data/$APP/
cd ~/umbrel && ./scripts/app install $APP
```

**Optie C, images publiceren.** Wil je het wél netjes via de store, push de drie
images naar GHCR of Docker Hub, pin ze op `@sha256:...` in `docker-compose.yml`
en haal `pull_policy: never` weg. Dat is ook wat Umbrel zelf van app-inzendingen
verlangt.

---

## 3. De node downloaden (initial block download)

Na installatie begint de node de hele eCash-chain te downloaden. **Er wordt niets
gemined zolang dit loopt** — de ckpool-container wacht expliciet tot
`initialblockdownload` op `false` staat, want tijdens IBD faalt
`getblocktemplate` en zou ckpool voor niets draaien.

Voortgang zie je in het dashboard (blokhoogte + balk), of via:

```bash
docker exec cryptocode-ecash-solo_node_1 \
  bitcoin-cli -datadir=/data getblockchaininfo | head -20
```

**Schijfruimte.** De exacte chain-grootte in 2026 heb ik niet betrouwbaar kunnen
vaststellen (Blockchair gaf 401, bitinfocharts 404). eCash draagt de volledige
Bitcoin/BCH-historie tot november 2020 mee plus zes jaar eigen blokken; reken op
enkele honderden GB. Je 2TB NV3000 heeft ruimte zat. Wil je het klein houden:

```yaml
# docker-compose.yml, service node
ABC_PRUNE: "50000"   # MiB, minimum 550
```

Pruned minen werkt (GBT heeft alleen de UTXO-set nodig), maar kost je Chronik en
staking. Doe het alleen als je die niet gebruikt.

**Sneller synchroniseren:** `ABC_DBCACHE: "4000"` tijdens IBD, daarna terug naar
2000.

---

## 4. Miners instellen

| Veld | Waarde |
|---|---|
| URL | `stratum+tcp://<umbrel-ip>:3333` |
| Gebruiker | je eigen eCash-adres, bv. `ecash:qq....xyz.bitaxe` |
| Wachtwoord | `x` |

ckpool draait in **btcsolo-modus** (`-B`): het adres in het gebruikersveld is het
uitbetaaladres. Elke miner mag zijn eigen adres hebben; `.workernaam` erachter is
optioneel en puur voor de statistieken.

**Twee dingen om te controleren bij de eerste miner:**

1. **De dubbele punt in `ecash:`.** Sommige firmware knipt de gebruikersnaam af
   op `:`. ckpool's `decode_cashaddr` gaat met de prefix om (PR #11 repareert
   ook een kapotte format string dáár), maar test het: kijk in
   `~/umbrel/app-data/cryptocode-ecash-solo/data/ckpool/logs/ckpool.log` of het
   adres correct gedecodeerd wordt. Zo niet, probeer de vorm zonder prefix.
2. **Lengte van het veld.** AxeOS heeft een limiet op de stratum-user. Een volle
   cashaddr (~54 tekens) plus `.worker` zit daar tegenaan. Een afgekapt adres =
   een blokbeloning naar iemand anders. Controleer het volledige adres in het
   dashboard onder Miners.

**Difficulty.** Standaard `mindiff 1000` / `startdiff 5000`. Dat past bij een
fleet van 0,5 tot 40 TH/s: de Bitaxe Gamma levert binnen seconden shares, de
Avalon Mini 3 overspoelt de pool niet vóór vardiff is ingeregeld. Aanpassen kan
via de `CK_*` environment-variabelen in `docker-compose.yml`.

---

## 5. Waarom deze app blokken vindt en generieke stratum-software niet

eCash verwerpt via de Avalanche-laag elk blok dat één van deze drie regels mist.
Alle drie zijn afgedekt, en ik heb de coinbase-output end-to-end nagerekend
tegen een namaak-node:

| Regel | Aandeel | Waar het vandaan komt |
|---|---|---|
| Miner fund output | 32% | `coinbasetxn.minerfund` uit `getblocktemplate` |
| Staking reward output | 10% | `coinbasetxn.stakingrewards.payoutscript.hex` |
| Miner | 58% | jouw adres uit het stratum-gebruikersveld |
| Real Time Target (Heartbeat) | — | `rtt.nexttarget`, direct uit de template |

De RTT wordt uit de template gelezen in plaats van lokaal herrekend, dus de
uitbreiding van 4 naar 5 filtervensters (upgrade 15 nov 2025) is automatisch
goed. `persistrecentheaderstime=1` staat in `bitcoin.conf` zodat de node na een
herstart niet 17 blokken lang op te lage difficulty mined.

**Belangrijk: Issue #10.** In ckpool master staat een open bug (gemeld 2 aug
2026) waarbij `network_diff` na elke blokwissel minutenlang ordes van grootte te
hoog staat, waardoor `test_blocksolve()` een geldig blok stilzwijgend weggooit —
precies waar het pijn doet. Daarom bouwt deze app standaard vanaf
**`pull/11/head`**, de openstaande fix. Is PR #11 gemerged, zet dan
`CKPOOL_PR=""` en `CKPOOL_REF=master` en bouw opnieuw.

---

## 6. Verwachtingen

Netwerk op 9 augustus 2026: ~55 PH/s, difficulty ~7,1G, XEC ~$0,0000068.
Coinbase 3.125.000 XEC, jouw 58% ≈ **$12 per blok**.

| Jouw hashrate | Gemiddeld één blok per |
|---|---|
| 1,2 TH/s (Bitaxe Gamma) | ~320 jaar |
| 10 TH/s (Nexus S1) | ~38 jaar |
| 37,5 TH/s (Avalon Mini 3) | ~10 jaar |
| 45 TH/s (fleet samen) | ~8,5 jaar |

Dat is Poisson, geen planning: morgen kan net zo goed. Ter vergelijking: dezelfde
45 TH/s op BTC is ordegrootte tienduizenden jaren. Doe dit voor de kans op een
echt blok en voor de infrastructuur, niet voor het rendement.

---

## 7. Wat getest is en wat niet

**Wel getest, door mij, tegen een namaak-eCash-node:**
- ckpool compileert schoon met exact deze dependencies op Debian/Ubuntu x86_64
- volledige stratum-handshake: subscribe → authorize → notify
- de coinbase bevat de drie verplichte outputs en telt exact op tot `coinbasevalue`
- het dashboard parseert een echte `pool.status` (drie losse JSON-objecten op
  aparte regels — geen array, daar sneuvelt naïeve `JSON.parse` op)
- alle YAML- en shell-bestanden syntactisch gevalideerd

**Niet getest:**
- de images zijn niet gebouwd (geen Docker in mijn omgeving)
- of de ABC-binary draait op `debian:bookworm-slim` zonder extra libs
  (waarschijnlijk; controleer met `ldd`)
- de installatie op umbrelOS zelf
- of `pull_policy: never` op jouw umbrelOS-versie standhoudt

Eerste keer opstarten: kijk direct in `docker logs` van beide containers.
