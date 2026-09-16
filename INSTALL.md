# Stap voor stap toevoegen

Zelfde route als de Dogecoin-store, met drie verschillen: eigen store-id
(`cryptocode`), images via GHCR, en umbrelOS 2.0 gebruikt `umbreld client`.

---

## 1. Repo aanmaken en pushen (op de Mac)

```bash
cd ~/Desktop
# pak hier de bundel uit, zodat je deze mapstructuur hebt:
#   umbrel-cryptocode/umbrel-app-store.yml
#   umbrel-cryptocode/.github/workflows/build-images.yml
#   umbrel-cryptocode/cryptocode-ecash-solo/...
mv cryptocode-umbrel-app-store umbrel-cryptocode
cd umbrel-cryptocode
git init -b master
git add .
git commit -m "eCash solo mining app"
gh repo create andreashetem-cloud/umbrel-cryptocode --public --source=. --push
```

Repo MOET publiek zijn; umbreld kloont anoniem.

---

## 2. Images bouwen op GitHub

Actions-tab -> **build-images** -> *Run workflow*. Duurt ~5-8 min.

Daarna: Profiel -> Packages -> elk van de drie pakketten -> **Package settings**
-> visibility op **Public**. Staan ze op private, dan faalt de pull op de Umbrel
met `denied`.

Drie images: `ecash-abc:0.33.9`, `ecash-ckpool:pr11`, `ecash-dashboard:1.0.0`.

Optioneel maar aan te raden: de workflow print per image een regel met
`@sha256:...`. Plak die digests achter de tags in `docker-compose.yml`, commit,
push. Dan staat vast welke build je draait.

---

## 3. Poortcheck op de Umbrel

```bash
ssh umbrel@100.111.67.28
sudo ss -ltnp | grep -E ':(3333|3036|8433)\b'
```

Moet leeg zijn. Thuis draait Bassin op 3456, LoneStrike op 3335/33333 en
DOGE/LTC op 22557, dus 3333 hoort vrij te zijn. Is het toch bezet, pas dan de
hostpoort in `docker-compose.yml` aan én `port:` in `umbrel-app.yml`.

---

## 4. Store toevoegen en installeren

Via de UI: App Store -> Community App Stores -> `https://github.com/andreashetem-cloud/umbrel-cryptocode`

Of via SSH:

```bash
umbreld client appStore.registry.query          # bekijk toegevoegde stores
umbreld client apps.install.mutate --appId cryptocode-ecash-solo
```

---

## 5. Kijken of hij loopt

```bash
docker logs -f cryptocode-ecash-solo_node_1
docker logs -f cryptocode-ecash-solo_ckpool_1
```

ckpool hoort te zeggen: `node synchroniseert: blok X (Y%)`. Dat is goed — hij
wacht bewust tot `initialblockdownload` false is. Pas daarna opent poort 3333.

Dashboard: `http://umbrel.local:3036` (of via de UI).

---

## 6. Eerste miner aansluiten

Pas als de node uitgesynct is. Neem één apparaat, bij voorkeur de Bitaxe Gamma.

| Veld | Waarde |
|---|---|
| URL | `stratum+tcp://192.168.1.149:3333` |
| Gebruiker | `ecash:qq....` (je eigen XEC-adres) |
| Wachtwoord | `x` |

Deze app kent dit probleem NIET: de betaling gaat naar de gebruikersnaam van de
miner zelf (`-B` btcsolo), dus geen lege `PAYOUT_ADDRESS` zoals bij de DOGE-app.

**Direct controleren in de log** of het adres heel is aangekomen:

```bash
docker logs cryptocode-ecash-solo_ckpool_1 | grep -i "ecash:\|addr"
```

Zie je een afgekapt adres, dan knipt de firmware op de dubbele punt. Probeer dan
de vorm zonder `ecash:`-prefix.

---

## 7. Wijzigen na installatie

Zelfde valkuil als eerder: een geïnstalleerde app draait uit
`~/umbrel/app-data/cryptocode-ecash-solo/docker-compose.yml`, een kopie van het
installatiemoment. Een push naar GitHub bereikt hem niet.

```bash
# env-variabelen gewijzigd? restart is niet genoeg:
umbreld client apps.stop.mutate  --appId cryptocode-ecash-solo
umbreld client apps.start.mutate --appId cryptocode-ecash-solo
```

---

## 8. Pas daarna: publiek maken

Niet doen voordat hij een week draait en je een geldige share hebt gezien.
Wat er dan nog moet gebeuren: 256x256 SVG-icoon, 3-5 screenshots 1440x900 PNG,
en ckpool bouwen vanaf een gemergede upstream in plaats van PR #11.
