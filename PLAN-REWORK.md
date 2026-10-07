# Plán: prestavba dátového modelu + výkon

## Stav (aktualizované 7. 10. 2026)

| krok | stav |
|---|---|
| 1 — zachytenie osirelých záznamov v snapshote | ✅ hotové |
| 2 — migračný skript, overený a idempotentný | ✅ hotové |
| 3 — prestavba frontendu (extrakcia + dátová vrstva) | ✅ hotové |
| 4 — nasadenie indexov do produkcie | ✅ hotové, stavajú sa |
| 4b — nové funkcionality | ✅ hotové |
| 5 — záloha tesne pred migráciou | ⬜ |
| 6 — read-only build s bannerom | ⬜ |
| 7 — migrácia produkcie | ⬜ |
| 8 — overenie | ⬜ |
| 9 — nasadenie frontendu + pravidiel | ⬜ |
| 10 — odležanie | ⬜ |
| 11 — odstránenie starých kolekcií | ⬜ |

Vetva `rework`, nepushnutá. Do produkcie zatiaľ išli **len indexy** — sú aditívne
a stará appka ich nepoužíva.

Testovacie siete: 56 testov pravidiel, 28 E2E, test súbežnosti, overenie
migrácie a overenie osirelých záznamov.

### Funkcionality

| # | funkcionalita | commit |
|---|---|---|
| 1 | odchod z tréningu bez zrušenia pre ostatných | `d16468f` |
| 2 | editovanie rezervácie (počty, disciplína) | `d16468f` |
| 3 | počet trénerov vedľa závodníkov | `6be3eb3` |
| 4 | check-in klubu pri príchode | `6be3eb3` |
| 5 | mesačný report (kluby, závodníci) | `b7f672c` |
| 6 | klub potvrdzuje sám, bez admina | `6be3eb3` |
| 7 | admin zakladá a presúva tréningy za klub | `b679276` |
| 8 | blokovanie jednotlivých blokov na trať | `6be3eb3` |
| 9 | zdieľaná poznámka pre trénerov | `6be3eb3` |
| 10 | automatické potvrdzovanie rezervácií (nastavenie strediska, default zapnuté) | — |

## Kde pokračovať

Lokálna časť je hotová: model, výkon aj všetkých 9 funkcionalít beží proti
migrovanému emulátoru a je pokrytá testami. **Ďalej už nasleduje len nasadenie,
teda kroky 5–11 v sekcii *Poradie nasadenia*** — a ten prvý z nich sa dotýka
produkcie, takže ich začíname až na výslovný pokyn.

Pred krokom 5 ešte treba: pushnúť vetvu `rework` a skontrolovať, že nasadené indexy
prešli z `CREATING` do `READY`.

Celé poradie nasadenia je v tabuľke na konci.

---

## Prečo to robíme

Aplikácia potrebuje 9 nových funkcionalít, no súčasný dátový model ich neunesie
a kalendár sa pri väčšom počte rezervácií výrazne spomaľuje.

Tréning je dnes modelovaný ako *rezervácia jedného klubu*, ku ktorej sa ostatné kluby
pripájajú do podkolekcie `addedUsers`. Z tohto jediného rozhodnutia vyplývajú tri
defekty, ktoré som overil priamo na produkčných dátach:

| defekt | rozsah |
|---|---|
| zmazanie vlastníka zabije tréning ostatným; podkolekcia zostane visieť | **101** osirelých záznamov pod **66** zmazanými rezerváciami |
| žiadna kontrola obsadenosti slotu pri zápise → dvojité rezervácie | **3** sloty, jeden skrýva tréning so **6** klubmi, ktorý nikto nevidí |
| `availableRacers` je ručný čítač, nie odvodená hodnota | 1 rozídený záznam |

Výkon: `fetchReservations` ([ResortPage.tsx:266](src/components/ResortPage.tsx:266))
číta rezervácie **všetkých stredísk** v okne 21 dní (admin 365) bez ohľadu na
zobrazený týždeň, a pre každú z nich sekvenčne dočíta `addedUsers` — N+1. Vo februári
2026 (160 rezervácií) to znamená stovky sériových round-tripov. Celé sa to opakuje po
**každom** zápise cez `handleUpdate`.

Cieľ: jeden konzistentný model, ktorý tieto defekty odstráni štrukturálne (nie
záplatou), zrýchli kalendár a unesie všetkých 9 funkcionalít. Historické dáta sa
prepíšu do rovnakého tvaru — needitovateľné v kalendári, dostupné adminovi pre výpočty.

---

