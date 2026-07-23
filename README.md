# CSV Dashboard

Statisches Dashboard (reines HTML/CSS/JS, kein Build-Schritt) zum Hochladen,
Anzeigen und Visualisieren von CSV-Dateien. Läuft komplett im Browser und kann
kostenlos über GitHub Pages gehostet werden.

## Funktionen

- CSV per Drag & Drop oder Dateiauswahl hochladen
- Automatische Tabellenvorschau, Kennzahlen und Charts (Linie/Balken/Punkte/Kreis)
- X-Achse und Y-Werte frei wählbar
- Optional: Hochgeladene CSVs direkt ins Repo (`data/`-Ordner) committen, sodass sie
  dauerhaft gespeichert bleiben und im Dashboard-Verlauf (Sidebar) wieder auswählbar sind

## Setup

1. **Repo auf GitHub erstellen** (leer, ohne README) und diesen Ordner dorthin pushen:

   ```bash
   git remote add origin https://github.com/<dein-user>/<dein-repo>.git
   git branch -M main
   git push -u origin main
   ```

2. **GitHub Pages aktivieren**: Repo → *Settings* → *Pages* → *Build and deployment* →
   Source: `Deploy from a branch`, Branch: `main` / `(root)`. Nach ein bis zwei Minuten
   ist das Dashboard unter `https://<dein-user>.github.io/<dein-repo>/` erreichbar.

3. **Im Dashboard konfigurieren**: Auf ⚙ *Einstellungen* klicken und Owner, Repo-Namen
   und Branch eintragen. Damit kann das Dashboard vorhandene CSVs aus `data/` lesen
   (öffentliche Repos funktionieren ohne Token, nur mit niedrigerem API-Ratenlimit).

4. **Speichern aus dem Browser (optional)**: Um hochgeladene CSVs automatisch ins Repo
   zu committen, wird ein GitHub Personal Access Token benötigt:
   - GitHub → *Settings* → *Developer settings* → *Fine-grained tokens* → *Generate new token*
   - Repository access: nur auf **dieses eine Repo** beschränken
   - Permissions: **Contents → Read and write**
   - Token im Dashboard unter Einstellungen eintragen

   Der Token wird ausschließlich lokal im Browser (`localStorage`) gespeichert und nie
   ins Repo committed. Trotzdem gilt: Token nur auf einem vertrauenswürdigen, eigenen
   Gerät hinterlegen und bei Bedarf über den Button „Token löschen“ wieder entfernen.

## Lokal testen

Da die Seite `fetch()` gegen die GitHub-API nutzt, sollte sie über einen lokalen
Webserver statt per `file://` geöffnet werden, z. B.:

```bash
npx serve .
# oder
python -m http.server 8080
```

Danach im Browser `http://localhost:8080` öffnen.

## Projektstruktur

```
csv-dashboard/
├── index.html        Seitenstruktur
├── css/style.css      Styling (hell/dunkel automatisch)
├── js/app.js          Parsing (PapaParse), Charts (Chart.js), GitHub-API-Anbindung
└── data/              CSV-Dateien (inkl. Beispiel sample.csv)
```
