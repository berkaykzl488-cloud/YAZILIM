# PLAN.md: yangpazar.com, from demo to a real multi-user site

## 0. Ground truth (what was checked)
- `index.html` has 9,047 lines. CSS is lines 5–1802 (151 KB). The single `<script>` runs from 1813 to 9046 (about 910 KB).
  - Lines 4701–7503 (109 KB) are embedded server kits: `TC_PHP` (4701), `API_KIT_FILES` (4847–7479), `zipFiles`. They are dead weight in production.
  - Demo data is about 78 KB: `seed()` (1860–2008), `migrate()` (2826–3072), `seed3()` (3073–3118), `POSTS_DEMO` (8494).
- **State today:** the global `S` is loaded and saved in localStorage (`load`/`save`, 2009–2010). Everything is computed in the browser:
  - Money: `spend`/`giveBack`/`addBonus` (2044–2046), `refundPart` (2071), `ledger()` (2068), `addTx`, `addRev` (2500).
  - Orders: `doBuy` (7760), `complete` (7792), `refund` (7804).
  - `autoConfirm` (7805) is called from `render()` (8835). Any visitor's browser completes orders today.
  - Exchange engine: 3604–3647. Withdrawals and e-Gider: `wdBreakdown`/`issueEgp`/`wdPaidBook` (2261, 2298, 2502). Raffles: 2507–2515. `notify` puts SMS/mail into a fake log (2792).
  - Media is in IndexedDB (2799–2812) or base64 data URLs (`fileToDataURL` 3407, `coverup`, `lsimg`, `disp`). Backups are in IndexedDB (`bkDB` 4446, auto-backup interval 8857).
- **UI dispatch:**
  - `ACT` (7821–8000) is dispatched from the click listener at 8001. `FORM` (8007–8201) from submit at 8202. `CHG` (8204–8262) from change/input at 8263/8272.
  - Later additions: `Object.assign(ACT, …)` at 8864 and 8941; overrides at 8898–8910 and 8965–8980; ETBİS at 9032–9041.
  - Permission wrapper: `ADM_ACT`/`ADM_FORM`/`ADM_CHG` (8956–8970) maps each admin action to a `PERMS` key (2765–2771). This map becomes the server's permission table directly.
