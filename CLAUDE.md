# Aster Valion — Fichas de Personaje D&D

Character-sheet + GM-tool web app for a live D&D 2024 (5.5e) tabletop group, deployed on AWS EC2.

## Architecture

- **Frontend**: single file, `public/index.html` — all HTML/CSS/JS inline, no build step, no framework.
- **Backend**: `server/index.js` + `server/db.js` — Express + better-sqlite3, exposes generic key-value REST endpoints.
  - All character/session data goes through `/api/shared/:key` (global, no auth) via the JS helpers `sharedGet(key)` / `sharedSet(key, value)` / `sharedDelete(key)`.
  - The older cookie-scoped `/api/kv/:key` + `client_id` system is deprecated — do not resurrect it (it caused a real data-fragmentation bug earlier: different browser tabs got different `client_id` cookies, so "the same" character silently forked into multiple copies).
- **Deployment**: GitHub repo `https://github.com/gasperiniricardo-ai/DnD_live.git` → GitHub Actions (`.github/workflows/deploy.yml`, uses `appleboy/ssh-action`) → on every push to `main`, SSHes into the EC2 box and runs `deploy/redeploy.sh` (git pull + pm2). No server process restart is needed for a `public/index.html`-only change (Express reads it fresh per request); a restart matters only for server-side JS changes.
  - EC2 instance: Amazon Linux 2023, IP `13.60.18.160`, user `ec2-user`, SSH key at `C:\Users\peopl\Downloads\dnd_live.pem`.
  - Nginx reverse-proxies port 80 → 3000; PM2 manages the node process.

## Mandatory pre-deploy validation

Before every `git push` to `main`, validate JS syntax remotely (this repo has no local Node install to check with):

```bash
scp -i "/c/Users/peopl/Downloads/dnd_live.pem" "/c/Users/peopl/Downloads/aster-app/aster-app/public/index.html" ec2-user@13.60.18.160:~/index_check.html
ssh -i "/c/Users/peopl/Downloads/dnd_live.pem" ec2-user@13.60.18.160 "node -e \"const fs=require('fs'); const c=fs.readFileSync('index_check.html','utf8'); const m=c.match(/<script>([\s\S]*)<\/script>/); fs.writeFileSync('extracted.js', m[1]);\" && node --check extracted.js && echo SYNTAX_OK"
```
Only commit/push after `SYNTAX_OK`. After pushing, poll `ssh ... "cd ~/aster-app && git log --oneline -1"` until it shows the new commit, then verify the actual feature in-browser (not just syntax) — this app has no automated test suite.

## Rules-accuracy discipline (hard-learned this session)

**Never implement a D&D 2024 rule from memory/training data alone — verify it against a live source first** (aidedd.org, 5e24srd.com, dndbeyond.com, or the official PHB). This session had two real mistakes from trusting memory: the prepared-spell-count formula (used the 2014 "level + ability mod" formula when 2024 replaced it with a fixed per-level table) and an unverified Channel Divinity assumption. When a class table looks odd or a fetched result seems internally inconsistent (e.g., grouped level ranges, a "0" that contradicts another already-verified table), cross-check with a second independent source before trusting it — don't just take the first result.

## Key data-model conventions in `public/index.html`

