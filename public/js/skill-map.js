(() => {
  /* ------------------------------------------------------------------ */
  /* Category config                                                      */
  /* ------------------------------------------------------------------ */
  const CATS = {
    A: { label:"Call Flow",    color:"#2dd4bf", center:{ x:  0,   y:  0   } },
    B: { label:"Discovery",    color:"#fb923c", center:{ x:  320, y: -60  } },
    C: { label:"Beliefs",      color:"#4ade80", center:{ x:  280, y:  280 } },
    D: { label:"Objections",   color:"#f87171", center:{ x: -20,  y:  320 } },
    E: { label:"Identity",     color:"#e879f9", center:{ x:  0,   y: -320 } },
    F: { label:"Language",     color:"#a78bfa", center:{ x: -320, y: -100 } },
    G: { label:"Tonality",     color:"#fbbf24", center:{ x: -300, y:  200 } },
    H: { label:"Fundamentals", color:"#64748b", center:{ x: -80,  y:  0   } },
  };

  const TIER_R = { 1:32, 2:18, 3:10 };

  /* ------------------------------------------------------------------ */
  /* Node data (~71 nodes)                                               */
  /* ------------------------------------------------------------------ */
  const NODES = [
    // A — Call Flow
    { id:"spine",           label:"One-Call Close",            cat:"A", tier:1, desc:"The whole sales process — the backbone everything hangs off.", scripts:["Think of this as one fluid process, not separate stages.","Your job is to move them through this spine naturally."] },
    { id:"opening",         label:"The Opening",               cat:"A", tier:2, desc:"Why they're here, what they want help with, why now. Set the frame.", scripts:["'Before we dive in — what made you reach out now specifically?'","'What's the main thing you'd want to sort out from this call?'"] },
    { id:"setframe",        label:"Set Frame",                 cat:"A", tier:3, desc:"Small agenda: see where they are, where they want to be, then next steps.", scripts:["'My goal today is just to understand where you are and where you want to get to.'"] },
    { id:"situation",       label:"Situation",                 cat:"A", tier:2, desc:"What are they doing now, how long, why. Max 20 minutes.", scripts:["'Walk me through what that looks like day to day.'","'How long have you been doing it this way?'"] },
    { id:"problem",         label:"Problem",                   cat:"A", tier:1, desc:"Dig into the pain. Pain creates urgency — satisfied people don't hop on sales calls.", scripts:["'What's the biggest thing holding you back right now?'","'If nothing changed in 6 months — what does that mean for you?'"] },
    { id:"eliminate",       label:"Eliminate Other Solutions", cat:"A", tier:2, desc:"What makes them want help instead of doing it alone?", scripts:["'What have you already tried to fix this?'","'Why not just do it yourself?'"] },
    { id:"buying",          label:"Understand Buying Decision",cat:"A", tier:2, desc:"What have they done before, pre-handle objections, identity reframe.", scripts:["'When you've invested in something like this before, how did that go?'","'What would make this a clear yes for you?'"] },
    { id:"futurepacing",    label:"Future Pacing",             cat:"A", tier:2, desc:"Paint the results and the feeling — get them to see the destination.", scripts:["'If we got you there — what does that look like a year from now?'","'How would you feel walking into that?'"] },
    { id:"consequences",    label:"Consequences",              cat:"A", tier:2, desc:"The cost of not acting is the biggest driver. Make it real.", scripts:["'What happens if you're still in this same spot in a year?'","'What does staying stuck actually cost you?'"] },
    { id:"presentation",    label:"Presentation (3 Pillars)",  cat:"A", tier:2, desc:"Short, 3 parts, build certainty, then price.", scripts:["Keep it under 10 minutes.","'Let me show you the 3 things that make this work...'"] },
    { id:"objections_phase",label:"Objections Phase",          cat:"A", tier:2, desc:"Bridge from the pitch to handling what's holding them back.", scripts:["'What questions do you have for me?'","Don't rush past resistance — it's information."] },

    // B — Discovery & Pain
    { id:"sixneeds",        label:"6 Human Needs",            cat:"B", tier:2, desc:"Contribution, growth, variety, significance, love/connection, certainty. Ask from the bottom up.", scripts:["'What does this mean for the people around you?'","'What does growth look like to you right now?'"] },
    { id:"maslow",          label:"Maslow's Pyramid",         cat:"B", tier:2, desc:"Physiological → safety → belonging → esteem → self-actualization. Everything is relative.", scripts:["People don't buy up the pyramid — they buy from their current level of need."] },
    { id:"pain_isgap",      label:"Pain = What They Don't Have",cat:"B", tier:3, desc:"Satisfied people don't hop on sales calls. The gap between now and their goal is the pain.", scripts:[] },
    { id:"problemvssymptom",label:"Problem vs Symptom",       cat:"B", tier:2, desc:"The real pain lives in the symptoms. The surface problem is not the source.", scripts:["'That's the symptom — what's the actual problem underneath it?'"] },
    { id:"probingladder",   label:"Probing Ladder",           cat:"B", tier:2, desc:"Broad → specific → timespan → quantify → business impact → personal impact → consequence.", scripts:["'How long has this been going on?'","'What has that cost you in real terms?'"] },
    { id:"improvementoffer",label:"Improvement Offer",        cat:"B", tier:3, desc:"They're already trying something. Create doubt in their method.", scripts:["'What's made you want to try something different now?'"] },
    { id:"newopp",          label:"New Opportunity",          cat:"B", tier:3, desc:"Sell a new mechanism — their current approach is what's causing the pain.", scripts:["'The reason your current approach isn't working is...'"] },
    { id:"pb_justtellme",   label:"Pushback: Just Tell Me",  cat:"B", tier:3, desc:"Soft defuse when they ask what you do before you've diagnosed.", scripts:["'I'd be doing you a disservice if I just pitched before I understood your situation.'","'Think of it like a doctor — they need to see the symptoms first.'"] },
    { id:"pb_allgood",      label:"Pushback: Everything's Fine",cat:"B", tier:3, desc:"Good-to-great frame + hook + re-ask.", scripts:["'I work with people who are already doing well and want to go further — that's exactly who this is for.'"] },

    // C — Beliefs & Reframes
    { id:"limitingbeliefs", label:"Limiting Beliefs",        cat:"C", tier:1, desc:"How they talk to you is how they talk to themselves. Beliefs drive all behavior.", scripts:["The objection is never about the offer — it's about what they believe about themselves."] },
    { id:"reframe4",        label:"4-Step Reframe",          cat:"C", tier:2, desc:"Identify → Clarify → Reframe → Close the loop.", scripts:["1. Name it. 2. Ask what they mean. 3. Reframe the meaning. 4. Confirm."] },
    { id:"belief_types",    label:"Belief Types",            cat:"C", tier:2, desc:"Skeptical, money, 'not so bad', blames externally, 'fixes itself', wishful thinking, research mode.", scripts:["Match your reframe to the specific type of belief they're holding."] },
    { id:"reframeladder",   label:"Reframe Steps",           cat:"C", tier:2, desc:"1 change meaning → 2 change reasons → 3 analogies → 4 change logical levels (identity).", scripts:["'What if it wasn't about X, but about Y?'","'Someone else with the same constraints has done this...'"] },
    { id:"prehandle_q",     label:"Pre-Handle Question",     cat:"C", tier:2, desc:"'What have you done before to solve this?' — asked early, prevents objections later.", scripts:["'Before we get into it — what have you already tried to fix this?'"] },
    { id:"b_tried",         label:"Tried Before",            cat:"C", tier:3, desc:"Good/bad results — either way, use it as data.", scripts:["'What did you try?'","'And what made it not stick?'"] },
    { id:"b_companies",     label:"Talking to Others",       cat:"C", tier:3, desc:"Gather leverage: 'what would you go by?'", scripts:["'What's making you compare options rather than just picking one?'"] },
    { id:"b_youtube",       label:"Tried It Alone",          cat:"C", tier:3, desc:"'If YouTube worked we'd all be millionaires.'", scripts:["'If free content was enough, you'd have figured it out already. What's actually in the way?'"] },
    { id:"b_nothing",       label:"Done Nothing",            cat:"C", tier:2, desc:"Find the real belief that's stopping them from starting.", scripts:["'So what's kept you from trying anything so far?'"] },
    { id:"ex_time",         label:"Excuse: Time",            cat:"C", tier:3, desc:"Others in the same situation find time — it's a priority question.", scripts:["'Other people with a family and full-time job have made this work. What's different for you?'"] },
    { id:"ex_money",        label:"Excuse: Money",           cat:"C", tier:3, desc:"Resourcefulness reframe.", scripts:["'Money is a resource. Resourcefulness is a superpower. Which one is actually missing?'"] },
    { id:"ex_didntknow",    label:"Excuse: Didn't Know",     cat:"C", tier:3, desc:"Whose responsibility is it to find a solution?", scripts:["'Now that you know — whose responsibility is it to act on it?'"] },
    { id:"ex_research",     label:"Excuse: Just Looking",    cat:"C", tier:3, desc:"Clarity reframe + beach analogy.", scripts:["'That's like standing on the shore trying to figure out how warm the water is without getting in.'"] },
    { id:"realbeliefs",     label:"Real Beliefs",            cat:"C", tier:2, desc:"Not a priority / fear of failure / 'I can fix it myself'.", scripts:["Once you know the real belief, name it directly but gently."] },
    { id:"identityframe",   label:"Identity Frame",          cat:"C", tier:2, desc:"Create an identity gap — the problem is who they're being, not just what they're doing.", scripts:["'What would the version of you who already had this do right now?'"] },
    { id:"roimath",         label:"ROI Math",                cat:"C", tier:3, desc:"Show what waiting costs — get them to accept the number.", scripts:["'If this costs £X per month in lost revenue — over 3 months that's £Y already gone.'"] },
    { id:"rf_restaurant",   label:"Restaurant Reframe",      cat:"C", tier:3, desc:"One bad experience ≠ never again.", scripts:["'If you got food poisoning once, you wouldn't stop eating out forever, right?'"] },
    { id:"rf_beach",        label:"Beach / Weather Reframe", cat:"C", tier:3, desc:"You don't know until you dive in.", scripts:["'You can't know from the shore. You have to get in the water.'"] },
    { id:"rf_medal",        label:"Medal Reframe",           cat:"C", tier:3, desc:"You run faster with a medal to aim for. Used in future pacing.", scripts:["'Having a clear goal changes everything about how you move toward it.'"] },
    { id:"rf_lion",         label:"Lion Reframe",            cat:"C", tier:3, desc:"You run faster with a lion behind you. Used in consequences.", scripts:["'What would it take for this to feel truly urgent?'"] },
    { id:"rf_boats",        label:"Burn the Boats",          cat:"C", tier:3, desc:"Having a plan B is part of the problem.", scripts:["'The plan B is what makes the plan A optional.'"] },
    { id:"rf_nicekind",     label:"Nice vs Kind",            cat:"C", tier:3, desc:"Dare to say the truth. Nice avoids. Kind tells.", scripts:["'I could be nice and tell you it'll be fine. I'd rather be kind and tell you what I actually see.'"] },

    // D — Objection Handling
    { id:"objections",      label:"Objections",              cat:"D", tier:1, desc:"Objections are limitations. Flip it so their 'why' outweighs the objection.", scripts:["Every objection is a reason they haven't bought yet. Find the real one."] },
    { id:"smoke_vs_real",   label:"Smoke Screen vs Real",    cat:"D", tier:2, desc:"Is this the real objection or a cover story? Don't treat a smoke screen as real.", scripts:["'Is that your only concern, or is there something else?'","'If we could sort out the [X] — would you want to go ahead?'"] },
    { id:"slowdown",        label:"Slow Down / Pause",       cat:"D", tier:3, desc:"Set the pace when objections come. Pause. Build trust.", scripts:["Silence is powerful. Don't rush to fill it when they object."] },
    { id:"o_think",         label:"Need to Think About It",  cat:"D", tier:3, desc:"Isolate the real concern.", scripts:["'Of course. What specifically do you feel you need to think over?'","'Is it the money, the timing, or something else?'"] },
    { id:"o_partner",       label:"Need to Talk to Partner", cat:"D", tier:3, desc:"What is the conversation mostly about? → Find the DMP.", scripts:["'What do you think that conversation will mostly be about?'"] },
    { id:"niche_smoke",     label:"Niche Smoke Screens",     cat:"D", tier:3, desc:"Testimonials, other companies → clarity reframe.", scripts:["'What specifically would a testimonial tell you that our conversation hasn't?'"] },
    { id:"o_money",         label:"Money Objection",         cat:"D", tier:2, desc:"9/10 times the main objection. Use CDR.", scripts:["Don't argue. Clarify what they mean, defuse the emotion, reframe the real concern."] },
    { id:"cdr",             label:"CDR: Clarify–Defuse–Reframe",cat:"D", tier:2, desc:"3 questions in a row to unpack the real concern behind money.", scripts:["Clarify: 'What do you mean by that?'","Defuse: 'I hear you. That makes sense.'","Reframe: 'Here's what most people mean when they say that...'"] },
    { id:"twofold",         label:"Two-Fold Choice",         cat:"D", tier:2, desc:"Offer two paths, the better one last, then 'Why?' — forces a real answer.", scripts:["'Most people who say that are either unsure it'll work, or worried about the investment. Which is it for you?'"] },
    { id:"o_time",          label:"Time Objection",          cat:"D", tier:3, desc:"Others in worse situations find time.", scripts:["'I've worked with people juggling more than you — what would need to shift for this to fit?'"] },
    { id:"dmp",             label:"Decision-Making Process", cat:"D", tier:2, desc:"Surface whether this is a real pattern or avoidance.", scripts:["'Walk me through how you've made big decisions like this in the past.'"] },
    { id:"dmp_partner",     label:"DMP: Partner / Responsibility",cat:"D", tier:3, desc:"Whose responsibility is this decision?", scripts:["'At some point someone has to take ownership of changing this. Who is that?'"] },
    { id:"dmp_scale",       label:"DMP: 1–10 Scale",         cat:"D", tier:3, desc:"Position the mindset as the problem, not the decision.", scripts:["'On a 1–10, how certain are you this is the right move?'","'What would make it a 10?'"] },
    { id:"rf_airplane",     label:"Airplane / Cockpit",      cat:"D", tier:3, desc:"Trust the authority and prior proof.", scripts:["'You don't become the pilot to trust the cockpit. You trust the track record.'"] },
    { id:"fear",            label:"Fear Objection",          cat:"D", tier:2, desc:"Comes last — after money and partner. Fear of failure or judgment.", scripts:["'What's the worst that happens if this doesn't work?'","'And if it does — what does that mean for you?'"] },
    { id:"abc",             label:"ABC: Admit–Befriend–Convert",cat:"D", tier:2, desc:"Pattern interrupt for fear: admit it's real, befriend it, convert it.", scripts:["'That fear is actually a good sign — it means this matters to you.'"] },
    { id:"bossvoice",       label:"Boss Voice vs Bitch Voice",cat:"D", tier:3, desc:"Challenge the voice keeping them stuck. Take them off autopilot.", scripts:["'Which voice is talking right now — the one that keeps you safe, or the one that moves you forward?'"] },

    // E — Identity
    { id:"identity",        label:"Identity",                 cat:"E", tier:1, desc:"Humanity's greatest force: maintaining its self-image. Higher leverage than any argument.", scripts:["People don't act against their identity. They buy their next identity."] },
    { id:"logiclevels",     label:"Logical Levels Pyramid",  cat:"E", tier:2, desc:"Environment → Behaviour → Skills → Beliefs → Identity. Higher = more leverage.", scripts:["Don't argue at the behaviour level. Go up to identity."] },
    { id:"identitygap",     label:"Identity Gap Framework",  cat:"E", tier:2, desc:"6 steps: acknowledge identity → limiting belief → connect → create pain → urgency → offer as the bridge.", scripts:["'You're already someone who [X]. The gap between that and [desired identity] is exactly what this solves.'"] },
    { id:"desiredidentity", label:"Desired Identity",        cat:"E", tier:3, desc:"'Where does your drive come from?' — surfaces who they want to become.", scripts:["'Who do you want to be known as in 3 years?'"] },
    { id:"identitybridge",  label:"Offer = Identity Bridge", cat:"E", tier:3, desc:"The product is the vehicle from their current self to their desired self.", scripts:["'This isn't just about the results. It's about who you become in the process.'"] },
    { id:"realurgency",     label:"Real Urgency",            cat:"E", tier:3, desc:"A promise to themselves beats fake deadline pressure.", scripts:["'The urgency isn't artificial. It comes from the cost of staying who you are right now.'"] },

    // F — Language Diagnostics
    { id:"straightline",    label:"The Straight Line",       cat:"F", tier:2, desc:"Selling is a straight line. Prospects bend off it — your job is to bend them back.", scripts:["Every answer should move them toward clarity and a decision."] },
    { id:"talkmirror",      label:"Language = Self-Talk",    cat:"F", tier:2, desc:"How they talk to you mirrors how they talk to themselves.", scripts:["'They said they'll try — that's how they approach everything in their life.'"] },
    { id:"l_wishful",       label:"Wishful Language",        cat:"F", tier:3, desc:"'I wish…' — call it out. Ask what they need to stop wishing.", scripts:["'You keep saying wish. What would it actually take to make it real?'"] },
    { id:"l_minimize",      label:"Minimizing Language",     cat:"F", tier:3, desc:"'Not that bad' — would a pro accept mediocre results anywhere else?", scripts:["'Would you settle for mediocre results anywhere else in your life?'"] },
    { id:"l_external",      label:"Victim / External",       cat:"F", tier:3, desc:"Blames outward → find someone with the same constraints who succeeded.", scripts:["'Someone in your exact situation has figured this out. What do you think they did differently?'"] },
    { id:"l_ambiguous",     label:"Ambiguous Language",      cat:"F", tier:3, desc:"'I think…' — repeat it back so they hear the doubt themselves.", scripts:["'You said you think you can. Do you know you can, or are you hoping?'"] },

    // G — Tonality & Delivery
    { id:"tonality",        label:"Tonality",                cat:"G", tier:2, desc:"Transfer emotions, not just information. Master your own state first.", scripts:["The tone you hold determines what the prospect feels — not the words."] },
    { id:"t_confused",      label:"Confused Tone",           cat:"G", tier:3, desc:"People help the confused. They open up and explain.", scripts:["'I'm confused — help me understand...'"] },
    { id:"t_curious",       label:"Curious Tone",            cat:"G", tier:3, desc:"Shows you want to help, not push.", scripts:["'Tell me more about that.'","Genuine curiosity = genuine trust."] },
    { id:"t_concerned",     label:"Concerned Tone",          cat:"G", tier:3, desc:"Amplifies the pain genuinely.", scripts:["'That sounds really frustrating — how long has this been going on?'"] },
    { id:"t_challenging",   label:"Challenging Tone",        cat:"G", tier:3, desc:"Don't let them buy their limitations.", scripts:["'Is that actually true, or does it just feel true right now?'"] },
    { id:"t_playful",       label:"Playful Tone",            cat:"G", tier:3, desc:"Defuses tension, gets them honest early.", scripts:["Playful early = trust fast.","Smile in your voice when the stakes are low."] },
    { id:"whatfeel",        label:"What Do I Want Them to Feel?",cat:"G", tier:3, desc:"Choose the emotion before you choose the words.", scripts:["Before each question: what state do I want them in?"] },
    { id:"piv",             label:"Perception · Intention · Value",cat:"G", tier:2, desc:"Three steps so they actually receive what you're saying.", scripts:["Perception: how you come across. Intention: what you want. Value: what they get from it."] },
    { id:"tempo",           label:"Verbal Tempo & Timing",   cat:"G", tier:3, desc:"Medium tempo so you can emphasize. Slow down on important lines.", scripts:["Pause after the key line. Let it land."] },

    // H — Fundamentals
    { id:"authority",       label:"Authority",               cat:"H", tier:2, desc:"Look, sound and be like someone who has it. Good setup matters.", scripts:["'I've worked with 50+ people in exactly your situation.'","Your certainty is contagious — or its absence is."] },
    { id:"funnel",          label:"Funnel",                  cat:"H", tier:2, desc:"Broad → narrow. Stop using cookie-cutter questions deeper in the call.", scripts:["Open broadly early. Get specific as you understand their situation."] },
    { id:"theirwords",      label:"Use Their Words",         cat:"H", tier:2, desc:"Their words = gospel. Yours mean little. Feed their language back.", scripts:["When they describe the pain, write it down. Use it verbatim later."] },
    { id:"selleridentity",  label:"Seller's Identity",       cat:"H", tier:2, desc:"Level 1: salesperson → Level 2: consultant → Level 3: transformation guide.", scripts:["You can't take someone further than you've gone yourself.","Who you're being on the call matters more than what you say."] },
  ];

  /* ------------------------------------------------------------------ */
  /* Edges                                                               */
  /* ------------------------------------------------------------------ */
  const EDGE_DATA = [
    // Spine — sequential call flow
    ["spine","opening","spine"],["opening","situation","spine"],["situation","problem","spine"],
    ["problem","eliminate","spine"],["eliminate","buying","spine"],["buying","futurepacing","spine"],
    ["futurepacing","consequences","spine"],["consequences","presentation","spine"],
    ["presentation","objections_phase","spine"],["opening","setframe","intra"],
    ["spine","problem","intra"],["spine","buying","intra"],["spine","objections_phase","intra"],
    // B
    ["problem","sixneeds","intra"],["problem","maslow","intra"],["problem","problemvssymptom","intra"],
    ["problem","probingladder","intra"],["problem","improvementoffer","intra"],["problem","newopp","intra"],
    ["opening","pb_justtellme","intra"],["opening","pb_allgood","intra"],
    // C
    ["limitingbeliefs","reframe4","intra"],["reframe4","reframeladder","intra"],
    ["limitingbeliefs","belief_types","intra"],["prehandle_q","b_tried","intra"],
    ["prehandle_q","b_companies","intra"],["prehandle_q","b_youtube","intra"],
    ["prehandle_q","b_nothing","intra"],["b_nothing","realbeliefs","intra"],
    ["b_nothing","ex_time","intra"],["b_nothing","ex_money","intra"],
    ["b_nothing","ex_didntknow","intra"],["b_nothing","ex_research","intra"],
    ["b_tried","rf_restaurant","intra"],["ex_research","rf_beach","intra"],
    ["ex_money","roimath","intra"],["identityframe","rf_nicekind","intra"],
    ["limitingbeliefs","identityframe","intra"],
    // D
    ["objections","smoke_vs_real","intra"],["smoke_vs_real","o_think","intra"],
    ["smoke_vs_real","o_partner","intra"],["smoke_vs_real","niche_smoke","intra"],
    ["smoke_vs_real","o_money","intra"],["smoke_vs_real","o_time","intra"],
    ["o_money","cdr","intra"],["cdr","twofold","intra"],["o_partner","dmp","intra"],
    ["dmp","dmp_partner","intra"],["dmp","dmp_scale","intra"],["dmp_scale","rf_airplane","intra"],
    ["objections","fear","intra"],["fear","abc","intra"],["abc","bossvoice","intra"],
    ["slowdown","smoke_vs_real","intra"],
    // E
    ["identity","logiclevels","intra"],["identity","identitygap","intra"],
    ["identitygap","desiredidentity","intra"],["identitygap","identitybridge","intra"],
    ["identitygap","realurgency","intra"],
    // F
    ["straightline","talkmirror","intra"],["straightline","l_wishful","intra"],
    ["straightline","l_minimize","intra"],["straightline","l_external","intra"],
    ["straightline","l_ambiguous","intra"],
    // G
    ["tonality","t_confused","intra"],["tonality","t_curious","intra"],
    ["tonality","t_concerned","intra"],["tonality","t_challenging","intra"],
    ["tonality","t_playful","intra"],["tonality","whatfeel","intra"],
    ["tonality","piv","intra"],["tonality","tempo","intra"],
    // Tonality halo
    ["tonality","opening","tonality"],["tonality","situation","tonality"],
    ["tonality","problem","tonality"],["tonality","buying","tonality"],
    ["tonality","futurepacing","tonality"],["tonality","consequences","tonality"],
    ["tonality","presentation","tonality"],["tonality","objections_phase","tonality"],
    // Cross-links
    ["problemvssymptom","o_money","cross"],["identityframe","identity","cross"],
    ["reframeladder","logiclevels","cross"],["identitygap","buying","cross"],
    ["identitygap","realbeliefs","cross"],["talkmirror","limitingbeliefs","cross"],
    ["talkmirror","belief_types","cross"],["twofold","fear","cross"],
    ["twofold","dmp","cross"],["dmp_scale","presentation","cross"],
    ["prehandle_q","buying","cross"],["sixneeds","opening","cross"],
    ["maslow","opening","cross"],["consequences","rf_lion","cross"],
    ["consequences","rf_boats","cross"],["futurepacing","rf_medal","cross"],
    ["fear","identity","cross"],["authority","spine","cross"],
    ["funnel","spine","cross"],["theirwords","spine","cross"],
    ["selleridentity","identity","cross"],["objections_phase","objections","cross"],
    ["limitingbeliefs","buying","cross"],
  ];

  const edges = EDGE_DATA.map(([s, t, type]) => ({ source: s, target: t, type }));

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

  const nodeById = {};
  NODES.forEach(n => { nodeById[n.id] = n; });

  /* ------------------------------------------------------------------ */
  /* Initial positions — scatter around category centers                 */
  /* ------------------------------------------------------------------ */
  NODES.forEach(n => {
    const c = CATS[n.cat].center;
    const spread = n.tier === 1 ? 20 : n.tier === 2 ? 70 : 110;
    n.x = c.x + (Math.random() - 0.5) * spread;
    n.y = c.y + (Math.random() - 0.5) * spread;
  });

  /* ------------------------------------------------------------------ */
  /* SVG + zoom                                                          */
  /* ------------------------------------------------------------------ */
  const svg = d3.select(svgEl);
  const g   = svg.append("g");

  const zoom = d3.zoom()
    .scaleExtent([0.08, 6])
    .on("zoom", e => g.attr("transform", e.transform));

  svg.call(zoom);

  function centerView() {
    svg.call(zoom.transform,
      d3.zoomIdentity.translate(W() / 2, H() / 2).scale(0.65));
  }
  centerView();

  /* ------------------------------------------------------------------ */
  /* Glow filters (one per category)                                     */
  /* ------------------------------------------------------------------ */
  const defs = svg.append("defs");
  Object.entries(CATS).forEach(([key]) => {
    const f = defs.append("filter")
      .attr("id", `glow-${key}`)
      .attr("x","-60%").attr("y","-60%").attr("width","220%").attr("height","220%");
    f.append("feGaussianBlur").attr("stdDeviation","5").attr("result","blur");
    const m = f.append("feMerge");
    m.append("feMergeNode").attr("in","blur");
    m.append("feMergeNode").attr("in","SourceGraphic");
  });

  /* ------------------------------------------------------------------ */
  /* Draw edges                                                          */
  /* ------------------------------------------------------------------ */
  const edgeG   = g.append("g").attr("class","edges");
  const edgeSel = edgeG.selectAll("line")
    .data(edges).join("line")
    .attr("class","edge")
    .attr("stroke", e => e.type === "spine" ? "#2dd4bf" : e.type === "tonality" ? "#fbbf24" : e.type === "cross" ? "#555" : "#2a2a2a")
    .attr("stroke-width", e => e.type === "spine" ? 2 : e.type === "tonality" ? 1.2 : 0.8)
    .attr("stroke-opacity", e => e.type === "spine" ? 0.85 : e.type === "tonality" ? 0.5 : e.type === "cross" ? 0.4 : 0.3)
    .attr("stroke-dasharray", e => e.type === "cross" ? "4,3" : null);

  /* ------------------------------------------------------------------ */
  /* Draw nodes                                                          */
  /* ------------------------------------------------------------------ */
  const nodeG   = g.append("g").attr("class","nodes");
  const nodeSel = nodeG.selectAll("g.node-group")
    .data(NODES).join("g")
    .attr("class","node-group")
    .attr("cursor","pointer")
    .call(d3.drag()
      .on("start", (e,d) => { if (!e.active) sim.alphaTarget(0.2).restart(); d.fx=d.x; d.fy=d.y; })
      .on("drag",  (e,d) => { d.fx=e.x; d.fy=e.y; })
      .on("end",   (e,d) => { if (!e.active) sim.alphaTarget(0); d.fx=null; d.fy=null; })
    );

  nodeSel.append("circle")
    .attr("r", d => TIER_R[d.tier])
    .attr("fill", d => CATS[d.cat].color)
    .attr("fill-opacity", d => d.tier === 1 ? 0.9 : d.tier === 2 ? 0.65 : 0.45)
    .attr("stroke", d => CATS[d.cat].color)
    .attr("stroke-width", d => d.tier === 1 ? 2.5 : d.tier === 2 ? 1 : 0.5)
    .attr("stroke-opacity", 0.9)
    .attr("filter", d => d.tier === 1 ? `url(#glow-${d.cat})` : null)
    .attr("opacity", d => d.tier === 3 ? 0.55 : 1);

  nodeSel.append("text")
    .attr("class","node-label")
    .attr("fill","#f0f0f0")
    .attr("font-size", d => d.tier === 1 ? "11px" : d.tier === 2 ? "8.5px" : "7px")
    .attr("font-weight", d => d.tier === 1 ? "600" : "400")
    .attr("font-family", "DM Mono, monospace")
    .attr("dominant-baseline","central")
    .attr("text-anchor","middle")
    .attr("pointer-events","none")
    .attr("opacity", d => d.tier === 3 ? 0 : 1)
    .text(d => d.label);

  /* ------------------------------------------------------------------ */
  /* Force simulation                                                    */
  /* ------------------------------------------------------------------ */
  const sim = d3.forceSimulation(NODES)
    .force("link", d3.forceLink(edges)
      .id(d => d.id)
      .distance(e => e.type === "spine" ? 80 : e.type === "tonality" ? 200 : e.type === "cross" ? 170 : 65)
      .strength(e => e.type === "spine" ? 0.9 : e.type === "tonality" ? 0.15 : e.type === "cross" ? 0.25 : 0.6)
    )
    .force("charge", d3.forceManyBody()
      .strength(d => d.tier === 1 ? -500 : d.tier === 2 ? -200 : -90))
    .force("center", d3.forceCenter(0, 0).strength(0.03))
    .force("collide", d3.forceCollide(d => TIER_R[d.tier] + 5))
    .force("radial", d3.forceRadial(
      d => d.tier === 1 ? 0 : (d.cat === "A" || d.cat === "D") ? 130 : 310,
      d => CATS[d.cat].center.x,
      d => CATS[d.cat].center.y
    ).strength(0.07))
    .alphaDecay(0.010)
    .velocityDecay(0.42);

  sim.on("tick", () => {
    edgeSel
      .attr("x1", e => e.source.x).attr("y1", e => e.source.y)
      .attr("x2", e => e.target.x).attr("y2", e => e.target.y);
    nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
  });

  /* ------------------------------------------------------------------ */
  /* Hover                                                               */
  /* ------------------------------------------------------------------ */
  function neighborIds(d) {
    const ids = new Set([d.id]);
    edges.forEach(e => {
      const sid = typeof e.source === "object" ? e.source.id : e.source;
      const tid = typeof e.target === "object" ? e.target.id : e.target;
      if (sid === d.id) ids.add(tid);
      if (tid === d.id) ids.add(sid);
    });
    return ids;
  }

  nodeSel
    .on("mouseover", function(event, d) {
      const nb = neighborIds(d);
      nodeSel.attr("opacity", n => nb.has(n.id) ? 1 : 0.08);
      edgeSel.attr("stroke-opacity", e => {
        const sid = typeof e.source === "object" ? e.source.id : e.source;
        const tid = typeof e.target === "object" ? e.target.id : e.target;
        return sid === d.id || tid === d.id ? 0.95 : 0.04;
      });
      ttLabel.textContent = d.label;
      ttDesc.textContent  = d.desc;
      tooltip.style.display = "block";
      moveTooltip(event);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", () => { resetOpacity(); tooltip.style.display = "none"; })
    .on("click", function(event, d) { event.stopPropagation(); openPanel(d); });

  svg.on("click", closePanel);

  function moveTooltip(event) {
    const r = wrap.getBoundingClientRect();
    const x = event.clientX - r.left + 14;
    const y = event.clientY - r.top  - 14;
    tooltip.style.left = Math.min(x, r.width - 240) + "px";
    tooltip.style.top  = Math.max(y, 4) + "px";
  }

  const hiddenCats = new Set();

  function resetOpacity() {
    nodeSel.attr("opacity", d => hiddenCats.has(d.cat) ? 0 : (d.tier === 3 ? 0.55 : 1));
    edgeSel.attr("stroke-opacity", e => {
      const sc = typeof e.source === "object" ? e.source.cat : nodeById[e.source]?.cat;
      const tc = typeof e.target === "object" ? e.target.cat : nodeById[e.target]?.cat;
      if (hiddenCats.has(sc) || hiddenCats.has(tc)) return 0;
      return e.type === "spine" ? 0.85 : e.type === "tonality" ? 0.5 : e.type === "cross" ? 0.4 : 0.3;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Side panel                                                          */
  /* ------------------------------------------------------------------ */
  function escHtml(str) {
    const d = document.createElement("div"); d.textContent = str; return d.innerHTML;
  }

  function openPanel(d) {
    const cat = CATS[d.cat];
    spTitle.textContent = d.label;
    spBadge.textContent = `${d.cat} — ${cat.label}`;
    spBadge.style.color       = cat.color;
    spBadge.style.borderColor = cat.color;
    spDesc.textContent  = d.desc;
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
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;

      if (cat === "ALL") {
        hiddenCats.clear();
        document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        resetOpacity();
        return;
      }

      document.querySelector(".filter-btn[data-cat='ALL']").classList.remove("active");

      if (hiddenCats.has(cat)) {
        hiddenCats.delete(cat);
        btn.classList.add("active");
      } else {
        hiddenCats.add(cat);
        btn.classList.remove("active");
      }

      resetOpacity();
    });
  });

  /* ------------------------------------------------------------------ */
  /* Search                                                              */
  /* ------------------------------------------------------------------ */
  const searchInput = document.getElementById("map-search");
  searchInput.addEventListener("input", function() {
    const q = this.value.trim().toLowerCase();
    if (!q) { resetOpacity(); return; }

    const matched = new Set(
      NODES.filter(n => n.label.toLowerCase().includes(q) || n.desc.toLowerCase().includes(q))
           .map(n => n.id)
    );

    nodeSel.attr("opacity", d => matched.has(d.id) ? 1 : 0.06);
    edgeSel.attr("stroke-opacity", 0.04);

    const first = NODES.find(n => matched.has(n.id));
    if (first && first.x != null) {
      svg.transition().duration(600)
        .call(zoom.transform,
          d3.zoomIdentity.translate(W()/2 - first.x * 1.5, H()/2 - first.y * 1.5).scale(1.5));
    }
  });

  searchInput.addEventListener("keydown", function(e) {
    if (e.key === "Escape") { this.value = ""; resetOpacity(); }
  });

  /* ------------------------------------------------------------------ */
  /* Resize                                                              */
  /* ------------------------------------------------------------------ */
  window.addEventListener("resize", centerView);

})();