- **Demo and safety switches:** account switcher `ACT.as`/`CHG.switch` (7823, 8205, overridden at 8951, 8971–8972). Demo reset `ACT.reset` (8000). Go-live checklist `goLiveChecks` (8982).
- **api/** (PHP, file storage) has patterns to reuse:
  - `yp_boot` (headers, CSP, same-origin check), `yp_input`/`yp_str`/`yp_money`, atomic and locked file storage.
  - `yp_encrypt`/`yp_decrypt` (sodium, falling back to AES-GCM; key in `data/anahtar.php`).
  - Sessions with `session_regenerate_id` and a CSRF header (`yp_require_csrf`), file-based per-IP rate limiting (`yp_rl_*`), `yp_http` (cURL).
  - PayTR hash helpers, `yp_valid_tckn`/`yp_valid_iban_tr`, `yp_redact`/`yp_log`.
  - Endpoints: `paytr_bildirim.php` (hash check, idempotent, but it only writes `odemeler.json` and credits nobody), `cekim_onayla.php` (Paraşüt/Bizim Hesap expense records), `paytr_hakedis.php` (cron with key).
- **Local tooling:** PHP 8.3 with pdo_mysql, pdo_sqlite (SQLite 3.45), sodium, gd, curl, mbstring. **No mysqld/mariadb/sqlite3 CLI.** Node 22 and Playwright are present. 4 cores.

**Decision:** one PDO data layer that targets **MariaDB 10.6 in production** and runs on **SQLite for tests** (in-memory for units, a file for HTTP and E2E tests). SQL stays in a portable subset. Dialect differences live only in `Db`. A final verification pass runs on real MariaDB (the owner's staging host and the self-test page in P8).

## 1. Architecture

### 1.1 Layout (zip or cPanel Git, no Composer/Node on the server)
```
public_html/
  index.php            SPA shell: SSR <title>/meta/JSON-LD (port of seoData 8328), CSP nonce, boot JSON inline
  .htaccess            HTTPS, clean URLs → index.php, /api/v1/* → api/v1/index.php, security headers, deny app/ & storage/
  assets/app.css, assets/js/*.js (classic scripts, cache-busted ?v=build)
  uploads/             PUBLIC media only (.htaccess: no script execution, Require all denied for *.php|phtml|phar…)
  api/                 existing files kept (paytr_bildirim.php URL must not change: owner pasted it into PayTR)
    _lib.php           extended (db, session unify)
    v1/index.php       front controller/router
  kurulum/index.php    install wizard (self-locks)
  app/                 (deny all) src/, routes/*.php, schema/*.php, migrations/, cron.php, presenters
  storage/             (deny all) private media, backups, logs, cache (reuse api/data pattern)
```
Everything stays under public_html with deny rules (the existing `api/data/.htaccess` pattern). A non-technical owner can't reliably upload outside the webroot. Every lib file keeps the `_lib.php` direct-call guard.

### 1.2 Backend modules (`app/src`)
- `Db`: PDO wrapper. Dialect is `mysql` or `sqlite`.
  - `tx(fn)` retries on deadlock (1213/1205) up to 3 times. SQLite starts transactions with `BEGIN IMMEDIATE`.
  - `forUpdate()` returns `' FOR UPDATE'` or `''`. `skipLocked()` is used only if the server is MariaDB ≥10.6 or MySQL 8, otherwise plain FOR UPDATE.
  - `upsert()` emits ON DUPLICATE KEY or ON CONFLICT. Connections set `sql_mode=STRICT_ALL_TABLES`, `utf8mb4`, time zone +03:00.
- `Schema`: PHP arrays (one file per domain in `app/schema/NN_domain.php`, loaded by glob) are turned into DDL for both dialects. Migrations are tracked in `schema_migrations`.
- `Auth` (members and staff share one session).
  - Session cookie `YPS`: HttpOnly, Secure, **SameSite=Lax** (Strict would log users out when PayTR redirects back).
  - Idle 2 h for staff, 30 days with "beni hatırla" for members.
  - `users.session_ver` is checked on every request, so ban or password change kills sessions.
  - Call `session_write_close()` right after auth. File sessions lock otherwise and would serialize polling.
- `Perm`: `PERMS` keys copied from 2765–2771. A route table maps each endpoint to a perm, generated from `ADM_ACT`/`ADM_FORM`/`ADM_CHG`.
  - Fix the inventory's gaps: `pazarlama/backlink/rehber` map to `seo`. `dopset` becomes `ilan`. Every destructive action gets its tab perm.
- `Money`: integer kuruş everywhere. `yp_money` parses input. Presenters output TL numbers so the UI's `TL()` and `r2()` keep working.
- `Ledger`: double entry (see §3.4).
  - `Ledger::post(kind, ref, [[account, ±kurus, label], …])` asserts the sum is 0.
  - Wallet rows are updated in the same transaction after `SELECT … FOR UPDATE`. Users are always locked in ascending id order.
- `Idem`: `Idempotency-Key` header on every money POST. `(user_id, key)` is unique and the stored response is replayed.
- Domain services, each in its own file, port the JS functions:
  - `OrderService` (doBuy, complete, refund, autoConfirm), `WalletService` (spend split cash/credit, giveBack, refundPart, creditDeposit/wdOK), `WithdrawService` (wdFee, wdBreakdown, issueEgp, wdPaidBook), `ExchangeService` (exQuote … exShutdown), `EpService`, `AdService` (adRangeFree, adBooked), `CampaignService` (raffleSpend, rCap, rOk, addTickets, spin with `random_int`, draw), `ReferralService` (refCheck), `VipService` (vip, rateFor, points), `Censor` (same regexes as `CENSOR` 2781, in PHP).
  - **Parity tests:** run the original JS helpers in Node and the PHP ports on the same JSON fixtures, and compare outputs.
- `Notify`: `notify()` writes an `notifications` row and queues mail/SMS in `outbox`, using templates from settings.
- `Media`: multipart upload with a finfo MIME check. Images are re-encoded with GD (EXIF stripped, max 1600 px, webp or jpeg). Video gets a size and MIME check only (no ffmpeg on the host).
  - Random file names. Public kinds go to `/uploads/Y/m/`, private kinds to `storage/media` and are served through an auth check.
  - Private kinds: delivery proofs, dispute, support, backup.
- `Mailer`: bundled PHPMailer `src/` (3 files, no Composer) over SMTP. Fallback is `mail()`.
- `Sms`: NetGSM HTTP API adapter, behind an interface so other providers can be added.
- `Queue`/`Cron`: one `app/cron.php` (CLI `php …/cron.php` every 5 min in cPanel, or a URL with a key for cron-job.org).
  - Each task has its own interval, a DB lock (`cron_runs.lock_until`) and a 45 s budget.
  - Lazy fallback: if cron is late by more than 10 min, the API runs one budgeted tick after the response (`litespeed_finish_request()` or `fastcgi_finish_request()`).
- `Audit`: every admin mutation, every reveal (TC, IBAN, exchange secrets, EP codes), every login and 2FA event. Logged data goes through `yp_redact`.

### 1.3 API conventions
- JSON only. Errors keep the existing shape: `{ok:false,error:"Türkçe",code,fields?}`.
- Success: `{ok:true,msg?,patch?,data?}`. `patch` is the "updated slices" contract (§2.2).
- All mutating calls need a session, `X-CSRF-Token` and the same-origin check (`yp_check_origin`).
- Rate limits reuse `yp_rl`:
  - login 5/15 min/IP plus 10/h per account; register 5/h/IP; tfa send 1/60 s and 5/h; paytr token 15/10 min (existing)
  - upload 30/10 min; chat/DM 20/min/user; listing create 20/h/user; partner apply 3/day/IP
- Pagination is keyset (`?after=<id>&limit=`). Search uses a `title_norm` column (TR-folded by the existing `slugify` rules) with `LIKE`. On MySQL, a FULLTEXT index is also used.

### 1.4 Server-authoritative rules (everything involving money or trust)
- **Balances.** Two buckets per user, as today: `cash` = `bal` (withdrawable), `credit` = `bonus` (shopping only).
  - `spend` uses credit first and the payer row records the `paid_cash/paid_credit` split, as `o.paid` does now.
  - Refunds go back into the same buckets.
- **Escrow (havuz).** Purchase moves buyer → `ESCROW:ORD`. Completion moves `ESCROW:ORD` → seller cash (net) + `REV:commission`, at the rate from `rateFor` frozen on the order. Refund moves escrow → buyer buckets.
  - The listing row is locked during purchase, so stock can't oversell.
- **Auto-confirm.** Cron only. It warns 1 h before (`warned`) and completes after `set.autoConfirm` hours. `render()` must no longer call `autoConfirm()`.
- **Disputes.** Buyer opens (`disp`), the escrow is frozen. Staff with `siparis` decides (`resolve`: complete or refund).
  - `guarantee` (late delivery, instant refund) is allowed only when the server finds the delivery deadline passed.
- **Exchange (borsa).** Buyer pays the total into `ESCROW:EX`. Each delivery pays sellers from escrow into their cash, and the margin goes to `REV:borsa`. `exFinish` refunds the price difference and `exCancelOrder` refunds the remainder.
  - Seller offer fields marked secret (account passwords) are encrypted. Only `borsa` staff can reveal them, each reveal is audited, and they're wiped on finish or cancel, with a cron safety net that wipes after 7 days.
- **EP store.** Codes are stored encrypted with a unique hash. Sale is `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1`. Buyer → `REV:ep`. The code is shown only to the buyer (and audited when staff view it).
- **Deposits.**
  - PayTR: the server creates a `deposits` row (merchant_oid, expected kuruş including the gateway fee from `gws.fee`, bonus, coupon reserved) and gets the token.
  - `paytr_bildirim.php` (same URL) verifies the hash, then does a single pending → success transition under a row lock. The amount must match. It credits cash if the gateway `cat==='eft'` (`wdOK` 2248), otherwise credit, plus the coupon bonus as credit, then ledger and notification. Replays return "OK" and change nothing.
  - Manual havale/kripto: `deps` rows go to staff with `odeme`, who approve (`dep-ok`) or reject (`dep-no`).
- **Withdrawals.**
  - Request: requires TC verified, a full TC number, amount at least `minWithdraw`, and amount no more than cash. Moves cash → `PAYABLE:WD`.
  - Approve: `PAYABLE:WD` → `BANK:OUT` (net) + `REV:cekim` (fee) + `TAX:stopaj`. The e-Gider number comes from `doc_sequences` under a row lock (`seri+year+9 digits`, as in `issueEgp` 2308). The ETTN is `random_bytes` UUIDv4. Paraşüt and Bizim Hesap calls (the `cekim_onayla.php` logic) run after commit through `accounting_jobs`.
  - Reject: refund to cash.
- **Ads and dopings.** The price is computed on the server (`dopCost`, `packs.p`, staff with `reklam` get them free). Calendar availability is re-checked under a lock on an `ads_slots` row per type. Money moves to `REV:ads` or `REV:doping`. Ad revenue is recognized on approval (`ad-ok`), and rejection refunds.
- **Raffles and wheel.** Tickets come from completed spend (`raffleSpend`). The free ticket is `UNIQUE(raffle,user,day)` and a spin is `UNIQUE(user,day)`. Prizes are drawn with `random_int`. Draws are staff-only and audited, with the seed and ticket snapshot stored.
- **Coupons.** One use per user, enforced by a unique index, consumed only when the deposit succeeds.
- **VIP and points.** `vol`/`pts` are updated in `complete`, EP and exchange. Point conversion (`pts`) goes to credit.
- **Referrals.** The ref code is captured at registration. `refCheck` runs on the first completed purchase at or above `refMin`, capped at `refMax`.
- **Paid user SMS (`smsuser`).** Charged at `sms.userPrice` to `REV:sms`.

### 1.5 Polling, not sockets (shared host constraint)
- `GET /v1/poll?n=<lastNotif>&dm=<thread:lastMsg>&tk=<ticket:lastMsg>&o=<order:lastEvt>&q=1(admin queues)` uses indexed `id > ?` queries. It returns deltas plus unread counts and badge counts (ADM_QUEUES).
- Client interval: 8 s while visible, 30 s when hidden, stop after 10 min idle, back off on 429.
- **No long polling.** CloudLinux entry-process limits (typically 20–30 concurrent) would be exhausted.

### 1.6 Cron tasks (5-minute tick)
- Every tick:
  - auto-confirm and warnings
  - expire PayTR deposits older than 3 days and release coupons
  - outbox sender: mail budget is `hourly_limit/12` per tick (setting, default 80/h), SMS has its own budget, 2FA/OTP messages go out immediately at request time with priority 0
  - `accounting_jobs` retries with backoff
  - ad stats flush
- Hourly: hakediş (the `paytr_hakedis.php` logic, now reading `deposits`).
- Daily:
  - DB backup: pure-PHP dump, streamed and gzipped, to `storage/backups`. Keep 7 daily, 4 weekly and 3 pre-update copies, with a size cap. `exec`/`mysqldump` is usually disabled.
  - Cleanup: idempotency keys over 24 h, challenges, rate-limit files, read notifications over 180 days, exchange secret wipe, delivery-proof retention (owner decides).
  - **Ledger invariant check**: every journal sums to 0 and `wallets` equal posting sums. A failure alerts the admin.
- Winback sends run on their schedule.

### 1.7 KVKK and security
- **TC number:**
  - `tc_enc`: yp_encrypt of the full number.
  - `tc_hash`: HMAC-SHA256 with a server pepper, `UNIQUE`. This replaces `sha256(tc+'|yangpazar')` (4672), which can be brute-forced across the 11-digit space.
  - `tc_mask`: 3 digits plus ******, plus 2 digits.
  - The full number is returned only by the e-Gider endpoints (`cekim|muhasebe`), and each call is audited.
  - NVİ KPSPublic SOAP verification runs on the server (port of `TC_PHP` 4701, ad/soyad taken from the DB).
- **IBANs** are encrypted. Members see them masked (`maskIban`). Staff with `cekim` see the full IBAN, audited.
- **Account deletion** anonymizes the user. Financial records are kept 10 years (VUK).
- **Headers:** HSTS. `X-Frame-Options DENY` and `frame-ancestors 'none'` everywhere except `/widget/*` (`vWidget` is meant to be embedded).
- **CSP** (nonce): `script-src 'self' 'nonce-…'` plus GTM/FB/AdSense hosts only when enabled in settings. `style-src 'self' 'unsafe-inline'` (398 inline style attributes). `img-src 'self' data: blob: community.akamai.steamstatic.com`. `frame-src www.paytr.com`. `connect-src 'self'`.
  - Replace the 3 inline `on*=` handlers.
  - Vendor `xlsx-js-style` from jsdelivr locally.
- Validation per endpoint (`V::` helpers on top of `yp_str`). The server applies `censor` too. The client keeps `esc()`.
- 2FA is mandatory for admin and for staff with any money perm (`odeme, cekim, bakiye, muhasebe, borsa`). This is a proposed default for the owner to confirm.

## 2. Frontend migration (low risk)

### 2.1 Step zero: split the file (mechanical, no behavior change)
Classic `<script>` files share one global lexical scope, so top-level `const`/`let`/`function` keep working across files with zero refactor as long as load order is preserved.

| file | source lines |
|---|---|
| assets/app.css | 5–1802 |
| js/00-core.js (helpers, constants) | 1813–1858 |
| js/demo/seed.js (demo only) | 1859–2008 |
| js/01-state.js (`load/save/S/ui`; becomes the data adapter) | 2009–2014 |
| js/02-domain.js (getters, wallet helpers, ledger, ads helpers, TFA, mail templates) | 2015–2247 |
| js/30-wallet-egp.js (withdrawals, e-Gider, raffle helpers) | 2248–2515 |
| js/40-views-public.js (render primitives, home, server, category, perms, censor/notify, media) | 2516–2825 |
| js/demo/migrate.js (demo only) | 2826–3118 |
| js/41-covers.js | 3119–3193 |
| js/42-views-member.js (header, listing, order, sell, account, campaigns, ads page, DMs, notifications) | 3194–3603 |
| js/50-exchange.js | 3604–3749 |
| js/60-admin-shell.js | 3750–4008 |
| js/61-admin-tabs.js (vAdmin) | 4009–4239 |
| js/62-admin-panels.js (EP, VIP, xlsx, muhasebe, backups, maintenance) | 4240–4506 |
| js/70-support.js | 4507–4625 |
| js/71-modals.js (login, register, deposit, TC) | 4626–4700 |
| js/demo/kits.js (removed in prod) | 4701–7503 |
| js/63-admin-ent.js | 7504–7698 |
| js/31-actions-core.js (paytr, doBuy, complete, refund…) | 7699–7820 |
| js/80-act-*.js | 7821–8000 (+8864, 8941) |
| js/81-form-*.js | 8006–8201 |
| js/82-chg-*.js | 8204–8262 |
| js/85-dispatch.js | 8001–8005, 8202, 8263–8275 |
| js/90-seo-mkt.js | 8276–8798 |
| js/95-router.js | 8799–8858 |
| js/99-wiring.js (admin wiring, overrides, ADM_* wrappers, go-live, ETBİS, final `render()`) | 8859–9046 |

- `ACT`/`FORM`/`CHG` become `const ACT={}` in core. Each domain file adds its handlers with `Object.assign(ACT,{…})`, split as `act-orders.js`, `act-wallet.js`, `act-exchange.js`, `act-admin-*.js` and so on.
- The `ADM_*` permission wrappers stay last (99-wiring), because they wrap whatever is registered at that point.
- `tools/build.php` (PHP CLI):
  - `--prod` writes the `assets/` tree, strips `js/demo/*`, and adds `?v=` hashes.
  - `--single` inlines CSS and JS in order into `dist/index.html`. That's the artifact preview: demo mode with the localStorage adapter, still working through P0–P1. After that it's frozen as tag `prototype-final`. The new handlers need a server, and keeping two code paths isn't worth it.
- Regression gate: Playwright with a frozen `Date.now` and seeded localStorage takes DOM and screenshot snapshots of about 35 routes (public, member, every admin tab). Snapshots must be identical before and after the split.

### 2.2 Data adapter and cache
- `index.php` inlines `window.YP_BOOT` and a nonce'd `<script>` (the result of `GET /v1/boot`):
  - csrf, server time (`SKEW`; `now` becomes `Date.now()+SKEW`)
  - public settings (whitelist), me + wallet + perms
  - servers, packs, dopings, public gws/banks/cnets, vip, slides, live ads, EP products (stock count only), exchange markets with stock
  - active raffles summary, covers, posts index
  - first page of listings with referenced public users, unread counts
- In prod, `load()` returns `S` from YP_BOOT and `save()` becomes a no-op, which neutralizes the about 120 `save()` calls.
- **Lazy slices:** views call `need(key, params)`. It returns the cached data, or starts a fetch, shows a skeleton and calls `render()` again when the data arrives.
  - Used for: `listings:<filter>`, `order:<id>`, `me:orders/tx/wd/deps/ep/dm/tickets`, and `adm:<tab>` per admin tab (orders, users, deps, wd, ledger…).
  - `S` keeps its current shapes and field names (`u, t, a, status:'odendi'…`), so templates stay unchanged.
  - Presenters on the server emit those shapes. Ids are numeric PKs shown with prefixes: `'S'+(100000+id)`, `'B'+(1000+id)`, `'EP'+n`, `'E'+n`, `'l'+id`.
- `user(id)` already falls back to "Misafir". Boot and patches carry only public user fields (`id, name, rating, sales, joined, verified, vipId, lastSeen`). Private fields come back for `me`, and for staff with `uye`.
- `PV`/`adImp`/`adClick` send `navigator.sendBeacon('/api/v1/ads/events')` with batched ids.
- `lastSeen` is updated by the server on each authenticated request (throttled to 60 s).

### 2.3 Handler pattern
```js
// js/05-api.js
async function call(method, path, body, opt={}){
  const h={Accept:'application/json'};
  if(method!=='GET'){ h['X-CSRF-Token']=API.csrf; h['Idempotency-Key']=opt.key||crypto.randomUUID(); }
  if(body&&!(body instanceof FormData)) h['Content-Type']='application/json';
  const r=await fetch('/api/v1/'+path,{method,headers:h,credentials:'same-origin',
          body: body instanceof FormData?body:(body?JSON.stringify(body):undefined)});
  const j=await r.json().catch(()=>({ok:false,error:'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'}));
  if(j.patch) applyPatch(j.patch);            // {upsert:{orders:[…]}, remove:{ads:[ids]}, set:{…}, me:{bal,bonus,pts}, replace:{dopings:{…}}}
  if(!j.ok){ toast(j.error||'İşlem yapılamadı.',true); throw j; }
  if(j.msg) toast(j.msg); return j;
}
```
- The dispatcher (8001, 8202) disables the clicked button or form while a handler's Promise is pending, so double-clicks can't double-charge.
- Forms keep one `data-ikey` per render, so a network retry sends the same key.

Before (7843):
```js
confirm:(d)=>{const o=ord(d.id); complete(o,pickedStar); save(); toast('Teşekkürler! Ödeme satıcıya aktarıldı.'); render();},
```
After:
```js
confirm:(d)=>call('POST',`orders/${d.id}/confirm`,{stars:pickedStar}).then(render),
```
Server side:
```php
route('POST','orders/{id}/confirm', fn($id)=>Db::tx(function() use($id){
  $u=Auth::member(); $in=V::body(['stars'=>'int:1..5?']);
  $o=Orders::lock(Ids::order($id));                                   // SELECT … FOR UPDATE
  if($o['buyer_id']!==$u['id']) throw Http::forbidden();
  if($o['status']!=='teslim') throw Http::conflict('Bu sipariş şu an onaylanamaz.');
  OrderService::complete($o, $in['stars'] ?? null);                   // ESCROW:ORD → seller cash + REV:commission, pts/vol, refCheck, notify
  return ['msg'=>'Teşekkürler! Ödeme satıcıya aktarıldı.','patch'=>Patch::order($o['id'])->me()];
}));
```
- Local validation stays in each handler for UX, and the server validates again.
- Handlers that relied on `S.users` lookups (`baladd`, `staffadd`, `winback`) send identifiers and let the server resolve them.
- Uploads (`sell`, `editl`, `deliver`, `disp`, `slideadd`, `coverup`, `lsimg`, `admediaadd`, `slidemedia`, `etbisimg`) use **upload-first**: `pupadd` and the like POST `/v1/media` and keep the media ids in `UPL`, then the form sends only the ids.

### 2.4 Production removals
- `seed`, `seed3`, `migrate`, `POSTS_DEMO`, `reset`, `ACT.as`, `CHG.switch`, the header demo selector and `paytr-ok`.
- Embedded kits: `TC_PHP`, `API_KIT_FILES`, `tc-kit`, `muhasebe-kit`, `muhasebe-zip-dl`. In their place, the Entegrasyonlar page shows the already-installed API status.
- `static-kit` and `seo-kit` are replaced by the dynamic `sitemap.xml`/`robots.txt` and SSR meta. `bkPut`/IndexedDB backups are removed.
- `aiAnswer`/`SAMPLE` (artifact runtime) is replaced by the server-side `botReply` rules, with optional AI (owner decides).
- **Cheap demo mode:** the installer checkbox "Demo verileriyle kur" loads `install/demo_seed.json`, exported once from `seed()` with Node. `settings.demo_mode=1` enables `POST /v1/demo/as` and the switcher, and is refused when any real PayTR deposit exists. The recommendation is a separate demo subdomain with its own DB.

## 3. Database schema (prefix `yp_`, InnoDB utf8mb4, times are BIGINT unix ms to match JS `t`, money is BIGINT kuruş)

### 3.1 System
- `schema_migrations(version PK, applied_at)`
- `settings(k PK varchar64, v MEDIUMTEXT json, secret TINYINT, updated_at, updated_by)`. Keys:
  - site, seo, tags, egp, tc, wdFee, hh, maint, ex (exOn/exPlace/exMargin/exOffMsg/exBuyOn/exSellOn/exAffected), ref, support (mode/hours/canned)
  - mail (pass encrypted), sms (pass encrypted), paytr-flags, packs, dopings, vip, wheel, etbis, cs2On, pvpEpOn, popup, autoConfirm, minWithdraw, commission, ptRate, moderation, demo_mode
- `audit_log(id, actor_id, action, entity, entity_id, ip, data TEXT, t)`, indexes (entity, entity_id) and (actor_id, t)
- `idempotency_keys(user_id, ikey, route, http, response MEDIUMTEXT, t, PK(user_id,ikey))`
- `cron_runs(task PK, last_start, last_ok, last_error, lock_until)`
- `backups(id, t, kind, by_id, file, bytes, sha256)`
- `outbox(id, channel ENUM(mail,sms), user_id, to_addr, ev, subject, body, priority TINYINT, status ENUM(queued,sending,sent,failed), tries, next_at, last_error, provider_id, created_at, sent_at)`, index (status, priority, next_at). Presenters build `S.mailLog`/`S.smsLog` from it.

### 3.2 Users and auth
- `users`:
  - `id, name, name_norm UNIQUE, email UNIQUE NULL, tel, ad, soyad, pass_hash`
  - `role ENUM(member,staff,admin), perms TEXT(json array), status ENUM(active,banned), verified`
  - `rating DECIMAL(4,2), rating_n, sales, vol BIGINT, pts INT, joined_at, last_seen`
  - `tfa ENUM('',sms,mail), ref_by FK, ref_paid, refs`
  - `tc_ok, tc_enc, tc_hash CHAR(64) UNIQUE NULL, tc_mask, tc_year, tc_by, tc_at, tc_tries, tc_lock_until, tc_ask_at, session_ver, created_at`
  - Indexes: (role), (last_seen)
- `wallets(user_id PK FK, cash BIGINT, credit BIGINT, updated_at)`. `bal`/`bonus` in the UI come from here.
- `user_ibans(id, user_id FK, bank, holder, iban_enc, iban_last4, created_at)`
- `auth_challenges(id, user_id FK, purpose ENUM(login,enable,disable,withdraw), channel, code_hash, expires_at, tries, sent_at, consumed_at)`
- `notifications(id, user_id FK, x, link, ev, read TINYINT, t)`, index (user_id, id)

### 3.3 Catalog
- `servers(id, sec ENUM(tr,pvp), name, slug UNIQUE, type, lv, c1, c2, online, open_at, descr, url, ep_on, partner_url, partner_at, logo_media_id, active, sort, added_at)`
- `listings`:
  - `id, no UNIQUE, seller_id FK, game ENUM(metin2,cs2,diger), server_id FK NULL, sec, cat, sub`
  - `title, title_norm, price BIGINT, stock INT, del_txt, descr`
  - `status ENUM(aktif,beklemede,satildi,kaldirildi), cover, skin TEXT, views`
  - `bump_at, free_bump_at, dop_vitrin, dop_acil, dop_renk, created_at, updated_at`
  - Indexes: (status, server_id, cat, bump_at), (status, sec, cat), (seller_id, status). FULLTEXT(title_norm) on MySQL only.
- `media(id, owner_id, kind, vis ENUM(public,private), path, mime, bytes, w, h, sha256, ref_type, ref_id, created_at)`
- `listing_media(listing_id, media_id, pos, PK(listing_id,pos))`
- `covers(k PK, media_id)`
- `bounties(id, user_id, server_id, title, budget, descr, t)`. Only if still rendered (it appears in `migrate` 2939); confirm.

### 3.4 Money
- `accounts(id, code UNIQUE, type ENUM(user_cash,user_credit,escrow,revenue,gateway,payable,tax,expense,equity), user_id NULL)`
  - Fixed codes: `ESCROW:ORD, ESCROW:EX, ESCROW:ADS, REV:commission|ads|doping|ep|borsa|sms|cekim, GW:paytr|paytr_eft|havale|kripto|…, PAYABLE:WD, BANK:OUT, TAX:stopaj, EXP:bonus|raffle|wheel|referral|points, ADJ`
- `journal(id, kind, ref_type, ref_id, actor_id, memo, meta TEXT, idem UNIQUE NULL, t)`
  - `kind` is a superset of `LKN` (2069): yukleme, cekim_talep, cekim_odendi, cekim_red, satis, iade, ep, borsa, bonus, duzeltme, stopaj_tahakkuk, plus satin_alma, doping, reklam, sms, cekilis, cark, puan, davet
  - Index (kind, t)
- `postings(id, journal_id FK, account_id FK, amount BIGINT signed, label)`, index (account_id, id). `label` is the member-facing text, so `S.tx` becomes postings on the user's accounts.
- Views and presenters: `S.ledger` comes from journal, `S.rev`/`revLog` from postings on `REV:*` grouped by day, and `escrowSum` from the `ESCROW:*` balances.
- `deposits`:
  - `id, user_id, gw, cat, amount, fee, bonus, coupon_id NULL`
  - `status ENUM(bekliyor,onaylandı,reddedildi,basarisiz,suresi_doldu)`
  - `merchant_oid UNIQUE NULL, paytr_total, paytr_payment, test_mode, bank, crypto_net_id, txid, tx_at, note, receipt_media_id, callbacks`
  - `created_at, decided_at, decided_by`
  - Index (status, created_at)
- `coupons(id, code UNIQUE, pct, max, on, created_at)` and `coupon_uses(coupon_id, user_id, deposit_id, status, PK(coupon_id,user_id))`
- `gateways(id PK, n, t, fee_bp, on, manual, cat, sort)` (non-secret), `banks(id, b, n, iban, sort)`, `crypto_nets(id, coin, net, addr, note, on)`
- `withdrawals`:
  - `id, user_id, amount, fee, brut, stopaj_bp, stopaj, net, taxpayer`
  - `bank, holder, iban_enc, iban_mask, status ENUM(bekliyor,onaylandı,reddedildi), why, note`
  - `created_at, paid_at, decided_by, egp_no UNIQUE NULL, egp_ettn, egp_doc_enc (snapshot with full TC), acct TEXT (parasut/bizimhesap results)`
  - Index (status, created_at)
- `doc_sequences(series, year, next_no, PK(series,year))`
- `accounting_jobs(id, kind, ref_id, service, status, tries, last_error, next_at)`
- `points_log(id, user_id, delta, reason, ref, t)`

### 3.5 Orders
- `orders`:
  - `id, listing_id FK, title, buyer_id FK, seller_id FK, qty, total, paid_cash, paid_credit`
  - `rate_bp, fee, net, status ENUM(odendi,teslim,itiraz,tamam,iade)`
  - `info, ch, place, ready_at, delivered_at, confirmed_at, warned_at, reason, stars, pts, created_at, updated_at`
  - Indexes: (buyer_id, created_at), (seller_id, created_at), (status, delivered_at)
- `order_events(id, order_id, actor_id, x, t)`. This is `o.log`.
- `order_messages(id, order_id, from_id, x, flagged, t)`. This is `o.chat`.
- `order_proofs(order_id, grp ENUM(dpre,dpost,dvid,dispute), media_id, pos)`

### 3.6 Exchange and EP
- `ex_markets(id, server_id UNIQUE, unit, buy BIGINT NULL, max BIGINT, margin_bp NULL, change_bp, on, sort)`
- `ex_fields(id, set ENUM(buy,sell), label, type, opts, note, req, secret, pos)` and `ex_rules` (in settings)
- `ex_orders`:
  - `id, user_id, dir, market_id, server_id, qty, price, total, reserve, paid_cash, paid_credit, cost, delivered`
  - `place, status ENUM(bekliyor,islemde,bilgi,kismen,tamam,iptal), staff_id, note, called_at, call_msg, ready_at, created_at, version`
  - Index (market_id, status, created_at)
- `ex_order_fields(order_id, field_id, value_enc NULL, PK)`
- `ex_offers(id, user_id, market_id, qty, left_qty, price, status ENUM(aktif,satildi,iptal), created_at)`, index (market_id, status, price, created_at)
- `ex_offer_fields(offer_id, field_id, value_enc NULL)`
- `ex_fills(id, order_id, offer_id, seller_id, qty, paid_qty, price, sell)`
- `ex_events(id, order_id, x, t)`
- `ep_products(id, server_id NULL, grp, ep, price, hh, v, on, sold_n, sort)`
- `ep_codes(id, product_id FK, code_enc, code_hash UNIQUE, status ENUM(stok,satildi,silindi), order_id NULL, added_at)`, index (product_id, status, id)
- `ep_orders(id, user_id, product_id, server_id, ep, ep_shown, hh, code_id, price, paid_cash, paid_credit, t)`

### 3.7 Ads and campaigns
- `ads(id, owner_id, type, server_id, title, text, btn, link, c1, c2, start_at, until_at, active, status ENUM(onay,onayli,red), reject_reason, price, paid_cash, paid_credit, ok_at, ok_by, views, clicks, created_at)`, index (type, status, start_at, until_at)
- `ad_media(ad_id, media_id, pos)` and `ad_stats(ad_id, day, imp, clk, PK)`
- `slides(id, on, title, text, link, btn, c1, c2, sort)` and `slide_media`
- `raffles(id, title, kind, value, end_at, c1, c2, w, per, cats, min_vip, max_tk, free, winner_id, drawn_at, draw_meta, created_by)`
- `raffle_tickets(raffle_id, user_id, n, acc, PK)`, `raffle_free(raffle_id, user_id, day, PK)`, `spins(user_id, day, prize, PK)`
- `winback(id, t, tpl, user_ids TEXT, coupon_code, sent)`
- `partner_apps(id, tp, n, s, u, l, c, st, t)`, `backlinks(id, url, target, anchor, k, st, ck, t)`
- `posts(id, slug UNIQUE, title, body, excerpt, cover, tags, status, t, up)`

### 3.8 Messaging and support
- `dm_threads(id, a_id, b_id, last_at, a_read, b_read, UNIQUE(a_id,b_id))` with a < b
- `dm_messages(id, thread_id, from_id, x, flagged, listing_id NULL, t)`, index (thread_id, id)
- `flagged(id, user_id, ctx, orig, seen, t)`
- `tickets(id, user_id, status ENUM(bekliyor,acik,kapandı), agent_id, rating, rated, unread_u, unread_s, created_at, closed_at, last_at)`
- `ticket_messages(id, ticket_id, f ENUM(u,b,a,s,n), by_id, x, order_ref, media_id, ai, t)`

## 4. Endpoint inventory (all under `/api/v1/`; perm in brackets; ⟵ the UI handler(s) it replaces)

**Client-only (no endpoint), about 95 keys.**
- Navigation, modals and tabs: login, register, close, pop-x, deposit, amt, copy, buy, slide, tab, atab, aq-clear, clear-f, sell-here, pick-ad, edit-l, dm-ctx, sms-user, admin-sms, star, dispute, ex-pick, ex-dir, ex-msec, ex-open, ex-srv-filter, ex-fix, exdq-fill, bkhist, exf, sv-sec, sv-ep, ep-buy, ntab, pupdel, pupcov, lgal, tplk, tpvar, adf, theme, ad-day, mday, ls-open, ls-close, admin-tk, adm-tk, adm-wdq, tk, tkf, dep-tab, seo-badge, widget-code, srvpickq, tc-open, tc-fixname, egp-q-clear, preview-pop, eplog
- Admin shell: sof, dpf, wdf, lf, uf, flf, adm-more, adm-grp, adm-menu, adm-menu-close, adm-scroll, perm-role, sv-edit, sv-add, sv-close, sv-web, sv-more, svf, sv-clear, ent-eye, ent-go, ent-retry
- FORM: search, asearch
- CHG: srvq, atabsel, utm, seoprev, ccfmt, svep (form toggle), epsrv, qty, game, calc, depcalc, adsrv, ex-sel, smsprev, supv, canned, ex-calc, skinpick, imgpick, admediaprev, addur, dprev, cnet, bksrv, tplprev, wdcalc, egicalc, mailprev, srvsec, bfsec, bfsrv, ex-sec, mday, wbdays, wball, wiban, svsort
- Read-only actions that only GET data: user-open (`GET admin/users/{id}`), ad-detail (`GET admin/ads/{id}`), proof-open (`GET media/{id}`), reveal (`GET admin/ex/orders/{id}?reveal=1`, audited), egp-view, egp-modal and egp-dl (`GET admin/withdrawals/{id}/egp`), egp-find and egplookup (`GET admin/egp?q=`), xls-day, xls-user and xlsrange (`GET admin/reports/...`; Excel is still generated client-side).

**P0: auth, account, staff**
- `GET boot` (everything at page load), `GET poll`
- `POST auth/register` ⟵ registerf (+ref from `yangpazar_ref`)
- `POST auth/login` ⟵ loginf; may answer `{tfa:{id,ch,dest}}`
- `POST auth/tfa/verify` ⟵ tfaf · `POST auth/tfa/resend` ⟵ tfa-resend · `POST auth/tfa/switch` ⟵ tfa-switch · `POST auth/logout`
- `PUT me/profile` ⟵ profile (password change needs the current password)
- `POST me/tfa` ⟵ tfa-save (challenge, then verify)
- `POST me/ibans` ⟵ ibanadd · `DELETE me/ibans/{id}` ⟵ iban-del
- `POST me/notifications/{id}/read` ⟵ n-open · `POST me/notifications/read-all` ⟵ n-readall · `DELETE me/notifications/read` ⟵ n-delread
- `POST demo/as` ⟵ as, switch (demo_mode only)
- `POST admin/staff` ⟵ staffadd [calisan] · `PUT admin/staff/{id}` ⟵ staffperm [calisan; a staffer can only grant perms they hold] · `DELETE admin/staff/{id}` ⟵ staff-del [calisan]
- `GET admin/users?q=` [uye|ara] · `POST admin/users/{id}/verify` ⟵ u-ver [uye] · `POST admin/users/{id}/ban` ⟵ u-ban [uye]
- `GET admin/today` (admToday KPIs and queues) [panel] · `GET admin/search?q=` (cmd palette, ara) [ara]

**P1: catalog and SEO**
- `GET listings?sec&server&cat&q&sort&after` · `GET listings/{id}` (+views) · `GET search/suggest?q=` (qSug) · `GET users/{id}` (public profile)
- `POST listings` ⟵ sell · `PUT listings/{id}` ⟵ editl · `POST listings/{id}/unlist` ⟵ unlist · `POST listings/{id}/free-bump` ⟵ free-bump
- `POST media` ⟵ pupadd, and generic uploads
- `POST admin/listings/{id}/approve` ⟵ l-ok [ilan] · `POST admin/listings/{id}/remove` ⟵ l-del [ilan] · `PUT admin/settings/moderation` ⟵ mod [ilan]
- `PUT admin/covers/{k}` ⟵ coverup [ilan] · `DELETE admin/covers/{k}` ⟵ cover-reset [ilan]
- `POST admin/servers` ⟵ srvadd [server] · `PUT admin/servers/{id}` ⟵ srvsave, srv-save [server] · `DELETE admin/servers/{id}` ⟵ srv-del [server; refuses if active listings or orders exist, otherwise soft delete]
- Public routes: `/sitemap.xml`, `/robots.txt`, SSR meta in index.php

**P2: wallet, orders, deposits**
- `POST orders` ⟵ buyf (Idem) · `GET orders/{id}` · `GET me/orders` · `GET me/tx`
- `POST orders/{id}/ready` ⟵ o-ready · `POST orders/{id}/deliver` ⟵ deliver (media ids) · `POST orders/{id}/confirm` ⟵ confirm · `POST orders/{id}/guarantee` ⟵ guarantee
- `POST orders/{id}/dispute` ⟵ disp · `POST orders/{id}/messages` ⟵ ochat · `POST admin/orders/{id}/resolve` ⟵ resolve [siparis] · `GET admin/orders?status` [siparis]
- `POST listings/{id}/dope` ⟵ dope; dopings also inside `POST listings` ⟵ sell
- `PUT admin/dopings` ⟵ dopset [ilan]
- `POST deposits/paytr` ⟵ dep (paytr, paytr_eft); returns iframe token
- `POST /api/paytr_bildirim.php` (callback, now credits). `paytr-ok` is removed.
- `GET deposits/{oid}` (status polling after the `?odeme=basarili` return)
- `POST deposits/manual` ⟵ dep (havale/kripto, receipt media)
- `POST admin/deposits/{id}/approve` ⟵ dep-ok [odeme] · `POST admin/deposits/{id}/reject` ⟵ dep-no [odeme]
- `POST me/points/convert` ⟵ pts
- `POST admin/balance` ⟵ baladd [bakiye] (`duzeltme` journal, reason required, audited)
- `POST admin/coupons` ⟵ coupon · `POST admin/coupons/{id}/toggle` ⟵ cp-toggle · `DELETE admin/coupons/{id}` ⟵ cp-del [kampanya]
- `PUT admin/gateways` ⟵ gws · `POST admin/gateways/{id}/toggle` ⟵ gw-toggle [odeme]
- `POST admin/banks` ⟵ bank · `DELETE admin/banks/{id}` ⟵ bank-del [odeme]
- `POST admin/crypto-nets` ⟵ cnetadd · `PUT admin/crypto-nets/{id}` ⟵ cnetsave · `POST admin/crypto-nets/{id}/toggle` ⟵ cnet-toggle · `DELETE admin/crypto-nets/{id}` ⟵ cnet-del [odeme]

**P3: withdrawals, TC, e-Gider, accounting**
- `POST me/tc/verify` ⟵ tcf (NVİ) · `POST me/tc/confirm` ⟵ tcconf
- `POST withdrawals` ⟵ withdraw (Idem) · `GET me/withdrawals`
- `GET admin/withdrawals?f&q` [cekim] · `POST admin/withdrawals/{id}/approve` ⟵ wd-ok · `POST admin/withdrawals/{id}/reject` ⟵ wd-no · `POST admin/withdrawals/{id}/egp` ⟵ egpissue [cekim]
- `POST admin/users/{id}/tc-full` ⟵ egptc [cekim|muhasebe] · `POST admin/users/{id}/tc-reset` ⟵ tc-reset [uye] · `POST admin/users/{id}/tc-ask` ⟵ tc-ask [cekim|muhasebe]
- `PUT admin/settings/tc` ⟵ tcset · `PUT admin/settings/wdfee` ⟵ wdfee · `PUT admin/settings/egp` ⟵ egpset [cekim]
- `GET admin/ledger`, `GET admin/reports/*` [muhasebe]
- Existing `api/ayarlar.php`, `api/test.php`, `kurulum`, `giris`, `cikis` ⟵ entsetup, entlogin, entsave, entbase, ent-test, ent-logout. They're switched to the unified staff session with [muhasebe|odeme]. The separate "API şifresi" goes away.

**P4: exchange (borsa) and EP**
- `GET exchange` · `POST exchange/orders` ⟵ exorder · `POST exchange/offers` ⟵ exoffer · `POST exchange/offers/{id}/cancel` ⟵ of-cancel (owner or [borsa])
- `PUT exchange/orders/{id}/fields` ⟵ exfix · `POST exchange/orders/{id}/ready` ⟵ ex-ready
- [borsa]: `POST admin/ex/orders/{id}/claim` ⟵ ex-claim · `…/pair` ⟵ ex-pair · `…/unpair` ⟵ ex-unpair · `…/unpair-all` ⟵ ex-unpair-all · `…/match` ⟵ ex-match
- [borsa]: `…/deliver {qty}` ⟵ exst, exdq, ex-done · `…/cancel` ⟵ ex-cancel · `…/call` ⟵ excall · `…/info` ⟵ exinfo
- [borsa]: `POST admin/ex/power` ⟵ ex-power (exShutdown) · `PUT admin/ex/switch` ⟵ ex-sw · `PUT admin/ex/offmsg` ⟵ exoffmsg
- [borsa_ayar]: `PUT admin/ex/markets` ⟵ exrates · `POST admin/ex/markets` ⟵ xradd, xr-add · `DELETE admin/ex/markets/{id}` ⟵ xr-del
- [borsa_ayar]: `PUT admin/ex/fields/{set}` ⟵ exfields · `POST admin/ex/fields/{set}` ⟵ ef-add · `DELETE …/{i}` ⟵ ef-del · `POST …/{i}/up` ⟵ ef-up
- `POST ep/orders` ⟵ epbuy (Idem) · `GET me/ep-orders`
- [ep]: `POST admin/ep/products` ⟵ epadd · `PUT admin/ep/products/{id}` ⟵ epprod (+codes) · `POST …/toggle` ⟵ ep-toggle · `DELETE …` ⟵ ep-del · `DELETE admin/ep/codes/{id}` ⟵ ep-cdel
- [ep]: `PUT admin/settings/hh` ⟵ hhset · `GET admin/ep/log`

**P5: ads, campaigns, VIP, referrals**
- `GET ads/availability?type&from` · `POST ads` ⟵ buyad · `POST ads/events` (beacon)
- [reklam]: `POST admin/ads/{id}/approve` ⟵ ad-ok · `…/reject` ⟵ adrej · `…/toggle` ⟵ ad-toggle · `…/extend` ⟵ ad-ext · `DELETE admin/ads/{id}` ⟵ ad-del
- [reklam]: `POST admin/ads/{id}/media` ⟵ admediaadd · `DELETE …/media` ⟵ ad-media-clear · `PUT admin/packs` ⟵ packs
- [reklam]: `POST admin/slides` ⟵ slideadd · `…/toggle` ⟵ slide-toggle · `DELETE` ⟵ slide-del · `POST …/media` ⟵ slidemedia · `DELETE …/media` ⟵ slide-clear
- `POST spin` ⟵ spin · `POST raffles/{id}/free-ticket` ⟵ free-tk
- [kampanya]: `POST admin/raffles` ⟵ raffle · `POST admin/raffles/{id}/draw` ⟵ draw · `DELETE admin/raffles/{id}` ⟵ r-del · `POST admin/spins/reset` ⟵ spin-reset · `PUT admin/settings/wheel` ⟵ wheelon
- [vip]: `PUT admin/vip` ⟵ vipset (vip-add and vip-del edit locally, then save) · `PUT admin/settings/referral` ⟵ refset
- [uye]: `POST admin/winback` ⟵ winback

**P6: support, DMs, notifications, mail/SMS**
- `GET support/ticket` · `POST support/messages` ⟵ ls, ls-q, lsord, lsimg, order-support · `POST support/escalate` ⟵ ls-agent · `POST support/rate` ⟵ tk-rate
- [destek]: `GET admin/tickets?f` · `POST admin/tickets/{id}/claim` ⟵ tk-claim · `…/reply` ⟵ tkreply · `…/close` ⟵ tk-close · `…/transfer` ⟵ tkxfer · `…/ai-draft` ⟵ tk-ai (optional) · `PUT admin/settings/support` ⟵ supportset
- `GET dm` · `GET dm/{peer}` · `POST dm/{peer}` ⟵ dm
- [mesaj]: `GET admin/flagged` · `POST admin/flagged/{id}/seen` ⟵ fl-seen · `POST admin/flagged/seen-all` ⟵ fl-seen-all
- `POST sms/user/{id}` ⟵ smsuser (paid; free with [uye])
- [sms]: `PUT admin/templates/{k}` ⟵ tplsave · `DELETE admin/templates/{k}` ⟵ tpldef · `PUT admin/settings/mail` ⟵ mailset · `PUT admin/settings/sms` ⟵ smsset · `POST admin/mail/test` ⟵ mailtest · `POST admin/sms/test` ⟵ smstest · `GET admin/outbox?ch`

**P7: remaining admin, maintenance**
- [seo]: `PUT admin/settings/seo` ⟵ seoset · `PUT admin/settings/tags` ⟵ adsset
- [seo]: `POST admin/posts` ⟵ postadd · `PUT admin/posts/{id}` ⟵ postsave · `DELETE` ⟵ post-del
- [seo]: `POST admin/backlinks` ⟵ bladd · `PUT admin/backlinks/{id}` ⟵ blst · `DELETE` ⟵ bl-del
- `POST partner-apps` ⟵ papply (public, rate-limited) · `POST admin/partner-apps/{id}/approve` ⟵ pa-ok [seo] · `…/reject` ⟵ pa-no [seo]
- [ayar]: `PUT admin/settings/etbis` ⟵ etbisset, etbispaste · `POST admin/settings/etbis/img` ⟵ etbisimg · `DELETE` ⟵ etbis-img-del
- [ayar]: `PUT admin/settings/site` ⟵ settings · `PUT admin/settings/golive` ⟵ golive (demo_mode; gated)
- [bakim]: `PUT admin/settings/maint` ⟵ maintset · `POST admin/backups` ⟵ bk-now · `GET admin/backups` · `GET admin/backups/{id}/download` ⟵ bk-dl · `DELETE` ⟵ bk-del
- [bakim]: `POST admin/backups/{id}/restore` ⟵ bk-restore (admin only, maintenance mode, takes a pre-restore backup) · `POST admin/backups/upload` ⟵ bkfile (admin only) · `PUT admin/settings/backup` ⟵ bkauto · `POST admin/update` ⟵ safe-update (backup, then migrate, inside maintenance mode)
- `ACT.reset` exists in demo only. `GET /widget/yang?server=` is public (vWidget).

Totals: about 95 mutating ACT keys, 80 mutating FORM keys and 14 mutating CHG keys map to about 150 endpoints.

## 5. Phases (each one can be installed as a demo on `test.yangpazar.com`, a cPanel subdomain with its own DB)

**P0a: split and build (S).**
- Scope: §2.1, `tools/build.php`, Playwright golden snapshots, an `ACT`/`FORM`/`CHG` registry per domain.
- Test: snapshot diff is identical; `--single` output works as a file:// demo.
- Owner sees: the same site, now made of separate files (no visible change).

**P0b: installer, DB, auth, staff (L).**
- Tables: system, users, wallets, user_ibans, auth_challenges, notifications, audit_log, settings, outbox.
- Wizard steps:
  1. Environment check: PHP ≥8.1, pdo_mysql, sodium/openssl, curl, gd, mbstring, zip; writable `storage/` and `uploads/`; upload_max_filesize and memory_limit shown with the cPanel "MultiPHP INI" hint.
  2. DB host/name/user/pass (created with the cPanel MySQL Wizard). Test the connection, then show the version and charset.
  3. Create tables.
  4. Site name and https URL.
  5. Admin account: username, email, password of at least 10 characters, 2FA by email.
  6. Optional demo data.
  7. Copy-ready cron command and PayTR notification URL, then self-lock. The one-time install code from the zip is kept (as in the existing `kurulum.php`). DB credentials go into `storage/db.php` encrypted with `yp_store_write`.
- Endpoints: P0 list. The SMTP mailer and NetGSM adapter ship now because 2FA needs them; settings can be edited through `mailset`/`smsset`, pulled forward from P6.
- Frontend: `05-api.js`, boot adapter, loginf, registerf, tfaf, tfa-*, profile, iban*, n-*, staff*, u-ver, u-ban, user-open; switcher and seed removed in prod.
- Tests:
  - PHP unit tests on SQLite.
  - HTTP tests through `php -S` with `PHP_CLI_SERVER_WORKERS=4` and a router script.
  - Playwright: register two users, login with 2FA (email OTP read from the outbox table through a test-only endpoint), staff perm denial matrix (a staffer without a perm gets 403 on each admin route), CSRF missing gives 403, cross-origin gives 403, session invalidated after a ban.
- Owner sees: real install on the host, real accounts, an admin panel only he can enter, creating staff with perms, 2FA codes by email.

**P1: catalog and SEO (M).**
- Tables: servers, listings, media, listing_media, covers (+bounties?).
- Frontend: vHome, vM2, vServer, vCategory, vListing, vSell and qSug use `need()`; sell, editl, unlist, free-bump, l-ok, l-del, mod, cover*, srv*; upload-first.
- Dopings are disabled until P2 with the tooltip "yakında".
- SSR meta, sitemap and robots; `.htaccess` clean URLs (pathToRoute/routeToPath unchanged).
- Tests:
  - Two browser contexts: A creates a listing with 3 images, B searches, filters and opens it, the view count goes up.
  - Moderation on: the listing is hidden until staff approve it.
  - Upload attacks: PHP disguised as JPG, SVG with script, oversize file. All are rejected.
  - Pagination and keyset correctness.
  - Lighthouse-style check that meta tags appear in raw HTML.
- Owner sees: live listings shared between all visitors, Google-readable pages.

**P2: money core (L, critical).**
- Tables: accounts, journal, postings, deposits, coupons, coupon_uses, gateways, banks, crypto_nets, orders, order_*, points_log.
- Cron: auto-confirm, deposit expiry, invariant check.
- Frontend: every P2 key, `mDeposit`/`mPaytr` (real iframe, then poll `deposits/{oid}`), `mBuy`, `vOrder`; `autoConfirm()` removed from `render`.
- Tests:
  - Ledger property tests: random operation sequences keep sums at 0 and wallets equal to postings.
  - Concurrency with `curl_multi`: 20 parallel buys on stock=1 give exactly 1 order. Parallel buys exceeding the balance never go negative. Five PayTR callback replays credit once. A wrong hash or amount gives no credit.
  - PayTR test mode end to end on staging with the PayTR test card.
  - Two-context Playwright: buyer buys; seller (polling) sees "satıldı", marks ready and delivers with proofs; buyer confirms; seller balance is up by net; commission shows in admin muhasebe. Dispute, then staff resolves both ways. Guarantee refund. Auto-confirm with the clock moved forward (test hook `YP_TEST_NOW`). Coupon single use. Card-funded credit can't be withdrawn.
- Owner sees: real PayTR test payments loading balance, a full escrow sale between two accounts, the ledger.

**P3: withdrawals and accounting (M-L).**
- Tables: withdrawals, doc_sequences, accounting_jobs; TC columns.
- Work: NVİ port; `cekim_onayla.php` logic becomes a service; Paraşüt and Bizim Hesap through the job queue; hakediş cron reads deposits; Excel exports fed from `admin/reports`; `muhasebe` views on journal.
- Tests:
  - TC uniqueness by HMAC; masked everywhere except the e-Gider endpoints (DOM scan as a member for `/gider|pusula|VUK|ETTN/i`, per R9).
  - Parallel withdrawals exceeding cash: only the valid one passes. Approve twice gives one number. Numbering stays sequential with no gaps under parallel approvals.
  - Parity test of `wdBreakdown` against JS. Accounting job retry when the service mock is down.
- Owner sees: a member withdraws, the admin approves, the e-Gider document gets its number, Paraşüt test record.

**P4: exchange and EP (L).**
- Tables: ex_*, ep_*.
- Tests:
  - Parity tests for exQuote, exApplyFills, exDeliver, exFinish and exCancelOrder on fixtures.
  - Parallel EP buys on the last code: one gets it, the other gets "tükendi".
  - Secrets are encrypted at rest, revealed only to [borsa] with an audit row, and NULL after finish.
  - exShutdown refunds everyone (sum check).
  - Three contexts: buyer, seller offer, operator.
- Owner sees: real exchange operations and instant EP code sales.

**P5: growth (M).**
- Ads with the calendar lock, approve-then-revenue flow, media and beacon stats; slides; raffles, wheel and free ticket; VIP, referral, winback.
- Tests: parallel bookings of the same slot give one winner; spin twice a day is rejected; the draw is audited and reproducible from its snapshot; referral pays once.
- Owner sees: server owners buying ad slots, campaigns running.

**P6: communication (M).**
- Support tickets with staff console, canned replies, transfer and rating; server-side `botReply` (4527); DMs with `censor` and flagging; mail/SMS queue with throttling, templates (`TPLK`, `SMSDEF`) and logs; paid user SMS.
- Tests: two contexts chat with polling under 10 s; hidden-tab backoff; outbox sends no more than the hourly limit (fake transport); 2FA mail goes out even when the queue is full.
- Owner sees: live chat between a customer and staff, real emails and SMS.

**P7: remaining admin (M).**
- SEO, rehber, backlinks/partners, ETBİS, site settings, maintenance mode (server-enforced, panel bypass), backups and restore, update with migrations, go-live checklist rewritten (§8), Entegrasyonlar unified.
- Tests: restore drill on staging (dump, wipe, restore, invariant check); maintenance mode blocks member POSTs.
- Owner sees: the whole panel working from the server.

**P8: hardening and go-live (M).**
- CSP with nonce; security review (authorization on every route, IDOR tests that walk other users' ids); KVKK texts; rate-limit tuning.
- `/kurulum/selftest` (admin only) runs the concurrency and parity suite against **real MariaDB** with a temp prefix.
- Load test with `npx autocannon` locally and a light run on staging (about 30 concurrent pollers plus 5 buyers; watch the LVE stats in cPanel "Resource Usage").
- Remove demo data; set up the backup and cron checklist; a "soft launch" with per-user withdrawal caps.
- Owner sees: the go-live checklist all green.

## 6. Risks (technical)
- **CloudLinux limits (entry processes, memory, I/O):** short polling only, `session_write_close()`, gzip, cache headers on boot slices, about 1 query per poll.
- **Shared MariaDB might not be 10.6:** detect the version. Without `SKIP LOCKED`, use plain FOR UPDATE; the EP lock has a short scope.
- **Email limits:** queue plus throttling, OTP prioritized. Recommend an external SMTP service (Brevo/Mailjet) if the host limit is under 200/h.
- **10 GB disk:** delivery videos up to 60 MB. Retention cron plus a per-user quota; backups capped.
- **Regressions in a 9k-line single-page app:** split first with snapshots; one domain per phase; S shapes unchanged.
- **The PayTR notification URL must stay** `/api/paytr_bildirim.php`. In test mode, credit only if the site is in test mode or on staging.
- **Client clock:** `SKEW` from boot.
- **SQLite and MariaDB differ** in locks and strictness: dialect wrapper, strict SQL mode, and the P8 self-test on the real DB.

## 7. Owner decisions (Sahibin kararları)
1. **Hosting limitleri:** Hosting firmanıza şunları sorun: saatte kaç e-posta gönderilebiliyor, cron en sık kaç dakikada bir çalışabiliyor, en büyük dosya yükleme sınırı nedir, MariaDB sürümü nedir?
2. **E-posta ve SMS:** E-postalar hostingin kendi sunucusundan mı gitsin, yoksa Brevo/Mailjet gibi bir servisten mi? SMS için NetGSM kullanılacak mı? SMS başlığı (YANGPAZAR) onaylı mı?
3. **Çekilebilir bakiye kuralı:** Kart veya cüzdanla yüklenen bakiye çekilemesin, sadece EFT ile yüklenen ve satıştan gelen bakiye çekilebilsin (bugünkü kural). Devam mı?
4. **Teslim kanıtları:** Ekran görüntüsü ve videolar kaç gün saklansın (öneri: 90 gün)? Disk sınırlı.
5. **2 adımlı doğrulama:** Yönetici ve para işi yapan çalışanlar için zorunlu olsun mu (öneri: evet)? Üyelikte e-posta doğrulaması istensin mi?
6. **Çekiliş ve şans çarkı:** Türkiye'de alışverişe bağlı çekilişler Milli Piyango İdaresi iznine tabi olabilir. Hukukçuya danışılana kadar kapalı açılması önerilir.
7. **Borsa'da oyun hesabı şifresi:** Satıcıdan oyun hesabı şifresi almak en riskli konu (şifreler şifrelenip işlem bitince silinecek). Bu yöntem devam mı, yoksa "karakter adına ticaret" ile mi yapılsın?
8. **Mali müşavir onayı:** Stopaj oranı, e-Gider Pusulası seri/numara biçimi ve Paraşüt/Bizim Hesap kayıt şekli için.
9. **Canlı destek yapay zekâsı:** Kapalı mı kalsın (hazır cevaplı bot), yoksa ücretli bir yapay zekâ servisi mi bağlansın?
10. **Demo ve açılış:** Demo için ayrı bir adres (demo.yangpazar.com) istenir mi? Gerçek paraya geçişte ilk hafta günlük çekim üst sınırı konsun mu?

## 8. Parallel work split
- **Prerequisite (one agent): P0a.** Its output is the domain file map and append-only registries:
  - `app/schema/NN_*.php`, `app/routes/*.php` and `app/presenters/*.php`, loaded by glob
  - `js/80-act-<domain>.js`, `js/81-form-<domain>.js`, `js/82-chg-<domain>.js` registering with `Object.assign`
  - perm map entries per routes file
- That makes the single `index.html` stop being a merge bottleneck.
- Core owner (one agent, serial): `Db`, `Auth`, `Ledger`, `Idem`, `Media`, `Notify`, `05-api.js`, `01-state.js`, `95-router.js` (`need()`). Others consume these and don't edit them; changes go through this agent.
- **Per phase, run in parallel:**
  - P0b: (a) installer and packaging, (b) auth and 2FA plus mailer and SMS adapters, (c) staff, users and perms tests.
  - P1: (a) listings API and search, (b) media service, (c) SEO SSR, sitemap and .htaccess, (d) frontend `act-catalog`/`form-catalog` and views using `need()`.
  - P2: (a) ledger and wallet plus property tests, (b) orders service, (c) deposits and PayTR callback, (d) admin payments CRUD (gateways, banks, crypto nets, coupons), (e) frontend order and deposit handlers. (a) must land before (b)–(d) merge.
  - P3: (a) TC/NVİ, (b) withdrawals and e-Gider numbering, (c) accounting jobs and hakediş, (d) reports API and the muhasebe frontend.
  - P4: (a) exchange service and parity tests, (b) EP service, (c) the two frontends.
  - P5–P7: one agent per domain (ads, campaigns, VIP/referral, support, DM/flagged, outbox/templates, SEO/posts/backlinks, ETBİS/settings, backups/maintenance). The domains don't share files.
- **Test infrastructure (one agent, from P0b on):** `tests/run.php` (no PHPUnit), SQLite fixtures, the `YP_TEST_NOW` and outbox test hooks (compiled out in prod builds), Playwright multi-context helpers, the `curl_multi` concurrency harness, and the JS↔PHP parity runner.

---

## Özet (Türkçe)

Planı yazdım ama istenen yola kaydedemedim: bu oturum salt okunur, dosya ve klasör oluşturmak engelli. Tam metin yukarıda; `/tmp/claude-0/-home-user-YAZILIM/c5402d75-b547-55b7-842f-b0b270529f25/scratchpad/realsite/PLAN.md` dosyasına olduğu gibi kaydedilmesi gerekiyor.

**Mevcut durum:** Para ve güven kuralları tarayıcıda çalışıyor (`doBuy` 7760, `complete` 7792, `refund` 7804, borsa motoru 3604–3647, çekim ve e-Gider 2261–2502). `render()` (8835) içindeki `autoConfirm()` yüzünden siparişleri herhangi bir ziyaretçinin tarayıcısı onaylıyor. `paytr_bildirim.php` hash'i doğruluyor ama kimsenin bakiyesine para yazmıyor. Dosyanın yaklaşık 190 KB'ı canlıda gereksiz: 109 KB gömülü PHP paketi (4701–7503) ve 78 KB demo verisi.

**Mimari:** Mevcut `api/` paketinin kalıpları (oturum, CSRF, köken kontrolü, hız sınırı, şifreleme, PayTR) aynen kullanılıyor. Üzerine PDO veri katmanı geliyor: canlıda MariaDB, testlerde SQLite, çünkü bu ortamda MySQL kurulu değil. Tutarlar kuruş cinsinden tamsayı tutuluyor. Çift taraflı defter, mevcut "çekilebilir bakiye" ve "sadece alışveriş bakiyesi" ayrımını koruyor. Para işlemlerinde satır kilidi ve tekrar korumalı istek anahtarı var. Dosyalar diske yükleniyor, veritabanına base64 yazılmıyor. Sohbet ve bildirimler kısa aralıklı yoklamayla güncelleniyor (CloudLinux'un eşzamanlı işlem sınırı yüzünden). 5 dakikalık cron otomatik onay, e-posta/SMS kuyruğu, yedek ve defter tutarlılık kontrolünü yapıyor. TC numarası şifreli ve maskeli, her görüntüleme kayıt altında.

**Ön yüz:** İlk adım `index.html`'i davranışı değiştirmeden ayrı dosyalara bölmek. Ekran görüntüsü karşılaştırmasıyla doğrulanacak; bu sayede birden fazla ajan aynı anda çalışabilir. Sonra `S` sunucudan dolan bir önbelleğe dönüşüyor ve her kayıt işlemi küçük bir API çağrısına iniyor (`confirm` örneği planda). Ekranlar ve HTML değişmiyor.

**Kurulum:** cPanel'de veritabanı açıldıktan sonra web sihirbazıyla: bilgiler girilir, tablolar kurulur, yönetici hesabı oluşturulur.

**Aşamalar (her biri test sitesinde sahibe gösterilebilir):**
- P0a dosyayı bölme
- P0b kurulum, giriş ve çalışan yetkileri
- P1 ilanlar ve SEO
- P2 bakiye, havuzlu sipariş ve PayTR
- P3 çekim, TC ve e-Gider
- P4 borsa ve EP
- P5 reklam ve kampanyalar
- P6 destek, mesajlar, e-posta/SMS
- P7 kalan yönetim ekranları ve yedekler
- P8 güvenlik, gerçek MariaDB'de öz-test ve yayına alma

Sahibin kararları ayrı bölümde, sade Türkçe. En önemlileri: çekiliş mevzuatı (Milli Piyango izni), borsada oyun hesabı şifresi alınması, hostingin e-posta limiti ve mali müşavir onayı.

### Critical Files for Implementation
- /home/user/YAZILIM/index.html (ACT 7821–8000, FORM 8007–8201, CHG 8204–8262, permission wrappers 8956–8970, money logic 2044–2071, 7699–7820, exchange 3604–3647)
- /home/user/YAZILIM/api/_lib.php
- /home/user/YAZILIM/api/paytr_bildirim.php
- /home/user/YAZILIM/api/cekim_onayla.php
- /home/user/YAZILIM/api/kurulum.php
## 9. Sahibin verdiği kararlar (2026-11-10)
1. **2 adımlı doğrulama:** Yönetici ve para yetkili çalışanlar için ZORUNLU DEĞİL, isteğe bağlı (her kullanıcı kendisi açar). Panelde açık olmayan yetkili hesaplar için uyarı gösterilebilir ama giriş engellenmez.
2. **E-posta gönderimi:** Baştan Brevo/Mailjet gibi harici bir SMTP/API servisi. P0b'de mailer, sağlayıcı seçimli (Brevo API, Mailjet API, genel SMTP) ve ayarları Entegrasyonlar sayfasından girilebilir olmalı; hosting `mail()` yalnız yedek.
3. **Çekiliş ve şans çarkı:** Gerçek sürümde AÇIK başlayacak (hukuki risk sahibe ait; panelden kapatılabilir kalmalı).
4. **Borsa oyun hesabı şifresi:** Devam — şifreli saklama, yalnız `borsa` yetkilisine gösterim, her gösterim audit, işlem bitince (ve 7 gün güvenlik ağıyla) silinir.
Henüz bekleyenler: hosting limitleri (e-posta/saat, cron sıklığı, yükleme sınırı, MariaDB sürümü), SMS sağlayıcısı, teslim kanıtı saklama süresi, mali müşavir onayı, canlı destek yapay zekâsı, demo adresi ve açılış haftası çekim sınırı.

## 10. PayTR en sona (sahip kararı, 2026-11-11)
PayTR mağaza başvurusu "satışa hazır" site istediği için PayTR en son bağlanacak.
- P2'de PayTR akışı yazılır ve sahte bildirimlerle test edilir; PayTR ayarı yoksa kart/PayTR seçenekleri üyelere gösterilmez.
- Test sitesinde bakiye, manuel havale/EFT yüklemesi (yönetici onaylı) veya yönetici bakiye düzeltmesiyle yüklenir; havuzlu satış akışı uçtan uca böyle denenir.
- PayTR başvurusundan önce hazır olması gerekenler (P7/P8'de tamamlanacak): SSL, KVKK aydınlatma metni, mesafeli satış sözleşmesi, iade/iptal koşulları, gizlilik politikası, hakkımızda/iletişim (şirket unvanı, adres, VKN/MERSİS, telefon, e-posta), ETBİS kaydı ve rozeti, çalışan ürün/ilan sayfaları ve sepet/ödeme akışı.
