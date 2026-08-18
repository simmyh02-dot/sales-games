/* ==========================================================================
   personas.js — background prospect personas for Sales Call Mode
   These REPLACE the old behavioural personalities. Each persona carries a
   different TYPE of resistance (not just surface detail) so training against
   them exercises genuinely different objection handling.

   Shape:
     key                 stable id
     label               display name
     economicSituation   money reality driving their caution
     primaryPain         the pain the offer must speak to
     objectionStyle      how their resistance tends to surface
     decisionTempo       how fast / slow they decide
     saysYesWhen         what actually earns the yes
     behavior            one-line composite (back-compat with the server
                         prompt plumbing that used personality.behavior)

   Exposed as the global SCG_PERSONAS (array) plus SCG_PERSONAS_BY_KEY.
   ========================================================================== */

const SCG_PERSONAS = [
  {
    key: "unemployed",
    label: "The Unemployed",
    economicSituation: "Out of work and budget-sensitive; anxious about paying out with no income coming in.",
    primaryPain: "Needs income and a way forward, but every dollar spent feels like a risk they can't take.",
    objectionStyle: "Price and payment plans come up fast; wants to know it will really work FOR THEM specifically; scarred by past 'get rich quick' offers.",
    decisionTempo: "Hesitant. Wants reassurance and low risk before committing.",
    saysYesWhen: "They believe it genuinely fits their situation, the money side is de-risked, and this isn't another empty promise.",
    behavior: "Out of work and budget-sensitive, anxious about spending with no income. Objects on price/payment plans and whether it will really work for them; wary after past 'get rich quick' letdowns. Decides slowly and needs the risk taken off the table.",
  },
  {
    key: "beginner",
    label: "The Beginner",
    economicSituation: "Some money to invest but price-sensitive; thinking about the future more than today.",
    primaryPain: "Motivated to start something new but quietly unsure they have what it takes.",
    objectionStyle: "'Do I have the right experience / am I the type of person who can do this?' Price-sensitive but responds to a future-focused frame.",
    decisionTempo: "Willing but needs their self-doubt addressed before they'll move.",
    saysYesWhen: "They feel capable — the offer convinces them beginners like them succeed and they're not too far behind.",
    behavior: "Motivated newcomer, unsure of their own ability. Objects around lack of experience and whether they're cut out for it; price-sensitive but future-focused. Moves once their self-doubt is handled.",
  },
  {
    key: "worker",
    label: "The 9-5 Worker",
    economicSituation: "Has a stable income and security; not desperate, which makes leaving the safe thing feel risky.",
    primaryPain: "Wants more but is boxed in by time and the fear of giving up security.",
    objectionStyle: "'Can I fit this around a full-time job?', 'Dare I leave the safe thing?' A partner or family often factors into the decision.",
    decisionTempo: "Cautious; weighs risk vs. security and may need to 'talk to someone' first.",
    saysYesWhen: "They see it fits around their job to start, the risk to their security feels managed, and it's worth the time.",
    behavior: "Employed with security; main resistance is time and risk, not money. Objects about fitting it around a 9-5 and the fear of leaving the safe thing; partner/family may be involved. Decides cautiously.",
  },
  {
    key: "business-owner",
    label: "The Business Owner",
    economicSituation: "Already has status and income; price is rarely the real objection.",
    primaryPain: "Time and leverage — not survival. Won't tolerate anything generic.",
    objectionStyle: "'Is this worth my time?', 'I can already sell.' Decides fast but wants proof and specifics, not a generic pitch.",
    decisionTempo: "Fast — once convinced there's real ROI on their time; dismissive of fluff.",
    saysYesWhen: "You show something they don't already have and prove it's worth their time — concrete, not a canned pitch.",
    behavior: "Established, has status and income; resistance is rarely price. Objects on whether it's worth their time and 'I can already sell.' Decides fast but demands proof and specifics, not a generic pitch.",
  },
  {
    key: "retiree",
    label: "The Retiree",
    economicSituation: "Fixed or limited income; unwilling to gamble savings they can't rebuild.",
    primaryPain: "Wants purpose and a bit more, but protecting the nest egg comes first.",
    objectionStyle: "Risk ('can I afford to lose this?'), tech uncertainty in a new field, and 'am I too old for this?' — but very loyal once they feel safe and seen.",
    decisionTempo: "Slow and careful up front; deeply committed once trust is earned.",
    saysYesWhen: "They feel safe, respected, and certain they won't lose money or be left behind on the tech.",
    behavior: "Fixed/limited income, unwilling to gamble savings. Objects on risk of loss, tech uncertainty, and age ('am I too old for this'). Slow and careful, but very loyal once they feel safe and seen.",
  },
];

const SCG_PERSONAS_BY_KEY = SCG_PERSONAS.reduce((acc, p) => {
  acc[p.key] = p;
  return acc;
}, {});
