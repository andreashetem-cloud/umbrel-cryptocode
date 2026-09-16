'use strict';
/*
 * Cryptocode eCash Solo Dashboard
 * Zero dependencies. Leest ckpool logs van schijf + praat JSON-RPC met de node.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const CK = process.env.CK_DIR || '/ckpool';
const ABC = process.env.ABC_DIR || '/abc';
const RPC_HOST = process.env.RPC_HOST || 'node';
const RPC_PORT = Number(process.env.RPC_PORT || 8332);
const STRATUM_HINT = process.env.STRATUM_HINT || '<umbrel-ip>:3333';

// ---------------------------------------------------------------- RPC client
function creds() {
  const raw = fs.readFileSync(path.join(ABC, 'rpc.creds'), 'utf8').split('\n');
  return { user: raw[0].trim(), pass: raw[1].trim() };
}

function rpc(method, params = []) {
  return new Promise((resolve, reject) => {
    let c;
    try { c = creds(); } catch (e) { return reject(new Error('rpc.creds nog niet aanwezig')); }
    const body = JSON.stringify({ jsonrpc: '1.0', id: 'dash', method, params });
    const req = http.request({
      host: RPC_HOST, port: RPC_PORT, method: 'POST', path: '/',
      timeout: 8000,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(body),
        Authorization: 'Basic ' + Buffer.from(c.user + ':' + c.pass).toString('base64'),
      },
    }, (res) => {
      let d = '';
      res.on('data', (x) => (d += x));
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return reject(new Error(j.error.message || 'rpc error'));
          resolve(j.result);
        } catch (e) { reject(new Error('ongeldig RPC-antwoord')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('rpc timeout')));
    req.on('error', reject);
    req.end(body);
  });
}

// ------------------------------------------------------------- ckpool status
// pool.status is GEEN JSON-array: het zijn 3 losse JSON-objecten, elk op een
// eigen regel. Regel voor regel parsen, anders klapt JSON.parse eruit.
function poolStatus() {
  const f = path.join(CK, 'logs', 'pool', 'pool.status');
  const out = { online: false };
  let txt;
  try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { return out; }
  for (const line of txt.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('{')) continue;
    try { Object.assign(out, JSON.parse(s)); } catch (e) { /* halve regel, overslaan */ }
  }
  out.online = out.lastupdate ? (Date.now() / 1000 - out.lastupdate) < 120 : false;
  return out;
}

function workers() {
  const dir = path.join(CK, 'logs', 'workers');
  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return []; }
  return files.map((name) => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8').split('\n')[0]);
      return { worker: name, ...j };
    } catch (e) { return { worker: name }; }
  });
}

function users() {
  const dir = path.join(CK, 'logs', 'users');
  let files = [];
  try { files = fs.readdirSync(dir); } catch (e) { return []; }
  return files.map((name) => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8').split('\n')[0]);
      return { address: name, ...j };
    } catch (e) { return { address: name }; }
  });
}

