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

## The 4 live characters (as of 2026-08-07)

All level 4, all real characters for an actual tabletop group — treat their live data with care (an earlier session accidentally overwrote Aster Valion's HP during testing with no way to recover the original value; be deliberate about test mutations on real character data, and always fetch a snapshot via `sharedGet` before mutating so it's easy to compute an exact undo). A full manual JSON backup of all 4 lives at `backups/characters_backup_20260730_111924.json` in the repo root (point-in-time snapshot, not auto-updating).

- **Roderick Thorn** "El Clérigo de la Moneda" — Human Variant Cleric, War Domain, Soldier background, deity Tymora. Has Channel Divinity: Guided Strike (War Domain), domain spells Divine Favor/Shield of Faith/Magic Weapon/Spiritual Weapon.
- **Walter Alzate** — Human Warlock level 4, custom "Haunted One" background (2014/Curse of Strahd flavor, not a 2024 standard background — kept as-is, intentional), patron The Great Old One. AC 16 (manual field, corrected from a stale value). Has all 3 of his level-4 Eldritch Invocations (Armor of Shadows, Pact of the Blade, Agonizing Blast), the 2024 Great Old One level-3 features (Awakened Mind — bonus action version, Psychic Spells), his 3rd known Warlock cantrip (Toll the Dead), and his Human "Versatile" Origin feat (Magic Initiate — Wizard list: Prestidigitation/Message cantrips + Shield as an always-prepared spell, CHA-based). His 5 known leveled spells are fully filled: Dissonant Whispers, Hex, Crown of Madness, Hold Person, Invisibility.
- **Kael Zareth** — Tiefling Sorcerer level 4, demonic patron, subclass Draconic Sorcery (Fire affinity). Has **Draconic Resilience** (level-3 feature: +HP, unarmored AC = 10+DEX+CHA = 18, corrected) but correctly does **not** yet have **Elemental Affinity** (level-6 feature: fire resistance + Charisma bonus to one fire-damage roll — was wrongly bundled into Draconic Resilience earlier, now split correctly). Background is Merchant (Animal Handling/Persuasion, Navigator's Tools, Lucky feat already present as his "Luck Points" trait).
- **Aster Valion** — Half-elf Paladin, Oath of Vengeance, Fighting Style: Dueling. Has Channel Divinity: Vow of Enmity, oath spells Bane/Hunter's Mark.

## Turn Simulator spell-attack auto-roll (added 2026-08-07)

Clicking a prepared spell in the Combate tab's Turn Simulator now auto-rolls 1d20 + spell attack bonus via the same `roll()` function used for weapons, for spells flagged `atk:true` in `spellDB` (currently: `eldritch_blast`, `sorcerous_burst`, `ray_of_frost`, `chromatic_orb`, `scorching_ray`, `guiding_bolt`, `spiritual_weapon` — the only attack-roll spells actually in use by the 4 live characters; extend this list as new attack-roll spells get prepared by any character). Save-based/utility spells just mark the action used, no roll. This also fixed a **pre-existing dead-code bug**: the action/bonus-action spell list check compared `sp.time` (an `{es,en}` object) against the literal strings `'action'`/`'bonus_action'`, which could never match — no prepared spell ever appeared in the Turn Simulator before this fix. The corrected check compares `sp.time.en` against `'Action'` / `'Bonus Action'` / `'Action or 8 hours'`.

## Full spell-database enrichment project — COMPLETE (2026-08-07)

All **385 spells** in `spellDB` were enriched with concrete 2024 mechanics (damage dice, save type, area, upcast scaling) instead of the original deliberately-vague paraphrased descriptions. Done **level by level** (0 through 9), each level fully verified via parallel research agents against aidedd.org/roll20.net/dndbeyond.com, then rewritten and deployed as its own commit (10 commits total, one per level). If a *new* spell is ever added to `spellDB` going forward, enrich it the same way rather than leaving it vague: dispatch a research `Agent` for exact 2024 PHB mechanics (damage/save/area/upcast, sourced from aidedd.org/roll20.net/dndbeyond.com — avoid `dnd2024.wikidot.com`, it has a redirect-loop bug), then write a concise bilingual (es/en) description from the verified facts.

**Recurring pattern found repeatedly — watch for it if adding any spell whose name sounds like an older-edition spell**: several 2014 spells were **renamed and mechanically reworked** in the 2024 PHB rather than just re-balanced, and `spellDB` had **both the old and new names as separate, redundant entries** (the old one still carrying 2014 mechanics). Found:
- `branding_smite` → renamed/reworked to `shining_smite` (2024: 2d6 radiant, bright light, advantage to hit it, can't turn invisible).
- `feeblemind` → renamed/reworked to `befuddlement` (2024: 10d12 psychic + half on save, no more permanent INT/CHA-to-1).
- Resolution pattern used both times: keep both ids (some character data might reference either), fix the *new*-named entry to the correct current 2024 text, and rewrite the *old*-named entry's description to explicitly say "(legacy)" / "(heredado)" and point to the new name, rather than deleting it.
- When researching a spell whose name sounds unfamiliar or where two similar-sounding names exist in the DB, explicitly ask the research agent to confirm whether the spell was renamed vs. genuinely coexists as a separate spell — don't assume.

**Also self-caught a fabrication during this project**: my first draft of Counterspell's 2024 rewrite invented a plausible-sounding "higher-level slot gives the target disadvantage" upcast clause that doesn't actually exist in the real 2024 text (Counterspell has no upcast/"Using a Higher-Level Spell Slot" section at all). Caught it by re-fetching the exact D&D Beyond spell text before finalizing, instead of trusting the first plausible-sounding synthesis. Applies generally: when a rewritten spell description includes an upcast clause, prefer omitting it over guessing if no source explicitly confirms one exists — many spells simply have no "Using a Higher-Level Spell Slot" text (all level-9 spells, by rule, plus a number of fixed-effect spells at other levels).

**Other real mechanical bugs the project caught and fixed** (beyond the renamed-spell cases above) — a sample of the kind of drift to watch for if this ever needs auditing again: Darkvision was granting 60 ft instead of the 2024-buffed 150 ft; Ray of Enfeeblement and Telekinesis were still using their 2014 opposed-check/attack-roll mechanics instead of 2024's save-based ones; three Paladin Smite spells were incorrectly marked as requiring concentration; Power Word Kill did nothing above its HP threshold instead of 2024's 12d12-damage fallback; Storm of Vengeance's stored duration was 1 hour instead of the correct 1 minute.

**Infra note**: GitHub Actions occasionally failed to trigger at all for a push to `main` (no workflow run appeared, not even a failed one) despite the commit landing fine on `origin/main` — a transient GitHub-side anomaly, not a config issue (the workflow trigger is plain `on: push: branches: [main]`, no path filters). Fallback when this happens: SSH in and run `bash /home/ec2-user/aster-app/deploy/redeploy.sh` directly — it's the exact same script the Action would have run remotely.

## Things NOT yet implemented (discussed with the user, not requested yet)

- Combat round counter on the GM dashboard.
- Custom/homebrew monster entries in the GM's mini-bestiary (currently a fixed 27-entry catalog).
- Backup/undo for GM session data itself (initiative tracker, party loot) — currently only character sheets have the restore-backup safety net.
- Multiclass support (spell slots / prepared limits currently assume a single class).
- Mass damage/heal application across multiple initiative-tracker entries at once (for AoE spells).
- Turn Simulator auto-roll phase 2 (discussed, not started): auto-rolling damage dice and auto-consuming the correct spell slot on cast, not just the attack roll.
