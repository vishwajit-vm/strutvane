# Naming availability checks — raw output (2026-11-13)

> Rounds 1–3 were for the abandoned working name "Mortarkit". Rounds 4–6 led to the selected brand **Strutvane**.

**Endpoints used:**

- npm package: `GET https://registry.npmjs.org/<name>` → 404 = no such package
- npm scope: `GET https://registry.npmjs.org/-/org/<name>/package` → 404 = no org/user scope with packages. A 429 means rate-limited (rechecked later). The npmjs.com website returns 403 to scripted requests, so it was not used.
- GitHub owner: `gh api users/<name>` → 404 = no user/org
- `.com`: `https://rdap.verisign.com/com/v1/domain/<name>.com` → 404 = not registered
- `.dev`: `https://pubapi.registry.google/rdap/domain/<name>.dev`
- `.io` / `.sh`: `https://rdap.identitydigital.services/rdap/domain/<name>.io`
- `.org`: `https://rdap.publicinterestregistry.org/rdap/domain/<name>.org`

## Round 1 — single words and coined words (scope column partially rate-limited)

```
name          npmPkg  npmScope ghUser
ashlar        200     200     taken
quoin         404     200     taken
mortise       200     200     taken
tenon         200     200     taken
plinth        200     200     taken
lintel        200     200     taken
corbel        200     200     taken
joist         200     200     taken
transom       200     200     taken
mullion       200     200     taken
purlin        200     429     taken
hewn          200     429     taken
keelstack     404     429     taken
stratakit     200     429     taken
lattix        200     429     taken
ferrule       404     429     taken
voussoir      404     429     taken
cornice       404     429     taken
joinery       200     429     taken
oriel         200     429     taken
stoa          200     429     taken
tessera       200     429     taken
keystack      404     429     taken
corvane       404     429     taken
zenlith       404     429     taken
vantrix       404     429     taken
kilnstack     404     404     free
korvel        404     404     taken
vaultic       404     200     taken
lintra        404     404     taken
stratiq       404     404     taken
arcwright     404     200     taken
stackwright   200     200     taken
framewright   200     404     taken
codewright    200     200     taken
stonewright   404     404     taken
brixel        200     200     taken
```

## Round 2 — compounds, throttled (no rate limiting), with domains

```
name         npm    scope  gh     com      dev
quoinkit     404    404    free   404      404
ashlarkit    404    404    free   404      404
hewnkit      404    404    free   404      404
mortarkit    404    404    free   404      404
plinthkit    404    404    free   200      404
corbelkit    404    404    free   404      404
joistkit     404    404    free   404      404
lintelkit    404    404    free   200      404
keelform     404    404    free   200      404
quarrystack  404    404    free   200      404
kilnstack    404    404    free   200      404
hewnstack    404    404    free   404      404
mortarstack  404    404    free   200      404
keelwork     404    200    free   200      200
joinwright   404    404    free   200      404
kilnkit      404    404    taken  200      404
lintra       404    404    taken  200      200
korvel       404    404    taken  200      404
stratiq      404    404    taken  200      200
stonewright  404    404    taken  200      404
tesselkit    404    404    free   404      404
```

## Round 3 — finalists

```
hewnkit   repos:0 code:4   io:404 sh:404 org:404 npmSearch:[]
mortarkit repos:1 code:121 io:404 sh:404 org:404 npmSearch:[]
ashlarkit repos:0 code:1   io:404 sh:404 org:404 npmSearch:[]
joistkit  repos:0 code:1   io:404 sh:404 org:404 npmSearch:[]
hewnstack repos:0 code:1   io:404 sh:404 org:404 npmSearch:[]

unscoped hewn:   "A CLI for creating new projects"
unscoped mortar: "Mortar ======"  (last modified 2022-06-20)
unscoped joist:  "A light workflow to reuse and separate logic pieces..."
unscoped ashlar: "Terminal UI framework for Solid 2.0 ..."

mkit: 200 (maxmertkit package manager) · mortarjs: 200 · mortarkit-cli: 404 · create-mortarkit: 404
```