// ckpool schrijft hashrates als "1.23T" / "980G" / "0"
function parseHash(v) {
  if (typeof v === 'number') return v;
  if (!v || typeof v !== 'string') return 0;
  const m = v.match(/^([\d.]+)\s*([KMGTPE]?)$/i);
  if (!m) return 0;
  const mult = { '': 1, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
  return parseFloat(m[1]) * (mult[m[2].toUpperCase()] || 1);
}

function fmtHash(h) {
  const u = ['H/s', 'KH/s', 'MH/s', 'GH/s', 'TH/s', 'PH/s', 'EH/s'];
  let i = 0;
  while (h >= 1000 && i < u.length - 1) { h /= 1000; i++; }
  return h.toFixed(2) + ' ' + u[i];
}

function fmtDuration(sec) {
  if (!isFinite(sec) || sec <= 0) return '—';
  const d = sec / 86400;
  if (d < 1) return (sec / 3600).toFixed(1) + ' uur';
  if (d < 365) return d.toFixed(1) + ' dagen';
  return (d / 365).toFixed(1) + ' jaar';
}

// --------------------------------------------------------------- status API
async function status() {
  const pool = poolStatus();
  const res = {
    ts: Date.now(),
    pool,
    workers: workers(),
    users: users(),
    stratum: STRATUM_HINT,
    node: { ok: false },
  };

  try {
    const [chain, net, mining] = await Promise.all([
      rpc('getblockchaininfo'),
      rpc('getnetworkinfo'),
      rpc('getmininginfo').catch(() => null),
    ]);
    res.node = {
      ok: true,
      blocks: chain.blocks,
      headers: chain.headers,
      progress: chain.verificationprogress,
      ibd: chain.initialblockdownload,
      sizeOnDisk: chain.size_on_disk,
      pruned: chain.pruned,
      difficulty: chain.difficulty,
      peers: net.connections,
      peersIn: net.connections_in,
      peersOut: net.connections_out,
      subversion: net.subversion,
      networkhashps: mining ? mining.networkhashps : null,
    };
  } catch (e) {
    res.node = { ok: false, error: e.message };
  }

  // Verwachte tijd tot blok: T = difficulty * 2^32 / hashrate
  const my = parseHash(pool.hashrate1hr) || parseHash(pool.hashrate15m) || parseHash(pool.hashrate5m);
  res.myHashrate = my;
  res.myHashrateFmt = fmtHash(my);
  if (my > 0 && res.node.ok && res.node.difficulty) {
    res.etaSeconds = (res.node.difficulty * Math.pow(2, 32)) / my;
    res.etaFmt = fmtDuration(res.etaSeconds);
  } else {
    res.etaFmt = '—';
  }
  // Hoe dichtbij was je beste share ooit? (log-schaal t.o.v. netwerk-difficulty)
  if (pool.bestshare && res.node.difficulty) {
    res.bestSharePct = Math.min(100, (Math.log10(Math.max(pool.bestshare, 1)) / Math.log10(res.node.difficulty)) * 100);
  }
  return res;
}

// -------------------------------------------------------------------- HTML
const HTML = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>eCash Solo</title>
<style>
:root{--bg:#0d1117;--card:#161b22;--line:#21262d;--tx:#e6edf3;--dim:#8b949e;--ok:#3fb950;--warn:#d29922;--bad:#f85149;--ac:#2f81f7}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
header{padding:20px 16px 8px}h1{margin:0;font-size:19px;letter-spacing:-.01em}
.sub{color:var(--dim);font-size:13px;margin-top:2px}
.wrap{padding:0 16px 40px;max-width:900px;margin:0 auto}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.v{font-size:20px;font-weight:600;margin-top:3px;font-variant-numeric:tabular-nums}
.v.sm{font-size:14px;font-weight:500}
.bar{height:6px;background:#21262d;border-radius:3px;overflow:hidden;margin-top:8px}
.bar>i{display:block;height:100%;background:var(--ac)}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line)}
th{color:var(--dim);font-weight:500;font-size:11px;text-transform:uppercase}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.ok{background:var(--ok)}.warn{background:var(--warn)}.bad{background:var(--bad)}
code{background:#21262d;padding:2px 6px;border-radius:4px;font-size:13px}
.note{color:var(--dim);font-size:12px;margin-top:14px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin:22px 0 8px}
</style></head><body>
<header><h1>eCash Solo Mining</h1><div class="sub" id="sub">laden…</div></header>
<div class="wrap">
  <div class="grid" id="kpi"></div>
  <h2>Node</h2><div class="grid" id="node"></div>
  <h2>Miners</h2><div class="card" style="padding:0;overflow:hidden"><table id="wk"><tbody><tr><td>—</td></tr></tbody></table></div>
  <div class="note" id="note"></div>
</div>
<script>
const f=(n,d=2)=>n==null?'—':Number(n).toLocaleString('nl-NL',{maximumFractionDigits:d});
function card(k,v,extra=''){return '<div class="card"><div class="k">'+k+'</div><div class="v">'+v+'</div>'+extra+'</div>'}
async function tick(){
  let s; try{ s=await (await fetch('./api/status')).json(); }catch(e){ document.getElementById('sub').textContent='dashboard onbereikbaar'; return; }
  const p=s.pool||{}, n=s.node||{};
  document.getElementById('sub').innerHTML =
    '<span class="dot '+(p.online?'ok':'bad')+'"></span>ckpool '+(p.online?'actief':'offline')+
    ' &nbsp;·&nbsp; <span class="dot '+(n.ok?(n.ibd?'warn':'ok'):'bad')+'"></span>node '+
    (n.ok?(n.ibd?'synchroniseert':'gesynchroniseerd'):'offline')+
    ' &nbsp;·&nbsp; stratum <code>'+s.stratum+'</code>';
  document.getElementById('kpi').innerHTML =
    card('Mijn hashrate', s.myHashrateFmt||'—') +
    card('Verwacht blok over', s.etaFmt||'—') +
    card('Workers', (p.Workers??0)+' / '+(p.Users??0)+' adressen') +
    card('Shares', f(p.accepted,0)+' ok / '+f(p.rejected,0)+' fout') +
    card('Beste share ooit', f(p.bestshare,0), s.bestSharePct?'<div class="bar"><i style="width:'+s.bestSharePct.toFixed(1)+'%"></i></div>':'');
  document.getElementById('node').innerHTML =
    card('Blokhoogte', f(n.blocks,0)+(n.headers&&n.headers>n.blocks?' / '+f(n.headers,0):''),
      n.progress!=null?'<div class="bar"><i style="width:'+(n.progress*100).toFixed(2)+'%"></i></div>':'') +
    card('Netwerk difficulty', f(n.difficulty,0)) +
    card('Peers', (n.peers??'—')+(n.peersIn!=null?' ('+n.peersIn+' in)':'')) +
    card('Chain op schijf', n.sizeOnDisk!=null?f(n.sizeOnDisk/1e9,1)+' GB'+(n.pruned?' (pruned)':''):'—');
  const rows=(s.workers||[]).map(w=>'<tr><td>'+w.worker+'</td><td>'+(w.hashrate5m||'—')+'</td><td>'+(w.hashrate1hr||'—')+'</td><td>'+f(w.bestshare,0)+'</td></tr>').join('');
  document.getElementById('wk').innerHTML='<thead><tr><th>Worker</th><th>5m</th><th>1u</th><th>Beste share</th></tr></thead><tbody>'+
    (rows||'<tr><td colspan="4" style="color:#8b949e">nog geen miner verbonden</td></tr>')+'</tbody>';
  document.getElementById('note').textContent = n.error? ('node: '+n.error) :
    'Zet in je miner: url '+s.stratum+', user = je eCash-adres, wachtwoord = x';
}
tick(); setInterval(tick, 10000);
</script></body></html>`;

// ------------------------------------------------------------------- server
http.createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/api/status') {
    try {
      const s = await status();
      const b = JSON.stringify(s);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(b);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }
  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HTML);
}).listen(PORT, '0.0.0.0', () => console.log('[dashboard] luistert op ' + PORT));
