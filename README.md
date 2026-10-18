# Gloop Guardians 🟢🦔

Ein farbenfrohes Tower-Defense-Spiel für iPhone, iPad, Android und den Browser. Es ist inspiriert von Bloons TD 6, hat aber eine **komplett eigene Welt**: Niedliche Tiere („Critters“) verteidigen ihr Tal gegen wabbelige Schleimwesen („Gloops“), die beim Treffer in kleinere Schichten zerplatzen.

Alle Grafiken werden im Code gezeichnet, alle Sounds und die Musik werden live synthetisiert. Das Spiel braucht also keine fremden Assets und keine Lizenzen.

## Was schon drin ist

| Bereich | Inhalt |
|---|---|
| **Türme** | 9 Critters mit je 3 Upgrade-Pfaden × 5 Stufen (135 Upgrades), Crosspath-Regel wie in BTD6 (max. 2 Pfade, nur einer über Stufe 2) |
| **Helden** | Nova die Sternenkatze & Grizz der Bärenhäuptling, Level 1–20, je 2 aktive Fähigkeiten |
| **Gegner** | 17 Gloop-Typen mit Schichtsystem, Immunitäten (Explosion, Frost, Magie, Spitzes), Camo, Regrow, Fortified und 5 Bosse, dazu der seltene ✨ **Goldene Gloop** (Bonusgeld, wenn man ihn erwischt) |
| **Runden** | 100 handgebaute Runden + endloser Freeplay-Modus mit steigender Boss-Stärke |
| **Karten** | 6 Karten (Anfänger bis Experte): Wiese, Kristallhöhlen, Frostfjord, Lavaschmiede, Zuckergasse und Zwillingsflüsse mit 2 Pfaden |
| **Modi** | Easy, Medium, Hard, Champion (1 Leben) und Sandbox |
| **Innovation** | ⚡ **Bonds**: 12 Turm-Paare verstärken sich gegenseitig, wenn sie nah beieinander stehen (mit Vorschau beim Platzieren). 🔥 **Frenzy-Meter**: Pops laden den Balken, dann gibt es 10 s lang +50 % Angriffstempo. **Combo-Zähler** mit Bonusgeld. |
| **Fähigkeiten** | 17 aktive Fähigkeiten (Thornado, Meltdown, Absolute Zero, Superstorm, Supernova …) |
| **Wirtschaft** | Eicheln zum Antippen, Bank mit Zinsen, Markt, Rabatt-Auren |
| **Meta** | Spieler-Level & XP, Freischaltungen, Medaillen pro Karte/Schwierigkeit, 🧠 **Critter-Weisheit** (20 dauerhafte Perks), 🏅 **23 Erfolge**, 📅 **tägliche Herausforderung**, Gloopedia, Autosave, „Runde wiederholen“ |
| **Sprachen** | Deutsch & Englisch (automatisch nach Gerätesprache, umschaltbar) |
| **Mobile** | Touch-Drag & Drop, Haptik (nativ über Capacitor), Querformat-Sperre, Safe-Areas (Notch), adaptive Grafikqualität |

## Lokal starten

```bash
npm install
npm run dev          # öffnet http://localhost:5173
```

- `?dev=1` (oder `#dev`) an die URL hängen: alle Karten, Türme und Helden sind sofort freigeschaltet (zum Testen).
- `node scripts/single.mjs gloop-guardians.html` baut das ganze Spiel als **eine einzige HTML-Datei** (≈450 KB) zum Teilen.
- `npm test` startet die Simulations-Tests.
- `BALANCE=1 npx vitest run tests/balance.test.ts` lässt einen Bot alle Karten durchspielen (Balance-Check).

Steuerung am Desktop: **Leertaste** = Start/Tempo, **Q W E R T Y U I O** = Türme, **H** = Held, **, . /** = Upgrade-Pfad 1/2/3, **Tab** = Zielmodus, **Entf** = Verkaufen, **F** = Frenzy, **Esc** = Pause.

## In den App Store bringen (iOS)

Das Projekt ist mit [Capacitor](https://capacitorjs.com) bereits als native iOS- und Android-App eingerichtet (`ios/` und `android/`).

Du brauchst:
1. einen **Mac mit Xcode** (aktuelle Version aus dem Mac App Store),
2. ein **Apple-Developer-Konto** (99 €/Jahr) unter https://developer.apple.com.

Dann:

```bash
npm install
npm run cap:sync     # baut das Spiel und kopiert es ins iOS-/Android-Projekt
npx cap open ios     # öffnet Xcode
```

In Xcode:
1. Projekt **App** → Tab **Signing & Capabilities** → dein Team auswählen. Die Bundle-ID (`com.gloopguardians.game`) bei Bedarf auf deine eigene ändern, auch in `capacitor.config.ts`.
2. Oben ein iPhone (oder einen Simulator) wählen → ▶ zum Testen.
3. **Product → Archive** → **Distribute App** → App Store Connect hochladen.
4. In [App Store Connect](https://appstoreconnect.apple.com) die App anlegen: Screenshots, Beschreibung, Altersfreigabe, Datenschutz-Angaben (das Spiel sammelt keine Daten). Danach TestFlight-Test und „Zur Prüfung einreichen“.

Android: `npx cap open android` öffnet Android Studio → **Build → Generate Signed Bundle** → im Google Play Console hochladen (einmalig 25 $).

Für den App Store brauchst du außerdem eine **Datenschutzerklärung** (eine URL). Das Spiel sammelt keine Daten; Fortschritt wird nur lokal auf dem Gerät gespeichert (zusätzlich im nativen Speicher, damit iOS ihn nicht löscht).

App-Icon und Splashscreen liegen in `resources/`. Sie werden mit `node scripts/icons.mjs` aus dem Code erzeugt, während `npm run dev` läuft.

## Projektstruktur

```
src/
  game/      Simulation (unabhängig von der Grafik, testbar): Game, Türme, Gloops, Runden, Karten, Synergien, Helden
  render/    Canvas-Renderer, prozedurale Grafik (Türme, Gloops, Karten), Partikel
  audio/     Synthetisierte Soundeffekte und Musik (WebAudio)
  ui/        Menüs, HUD, Shop, Upgrade-Panel, Tutorial
  save/      Fortschritt & Spielstände (localStorage)
tests/       Vitest: Simulation & Balance-Bot
scripts/     Screenshot-, QA-, Performance- und Icon-Skripte (Playwright)
```

## Rechtliches

„Gloop Guardians“ ist ein Arbeitstitel. Vor dem Release kurz prüfen, ob Name und Marke frei sind. Das Spiel verwendet keine Namen, Figuren oder Grafiken aus Bloons TD 6. Die Spielmechanik eines Tower-Defense-Spiels ist nicht geschützt, Namen und Grafiken dagegen schon. Die Schrift „Baloo 2“ steht unter der SIL Open Font License und darf in Apps verwendet werden.