## Cieľový model

### `trainings/{slotId}` — deterministické ID

```
slotId = `${resortId}__${courseId}__${date}__${startTime}__L${lineNumber}`
```

Toto je kľúčové rozhodnutie. Web SDK `Transaction.get()` prijíma len
`DocumentReference`, nie `Query` — transakcia sa teda **nevie** spýtať „je tento slot
voľný?". S deterministickým ID je to čítanie jedného dokumentu a unikátnosť slotu
vynucuje sám Firestore. Trieda chýb s dvojitou rezerváciou tým zaniká štrukturálne.

```ts
trainings/{slotId} = {
  resortId, courseId, date, session{startTime,endTime}, lineNumber,
  startAt, endAt,                      // Timestamp — potrebné pre pravidlá
  discipline, category, status, note, noteUpdatedBy, noteUpdatedAt,

  participants: {                      // kľúč = Auth uid (nie email)
    [uid]: { sportClub, firstName, secondName, email, tel_number,
             racers, coaches, tickets, role, joinedAt,
             confirmedAt, checkedInAt, attended }
  },

  participantUids: string[],           // Firestore nevie dotaz "mapa obsahuje kľúč"
  clubs: string[],
  racersTotal, coachesTotal, participantCount, confirmedCount,

  createdBy, createdOnBehalfOf, createdAt, updatedAt,
  legacyId, migrationVersion, dataQuality,
}
```

Voľné miesto sa **neukladá**, počíta sa: `individualLineCapacity − racersTotal`.
Ukladá sa spotrebované (vlastnosť tréningu), odvodzuje sa voľné (funkcia tréningu
a kapacity kurzu) — inak zmena kapacity kurzu spätne znehodnotí všetky staré záznamy.

Sumárne polia zostávajú, ale na rozdiel od dnešného `availableRacers` žijú v **tom
istom dokumente** ako dáta, ktoré sumarizujú → jedna jednodokumentová transakcia ich
udrží konzistentné. `participantUids`/`clubs` sú povinné, nie voliteľné: bez nich sa
nedá vyhľadať „ktoré tréningy má klub X".

### `closures/{closureId}` — nahrádza `closedTracks`

```
closureId = `${resortId}__${courseId}__${date}__${scopeKey}__L${lineNumber}`
scopeKey = "ALL" (celý deň) | "0900" (jeden blok)
```

Bod 8 je tým navrhnutý dopredu — denné blokovanie funguje ako dnes, blokovanie bloku
je aditívne, jeden dotaz obslúži oboje. Pribúda `resortId`, ktorý dnes chýba.

### Zápisy

Každá mutácia = `runTransaction` nad jedným dokumentom, v novom
`src/services/trainings.ts`. Dnes existuje tá istá logika v piatich nekonzistentných
kópiách, žiadna transakčná. `racersTotal` sa vždy prepočíta z transakčne prečítanej
hodnoty, nikdy sa neaplikuje klientom poslaný rozdiel.

---

## Čítanie a výkon

- Dotaz presne na zobrazený týždeň: `resortId` + `courseId` + rozsah `date`.
  Strop **63 dokumentov** (3 trate × 3 bloky × 7 dní) namiesto ~700 + 277 podkolekcií.
- **`onSnapshot`** na aktuálny týždeň — ruší `handleUpdate` (6 volaní) a zároveň
  zmenšuje okno pre kolízie. Po prvom snapshote sa účtujú len zmenené dokumenty.
- Bez prefetchu susedných týždňov; namiesto toho `Map<weekKey, Training[]>` v `useRef`.
- Sezóny len pre vybraný kurz, paralelne (`Promise.all`), nie sekvenčne pre všetky.
- `format(today,"yyyy-MM-dd")` namiesto `toISOString()` — dnes sa okno okolo polnoci
  posúva o deň (UTC vs Europe/Bratislava).
- Extrakcia `renderCalendar` (428 riadkov) do `CalendarWeek/DayColumn/TrackColumn/
  SessionCell` + `React.memo`. Bez extrakcie sa memoizovať nedá.

Indexy do `firestore.indexes.json` (dnes prázdny): `(resortId,courseId,date)`,
`(resortId,date)`, `(participantUids,date)`, `(resortId,status,date)`,
`closures(resortId,courseId,date)`. Plus `fieldOverrides` vypínajúci indexovanie mapy
`participants` — inak každý nový uid vytvára nové indexované cesty naprieč kolekciou.

---

## Migrácia

### Krok 1 (blokujúci): oprava pull skriptu

