# Catch the Dot

Willkommen zum Schnuppertag, schön bist du da! Wir bauen heute ein kleines Mini-Game im Browser.

Du wirst dabei sehen, wie eine moderne Web-App aufgebaut ist und wie man mit React, Next.js und Tailwind CSS eine interaktive Oberfläche entwickelt.

## Applikation starten

```bash
npm run dev
```

Danach kannst du die App im Browser öffnen:

```txt
http://localhost:3000
```

---

# Dateistruktur

```txt
app/page.tsx
components/game.tsx
components/score-board.tsx
```

Die wichtigste Datei für dich ist:

```txt
components/game.tsx
```

---

# Aufgaben

## 1. 👨‍🎨 Styling des Games verbessern

Starte damit, das Game optisch nach deinem Geschmack zu verändern.

Ein paar Ideen:

- ändere die Hintergrundfarbe
- ändere die Farbe des Buttons
- mache den Punkt grösser oder kleiner
- verwende ein anderes Emoji
- passe Rundungen und Schatten an
- ändere Texte oder Titel
- gib dem Spiel einen eigenen Namen

Du kannst dafür Tailwind CSS-Klassen direkt in der Komponente ändern.

Beispiele:

```tsx
bg-zinc-950
text-white
rounded-full
shadow-xl
hover:scale-110
```

---

## 2. 🐞 Fehler finden und beheben

Im Spiel ist ein kleiner Fehler eingebaut.

Der Punkt bewegt sich zwar nach oben und unten, aber nicht richtig nach links und rechts.

Finde den Fehler im Code und korrigiere ihn.

Tipp: Schau dir diese Stelle genau an:

```tsx
setX(ARENA_WIDTH / 2);
setY(newY);
```

Was müsste statt `ARENA_WIDTH / 2` verwendet werden?

---

## 3. 🎯 Score erhöhen

Aktuell passiert beim Klick auf den Punkt noch nicht alles, was passieren soll.

Ergänze im `handleDotClick` die Logik, damit der Score bei jedem Klick um 1 steigt.

Tipp:

```tsx
setScore(score + 1);
```

---

## 4. ⌨️ Spiel mit Leertaste starten

Ergänze eine Tastatursteuerung.

Wenn man die Leertaste drückt, soll das Spiel starten.

Dafür kannst du den vorbereiteten Code beim Kommentar `TODO 2` verwenden.

---

# Bonus-Aufgaben

Wenn noch Zeit bleibt, kannst du das Spiel erweitern.

## Bonus 1: Punkt wird kleiner

Mache den Punkt kleiner, je höher der Score wird.

Beispiel:

```tsx
const dotSize = Math.max(32, DOT_SIZE - score * 2);
```

Danach musst du beim Button `width` und `height` von `DOT_SIZE` auf `dotSize` ändern.

## Bonus 2: Highscore speichern

Speichere den besten Score und zeige ihn neben Punkte und Zeit an.

## Bonus 3: Schwierigkeitsgrad

Baue verschiedene Modi ein:

- Easy: 30 Sekunden
- Normal: 20 Sekunden
- Hard: 10 Sekunden

## Bonus 4: Andere Endtexte

Zeige je nach Score einen anderen Text an:

- 0–5 Punkte: "Solider Start."
- 6–12 Punkte: "Stark gespielt!"
- 13+ Punkte: "Sehr schnell!"

## Bonus 5: Mobile verbessern

Wie sieht das Game auf einem Smartphone aus?

Kannst du das Layout so anpassen, dass es auch auf kleinen Screens gut funktioniert?

---

# Ziel

Am Ende hast du ein kleines Game gebaut, gestylt, einen Bug gefunden und eine echte Funktion ergänzt.

Das ist ziemlich nah an dem, was Entwicklerinnen und Entwickler im Alltag machen: verstehen, verändern, testen, verbessern.
