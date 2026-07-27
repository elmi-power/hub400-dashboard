# HUB400 Dashboard (ELMI)

Statisches Dashboard (reines HTML/CSS/JS, kein Build-Schritt) für ELMI-Batteriedaten
(ESS `RunData` CSV-Exporte). Läuft komplett im Browser, gehostet über GitHub Pages,
hinter einem Passwort-Login.

## Funktionen

- **Login**: Die gesamte Seite ist hinter einem Passwort-Screen versteckt (siehe
  „Sicherheit“ unten für die Grenzen davon).
- **Sites**: Feste Startauswahl „Edzards Reisen“ / „Niddatal“, weitere über
  „+ Neue hinzufügen“ anlegbar (wird als `data/<site>/site.json` im Repo gespeichert).
- **Tag(e) auswählen**: Pro Site werden alle im Repo vorhandenen Tage als Chip-Leiste
  angezeigt (erkannt am Dateinamensmuster `..._Day[YYYY-MM-DD ...]...csv`). Fehlende
  Tage werden ausgegraut mit angezeigt. Mehrere (auch nicht zusammenhängende) Tage
  lassen sich gleichzeitig auswählen — die Daten werden dann zeitlich zusammengeführt.
- **Direkt-Ansicht**: Eine neu hochgeladene CSV wird sofort angezeigt, unabhängig davon,
  ob sie im Repo gespeichert wird.
- **4 Hauptgrafiken** (Zeit auf X-Achse):
  1. Batterieleistung gesamt (PackV × PackA, pro Pack, dann summiert)
  2. PacOut (Systemausgang)
  3. SOC kombiniert (Mittelwert beider Packs)
  4. PacOut vs. EMS-Setpoint (letzter `P_EMS`-Wert als Referenzlinie) vs. SOC kombiniert
     (zweite Y-Achse)
- **4 Mini-Grafiken pro Pack**: Leistung Pack 1/2, SOC Pack 1/2
- **Zoom**: Rahmen ziehen = reinzoomen, Rechtsklick = zurück auf die Ausgangsansicht
- **Nicht-ESS-CSVs**: Fallback auf eine generische Tabellen-/Chart-Ansicht mit frei
  wählbarer X-/Y-Achse (Linie/Balken/Punkte/Kreis)

## Annahmen bei der Datenauswertung (bitte prüfen)

Die ESS-Dateien loggen pro Zeitstempel meist zwei Zeilen (`[BatRack]:BmsIdx` 0/1 =
Pack 1/2). Daraus abgeleitet:

- **Batterieleistung**: `PackV × PackA` je Pack, dann pro Zeitpunkt aufsummiert
  (bei asynchronen Timestamps wird der jeweils letzte bekannte Wert des anderen Packs
  fortgeschrieben, klassisches „Forward-Fill & Summe“).
- **PacOut**: wie die Batterieleistung je Pack per Forward-Fill nachgeführt und dann
  pro Zeitpunkt aufsummiert. Hinweis: In den bisherigen Testdaten melden beide Packs
  aktuell denselben PacOut-Wert (z.B. beide 3), wodurch die Summe wie eine
  Verdopplung aussieht (6 statt 3) — falls das nicht stimmt, bitte Bescheid geben.
- **SOC kombiniert**: **Mittelwert** aus Pack 1 + Pack 2 (nicht Summe — Prozent lässt
  sich nicht sinnvoll addieren).
- **EMS-Setpoint**: letzter Wert aus `[PC]:Tmax/Pauxload/P_EMS` (3. Teil des
  Pipe-getrennten Felds `Tmax|Pauxload|P_EMS`) in der gewählten Auswahl, als
  horizontale Referenzlinie — so vom Nutzer bestätigt.

Falls eine dieser Annahmen nicht stimmt, in `js/ess.js` (`buildEssSeries`) anpassen.