`scripts/pull-prod-data.mjs` používa `ref.get()`, ktoré vracia len existujúce
dokumenty — osirelé `addedUsers` teda **nevidí** (zachytáva 604 zo 705). Prepnúť na
`listDocuments()`, ktoré vráti referencie aj na chýbajúce dokumenty s podkolekciami.
V `seed-emulator.mjs` preskočiť zápis chýbajúceho rodiča, ale zostúpiť do podkolekcií.

Bez toho sa spracovanie osirelých dát nedá lokálne otestovať — teda presne tá časť
migrácie, ktorá sa týka stratených používateľských dát.

### `scripts/migrate-trainings.mjs`

Flagy `--dry-run` (default), `--target=emulator|prod`, `--confirm`, `--report`.
Rovnaké poistky ako existujúce skripty (`--target=prod` odmietne bežať pri nastavenom
`FIRESTORE_EMULATOR_HOST`).

1. `emailToUid` z `users` (overené 1:1, 107/107, 0 nerozlúštených zo 604 pripojených).
2. Načítať rezervácie + `collectionGroup("addedUsers")` (jediný spôsob, ako vidieť osirelé).
3. Rozdeliť na živé a osirelé rodičovské ID.
4. Nerozlúštiteľné → deterministický `legacy_${sha1(email)}`; 1 rezervácia má prázdny email.
5. Kolízie slotov: najstaršia podľa `createdAt` dostane kanonické ID, ďalšie
   `__dup2` + `dataQuality:"duplicate-slot"`. **Tým sa zviditeľnia 3 skryté tréningy.**
6. `racersTotal` prepočítať zo zdroja — neprepisovať `availableRacers` (opraví drift).
7. Zápis `BulkWriter.set()` bez `merge` → idempotentné, druhý beh dá identické dokumenty.
8. Osirelé → `trainingsOrphanedParticipants/{legacyId}`. Nezahadzujú sa (sú dôkazom
   defektu) ani sa nerekonštruujú na tréningy (dátum/slot sú nenávratne preč).
9. `closedTracks` → `closures` so `scope:"day"` a doplneným `resortId`.
10. **Nič sa nemaže.** Odstránenie starých kolekcií je samostatný skript po odležaní.

---

## Historické vs. editovateľné

Bez príznaku a bez druhej kolekcie — jeden tvar, ako si žiadal. Rozlíšenie je odvodené
z `startAt` v troch vrstvách: dotaz kalendára ide len dopredu (99 % vynútenia zadarmo),
UI drží dnešné pravidlo `day.date !== today`, a **pravidlá** to garantujú cez
`resource.data.startAt > request.time`. Práve preto sa `startAt` ukladá ako Timestamp —
pravidlá nevedia spočítať „dnes", ale vedia porovnať `request.time` s uloženým okamihom.

Admin história: `src/components/admin/TrainingHistory.tsx`, ten istý tvar, tie isté
parsovacie funkcie, len iné hranice dotazu a bez mutácií.

---

## Poradie nasadenia

Dáta rozhodli o stratégii: **705 zo 706 tréningov a všetkých 418 uzávierok je
v minulosti.** Živá editovateľná množina je prakticky prázdna. Dual-write by
zdvojnásobil plochu presne tej duplicitnej netransakčnej logiky, ktorú ideme mazať —
neopodstatnené. Stačí krátke okno údržby.

| # | krok | vratné? |
|---|---|---|
| **1** | **oprava pull skriptu, `db:pull`, `db:seed`** | len čítanie |
| 2 | migrácia otestovaná na emulátore, spustená dvakrát, parity skript zelený | lokálne |
| 3 | frontend prerobený proti migrovanému emulátoru | lokálne |
| 4 | `deploy --only firestore:indexes` — **s predstihom dní**, indexy sa stavajú asynchrónne | aditívne |
| 5 | `npm run db:pull` tesne pred oknom — **toto je záloha** | — |
| 6 | nasadiť read-only build s bannerom „Prebieha údržba systému" | `hosting:rollback` |
| 7 | `migrate-trainings.mjs --target=prod --confirm` — píše len nové kolekcie | zmazať 3 nové kolekcie |
| 8 | overiť: 706 tréningov (3 s `__dup`), 418 uzávierok, 66 osirelých | — |
| 9 | nasadiť nový frontend + sprísnené `firestore.rules` naraz | rollback + staré pravidlá |
| 10 | nechať odležať cez otvárací víkend so starými kolekciami | — |
| 11 | čerstvý `db:pull`, potom `drop-legacy-collections.mjs` | pull je záloha |

