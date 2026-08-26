/* ---------------------------------------------------------------------- */
/* i18n (Phase 2) — translate the static UI chrome.                        */
/*                                                                         */
/* Phase 1 (lang.js) made the AI *content* speak the chosen language. This */
/* layer handles the fixed labels around it: nav, buttons, headings, hints. */
/*                                                                         */
/* Usage:                                                                  */
/*   HTML:  <h1 data-i18n="home.title"></h1>                               */
/*          <span data-i18n-html="settings.themeSub"></span>   (allows tags)*/
/*          <input data-i18n-attr="placeholder:settings.friendPlaceholder">*/
/*   JS:    SCG_I18N.t("lessons.emptyFilter")                              */
/*          SCG_I18N.t("shell.level", { n: 3 })      // "Lv {n}"           */
/*                                                                         */
/* English is the source of truth. Any key missing from a locale falls back*/
/* to English, so a half-translated locale degrades gracefully instead of  */
/* showing blanks. To add a language: fill in a dict below (the codes come */
/* from LANGS in lang.js) — no other file needs to change.                 */
/* ---------------------------------------------------------------------- */
const SCG_I18N = (() => {

  // ---- English: the source of truth -------------------------------------
  const en = {
    // Shared
    "common.signOut":        "Sign out",
    "common.settings":       "Settings",
    "common.profile":        "Profile",
    "common.inviteFriends":  "Invite friends",
    "common.account":        "Account",

    // App bar + user menu (app-shell.js)
    "nav.train":             "Train",
    "nav.progress":          "Progress",
    "nav.salesCall":         "Sales Call",
    "nav.salesCallTag":      "Full simulation",
    "nav.objection":         "Objection Battle",
    "nav.objectionTag":      "Speed drill",
    "nav.pattern":           "Pattern Recognition",
    "nav.patternTag":        "Read the room",
    "nav.skillTree":         "Skill Tree",
    "nav.skillTreeTag":      "The methodology",
    "nav.lessons":           "Lessons",
    "nav.lessonsTag":        "Your playbook",
    "shell.brandHome":       "Sales Camp Games home",
    "shell.pointsTitle":     "Your total points",
    "shell.level":           "Lv {n}",
    "shell.you":             "You",

    // Home
    "home.eyebrow":          "// Welcome back",
    "home.title":            "Where do you want to train?",
    "home.sub":              "Run live reps to sharpen the reflex - then step back and see what you're building.",
    "home.sectionTrain":     "// Train",
    "home.sectionProgress":  "// Your progress",
    "home.callTag":          "Flagship · Full Simulation",
    "home.callTitle":        "Sales Call Mode",
    "home.callDesc":         "The main event. Pick a scenario, an offer and a prospect persona, then run a full live call from rapport to close. After it, your call gets marked up line by line - what landed, what to sharpen - plus the one thing to remember next time.",
    "home.callCta":          "Take the call",
    "home.objTag":           "Mode 01 · Speed Drill",
    "home.objTitle":         "Objection Battle",
    "home.objDesc":          "A prospect throws an objection. You get seconds to find the real belief behind the words.",
    "home.objCta":           "Enter the arena",
    "home.patTag":           "Mode 02 · Read The Room",
    "home.patTitle":         "Pattern Recognition",
    "home.patDesc":          "A prospect makes a statement. Spot the limiting belief, identity issue or hidden objection underneath.",
    "home.patCta":           "Start spotting",
    "home.treeTag":          "Reference · Skill Trees",
    "home.treeTitle":        "Skill Tree",
    "home.treeDesc":         "The whole methodology as branching skill trees. Skills unlock as you train across the modes.",
    "home.treeCta":          "Explore the trees",
    "home.lessonsTag":       "Reference · Your Playbook",
    "home.lessonsTitle":     "Lessons",
    "home.lessonsDesc":      "The one thing to remember from every Sales Call, saved so you can review and pin what matters.",
    "home.lessonsCta":       "Open your lessons",

    // Pricing modal (shared by home + settings)
    "pricing.limitTitle":    "You've hit your session limit",
    "pricing.limitSub":      "Upgrade to keep training. No interruptions.",
    "pricing.free":          "Free",
    "pricing.pro":           "Pro",
    "pricing.power":         "Power",
    "pricing.freeSessions":  "5 sessions / month",
    "pricing.proSessions":   "60 sessions / month",
    "pricing.powerSessions": "Unlimited sessions",
    "pricing.currentPlan":   "Your current plan",
    "pricing.mostPopular":   "Most popular",
    "pricing.upgradePro":    "Upgrade to Pro",
    "pricing.goPower":       "Go Power",
    "pricing.maybeLater":    "Maybe later",

    // Settings
    "settings.tag":          "Account",
    "settings.title":        "Settings",
    "settings.sub":          "Manage your profile, appearance, and who you compete with.",
    "settings.profile":      "Profile",
    "settings.progress":     "Progress",
    "settings.progressHint": "Points are earned on completed reps - see each debrief for the breakdown.",
    "settings.totalPoints":  "Total points",
    "settings.level":        "Level",
    "settings.reps":         "Reps completed",
    "settings.appearance":   "Appearance",
    "settings.theme":        "Theme",
    "settings.themeSub":     "<strong>Glow</strong> is the dark, animated look. <strong>Light</strong> is the calm, static crimson.",
    "settings.language":     "Training language",
    "settings.languageSub":  "The language your roleplays, feedback and lessons come back in. The app's own labels follow where translated.",
    "settings.friends":      "Friends &amp; leaderboard",
    "settings.friendsHint":  "Invite people by email and compare total points. They appear once they join.",
    "settings.friendPlaceholder": "friend@email.com",
    "settings.invite":       "Invite",
    "settings.plan":         "Plan",
    "settings.upgradeProBtn":"Upgrade to Pro - $15/mo",
    "settings.goPowerBtn":   "Go Power - $29/mo",
    "settings.lbEmpty":      "No competitors yet - invite a friend above.",
    "settings.lbSignIn":     "Sign in to compete.",
    "settings.lbNeedDb":     "Competing needs the database - available on the live site.",
    "settings.lbError":      "Couldn't load the leaderboard.",
    "settings.lbPending":    "Hasn't joined yet",
    "settings.lbPts":        "pts",
    "settings.lbYou":        "you",
    "settings.lbRemove":     "Remove",
    "settings.addFriendError":"Couldn't add that person.",
    "settings.invited":      "Invited {email}.",
    "settings.planFree":     "You're on the Free plan.",
    "settings.planPro":      "You're on Pro.",
    "settings.planPower":    "You're on Power - unlimited sessions.",
    "settings.sessionsThisMonth": "{used} / {limit} sessions this month",
    "settings.toNextLevel":  "{n} pts to Level {level}",

    // Lessons
    "lessons.tag":           "Reference · Your Playbook",
    "lessons.title":         "Lessons",
    "lessons.intro":         "Every Sales Call debrief leaves behind one thing to remember. They collect here so you can review them before your next call, pin the ones that matter, and see your weak spots by persona.",
    "lessons.signedOutTitle":"Sign in to see your lessons",
    "lessons.signedOutBody": "Lessons are saved to your account after each Sales Call. Sign in from the top right to start building your library.",
    "lessons.filterAll":     "All",
    "lessons.filterPinned":  "Pinned",
    "lessons.filterUnread":  "Unread",
    "lessons.filterSetter":  "Setter",
    "lessons.filterCloser":  "Closer",
    "lessons.allPersonas":   "All personas",
    "lessons.emptyNone":     "No lessons yet. Run a Sales Call and your key takeaway will be saved here.",
    "lessons.emptyFilter":   "No lessons match this filter.",
    "lessons.needDb":        "Lessons need the database to be configured.",
    "lessons.loadError":     "Couldn't load your lessons.",
    "lessons.pin":           "Pin",
    "lessons.unpin":         "Unpin",
    "lessons.markReviewed":  "Mark reviewed",
    "lessons.markUnread":    "Mark unread",
    "lessons.delete":        "Delete",
    "lessons.call":          "Call",
    "lessons.langUnknown":   "Language not recorded",
  };

  // ---- Swedish -----------------------------------------------------------
  const sv = {
    "common.signOut":        "Logga ut",
    "common.settings":       "Inställningar",
    "common.profile":        "Profil",
    "common.inviteFriends":  "Bjud in vänner",
    "common.account":        "Konto",

    "nav.train":             "Träna",
    "nav.progress":          "Utveckling",
    "nav.salesCall":         "Säljsamtal",
    "nav.salesCallTag":      "Full simulering",
    "nav.objection":         "Invändningsstrid",
    "nav.objectionTag":      "Snabbövning",
    "nav.pattern":           "Mönsterigenkänning",
    "nav.patternTag":        "Läs av rummet",
    "nav.skillTree":         "Färdighetsträd",
    "nav.skillTreeTag":      "Metodiken",
    "nav.lessons":           "Lärdomar",
    "nav.lessonsTag":        "Din spelbok",
    "shell.brandHome":       "Sales Camp Games startsida",
    "shell.pointsTitle":     "Dina totala poäng",
    "shell.level":           "Nivå {n}",
    "shell.you":             "Du",

    "home.eyebrow":          "// Välkommen tillbaka",
    "home.title":            "Var vill du träna?",
    "home.sub":              "Kör skarpa pass för att slipa reflexen - kliv sedan tillbaka och se vad du bygger.",
    "home.sectionTrain":     "// Träna",
    "home.sectionProgress":  "// Din utveckling",
    "home.callTag":          "Flaggskepp · Full simulering",
    "home.callTitle":        "Säljsamtalsläge",
    "home.callDesc":         "Huvudnumret. Välj ett scenario, ett erbjudande och en prospektpersona, och kör sedan ett helt live-samtal från relation till avslut. Efteråt markeras samtalet rad för rad - vad som landade, vad du ska vässa - plus den enda sak du ska minnas till nästa gång.",
    "home.callCta":          "Ta samtalet",
    "home.objTag":           "Läge 01 · Snabbövning",
    "home.objTitle":         "Invändningsstrid",
    "home.objDesc":          "Ett prospekt kastar fram en invändning. Du har sekunder på dig att hitta den verkliga övertygelsen bakom orden.",
    "home.objCta":           "Kliv in i arenan",
    "home.patTag":           "Läge 02 · Läs av rummet",
    "home.patTitle":         "Mönsterigenkänning",
    "home.patDesc":          "Ett prospekt säger något. Hitta den begränsande övertygelsen, identitetsfrågan eller den dolda invändningen under ytan.",
    "home.patCta":           "Börja spana",
    "home.treeTag":          "Referens · Färdighetsträd",
    "home.treeTitle":        "Färdighetsträd",
    "home.treeDesc":         "Hela metodiken som förgrenade färdighetsträd. Färdigheter låses upp när du tränar i de olika lägena.",
    "home.treeCta":          "Utforska träden",
    "home.lessonsTag":       "Referens · Din spelbok",
    "home.lessonsTitle":     "Lärdomar",
    "home.lessonsDesc":      "Den enda sak du ska minnas från varje säljsamtal, sparad så att du kan repetera och nåla fast det som betyder något.",
    "home.lessonsCta":       "Öppna dina lärdomar",

    "pricing.limitTitle":    "Du har nått din sessionsgräns",
    "pricing.limitSub":      "Uppgradera för att fortsätta träna. Inga avbrott.",
    "pricing.free":          "Gratis",
    "pricing.pro":           "Pro",
    "pricing.power":         "Power",
    "pricing.freeSessions":  "5 sessioner / månad",
    "pricing.proSessions":   "60 sessioner / månad",
    "pricing.powerSessions": "Obegränsat med sessioner",
    "pricing.currentPlan":   "Ditt nuvarande abonnemang",
    "pricing.mostPopular":   "Populärast",
    "pricing.upgradePro":    "Uppgradera till Pro",
    "pricing.goPower":       "Välj Power",
    "pricing.maybeLater":    "Kanske senare",

    "settings.tag":          "Konto",
    "settings.title":        "Inställningar",
    "settings.sub":          "Hantera din profil, ditt utseende och vilka du tävlar mot.",
    "settings.profile":      "Profil",
    "settings.progress":     "Utveckling",
    "settings.progressHint": "Poäng tjänas in på avklarade pass - se varje genomgång för fördelningen.",
    "settings.totalPoints":  "Totala poäng",
    "settings.level":        "Nivå",
    "settings.reps":         "Avklarade pass",
    "settings.appearance":   "Utseende",
    "settings.theme":        "Tema",
    "settings.themeSub":     "<strong>Glow</strong> är det mörka, animerade utseendet. <strong>Light</strong> är det lugna, statiska röda.",
    "settings.language":     "Träningsspråk",
    "settings.languageSub":  "Språket som dina rollspel, din återkoppling och dina lärdomar kommer tillbaka på. Appens egna etiketter följer med där de är översatta.",
    "settings.friends":      "Vänner &amp; topplista",
    "settings.friendsHint":  "Bjud in personer via e-post och jämför totala poäng. De dyker upp när de gått med.",
    "settings.friendPlaceholder": "van@epost.se",
    "settings.invite":       "Bjud in",
    "settings.plan":         "Abonnemang",
    "settings.upgradeProBtn":"Uppgradera till Pro - $15/mån",
    "settings.goPowerBtn":   "Välj Power - $29/mån",
    "settings.lbEmpty":      "Inga konkurrenter än - bjud in en vän ovan.",
    "settings.lbSignIn":     "Logga in för att tävla.",
    "settings.lbNeedDb":     "Att tävla kräver databasen - finns på den live-versionen.",
    "settings.lbError":      "Kunde inte hämta topplistan.",
    "settings.lbPending":    "Har inte gått med än",
    "settings.lbPts":        "p",
    "settings.lbYou":        "du",
    "settings.lbRemove":     "Ta bort",
    "settings.addFriendError":"Kunde inte lägga till den personen.",
    "settings.invited":      "Bjöd in {email}.",
    "settings.planFree":     "Du har Gratis-abonnemanget.",
    "settings.planPro":      "Du har Pro.",
    "settings.planPower":    "Du har Power - obegränsat med sessioner.",
    "settings.sessionsThisMonth": "{used} / {limit} sessioner den här månaden",
    "settings.toNextLevel":  "{n} p till nivå {level}",

    "lessons.tag":           "Referens · Din spelbok",
    "lessons.title":         "Lärdomar",
    "lessons.intro":         "Varje genomgång av ett säljsamtal lämnar efter sig en sak att minnas. De samlas här så att du kan repetera dem inför nästa samtal, nåla fast de som betyder något och se dina svaga punkter per persona.",
    "lessons.signedOutTitle":"Logga in för att se dina lärdomar",
    "lessons.signedOutBody": "Lärdomar sparas till ditt konto efter varje säljsamtal. Logga in uppe till höger för att börja bygga ditt bibliotek.",
    "lessons.filterAll":     "Alla",
    "lessons.filterPinned":  "Fastnålade",
    "lessons.filterUnread":  "Olästa",
    "lessons.filterSetter":  "Setter",
    "lessons.filterCloser":  "Closer",
    "lessons.allPersonas":   "Alla personas",
    "lessons.emptyNone":     "Inga lärdomar än. Kör ett säljsamtal så sparas din viktigaste insikt här.",
    "lessons.emptyFilter":   "Inga lärdomar matchar det här filtret.",
    "lessons.needDb":        "Lärdomar kräver att databasen är konfigurerad.",
    "lessons.loadError":     "Kunde inte hämta dina lärdomar.",
    "lessons.pin":           "Nåla fast",
    "lessons.unpin":         "Ta bort nål",
    "lessons.markReviewed":  "Markera som repeterad",
    "lessons.markUnread":    "Markera som oläst",
    "lessons.delete":        "Ta bort",
    "lessons.call":          "Samtal",
    "lessons.langUnknown":   "Språk ej registrerat",
  };

  // Locales not yet translated fall back to English key by key, so the app is
  // never broken by a partial dict — fill one in and it starts showing up.
  const DICTS = { en, sv, es: {}, de: {}, fr: {}, no: {}, da: {}, fi: {}, it: {}, nl: {}, pt: {} };

  function locale() {
    return (typeof SCG_LANG !== "undefined") ? SCG_LANG.get() : "en";
  }

  // Look up a key: active locale -> English -> the key itself (so a missing
  // string is obvious in dev rather than rendering as an empty element).
  function t(key, vars) {
    const dict = DICTS[locale()] || {};
    let out = dict[key];
    if (out == null) out = en[key];
    if (out == null) return key;
    if (vars) {
      out = out.replace(/\{(\w+)\}/g, (m, name) =>
        Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m
      );
    }
    return out;
  }

  // Walk a subtree and fill in every marked element. Safe to re-run (it is
  // driven by attributes, not by replacing existing text), so a language
  // change just calls apply() again.
  function apply(root) {
    const scope = root || document;

    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });

    // Only for strings that intentionally carry inline markup (e.g. <strong>).
    // These come from our own dictionaries above, never from user input.
    scope.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });

    // "placeholder:key;title:key" -> set each attribute from its key.
    scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
        const [attr, key] = pair.split(":").map((s) => (s || "").trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });

    document.documentElement.setAttribute("lang", locale());
  }

  // Re-translate the chrome, then let each page re-render its dynamic parts.
  function refresh() {
    apply();
    document.dispatchEvent(new CustomEvent("scg:languagechange", { detail: { lang: locale() } }));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => apply());
  } else {
    apply();
  }

  return { t, apply, refresh, locale, DICTS };
})();