Die Spalten (`SOC`, `PackV`, `PackA`, `PacOut`, das `[PC]:Tmax/...`-Feld) werden pro
Datei anhand der eigenen Kopfzeile gesucht, nicht über feste Positionen — verschiedene
Exporte/Standorte hatten in der Praxis bereits leicht unterschiedliche Spaltenanzahlen
und Feldnamen (z.B. fehlendes `PCS_Tmax`).

## Bekannte Einschränkung: Browser-Cache nach einem Update

GitHub Pages liefert alle Dateien mit `Cache-Control: max-age=600` aus (10 Minuten) —
das lässt sich über Repo-Dateien nicht ändern (kein Custom-Header-Support). Nach einem
Update kann ein Browser, der die Seite kurz vorher schon offen hatte, bis zu 10 Minuten
lang noch die alte Version zeigen. Deployment selbst passiert automatisch bei jedem
Push (i.d.R. unter 1 Minute) — das Problem ist rein der Browser-Cache danach. Hilft:
**Strg+Umschalt+R** (harter Reload) oder kurz warten. `js/*.js`/`css/style.css` werden
zusätzlich mit `?v=<Zeitstempel>` in `index.html` referenziert (bei jeder Änderung
manuell hochzählen), damit zumindest unterschiedliche Versionen nie gemischt geladen
werden.

## Setup

1. **GitHub Pages aktivieren**: Repo → *Settings* → *Pages* → *Build and deployment* →
   Source: `Deploy from a branch`, Branch: `main` / `(root)`.
2. **Token hinterlegen** (für Speichern & neue Sites): Button 🔑 *Token* oben rechts.
   - GitHub → *Settings* → *Developer settings* → *Fine-grained tokens* → *Generate new token*
   - Repository access: nur auf **dieses eine Repo** beschränken
   - Permissions: **Contents → Read and write**
   - Der Token wird ausschließlich lokal im Browser (`localStorage`) gespeichert, nie
     ins Repo committed.

## Sicherheit / Login — wichtige Einschränkung

Das Passwort-Feld prüft nur einen **SHA-256-Hash** (in `js/auth.js` hinterlegt) gegen
die Eingabe — das Klartext-Passwort steht nirgends im Repo. Das ist aber **kein echter
Zugriffsschutz**: Da der komplette Quellcode (inkl. Hash) öffentlich auf GitHub liegt,
könnte ein Angreifer den Hash offline per Brute-Force angreifen oder das Frontend so
verändern, dass die Prüfung übersprungen wird. Es hält casual/automatisierte Leser
(auch andere KIs, die das Repo crawlen) davon ab, direkt an die Daten zu kommen — mehr
nicht.

**Für echten Zugriffsschutz**: Repo auf privat stellen (erfordert GitHub Pro/Team, dann
funktioniert GitHub Pages nur für eingeloggte Collaborators) oder das Dashboard hinter
einen Reverse Proxy mit echter Auth stellen.

## Lokal testen

Da die Seite `fetch()` gegen die GitHub-API nutzt, sollte sie über einen lokalen
Webserver statt per `file://` geöffnet werden, z. B.:

```bash
npx serve .
```

## Projektstruktur

```
csv-dashboard/
├── index.html        Seitenstruktur (Login, Site-/Tag-Picker, Chart-Grid)
├── css/style.css      Styling, ELMI-Branding (hell/dunkel automatisch)
├── js/auth.js         Passwort-Gate (SHA-256-Hash-Vergleich)
├── js/github.js       GitHub-Contents-API (lesen/schreiben, Token-Verwaltung)
├── js/ess.js          Parsing & Aggregation der ESS RunData CSVs
├── js/charts.js        Chart.js-Setup inkl. Zoom-Plugin
├── js/app.js           Orchestrierung: Sites, Tage, Upload, generischer Fallback
└── data/<site>/        CSV-Dateien pro Site (Dateiname enthält das Datum)
```