Okno údržby pod 30 minút. Krok 7 je čisto aditívny → rollback celého presunu je
„zmazať tri nové kolekcie a vrátiť predošlý build".

**Staré potvrdzovacie odkazy v mailoch** ukazujú na `/reservations/{legacyId}`. Route
zostáva; `ReservationConfirm.tsx` skúsi `trainings/{id}` a potom
`where("legacyId","==",id)`. Bez redeploy funkcií.

**Overiť pred krokom 7:** či je projekt na Blaze (inak `gcloud firestore export`
nefunguje a `db:pull` je jediná záloha), a či sa dá zapnúť Point-in-Time Recovery.

---

## Súbory

Meniť: `src/components/ResortPage.tsx` (1547 r., cieľ ~250),
`EditReservationModal.tsx` (logika 76-192 → služba), `AdminPage.tsx` (číta celú
kolekciu + N+1; doplniť guard na `/AdminPage`, ktorý dnes chýba),
`ReservationConfirm.tsx`, `CloseTrackModal.tsx`, `App.tsx`, `FirebaseService.ts`
(`isAdmin` mimo `localStorage`), `firestore.rules`.

Nové: `src/services/trainings.ts`, `src/hooks/useTrainingWeek.ts`,
`src/hooks/useCourseSeasons.ts`, `src/types/training.ts`,
`src/components/calendar/*`, `src/components/admin/TrainingHistory.tsx`,
`scripts/migrate-trainings.mjs`, `scripts/verify-migration.mjs`.

Extrakcia kalendára v **dvoch oddelene vratných commitoch**: (A) čistý presun bez zmeny
správania nad starým tvarom dát, (B) výmena dátovej vrstvy. Naraz by sa regresia nedala
odbisektovať v 1500-riadkovom súbore bez testov.

---

## Overenie

- `scripts/verify-migration.mjs`: parita 706 tréningov, **1310** účastníckych záznamov
  (706 vlastníkov + 604 pripojených) + 101 osirelých, `racersTotal` sedí, 3 duplicity
  prežili ako `__dup2`, idempotencia cez hash dokumentov pri dvoch behoch.
- `scripts/test-concurrency.mjs`: 50× dve súbežné `createTraining` na ten istý slot →
  presne jedna uspeje. Priamo reprodukuje tri reálne produkčné kolízie.
- Pravidlá cez `@firebase/rules-unit-testing`: nikto nesmie zapísať tréning v minulosti.
- **Výkon merať s hodinami nastavenými na 2026-02-10** (160 rezervácií). Dnešným
  dátumom by sa nenameralo nič — takmer všetko je v minulosti a dopredné okno vráti
  takmer prázdny výsledok. Merať počet prečítaných dokumentov aj čas do vykreslenia,
  na `main` aj na vetve.
- React DevTools Profiler: otvorenie „ZOBRAZIŤ KLUBY" pred (prekreslenie 63 buniek)
  a po (jedna bunka).
- Brány pred nasadením: `npm run build`, `npm run deploy:check`.

---

## Ako do modelu zapadnú funkcionality

| # | funkcionalita | ako |
|---|---|---|
| 1 | odhlásenie bez zrušenia ostatným | `participants.<uid>: deleteField()` v transakcii; posledný odchádzajúci → zmazať dokument; odchod vlastníka → povýšiť najstaršieho podľa `joinedAt`. Niet podkolekcie, niet čo osirieť. |
| 2 | úprava rezervácie | tá istá transakcia, `racersTotal` prepočítané z prečítanej mapy |
| 3 | tréneri + pretekári | polia už v schéme; či sa tréneri rátajú do kapacity = `capacityMode` na kurze |
| 4 | check-in na tréningu | `participants.<uid>.checkedInAt` — jeden zápis, bez transakcie |
| 5 | mesačný report | jeden dotaz `(resortId, date)` — ~200 dokumentov/mesiac; `clubs`, `racersTotal` to robia takmer zadarmo |
| 6 | klub si potvrdzuje sám | `confirmedAt` + `confirmedCount`; `status` sa preklopí keď `confirmedCount === participantCount` |
| 7 | admin presúva/vytvára za kluby | `createdOnBehalfOf`; presun = transakcia nad starým a novým slotom, deterministické ID robí kontrolu kolízie čítaním jedného dokumentu |
| 8 | blokovanie jednotlivých blokov | už navrhnuté v `closures`, `scope:"session"` — bez migrácie |
| 9 | spoločná poznámka | `note` + `noteUpdatedBy/At`, pravidlo na `participantUids` |
