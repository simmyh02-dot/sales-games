(() => {
  /* ------------------------------------------------------------------ */
  /* Category config (one discipline = one skill tree)                    */
  /* ------------------------------------------------------------------ */
  const CATS = {
    A: { label: "Call Flow",     color: "#2dd4bf" },
    B: { label: "Discovery",     color: "#fb923c" },
    C: { label: "Beliefs",       color: "#4ade80" },
    D: { label: "Objections",    color: "#f87171" },
    E: { label: "Identity",      color: "#e879f9" },
    F: { label: "Language",      color: "#a78bfa" },
    G: { label: "Tonality",      color: "#fbbf24" },
    H: { label: "Fundamentals",  color: "#64748b" },
    I: { label: "Remote & High-Ticket", color: "#38bdf8" },
  };
  const TREE_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const TIER_R = { 1: 30, 2: 18, 3: 11 };

  const PRE_UNLOCKED = new Set([
    "tonality","t_confused","t_curious","t_concerned","t_challenging",
    "t_playful","whatfeel","piv","tempo"
  ]);
  let unlockedSet = new Set(PRE_UNLOCKED);
  function isLocked(d) { return !unlockedSet.has(d.id); }

  /* ------------------------------------------------------------------ */
  /* Nodes — each has a single parent within its own tree (parent:null    */
  /* marks the tree root). Cross-tree relationships live in CROSS_LINKS.   */
  /* ------------------------------------------------------------------ */
  const NODES = [
    // A — Call Flow (root: spine)
    { id:"spine",        label:"One-Call Close",            cat:"A", tier:1, parent:null,    desc:"The whole sales process - the backbone everything hangs off.", scripts:["Think of this as one fluid process, not separate stages.","Your job is to move them through this spine naturally."] },
    { id:"opening",      label:"The Opening",               cat:"A", tier:2, parent:"spine", desc:"Why they're here, what they want help with, why now. Set the frame.", scripts:["'Before we dive in - what made you reach out now specifically?'","'What's the main thing you'd want to sort out from this call?'"] },
    { id:"setframe",     label:"Set Frame",                 cat:"A", tier:3, parent:"opening", desc:"Small agenda: see where they are, where they want to be, then next steps.", scripts:["'My goal today is just to understand where you are and where you want to get to.'"] },
    { id:"situation",    label:"Situation",                 cat:"A", tier:2, parent:"spine", desc:"What they're doing now, how long, why. Max 20 minutes.", scripts:["'Walk me through what that looks like day to day.'","'How long have you been doing it this way?'"] },
    { id:"problem",      label:"Problem",                   cat:"A", tier:1, parent:"spine", desc:"Dig into the pain. Pain creates urgency - satisfied people don't hop on sales calls.", scripts:["'What's the biggest thing holding you back right now?'","'If nothing changed in 6 months - what does that mean for you?'"] },
    { id:"eliminate",    label:"Eliminate Solutions",       cat:"A", tier:2, parent:"spine", desc:"What makes them want help instead of doing it alone?", scripts:["'What have you already tried to fix this?'","'Why not just do it yourself?'"] },
    { id:"buying",       label:"Buying Decision",           cat:"A", tier:2, parent:"spine", desc:"What they've done before, pre-handle objections, identity reframe.", scripts:["'When you've invested in something like this before, how did that go?'","'What would make this a clear yes for you?'"] },
    { id:"futurepacing", label:"Future Pacing",             cat:"A", tier:2, parent:"spine", desc:"Paint the results and the feeling - get them to see the destination.", scripts:["'If we got you there - what does that look like a year from now?'","'How would you feel walking into that?'"] },
    { id:"consequences", label:"Consequences",              cat:"A", tier:2, parent:"spine", desc:"The cost of not acting is the biggest driver. Make it real.", scripts:["'What happens if you're still in this same spot in a year?'","'What does staying stuck actually cost you?'"] },
    { id:"presentation", label:"Presentation",              cat:"A", tier:2, parent:"spine", desc:"Short, 3 parts, build certainty, then price.", scripts:["Keep it under 10 minutes.","'Let me show you the 3 things that make this work...'"] },
    { id:"objections_phase", label:"Objections Phase",      cat:"A", tier:2, parent:"spine", desc:"Bridge from the pitch to handling what's holding them back.", scripts:["'What questions do you have for me?'","Don't rush past resistance - it's information."] },

    // B — Discovery & Pain (root: discovery)
    { id:"discovery",    label:"Discovery",                 cat:"B", tier:1, parent:null,        desc:"Discovery decides the rest of the deal: get the real problem, its cost, and who decides.", scripts:["Almost every late objection is a discovery gap.","Establish value and urgency before price is on the table."] },
    { id:"sixneeds",     label:"6 Human Needs",             cat:"B", tier:2, parent:"discovery", desc:"Contribution, growth, variety, significance, love/connection, certainty. Ask from the bottom up.", scripts:["'What does this mean for the people around you?'","'What does growth look like to you right now?'"] },
    { id:"maslow",       label:"Maslow's Pyramid",          cat:"B", tier:2, parent:"discovery", desc:"Physiological to safety to belonging to esteem to self-actualization. Everything is relative.", scripts:["People buy from their current level of need, not above it."] },
    { id:"pain_isgap",   label:"Pain = The Gap",            cat:"B", tier:3, parent:"discovery", desc:"Satisfied people don't hop on sales calls. The gap between now and the goal is the pain.", scripts:[] },
    { id:"problemvssymptom", label:"Problem vs Symptom",    cat:"B", tier:2, parent:"discovery", desc:"The real pain lives in the symptoms. The surface problem is not the source.", scripts:["'That's the symptom - what's the actual problem underneath it?'"] },
    { id:"probingladder",label:"Probing Ladder",            cat:"B", tier:2, parent:"discovery", desc:"Broad to specific to timespan to quantify to business impact to personal impact to consequence.", scripts:["'How long has this been going on?'","'What has that cost you in real terms?'"] },
    { id:"openq",        label:"Open Questions",            cat:"B", tier:2, parent:"discovery", desc:"Open 'walk me through' questions get long answers that surface real detail.", scripts:["'Walk me through how this shows up day to day.'","Avoid yes/no questions - they invite one-word answers."] },
    { id:"dozenq",       label:"~A Dozen Questions",        cat:"B", tier:3, parent:"discovery", desc:"The sweet spot is roughly 11-14 targeted questions. More starts to feel like an interrogation.", scripts:["Quality and pacing over volume.","Sharp, sequenced questions beat a long checklist."] },
    { id:"threefour",    label:"3-4 Problem Rule",          cat:"B", tier:2, parent:"discovery", desc:"Go deep on three or four problems rather than shallow on ten.", scripts:["Stay on one topic through several follow-ups: cause, cost, frequency, impact.","Depth beats breadth for usable material."] },
    { id:"talklisten",   label:"Talk-Listen Ratio",         cat:"B", tier:2, parent:"discovery", desc:"Aim for ~40% talking, 60% listening. Every minute talking is a minute not learning.", scripts:["If you're well above 40% talk time, turn statements into questions.","Let the buyer narrate."] },
    { id:"seqq",         label:"Sequence Questions",        cat:"B", tier:3, parent:"discovery", desc:"Cluster probing questions around a live problem; save logistics for the end.", scripts:["Ask 'who else decides' after 15 minutes, not in the first two.","Earn openness before logistics."] },
    { id:"improvementoffer", label:"Improvement Offer",     cat:"B", tier:3, parent:"discovery", desc:"They're already trying something. Create doubt in their method.", scripts:["'What's made you want to try something different now?'"] },
    { id:"newopp",       label:"New Opportunity",           cat:"B", tier:3, parent:"discovery", desc:"Sell a new mechanism - their current approach is what's causing the pain.", scripts:["'The reason your current approach isn't working is...'"] },
    { id:"pb_justtellme",label:"Pushback: Just Tell Me",    cat:"B", tier:3, parent:"discovery", desc:"Soft defuse when they ask what you do before you've diagnosed.", scripts:["'I'd be doing you a disservice if I pitched before I understood your situation.'","'Think of it like a doctor - they need to see the symptoms first.'"] },
    { id:"pb_allgood",   label:"Pushback: All Fine",        cat:"B", tier:3, parent:"discovery", desc:"Good-to-great frame, hook, then re-ask.", scripts:["'I work with people already doing well who want to go further - that's exactly who this is for.'"] },

    // C — Beliefs & Reframes (root: limitingbeliefs)
    { id:"limitingbeliefs", label:"Limiting Beliefs",       cat:"C", tier:1, parent:null,             desc:"How they talk to you is how they talk to themselves. Beliefs drive all behavior.", scripts:["The objection is never about the offer - it's about what they believe about themselves."] },
    { id:"reframe4",     label:"4-Step Reframe",            cat:"C", tier:2, parent:"limitingbeliefs", desc:"Identify, clarify, reframe, close the loop.", scripts:["1. Name it. 2. Ask what they mean. 3. Reframe the meaning. 4. Confirm."] },
    { id:"reframeladder",label:"Reframe Steps",             cat:"C", tier:2, parent:"reframe4",        desc:"1 change meaning, 2 change reasons, 3 analogies, 4 change logical levels (identity).", scripts:["'What if it wasn't about X, but about Y?'","'Someone with the same constraints has done this...'"] },
    { id:"belief_types", label:"Belief Types",              cat:"C", tier:2, parent:"limitingbeliefs", desc:"Skeptical, money, 'not so bad', blames externally, 'fixes itself', wishful, research mode.", scripts:["Match your reframe to the specific type of belief they're holding."] },
    { id:"prehandle_q",  label:"Pre-Handle Question",       cat:"C", tier:2, parent:"limitingbeliefs", desc:"'What have you done before to solve this?' - asked early, prevents objections later.", scripts:["'Before we get into it - what have you already tried to fix this?'"] },
    { id:"b_tried",      label:"Tried Before",              cat:"C", tier:3, parent:"prehandle_q",     desc:"Good or bad results - either way, use it as data.", scripts:["'What did you try?'","'And what made it not stick?'"] },
    { id:"rf_restaurant",label:"Restaurant Reframe",        cat:"C", tier:3, parent:"b_tried",         desc:"One bad experience does not mean never again.", scripts:["'If you got food poisoning once, you wouldn't stop eating out forever, right?'"] },
    { id:"b_companies",  label:"Talking to Others",         cat:"C", tier:3, parent:"prehandle_q",     desc:"Gather leverage: 'what would you go by?'", scripts:["'What's making you compare options rather than just picking one?'"] },
    { id:"b_youtube",    label:"Tried It Alone",            cat:"C", tier:3, parent:"prehandle_q",     desc:"'If YouTube worked we'd all be millionaires.'", scripts:["'If free content was enough, you'd have figured it out already. What's in the way?'"] },
    { id:"b_nothing",    label:"Done Nothing",              cat:"C", tier:2, parent:"prehandle_q",     desc:"Find the real belief that's stopping them from starting.", scripts:["'So what's kept you from trying anything so far?'"] },
    { id:"realbeliefs",  label:"Real Beliefs",              cat:"C", tier:2, parent:"b_nothing",       desc:"Not a priority / fear of failure / 'I can fix it myself'.", scripts:["Once you know the real belief, name it directly but gently."] },
    { id:"ex_time",      label:"Excuse: Time",              cat:"C", tier:3, parent:"b_nothing",       desc:"Others in the same situation find time - it's a priority question.", scripts:["'Other people with a family and full-time job make this work. What's different for you?'"] },
    { id:"ex_money",     label:"Excuse: Money",             cat:"C", tier:3, parent:"b_nothing",       desc:"Resourcefulness reframe.", scripts:["'Money is a resource. Resourcefulness is a superpower. Which is actually missing?'"] },
    { id:"roimath",      label:"ROI Math",                  cat:"C", tier:3, parent:"ex_money",        desc:"Show what waiting costs - get them to accept the number.", scripts:["'If this costs X per month in lost revenue - over 3 months that's Y already gone.'"] },
    { id:"ex_didntknow", label:"Excuse: Didn't Know",       cat:"C", tier:3, parent:"b_nothing",       desc:"Whose responsibility is it to find a solution?", scripts:["'Now that you know - whose responsibility is it to act on it?'"] },
    { id:"ex_research",  label:"Excuse: Just Looking",      cat:"C", tier:3, parent:"b_nothing",       desc:"Clarity reframe and beach analogy.", scripts:["'That's like standing on the shore trying to figure out how warm the water is without getting in.'"] },
    { id:"rf_beach",     label:"Beach Reframe",             cat:"C", tier:3, parent:"ex_research",     desc:"You don't know until you dive in.", scripts:["'You can't know from the shore. You have to get in the water.'"] },
    { id:"identityframe",label:"Identity Frame",            cat:"C", tier:2, parent:"limitingbeliefs", desc:"Create an identity gap - the problem is who they're being, not just what they're doing.", scripts:["'What would the version of you who already had this do right now?'"] },
    { id:"rf_nicekind",  label:"Nice vs Kind",              cat:"C", tier:3, parent:"identityframe",   desc:"Dare to say the truth. Nice avoids. Kind tells.", scripts:["'I could be nice and say it'll be fine. I'd rather be kind and tell you what I see.'"] },
    { id:"rf_medal",     label:"Medal Reframe",             cat:"C", tier:3, parent:"reframeladder",   desc:"You run faster with a medal to aim for. Used in future pacing.", scripts:["'A clear goal changes everything about how you move toward it.'"] },
    { id:"rf_lion",      label:"Lion Reframe",              cat:"C", tier:3, parent:"reframeladder",   desc:"You run faster with a lion behind you. Used in consequences.", scripts:["'What would it take for this to feel truly urgent?'"] },
    { id:"rf_boats",     label:"Burn the Boats",            cat:"C", tier:3, parent:"reframeladder",   desc:"Having a plan B is part of the problem.", scripts:["'The plan B is what makes the plan A optional.'"] },

    // D — Objection Handling (root: objections)
    { id:"objections",   label:"Objections",                cat:"D", tier:1, parent:null,           desc:"Objections are limitations. Flip it so their 'why' outweighs the objection.", scripts:["Every objection is a reason they haven't bought yet. Find the real one."] },
    { id:"smoke_vs_real",label:"Smoke vs Real",             cat:"D", tier:2, parent:"objections",    desc:"Is this the real objection or a cover story? Don't treat a smoke screen as real.", scripts:["'Is that your only concern, or is there something else?'","'If we sorted out the [X] - would you want to go ahead?'"] },
    { id:"o_think",      label:"Need to Think",             cat:"D", tier:3, parent:"smoke_vs_real", desc:"Isolate the real concern.", scripts:["'Of course. What specifically do you feel you need to think over?'","'Is it the money, the timing, or something else?'"] },
    { id:"o_partner",    label:"Need Partner",              cat:"D", tier:3, parent:"smoke_vs_real", desc:"What is the conversation mostly about? Find the DMP.", scripts:["'What do you think that conversation will mostly be about?'"] },
    { id:"dmp",          label:"Decision Process",          cat:"D", tier:2, parent:"o_partner",     desc:"Surface whether this is a real pattern or avoidance.", scripts:["'Walk me through how you've made big decisions like this before.'"] },
    { id:"dmp_partner",  label:"DMP: Partner",              cat:"D", tier:3, parent:"dmp",           desc:"Whose responsibility is this decision?", scripts:["'At some point someone has to own changing this. Who is that?'"] },
    { id:"dmp_scale",    label:"DMP: 1-10 Scale",           cat:"D", tier:3, parent:"dmp",           desc:"Position the mindset as the problem, not the decision.", scripts:["'On a 1-10, how certain are you this is the right move?'","'What would make it a 10?'"] },
    { id:"rf_airplane",  label:"Airplane Reframe",          cat:"D", tier:3, parent:"dmp_scale",     desc:"Trust the authority and prior proof.", scripts:["'You don't become the pilot to trust the cockpit. You trust the track record.'"] },
    { id:"niche_smoke",  label:"Niche Smoke Screens",       cat:"D", tier:3, parent:"smoke_vs_real", desc:"Testimonials, other companies - clarity reframe.", scripts:["'What would a testimonial tell you that our conversation hasn't?'"] },
    { id:"o_money",      label:"Money Objection",           cat:"D", tier:2, parent:"smoke_vs_real", desc:"9/10 times the main objection. Use CDR.", scripts:["Don't argue. Clarify what they mean, defuse the emotion, reframe the real concern."] },
    { id:"cdr",          label:"CDR",                       cat:"D", tier:2, parent:"o_money",       desc:"Clarify, Defuse, Reframe - three questions to unpack the real concern behind money.", scripts:["Clarify: 'What do you mean by that?'","Defuse: 'I hear you. That makes sense.'","Reframe: 'Here's what most people mean by that...'"] },
    { id:"twofold",      label:"Two-Fold Choice",           cat:"D", tier:2, parent:"cdr",           desc:"Offer two paths, the better one last, then 'Why?' - forces a real answer.", scripts:["'Most people who say that are either unsure it'll work, or worried about the investment. Which is it?'"] },
    { id:"o_time",       label:"Time Objection",            cat:"D", tier:3, parent:"smoke_vs_real", desc:"Others in worse situations find time.", scripts:["'I've worked with people juggling more than you - what would need to shift for this to fit?'"] },
    { id:"fear",         label:"Fear Objection",            cat:"D", tier:2, parent:"objections",    desc:"Comes last - after money and partner. Fear of failure or judgment.", scripts:["'What's the worst that happens if this doesn't work?'","'And if it does - what does that mean for you?'"] },
    { id:"abc",          label:"ABC",                       cat:"D", tier:2, parent:"fear",          desc:"Admit, befriend, convert. Pattern interrupt for fear.", scripts:["'That fear is actually a good sign - it means this matters to you.'"] },
    { id:"bossvoice",    label:"Boss Voice",                cat:"D", tier:3, parent:"abc",           desc:"Challenge the voice keeping them stuck. Take them off autopilot.", scripts:["'Which voice is talking - the one that keeps you safe, or the one that moves you forward?'"] },
    { id:"slowdown",     label:"Slow Down",                 cat:"D", tier:3, parent:"objections",    desc:"Set the pace when objections come. Pause. Build trust.", scripts:["Silence is powerful. Don't rush to fill it when they object."] },
    { id:"objframework", label:"5-Step Framework",          cat:"D", tier:2, parent:"objections",    desc:"Listen, Validate, Clarify, Respond, Confirm - in order, every time.", scripts:["Don't skip Clarify - answering the wrong concern still loses the deal.","Confirm it's resolved or it resurfaces at the close."] },
    { id:"rootcauses",   label:"3 Root Causes",             cat:"D", tier:2, parent:"objframework",  desc:"Every objection is emotional, tactical, or practical. Diagnose before you answer.", scripts:["'It's too expensive' can be any of the three.","Find which one you're dealing with first."] },
    { id:"feelfeltfound",label:"Feel-Felt-Found",           cat:"D", tier:2, parent:"objframework",  desc:"Validate, then shift from opinion to evidence with a specific outcome.", scripts:["'I understand how you feel. Others felt the same. What they found was [specific outcome].'","The third beat must be concrete, not a cliche."] },
    { id:"proactive",    label:"Pre-empt Objections",       cat:"D", tier:2, parent:"objections",    desc:"Raise the predictable objections yourself, before the prospect does.", scripts:["'I'll be upfront - this isn't the cheapest option, and here's why that's worth it.'","Pre-empting removes the adversarial frame and signals competence."] },

    // E — Identity (root: identity)
    { id:"identity",     label:"Identity",                  cat:"E", tier:1, parent:null,         desc:"Humanity's greatest force: maintaining its self-image. Higher leverage than any argument.", scripts:["People don't act against their identity. They buy their next identity."] },
    { id:"logiclevels",  label:"Logical Levels",            cat:"E", tier:2, parent:"identity",   desc:"Environment to behaviour to skills to beliefs to identity. Higher = more leverage.", scripts:["Don't argue at the behaviour level. Go up to identity."] },
    { id:"identitygap",  label:"Identity Gap",              cat:"E", tier:2, parent:"identity",   desc:"Acknowledge identity, limiting belief, connect, create pain, urgency, offer as the bridge.", scripts:["'You're already someone who [X]. The gap to [desired identity] is what this solves.'"] },
    { id:"desiredidentity", label:"Desired Identity",       cat:"E", tier:3, parent:"identitygap", desc:"'Where does your drive come from?' - surfaces who they want to become.", scripts:["'Who do you want to be known as in 3 years?'"] },
    { id:"identitybridge",label:"Identity Bridge",          cat:"E", tier:3, parent:"identitygap", desc:"The product is the vehicle from their current self to their desired self.", scripts:["'This isn't just about results. It's about who you become in the process.'"] },
    { id:"realurgency",  label:"Real Urgency",              cat:"E", tier:3, parent:"identitygap", desc:"A promise to themselves beats fake deadline pressure.", scripts:["'The urgency comes from the cost of staying who you are right now.'"] },

    // F — Language Diagnostics (root: straightline)
    { id:"straightline", label:"The Straight Line",         cat:"F", tier:2, parent:null,           desc:"Selling is a straight line. Prospects bend off it - your job is to bend them back.", scripts:["Every answer should move them toward clarity and a decision."] },
    { id:"talkmirror",   label:"Language = Self-Talk",      cat:"F", tier:2, parent:"straightline", desc:"How they talk to you mirrors how they talk to themselves.", scripts:["'They said they'll try - that's how they approach everything in life.'"] },
    { id:"l_wishful",    label:"Wishful Language",          cat:"F", tier:3, parent:"straightline", desc:"'I wish...' - call it out. Ask what they need to stop wishing.", scripts:["'You keep saying wish. What would it take to make it real?'"] },
    { id:"l_minimize",   label:"Minimizing Language",       cat:"F", tier:3, parent:"straightline", desc:"'Not that bad' - would a pro accept mediocre results anywhere else?", scripts:["'Would you settle for mediocre results anywhere else in your life?'"] },
    { id:"l_external",   label:"Victim Language",           cat:"F", tier:3, parent:"straightline", desc:"Blames outward. Find someone with the same constraints who succeeded.", scripts:["'Someone in your exact situation figured this out. What did they do differently?'"] },
    { id:"l_ambiguous",  label:"Ambiguous Language",        cat:"F", tier:3, parent:"straightline", desc:"'I think...' - repeat it back so they hear the doubt themselves.", scripts:["'You said you think you can. Do you know you can, or are you hoping?'"] },

    // G — Tonality & Delivery (root: tonality)
    { id:"tonality",     label:"Tonality",                  cat:"G", tier:2, parent:null,       desc:"Transfer emotions, not just information. Master your own state first.", scripts:["The tone you hold determines what the prospect feels - not the words."] },
    { id:"t_confused",   label:"Confused Tone",             cat:"G", tier:3, parent:"tonality", desc:"People help the confused. They open up and explain.", scripts:["'I'm confused - help me understand...'"] },
    { id:"t_curious",    label:"Curious Tone",              cat:"G", tier:3, parent:"tonality", desc:"Shows you want to help, not push.", scripts:["'Tell me more about that.'","Genuine curiosity = genuine trust."] },
    { id:"t_concerned",  label:"Concerned Tone",            cat:"G", tier:3, parent:"tonality", desc:"Amplifies the pain genuinely.", scripts:["'That sounds really frustrating - how long has this been going on?'"] },
    { id:"t_challenging",label:"Challenging Tone",          cat:"G", tier:3, parent:"tonality", desc:"Don't let them buy their limitations.", scripts:["'Is that actually true, or does it just feel true right now?'"] },
    { id:"t_playful",    label:"Playful Tone",              cat:"G", tier:3, parent:"tonality", desc:"Defuses tension, gets them honest early.", scripts:["Playful early = trust fast.","Smile in your voice when the stakes are low."] },
    { id:"whatfeel",     label:"What To Feel?",             cat:"G", tier:3, parent:"tonality", desc:"Choose the emotion before you choose the words.", scripts:["Before each question: what state do I want them in?"] },
    { id:"piv",          label:"Perception-Intention-Value",cat:"G", tier:2, parent:"tonality", desc:"Three steps so they actually receive what you're saying.", scripts:["Perception: how you come across. Intention: what you want. Value: what they get."] },
    { id:"tempo",        label:"Tempo & Timing",            cat:"G", tier:3, parent:"tonality", desc:"Medium tempo so you can emphasize. Slow down on important lines.", scripts:["Pause after the key line. Let it land."] },

    // H — Fundamentals (root: fundamentals)
    { id:"fundamentals", label:"Fundamentals",              cat:"H", tier:1, parent:null,           desc:"The anchors the whole call rests on: authority, funnel, their words, your identity.", scripts:["Get the basics right and everything else lands harder."] },
    { id:"authority",    label:"Authority",                 cat:"H", tier:2, parent:"fundamentals", desc:"Look, sound and be like someone who has it. Good setup matters.", scripts:["'I've worked with 50+ people in exactly your situation.'","Your certainty is contagious - or its absence is."] },
    { id:"funnel",       label:"Funnel",                    cat:"H", tier:2, parent:"fundamentals", desc:"Broad to narrow. Stop using cookie-cutter questions deeper in the call.", scripts:["Open broadly early. Get specific as you understand their situation."] },
    { id:"theirwords",   label:"Use Their Words",           cat:"H", tier:2, parent:"fundamentals", desc:"Their words = gospel. Yours mean little. Feed their language back.", scripts:["When they describe the pain, write it down. Use it verbatim later."] },
    { id:"selleridentity",label:"Seller's Identity",        cat:"H", tier:2, parent:"fundamentals", desc:"Level 1 salesperson, Level 2 consultant, Level 3 transformation guide.", scripts:["You can't take someone further than you've gone yourself.","Who you're being matters more than what you say."] },

    // I — Remote & High-Ticket (root: remote)
    { id:"remote",       label:"Remote & High-Ticket",      cat:"I", tier:1, parent:null,     desc:"Big deals on a screen run on different signals - risk management over persuasion.", scripts:["Most objections form before and after your call, not during it.","Plan for what happens after you hang up."] },
    { id:"cameraon",     label:"Camera On",                 cat:"I", tier:2, parent:"remote", desc:"Camera on the whole call - it reads engagement and builds mutual trust.", scripts:["Closed deals use video more than lost deals.","Don't go off-camera during screen-shares - that's when attention drifts."] },
    { id:"framecontrol", label:"Frame Control",             cat:"I", tier:2, parent:"remote", desc:"Open by stating what the call covers and bring it back when it drifts.", scripts:["'In the next 20 minutes I'd like to... does that work, or anything to add?'","Propose structure and invite them in - don't steamroll."] },
    { id:"remoteopen",   label:"Remote Opening",            cat:"I", tier:2, parent:"remote", desc:"Win the first 30 seconds: who you are, respect their time, a specific reason.", scripts:["'I'll keep this brief. I noticed [specific observation]. Can I ask one quick question?'","Generic 'got a minute?' openers read as background noise."] },
    { id:"derisk",       label:"De-Risk not Discount",      cat:"I", tier:2, parent:"remote", desc:"When a high-ticket buyer hesitates, lower the risk, not the price.", scripts:["Discounting signals the price wasn't solid and invites more pushback.","Use specific proof, guarantees, a pilot, or honest limitations."] },
  ];

  // Cross-tree links — show the methodology is one connected system (dashed).
  const CROSS_LINKS = [
    ["discovery","problem"], ["problemvssymptom","o_money"], ["prehandle_q","buying"],
    ["identityframe","identity"], ["reframeladder","logiclevels"], ["talkmirror","limitingbeliefs"],
    ["fear","identity"], ["selleridentity","identity"], ["objections_phase","objections"],
    ["identitygap","buying"], ["twofold","fear"], ["dmp_scale","presentation"],
    ["consequences","rf_lion"], ["futurepacing","rf_medal"],
    ["proactive","prehandle_q"], ["feelfeltfound","cdr"], ["rootcauses","o_money"],
    ["framecontrol","setframe"], ["remoteopen","opening"], ["derisk","o_money"],
    ["talklisten","situation"], ["openq","probingladder"],
    ["tonality","opening"], ["tonality","problem"], ["tonality","objections"],
    ["authority","spine"], ["funnel","spine"], ["theirwords","spine"],
  ];

  const nodeById = {};
  NODES.forEach(n => { nodeById[n.id] = n; });

  /* ------------------------------------------------------------------ */
  /* Layout — one top-down tree per category, packed into a grid          */
  /* ------------------------------------------------------------------ */
  const SIB_GAP   = 108;  // horizontal spacing between sibling nodes
  const LEVEL_GAP = 100;  // vertical spacing between tree depths
  const COLS      = 3;    // trees per row
  const COL_GAP   = 64;
  const ROW_GAP   = 96;
  const HEADER_SPACE = 64;

  const trees = [];
  TREE_ORDER.forEach((cat) => {
    const catNodes = NODES.filter(n => n.cat === cat);
    if (!catNodes.length) return;
    let root;
    try {
      root = d3.stratify().id(d => d.id).parentId(d => d.parent)(catNodes);
    } catch (e) {
      console.error(`Tree ${cat} failed to build:`, e.message);
      return;
    }
    d3.tree().nodeSize([SIB_GAP, LEVEL_GAP])(root);

    const descendants = root.descendants();
    let minX = Infinity, maxX = -Infinity, maxDepth = 0;
    descendants.forEach(d => {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      maxDepth = Math.max(maxDepth, d.depth);
    });
    trees.push({
      cat, root, descendants,
      width: (maxX - minX) || 1,
      height: maxDepth * LEVEL_GAP,
      minX,
    });
  });

  // Grid packing: uniform column width, per-row height.
  const colWidth = Math.max(...trees.map(t => t.width)) + COL_GAP;
  const rowHeights = [];
  trees.forEach((t, i) => {
    const row = Math.floor(i / COLS);
    rowHeights[row] = Math.max(rowHeights[row] || 0, t.height + HEADER_SPACE);
  });
  const rowY = [];
  rowHeights.forEach((h, r) => { rowY[r] = (r === 0 ? 0 : rowY[r - 1] + rowHeights[r - 1] + ROW_GAP); });

  trees.forEach((t, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const cellX = col * (colWidth + COL_GAP);
    const originX = cellX + (colWidth - t.width) / 2 - t.minX;
    const originY = rowY[row] + HEADER_SPACE;
    t.headerX = cellX + colWidth / 2;
    t.headerY = rowY[row] + 18;
    t.descendants.forEach(d => {
      const node = d.data;
      node.gx = originX + d.x;
      node.gy = originY + d.y;
      node.parentNode = d.parent ? d.parent.data : null;
    });
  });

  /* ------------------------------------------------------------------ */
  /* Adjacency (for hover highlight)                                      */
  /* ------------------------------------------------------------------ */
  const adjacency = {};
  function addAdj(a, b) { (adjacency[a] = adjacency[a] || new Set()).add(b); (adjacency[b] = adjacency[b] || new Set()).add(a); }
  NODES.forEach(n => { if (n.parent) addAdj(n.id, n.parent); });
  CROSS_LINKS.forEach(([s, t]) => { if (nodeById[s] && nodeById[t]) addAdj(s, t); });

  const branchLinks = NODES.filter(n => n.parentNode).map(n => ({ source: n.parentNode, target: n }));
  const crossLinks  = CROSS_LINKS
    .filter(([s, t]) => nodeById[s] && nodeById[t])
    .map(([s, t]) => ({ source: nodeById[s], target: nodeById[t] }));

  /* ------------------------------------------------------------------ */
  /* DOM refs                                                            */
  /* ------------------------------------------------------------------ */
  const wrap      = document.getElementById("map-svg-wrap");
  const svgEl     = document.getElementById("map-svg");
  const tooltip   = document.getElementById("map-tooltip");
  const ttLabel   = document.getElementById("tt-label");
  const ttDesc    = document.getElementById("tt-desc");
  const sidePanel = document.getElementById("side-panel");
  const spTitle   = document.getElementById("sp-title");
  const spBadge   = document.getElementById("sp-badge");
  const spDesc    = document.getElementById("sp-desc");
  const spScripts = document.getElementById("sp-scripts");
  const closeSide = document.getElementById("side-close-btn");

  const W = () => wrap.clientWidth;
  const H = () => wrap.clientHeight;

  /* ------------------------------------------------------------------ */
  /* SVG + zoom                                                          */
  /* ------------------------------------------------------------------ */
  const svg = d3.select(svgEl);
  const g   = svg.append("g");
  const zoom = d3.zoom().scaleExtent([0.12, 3.5]).on("zoom", e => g.attr("transform", e.transform));
  svg.call(zoom);

  // Global bounding box of all placed nodes.
  function bbox() {
    const xs = NODES.map(n => n.gx), ys = NODES.map(n => n.gy);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  // Fit the trees to the width and anchor them at the top (no empty gap).
  function fitView() {
    const b = bbox();
    const pad = 60;
    const contentW = (b.maxX - b.minX) + pad * 2;
    const scale = Math.min((W()) / contentW, 0.95);
    const tx = (W() - (b.maxX - b.minX) * scale) / 2 - b.minX * scale;
    const ty = 28 - b.minY * scale;
    svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  /* ------------------------------------------------------------------ */
  /* Glow filters (one per category)                                     */
  /* ------------------------------------------------------------------ */
  const defs = svg.append("defs");
  Object.keys(CATS).forEach((key) => {
    const f = defs.append("filter").attr("id", `glow-${key}`)
      .attr("x", "-60%").attr("y", "-60%").attr("width", "220%").attr("height", "220%");
    f.append("feGaussianBlur").attr("stdDeviation", "4").attr("result", "blur");
    const m = f.append("feMerge");
    m.append("feMergeNode").attr("in", "blur");
    m.append("feMergeNode").attr("in", "SourceGraphic");
  });

  /* ------------------------------------------------------------------ */
  /* Tree headings                                                       */
  /* ------------------------------------------------------------------ */
  const headerG = g.append("g").attr("class", "tree-headers");
  trees.forEach(t => {
    const grp = headerG.append("g").attr("data-cat", t.cat);
    grp.append("text").attr("class", "tree-title")
      .attr("x", t.headerX).attr("y", t.headerY)
      .attr("fill", CATS[t.cat].color).attr("font-size", "17px")
      .text(CATS[t.cat].label);
    grp.append("text").attr("class", "tree-title-sub")
      .attr("x", t.headerX).attr("y", t.headerY + 18)
      .attr("fill", "#666").attr("font-size", "10px").attr("letter-spacing", "0.16em")
      .text("SKILL TREE");
  });

  /* ------------------------------------------------------------------ */
  /* Links                                                               */
  /* ------------------------------------------------------------------ */
  function linkPath(s, t) {
    const my = (s.gy + t.gy) / 2;
    return `M${s.gx},${s.gy} C${s.gx},${my} ${t.gx},${my} ${t.gx},${t.gy}`;
  }

  const crossG = g.append("g").attr("class", "cross-links");
  const crossSel = crossG.selectAll("line").data(crossLinks).join("line")
    .attr("class", "edge cross-edge")
    .attr("x1", e => e.source.gx).attr("y1", e => e.source.gy)
    .attr("x2", e => e.target.gx).attr("y2", e => e.target.gy)
    .attr("stroke", "#5a5a5a").attr("stroke-width", 0.9)
    .attr("stroke-opacity", 0.38).attr("stroke-dasharray", "4,4");

  const branchG = g.append("g").attr("class", "branch-links");
  const branchSel = branchG.selectAll("path").data(branchLinks).join("path")
    .attr("class", "edge branch-edge")
    .attr("d", e => linkPath(e.source, e.target))
    .attr("fill", "none")
    .attr("stroke", e => CATS[e.target.cat].color)
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.4);

  /* ------------------------------------------------------------------ */
  /* Nodes                                                               */
  /* ------------------------------------------------------------------ */
  function wrapLabel(text) {
    if (text.length <= 15) return [text];
    const words = text.split(" ");
    const lines = []; let cur = "";
    words.forEach(w => {
      if ((cur + " " + w).trim().length > 15 && cur) { lines.push(cur); cur = w; }
      else cur = (cur + " " + w).trim();
    });
    if (cur) lines.push(cur);
    return lines.slice(0, 2);
  }

  const nodeG = g.append("g").attr("class", "nodes");
  const nodeSel = nodeG.selectAll("g.node-group").data(NODES).join("g")
    .attr("class", "node-group")
    .attr("data-cat", d => d.cat)
    .attr("transform", d => `translate(${d.gx},${d.gy})`)
    .attr("cursor", "pointer");

  nodeSel.append("circle")
    .attr("class", "node-circle")
    .attr("r", d => TIER_R[d.tier])
    .attr("fill", d => CATS[d.cat].color)
    .attr("fill-opacity", d => d.tier === 1 ? 0.9 : d.tier === 2 ? 0.62 : 0.42)
    .attr("stroke", d => CATS[d.cat].color)
    .attr("stroke-width", d => d.tier === 1 ? 2.5 : d.tier === 2 ? 1.4 : 0.8)
    .attr("stroke-opacity", 0.9)
    .attr("filter", d => d.tier === 1 ? `url(#glow-${d.cat})` : null);

  nodeSel.each(function (d) {
    const lines = wrapLabel(d.label);
    const fs = d.tier === 1 ? 12 : d.tier === 2 ? 10 : 8.5;
    const startY = TIER_R[d.tier] + 12;
    const text = d3.select(this).append("text")
      .attr("class", "node-label")
      .attr("fill", d.tier === 3 ? "#bbb" : "#f0f0f0")
      .attr("font-size", `${fs}px`)
      .attr("font-weight", d.tier === 1 ? "600" : "400")
      .attr("font-family", "DM Mono, monospace")
      .attr("text-anchor", "middle");
    lines.forEach((ln, i) => {
      text.append("tspan").attr("x", 0).attr("y", startY + i * (fs + 2)).text(ln);
    });
  });

  /* ------------------------------------------------------------------ */
  /* Hover                                                               */
  /* ------------------------------------------------------------------ */
  const hiddenCats = new Set();

  nodeSel
    .on("mouseover", function (event, d) {
      const nb = adjacency[d.id] || new Set();
      nodeSel.attr("opacity", n => (n.id === d.id || nb.has(n.id)) ? 1 : 0.1);
      branchSel.attr("stroke-opacity", e => (e.source.id === d.id || e.target.id === d.id) ? 0.95 : 0.05);
      crossSel.attr("stroke-opacity", e => (e.source.id === d.id || e.target.id === d.id) ? 0.85 : 0.05);
      ttLabel.textContent = isLocked(d) ? `${d.label} (locked)` : d.label;
      ttDesc.textContent  = isLocked(d) ? "Complete training sessions to unlock this skill." : d.desc;
      tooltip.style.display = "block";
      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => { resetOpacity(); tooltip.style.display = "none"; })
    .on("click", function (event, d) { event.stopPropagation(); openPanel(d); });

  svg.on("click", closePanel);

  function moveTooltip(event) {
    const r = wrap.getBoundingClientRect();
    const x = event.clientX - r.left + 14;
    const y = event.clientY - r.top - 14;
    tooltip.style.left = Math.min(x, r.width - 240) + "px";
    tooltip.style.top  = Math.max(y, 4) + "px";
  }

  function resetOpacity() {
    nodeSel.attr("opacity", d => hiddenCats.has(d.cat) ? 0 : 1);
    branchSel.attr("stroke-opacity", e => (hiddenCats.has(e.source.cat) || hiddenCats.has(e.target.cat)) ? 0 : 0.4);
    crossSel.attr("stroke-opacity", e => (hiddenCats.has(e.source.cat) || hiddenCats.has(e.target.cat)) ? 0 : 0.38);
  }

  /* ------------------------------------------------------------------ */
  /* Side panel                                                          */
  /* ------------------------------------------------------------------ */
  function escHtml(str) { const d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

  function openPanel(d) {
    const cat = CATS[d.cat];
    spTitle.textContent = d.label;
    spBadge.textContent = cat.label;
    spBadge.style.color = cat.color;
    spBadge.style.borderColor = cat.color;
    spDesc.textContent = d.desc;
    if (d.scripts && d.scripts.length) {
      spScripts.innerHTML = `<div class="side-scripts-label">// Example lines</div><ul>${d.scripts.map(s => `<li>${escHtml(s)}</li>`).join("")}</ul>`;
    } else {
      spScripts.innerHTML = "";
    }
    sidePanel.classList.add("open");
  }
  function closePanel() { sidePanel.classList.remove("open"); }
  closeSide.addEventListener("click", e => { e.stopPropagation(); closePanel(); });

  /* ------------------------------------------------------------------ */
  /* Category filters                                                    */
  /* ------------------------------------------------------------------ */
  function applyCatVisibility() {
    headerG.selectAll("g").attr("opacity", function () {
      return hiddenCats.has(this.getAttribute("data-cat")) ? 0 : 1;
    });
    resetOpacity();
  }

  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      if (cat === "ALL") {
        hiddenCats.clear();
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        applyCatVisibility();
        return;
      }
      document.querySelector(".filter-btn[data-cat='ALL']").classList.remove("active");
      if (hiddenCats.has(cat)) { hiddenCats.delete(cat); btn.classList.add("active"); }
      else { hiddenCats.add(cat); btn.classList.remove("active"); }
      applyCatVisibility();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Search                                                              */
  /* ------------------------------------------------------------------ */
  const searchInput = document.getElementById("map-search");
  searchInput.addEventListener("input", function () {
    const q = this.value.trim().toLowerCase();
    if (!q) { resetOpacity(); return; }
    const matched = new Set(NODES.filter(n => n.label.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q)).map(n => n.id));
    nodeSel.attr("opacity", d => matched.has(d.id) ? 1 : 0.08);
    branchSel.attr("stroke-opacity", 0.04);
    crossSel.attr("stroke-opacity", 0.04);
    const first = NODES.find(n => matched.has(n.id));
    if (first) {
      svg.transition().duration(600).call(zoom.transform,
        d3.zoomIdentity.translate(W() / 2 - first.gx * 1.2, H() / 2 - first.gy * 1.2).scale(1.2));
    }
  });
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { this.value = ""; resetOpacity(); fitView(); }
  });

  /* ------------------------------------------------------------------ */
  /* Lock state                                                          */
  /* ------------------------------------------------------------------ */
  function applyLockState() {
    nodeSel.select("circle.node-circle")
      .attr("fill", d => isLocked(d) ? "#1e1e1e" : CATS[d.cat].color)
      .attr("fill-opacity", d => isLocked(d) ? 0.5 : d.tier === 1 ? 0.9 : d.tier === 2 ? 0.62 : 0.42)
      .attr("stroke", d => isLocked(d) ? "#333" : CATS[d.cat].color)
      .attr("filter", d => (d.tier === 1 && !isLocked(d)) ? `url(#glow-${d.cat})` : null);
    nodeSel.selectAll("text.node-label tspan").attr("fill", function () { return null; });
    nodeSel.select("text.node-label").attr("fill", d => isLocked(d) ? "#555" : (d.tier === 3 ? "#bbb" : "#f0f0f0"));
  }

  async function fetchUnlockedSkills() {
    const token = localStorage.getItem("scg_auth_token");
    if (!token) return;
    try {
      const res = await fetch("/api/skills/unlocked", { headers: { "Authorization": `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json();
      unlockedSet = new Set(data.unlockedIds || []);
      PRE_UNLOCKED.forEach(id => unlockedSet.add(id));
      applyLockState();
    } catch { /* keep pre-unlocked only */ }
  }

  /* ------------------------------------------------------------------ */
  /* Init                                                                */
  /* ------------------------------------------------------------------ */
  fitView();
  fetchUnlockedSkills();
  window.addEventListener("resize", fitView);
})();
