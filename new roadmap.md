# Sales Call Mode Revamp — Roadmap
**Projekt:** Sales Camp Games (sales_training_website)
**Scope:** Setter/Closer-uppdelning, persona-system, borttagning av points, Lessons-system

---

## Fas 0 — Underlag som behövs innan kod skrivs

- **TRIAGE script**-dokumentet (struktur + skript för Setter mode)
- Källkod för nuvarande Sales Call Mode-komponenten/sidan
- Källkod/plats för dagens points-system (frontend-state, databastabell, API-routes)
- Svar: finns redan en databas för användardata (t.ex. Supabase/Postgres) för sessioner och framsteg, eller ligger allt client-side just nu? Avgör hur Lessons och persona-historik ska lagras.

---

## Fas 1 — Läges-val: Setter vs Closer

Klick på "Sales Call Mode" leder inte längre direkt in i ett samtal, utan visar ett val: **Setter Call** eller **Closer Call**.

**Öppen produktfråga:** ska båda lägen vara tillgängliga på alla tiers, eller ska t.ex. Setter vara en lättare funktion på Free medan Closer kräver Pro+? Påverkar var gating-logiken läggs.

---

## Fas 1b — Prospect-persona med bakgrund

**Problemet:** när systemprompten bara säger "simulera en prospect" utan konkret bakgrund fyller modellen i generiska luckor själv, vilket gör att den tenderar mot samma typ av invändningar varje gång.

**Lösningen:** strukturerad persona-data som injiceras i systemprompten, separat från TRIAGE/Closer-skriptet. Skriptet styr *vad* AI:n ska göra, personan styr *vem* den spelar.

**Arkitektur:**
- Egen `personas`-datastruktur (egen fil, inte hårdkodat i prompten), ett objekt per arketyp: ekonomisk situation, primär smärtpunkt, invändningsstil, beslutstempo, vad som skulle få dem att säga ja
- Vid start av ett Setter- eller Closer-samtal väljer användaren persona (eller "Slumpa" som default — annars tränar man bara på sin favoritpersona om och om igen)
- Kopplas till Lessons: varje lesson taggas med vilken persona samtalet gällde, så man ser t.ex. styrka mot Business Owner men svaghet mot Arbetslös

**De fem arketyperna (första utkast — justera gärna):**

| Persona | Kärnmotstånd | Typiska invändningar |
|---|---|---|
| **Arbetslös** | Behöver inkomst, men budgetkänslig och orolig att betala utan pengar in samtidigt | Pris/betalplan, "fungerar det verkligen för mig", skepsis pga tidigare "bli rik snabbt"-erbjudanden |
| **Nybörjare** | Taggad men osäker på egen förmåga | "Har jag rätt erfarenhet", prisskänslig men framtidsfokuserad |
| **Arbetare** | Har trygghet, huvudmotstånd är tid och risk | "Hinner jag vid sidan av 9–5", "vågar jag lämna det trygga", partner/familj ska ofta med på båten |
| **Business owner** | Har redan status/inkomst, motstånd är sällan pris | "Är det värt min tid", "jag kan redan sälja", snabbt beslutstempo men vill ha bevis, inte en generisk pitch |
| **Pensionär** | Fast/begränsad inkomst, ovillig att chansa med sparpengar | Risk ("har jag råd att förlora dessa pengar"), teknisk osäkerhet inför ny bransch/digitala verktyg, "är jag för gammal för det här" — men kan bli mycket lojal om de känner sig trygga och sedda |

Varje persona har olika **typ** av motstånd inbyggt, inte bara ytliga detaljskillnader — det löser variationsproblemet direkt.

---

## Fas 2 — Closer Mode (oförändrad)

- Ingen funktionell ändring, bara kopplad till det nya läges-valet och persona-valet
- Regressionstest efter att läges-valet är på plats

---

## Fas 3 — Setter Mode (ny, enklare)

- **Syfte:** kvalificera ett varmt lead för coachingprogrammet → vid kvalificering är utfallet "boka closer-call" (själva bokningen byggs inte här, bara statusen/CTA:n)
- Bygger på TRIAGE script-innehållet — kortare, mer checklista-artat flöde än Closer, färre invändningstyper
- Egen AI-systemprompt/persona-integration, separat från Closers
- Utfallstillstånd: Kvalificerad / Inte kvalificerad, med tydlig motivering till användaren

---

## Fas 4 — Ta bort points-systemet

- Points är plattformsbrett (Objection Battle, Pattern Recognition, Sales Call Mode) — det här är en sanering över hela appen
- Kartlägg alla ställen: UI (poängräknare, "+X points"-toasts, ev. leaderboard), datamodell (fält i user/session-tabeller), ev. tier-gating byggd på poäng
- Ingen lanserad data att migrera — ren utrensning

---

## Fas 5 — Bygg Lessons-systemet

**Scope:** endast Sales Call Mode (Setter + Closer) — inte Objection Battle eller Pattern Recognition.

- **Datamodell:** Lesson = innehåll, källa (Setter/Closer), persona samtalet gällde, tidsstämpel, `reviewed`-flagga, `pinned`-flagga
- **Generering:** efter en samtalssession genererar AI:n en eller flera konkreta lessons istället för poäng
- **Lessons-bibliotek** (ny sida/sektion): lista alla lessons, bocka av som genomgångna, fästa som viktiga, filtrera på fästa/olästa/persona

---

## Fas 6 — QA

- Setter end-to-end mot TRIAGE-skriptet, samtliga fem personor
- Closer oförändrad, samtliga fem personor
- Lessons överlever ny inloggning
- Inga kvarvarande referenser till points i hela kodbasen

---

## Fas 7 — Rebrand (senare, separat)

Hålls utanför denna roadmap.

---

## Vad som behövs från dig

1. **TRIAGE script**-dokumentet (innehåll/struktur)
2. Källkod för Sales Call Mode-komponenten/sidan
3. Källkod/plats för dagens points-system
4. Svar: databas eller client-side lagring idag?
5. Ev. justering av de fem persona-beskrivningarna
6. Beslut: tier-gating för Setter/Closer, ja eller nej
7. När koden är klar: GitHub-token eller Pro-uppgradering, för själva push:en till main