The 121 GitHub code hits for "mortarkit" are Guild Wars 2 tooling that references the in-game "Mortar Kit" engineer skill: `Zerthox/gw2-rotation-planner`, `MINIONBOTS/SkillManager_Addon`, and an expired-domain list from 2017.

## Re-run script (bash; needs curl and an authenticated gh)

```bash
for n in mortarkit; do
  p=$(curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/$n)
  sleep 2; o=$(curl -s -o /dev/null -w "%{http_code}" https://registry.npmjs.org/-/org/$n/package)
  g=$(gh api users/$n --silent >/dev/null 2>&1 && echo taken || echo free)
  c=$(curl -s -o /dev/null -w "%{http_code}" https://rdap.verisign.com/com/v1/domain/$n.com)
  d=$(curl -s -o /dev/null -w "%{http_code}" https://pubapi.registry.google/rdap/domain/$n.dev)
  echo "$n npm:$p scope:$o gh:$g com:$c dev:$d"
done
```

---

## Round 4 — themed product words (unscoped npm descriptions)

```
gatehouse  | "Drop-in RBAC for Next.js. 5 lines to working permissions." | modified 2026-03-29  ← same niche
groundwork | "Scaffold out any project quickly"                          | modified 2023-02-17
quarry     | "RESTful database abstraction application"                  | modified 2026-09-05  ← same niche
rampart    | "Authorization module for Node.js."                         | modified 2022-06-25  ← same niche
drawbridge | "User authentication, waiting lists, and invitations for…"  | modified 2022-06-15  ← same niche
barbican   | "CLI harness for testing RBAC and tenant isolation in mu…"  | modified 2026-10-03  ← same niche
portcullis | "portreserve utilities"                                     | modified 2022-06-24
```

## Round 5 — coined "-iq" per-package family

```
sentoriq npm:404 scope:404 gh:free repos:0 code:2   com:200 dev:404   ← web: SENTRIQS (security co.)
facadiq  npm:404 scope:404 gh:free repos:0 code:5   com:200 dev:404
strutiq  npm:404 scope:404 gh:free repos:1 code:14  com:404 dev:404   ← web: StructIQ (BIM plug-in)
gardiq   (854 code hits: Crowcon "Xgard IQ" gas detector firmware)
vistriq  (1 active personal repo rajy75446-ai/Vistriq)
```

## Round 6 — coined umbrella brands (strict)

```
name       npm  scope ghUsr repos code  com  dev
keldara    404  404   taken 0     1248  200  404
vellora    200  200   taken 207   3168  200  200
arkavel    404  404   free  0     1238  200  404
brikvel    404  404   free  0     14    404  404
lithavel   404  404   free  0     6     404  404
cendrel    404  404   free  7     1150  200  404
morvane    404  404   taken 37    1376  200  200
bricora    404  404   free  16    1686  200  404
tessavel   404  404   free  1     136   200  404
strovel    404  404   free  1     814   200  404
fortavel   404  404   free  0     20576 200  404
calvexa    404  404   taken 1     55    200  200
lithara    404  404   taken 4     44480 200  404
stonara    404  404   free  0     315   200  404
quarvel    404  404   taken 0     57    200  404
tervane    404  404   taken 5     974   200  200
solvane    404  200   taken 40    1908  200  200
aurelith   404  404   taken 24    1168  200  404
brixora    404  404   free  6     66    200  404
kestrova   404  200   free  2     231   200  404
velmora    200  404   taken 472   4472  200  200
gatrova    404  404   free  0     73    404  404
strutvane  404  404   free  0     0     404  404   ← SELECTED

strutvane extra: io:404 org:404 sh:404 · create-strutvane:404 · strutvane-cli:404
Web search "Strutvane": no page uses the term.
```