- **`migrateCharacter(c)`** — the single source of truth for default-field migration on old character data. Called from `openCharacter`, `joinSessionWith`, and the backup-restore handler. If you add a new character field, add its default here ONCE — don't duplicate the migration block per call site (that duplication caused real bugs earlier in the project).
- **`character.domainSpellIds`**: `[{id, source:{es,en}}]` — marks specific prepared spells as always-prepared-for-free from a class feature (Cleric Divine Domain spells, Paladin Sacred Oath spells, Sorcerer subclass spells, etc.). These are excluded from the prepared-spell-limit count (`countsAgainstPrepLimit`) and get a "Siempre preparado (gratis) — <source>" badge in the prepared list. To grant a character free subclass spells: push the spell id into both `preparedSpellIds` and `domainSpellIds`.
- **`character.channelDivinityUsed`** + `channelDivinityMax()` / `channelDivinityOptions()` — shared Channel Divinity mechanic for Cleric and Paladin (2024 rules: Paladin's old separate "Divine Sense" pool was folded into Channel Divinity, so the standalone `divine-sense-card` is now permanently hidden). Domain/Oath-specific CD options are **auto-discovered**: any trait whose `es.name` starts with the literal prefix `"Conjurar la Divinidad:"` is automatically listed as an available option — that's the convention to follow when adding a new subclass CD feature (e.g. Roderick's "Conjurar la Divinidad: Golpe Certero (Guided Strike)").
- **Prepared/known spell limits** (`preparedLimitForLevel`, `cantripLimitForClass`, `currentPreparedLimit`) — use the *official fixed 2024 PHB tables* per class, not a formula:
  - `PREP_TABLE_CLERIC_DRUID`, `PREP_TABLE_WIZARD`, `PREP_TABLE_HALF_CASTER` (Paladin/Artificer) — prepared-caster tables.
  - `KNOWN_CASTER_TABLES` (Bard/Ranger/Sorcerer/Warlock) — known-caster tables, cantrips + spells, separately capped.
- **Spell slots** (`slotCountsForCharacter`) — `FULL_CASTER_SLOT_TABLE` (Bard/Cleric/Druid/Sorcerer/Wizard, levels 1-9) vs `slotTable` (half-casters: Paladin/Ranger/Artificer) vs `PACT_SLOT_TABLE` (Warlock Pact Magic, recharges on short rest — the only slot pool that does).
- **`normalizeText(str)`** — accent-insensitive lowercase compare (`\p{Diacritic}` regex). Use this instead of raw `.toLowerCase()` for any new search/filter feature.
- **`char_backup_<id>`** shared key — a snapshot taken every time a character is opened (before that sitting's edits happen), restorable via the "↺ Restaurar copia" button (double-tap confirm pattern) in the sheet header. This is a "revert tonight's session" safety net, not full version history.
- **Preset characters** (`PRESET_CHARACTERS` array + `ensurePresetCharacters()`) only seed a character **if it doesn't already exist** in `charIndex`. All 4 real characters (see below) already exist server-side, so editing the `PRESET_CHARACTERS` builder function has **no effect on the live data** — to fix/extend an existing character you must patch its `char_data_<id>` record directly (fetch via `sharedGet`, mutate, `sharedSet` back), same as any live rules correction.
- Double-tap confirm UI pattern (delete character, restore backup): first click adds a `.confirm` class + swaps button text, second click within ~2.5s performs the action. When testing this via automated tools, remember the confirm window is real wall-clock time — a multi-step tool round-trip can outlast it.

## The 4 live characters (as of last edit)

All level 4, all real characters for an actual tabletop group — treat their live data with care (an earlier session accidentally overwrote Aster Valion's HP during testing with no way to recover the original value; be deliberate about test mutations on real character data, and always fetch bilingual snapshot from `sharedGet` before mutating so it's easy to compute an exact undo).

- **Roderick Thorn** "El Clérigo de la Moneda" — Human Variant Cleric, War Domain, Soldier background, deity Tymora. Has Channel Divinity: Guided Strike (War Domain), domain spells Divine Favor/Shield of Faith/Magic Weapon/Spiritual Weapon.
- **Walter Alzate** — Human Warlock level 4, custom "Haunted One" background (2014/Curse of Strahd flavor, not a 2024 standard background — kept as-is, intentional), patron The Great Old One. AC 16 (manual field). Has all 3 of his level-4 Eldritch Invocations (Armor of Shadows, Pact of the Blade, Agonizing Blast), the 2024 Great Old One level-3 features (Awakened Mind — bonus action version, Psychic Spells), his 3rd known Warlock cantrip (Toll the Dead), and his Human "Versatile" Origin feat (Magic Initiate — Wizard list: Prestidigitation/Message cantrips + Shield as an always-prepared spell, CHA-based). Only 1 of his 5 available known leveled-spell slots is filled (Dissonant Whispers) — flagged to the user 2026-07-30, not filled in since spell picks are a player choice.
- **Kael Zareth** — Tiefling Sorcerer level 4, demonic patron, subclass Draconic Sorcery (Fire affinity — chosen by Claude as a thematic fit with his demonic flavor, confirm with the user if they want a different damage type). Has **Draconic Resilience** (level-3 feature: +HP, unarmored AC = 10+DEX+CHA) but does **not** yet have **Elemental Affinity** (level-6 feature: fire resistance + Charisma bonus to one fire-damage roll) — these are two separate features on the official 2024 table, don't bundle them into one trait again. His `ac` field is a manually-entered value (not auto-computed from class features anywhere in this app) and is currently 14, not the computed 18 — flagged to the user 2026-07-29, not yet corrected since it may be intentionally manual.
- **Aster Valion** — Half-elf Paladin, Oath of Vengeance, Fighting Style: Dueling. Has Channel Divinity: Vow of Enmity, oath spells Bane/Hunter's Mark.

## Things NOT yet implemented (discussed with the user, not requested yet)

- Combat round counter on the GM dashboard.
- Custom/homebrew monster entries in the GM's mini-bestiary (currently a fixed 27-entry catalog).
- Backup/undo for GM session data itself (initiative tracker, party loot) — currently only character sheets have the restore-backup safety net.
- Multiclass support (spell slots / prepared limits currently assume a single class).
- Mass damage/heal application across multiple initiative-tracker entries at once (for AoE spells).
