# Culture Club Vision (v2)

cccircuit.com

A members' club with no house. We go to culture together.

---

## The Thesis

London has infinite culture and zero infrastructure for experiencing it consistently with the same people. The gap between "I should go to more things" and actually going is not informational. Time Out, Eventbrite, and Instagram solve discovery. Nobody solves the social barrier: going alone is hard, going with the same people is harder, and recognising who keeps showing up is impossible without a system.

Culture Club is a members' club where the city is the building and attendance is the only currency. No fixed venue. No annual fee. No dress code. Members go to cultural events across London together on a rotating circuit. The club recognises who keeps showing up and rewards consistency with access. Everything runs on Circuit.

Three forces make this viable now.

The post-pandemic loneliness crisis created intense editorial and cultural appetite for "community as the answer." Run clubs, supper clubs, book clubs, and sober raves have replaced traditional nightlife for 25-40 year olds. Strava reported a 59% increase in run club participation. Eventbrite reported book club events up 31% year-on-year. The demand for recurring informal gatherings is at an all-time high and rising.

Soho House's 30-year inability to turn a profit culminated in a $2.7 billion going-private buyout that closed January 29, 2026 after nearly collapsing. The company has begun purging members who no longer fit its "creative profile" after expanding to 270,000 members. The New Statesman called it the McDonald's of private members' clubs. The narrative vacuum — "what replaces the members' club?" — is open and unclaimed.

Nobody in London curates across film, food, fitness, and art for a single community at an accessible price point. The cross-format gap is confirmed: private members' clubs touch multiple formats but serve a wealthy niche (The Arts Club at £3,200/year, Shoreditch Arts Club at £2,000/year). Grassroots communities are siloed by format — the best supper clubs don't programme film screenings, and the best run clubs don't organise gallery visits. Culture Club fills this gap.

The positioning is post-Soho House, not anti-Soho House. Anti-Soho House is reactive and rides someone else's decline. Post-Soho House is constructive and proposes what comes next. A members' club with no house.

---

## The Name

Culture Club is the organiser name on Circuit. It sits in the same position as "Backlight" would for Naia. The Digital Stub says "Culture Club" at the top. The Circuit watermark sits at the bottom. This is how Circuit works: the organiser is the brand, Circuit is the infrastructure.

cccircuit.com is the URL. Pronounced "circuit." The "cc" encodes "culture club" as a wink, not a brand name. In press, on social, in conversation, it is just Circuit. When someone screenshots their stub, they see Culture Club. When a journalist asks what platform this runs on, the answer is Circuit. When an organiser asks how attendance is tracked, the answer is Circuit. Same name, two doors.

The Soho House Principle from TASTE.md applies to Circuit's own club: Circuit is the building; Culture Club is the sign on the door.

When someone types the URL, they type circuit. When someone sees a stub, they see Culture Club. When someone visits meetcircuit.com, they see the product. The club promotes the infrastructure. The infrastructure enables the club. There is no translation layer.

The "Culture Club" name is used as a descriptive organiser name, not a registered trademark in Class 41. This reduces but does not eliminate the Boy George trademark risk. A professional UK IPO trademark search should be completed before any commercial use. The London Art Fair also operates a "Culture Club" membership programme — a closer conceptual competitor. A trademark attorney should assess both risks and advise on whether a distinctive modifier is needed.

---

## The Channels

Two channels. Each does one job.

### Email is the front door

cccircuit.com has one field: your email. That is the queue. You submit, you are on the list. You get a weekly email with the shortlist — two or three options for that week's format, RSVP links powered by Circuit. Clean, short, no newsletter energy. The subject line is the format: "Watch: Thursday." or "Eat: Saturday."

Everyone on the email list can RSVP to any outing. Email is how the club scales past 200, past 1,000, past 5,000 without ever hitting a platform ceiling. The email list is the club.

Email handles: the queue, the weekly shortlist, Wildcard announcements, the press-friendly funnel metric ("500 people on the list").

### WhatsApp is the living room

The WhatsApp group is earned. You get added after your first outing. It is capped at 200. This number is not arbitrary. Robin Dunbar's research confirms that groups above 150 shift from conversation to broadcast. The cap preserves intimacy. The cap creates scarcity.

WhatsApp is where people talk about what happened, share recommendations, post their stub, coordinate who is going next week. The group is where strangers become regulars. It is the social layer that makes someone come back a second time because they recognise a name, not because the programming was good.

If you never make it into the WhatsApp group, you are still a member. You still get the email, you still RSVP, you still get stubs, your attendance still counts. But the group is the reward for showing up.

WhatsApp handles: post-event conversation, social bonds, real-time coordination, the feeling of belonging.

When someone lapses for 3+ months, they are gracefully removed and the spot opens for someone from the queue. They can re-enter later. Their attendance count in Circuit is preserved.

### Circuit handles everything else

RSVP, check-in, attendance tracking, unlock rules, Digital Stubs, recognition emails, Core Member computation. Circuit is the consent gate. The first time a member RSVPs, they see the consent checkbox (unchecked by default, readable terms, per SPEC.md). WhatsApp group membership does not constitute GDPR consent. Circuit's RSVP flow does.

### The Card is the artefact

The Culture Club Card is a matte black NFC card handed to a member by the curator at their first outing (Floor tier — see Membership Model below). One card per member, kept for life. The card is the physical proof of membership and the mechanism by which members vouch strangers into the Queue: hand the card to a friend, the friend taps their phone to it, the friend lands on a join page crediting the member. See `avdience-docs/docs/culture-club/CULTURE_CLUB_CARD.md` for the full hardware and tap spec.

The stack: email for broadcast (free), WhatsApp for community (free, capped at 200), the Card for vouching (handed at the door), Circuit for infrastructure (the product).

---

## The Membership Model

Everyone enters through the same door: an email address on cccircuit.com. What happens after that is determined entirely by how often you show up.

### The Queue

Submitting your email puts you in the queue. You get an email when the next outing is announced. You can RSVP immediately. This is not a waitlist in the Soho House sense. It is capacity management. The queue length is the metric cited in every press pitch. "500 people on the email list" is a headline. The queue is the product's marketing.

### The Floor

Once you attend your first outing and are added to the WhatsApp group, you are on the floor. You see every outing announced via email. You hear the conversation in WhatsApp. You RSVP through Circuit. You show up. No tier label. No onboarding. You are in.

### The Regulars

After 3 outings attended (tracked by Circuit, not manually), an unlock rule fires. You get 24-hour early access to RSVP for the next outing. This matters when a supper club has 12 seats or a screening has 40 spots and 80 people want them. The people who keep coming get first access. No announcement. No badge. You notice the RSVP link arrives earlier than it used to.

### The Circuit

After 6 outings attended, Circuit's Core Member Doctrine applies. For monthly cadence events, the system-defined threshold is 3 or more visits in 180 days — which Culture Club's 6-outing milestone exceeds. Core Members get access to a second tier of programming: the intimate ones. A 10-person dinner. A studio visit. A conversation with a filmmaker after a screening that only the inner circle knows about. These are not "VIP events." They are events that only work with people who already know each other from showing up repeatedly. The intimacy is earned, not purchased.

The behavioural science validates this structure. Jeffrey Hall's 2019 research established that 40-60 hours of leisure time together creates casual friendship. At 2-3 hour monthly events, 6 outings represents 12-18 hours — the beginning of the friendship formation window. The mere exposure effect peaks at 10-20 exposures, meaning the first 10-20 outings are the most powerful for building bonds.

### The Key

After 12 outings, you get the ability to invite one person to the next outing. Not a plus-one to every event forever. One invite, one time, refreshed at the next milestone. This is how the club grows: through its most committed members bringing in one person they think belongs. The growth mechanic is built into the attendance model. Circuit tracks who invited whom through the ambassador attribution field.

---

## The Card and the Board

A second growth mechanism runs alongside the attendance progression: the physical Culture Club Card and the public leaderboard at `cccircuit.com/board`. These are marketing additions on top of the membership model — they do not replace the attendance tiers above.

The governing principle: **attendance gates intimacy, rank gates exposure.** Two parallel reward axes, two different reward types — because they reward two different behaviours.

### The Card

Every member gets a Culture Club Card the first time they attend an outing (Floor tier). The curator (Ciara in London) carries a tin of cards to every outing and hands one over at check-in. One card per member, kept for life. There is no shipping form. There is no postal step. The handover is the moment.

Members use the card to vouch strangers into the Queue: hand the card to a friend, the friend taps their phone to it, a URL opens that says *"X thinks you belong in Culture Club"* and routes the friend to the join form. The friend lands in the Queue with attribution to the voucher. Every accepted vouch scores on the leaderboard.

The card does not check guests into events (Block hardware does that), does not RSVP to events (Circuit does that), and does not unlock attendance tiers (showing up does that). The card has one job: be tapped by a stranger's phone to deliver a credited invite.

See `avdience-docs/docs/culture-club/CULTURE_CLUB_CARD.md` for the physical spec, the chip provisioning, and the tap landing page details.

### The Board

A public leaderboard at `cccircuit.com/board`, visible to anyone, ranks members by their vouching record:

- **+1** when a recipient joins the Queue
- **+3** when the recipient attends their first outing (reaches Floor)
- **+10** when the recipient themselves becomes a voucher (reaches Floor and gets a card)

The scoring weights conversion, not volume. Handing a card to a stranger who never shows up scores 1. Handing a card to someone who passes through to become a recruiting voucher themselves scores 14 plus all their downstream vouches. The leaderboard is self-rationing — sloppy vouching tanks rank, disciplined vouching compounds it.

### What the rank axis unlocks

The top of the board unlocks invites to **exclusive Circuit-paid premium events** — distinct from the Core Member intimate programming above. These are designed to be photogenic, location-novel, and share-worthy: the kind of event a top voucher will post about. Circuit pays as customer acquisition spend. The events function as recruitment content engines.

### Why the two axes don't collide

The attendance axis (Queue → Floor → Regulars → Circuit Core → Key) rewards *showing up*. Its rewards are intimate by design: WhatsApp, early RSVP, 10-person dinners, +1 invites. These events only work because the people in the room have shown up together repeatedly.

The rank axis (the leaderboard) rewards *recruiting well*. Its rewards are exposure by design: photogenic, share-worthy events that produce content for the next cohort.

A loyal member who attends every outing but recruits nobody earns the full attendance progression and none of the rank-axis perks. A high-converting voucher who has only attended once gets onto the leaderboard quickly but doesn't get into the Core Member dinners. A member who does both earns both, and at scale that's the ideal Culture Club member.

### Why this is paid by Circuit, not members

Both event tracks are CAC for Circuit. Intimate programming generates the longitudinal attendance data; rank-axis premium events generate the recruitment marketing. The moment members pay for either kind of access — putting money *into* the loop — rank becomes purchasable and the currency deflates. Cash-free is what makes the status real.

---

## The Programming

Culture Club programmes a circuit through London's cultural landscape. Not its own events. Other people's events. The club is the audience, not the stage.

### The Monthly Circuit

Four outings per month. One per week. Each one is a different format:

**Week 1: Watch.** Film screenings, theatre, comedy, spoken word. Target venues: Close-Up Film Centre (Shoreditch, 40 seats, 35mm projection), The Arzner (Elephant & Castle, London's first LGBTQ+ cinema), Rooftop Film Club (Peckham, seasonal), ICA Cinema (The Mall). Cost per head: £0-20.

**Week 2: Move.** Run clubs, movement classes, sound baths, dawn swims. Target partners: Run Dem Crew (Tuesdays, lululemon Spitalfields), Peckham Pacers (anti-competitive ethos), Community Sauna Baths (6 London locations, breathwork, cold plunge). Cost per head: £0-15.

**Week 3: Eat.** Supper clubs, pop-up kitchens, wine tastings, market crawls. Target partners: Come Together / Test Kitchen (Forest Gate, £50-60, communal cooking), Eleven98 (East London, BYOB, eco-minded), Smoke & Lime (SE London, 8-person Bengali, £50). Cost per head: £40-80. Members pay their own way.

**Week 4: See.** Gallery openings, studio visits, exhibitions, open studios. Target: Condo London venues (50 international galleries across 23 London spaces), South London Gallery, gallery lates at Tate Modern, Whitechapel Gallery. Private views at commercial galleries are free and often include wine. Cost per head: £0.

This rotation is the identity. Film, movement, food, art. Every month. The consistency creates expectation. Members know what week 3 means.

### The Wildcard

Once per quarter, a fifth outing that breaks the pattern. Something unexpected. A warehouse party. A sunrise hike. A ferry to Margate. A sober rave at Ministry of Sound. This is the one that gets photographed. The one that becomes the LadBible clip. The Wildcard is the marketing moment. The regular circuit is the product.

The Wildcard is the one outing announced to the full email list, not just the WhatsApp group. This is how the queue experiences what the club feels like. The Wildcard fills from the widest pool.

Wildcard criteria: photographable, location-novel (somewhere Culture Club has not been), and with a natural social media hook. Three examples with their PR angle:

1. **Dawn swim at Hampstead Heath ponds followed by breakfast at Parliament Hill Cafe.** Angle for Monocle: "A new model for urban belonging starts at 6am."
2. **Sober rave at Ministry of Sound's Dry Day Rave.** Angle for LadBible: "This London WhatsApp group is doing club nights without the hangover."
3. **Day trip to Margate — Turner Contemporary, Dreamland, supper club at a Harbour Arm restaurant.** Angle for Time Out: "The members' club that took 40 people to the seaside."

### LINECONIC in the rotation

LINECONIC (Live. Presents. Out Loud., the Avdience format hosted monthly at Soho House London) slots into the rotation as a Watch outing — sometimes as a Wildcard. Cadence: one or two LINECONIC outings per month as the Avdience format slate grows. LINECONIC is the one Culture Club outing that Avdience produces directly, rather than curates from a third-party organiser. Every other outing remains curation-not-creation. The rotation is not allowed to be saturated by LINECONIC alone — Move, Eat, See keep the monthly circuit honest.

### Curation, Not Creation

Apart from LINECONIC, Culture Club never produces events. It curates attendance at existing events. This keeps operational cost near zero and puts the club in a collaborative relationship with every organiser in London rather than a competitive one. You bring 15 people to their event. You are their best table. The relationship is inherently warm.

The organiser relationship is the warm acquisition channel for Circuit. After 3-5 events where Culture Club brings a consistent group, the organiser has seen Circuit in action at their own event. The pitch to use Circuit is no longer theoretical. "We brought 15 people to your screening and 11 came back the next month. Here is the dashboard."

### The Weekly Cadence

Monday: email drops with the shortlist (2-3 options for that week's format). The shortlist is curated. There is no vote. The curator curates. RSVPs are the only signal that matters.

Tuesday: RSVP opens on Circuit. Regulars got the link 24 hours earlier via Circuit notification.

Wednesday: RSVP closes, confirmation via Circuit. WhatsApp group discusses who is going.

The outing: whenever the event is scheduled.

After: stubs land in members' Circuit recognition pages. Photographer delivers selects within 48 hours. Best photos shared in WhatsApp group.

---

## The Economics

Culture Club operates at near-zero cost because two of the four weekly formats (galleries and run clubs) are free, film screenings are £7-20, and members pay their own way for all events including supper clubs.

### 12-Month P&L

**Costs (monthly):**
- Photography: £800 (emerging documentary photographer, 1 outing per month, portfolio-building rate)
- Insurance: £15 (annual public liability policy at ~£180/year)
- Website: £1 (Vercel free tier + domain)
- WhatsApp: £0 (Business App, free)
- Admin/tools: £150 (email platform, 10 hours at £15/hour)
- Quarterly Wildcard subsidy: £125 (£500/quarter amortised monthly — subsidising one signature experience)

**Total monthly: ~£1,090**
**Total annual: ~£13,100**

This is framed in the SEIS deck as Circuit's customer acquisition cost. At £13,100 to generate a dataset showing cross-format return rates across 200 members over 12 months, this is cheaper than any other CAC in the events space.

### No membership fee in Year 1

The research shows paid communities have 40-60% active member rates versus approximately 5% for free communities. But Culture Club's constraint is different. The PR narrative of "free to join, attendance is the only currency" is essential for the post-Soho House positioning. A fee, even £5/month, muddies the story.

A membership fee can be introduced in Year 2, framed as unlocking Circuit premium features rather than paying for Culture Club access.

### What members pay

Members pay their own way for all events. When a supper club costs £55/head, members pay £55. When a gallery opening is free, they pay nothing. Culture Club is not a discount programme. It is a curation and coordination layer. The value is knowing what to go to, going with people you recognise, and being recognised for showing up.

---

## The Visual Identity

Culture Club's visual identity is Circuit's visual identity, because Culture Club runs on Circuit. The design system in TASTE.md and DESIGN_SYSTEM.md governs everything.

### The Stub

Every outing, every member who checks in gets a Digital Stub. "Culture Club" at the top (the organiser name). Their name and attendance count in large monospace (the centrepiece). The format type. Circuit watermark at the bottom. Optimised for 9:16 Instagram Stories.

The stub is the only marketing that matters. Every stub posted is an ad for both Culture Club and Circuit without being an ad for either. If it is not beautiful enough to screenshot, it is not done.

The stub follows the Recognition surface register from DESIGN_SYSTEM.md: the organiser is the brand, Circuit is the watermark, attendance count is the centrepiece, minimal interaction.

### Photography

One photographer at one outing per month. Documentary, candid, low-light, available light only.

The photographer brief:

**Style:** Documentary. Never staged. If someone looks at the camera, it is the wrong shot. The right shot is two people mid-conversation who did not know they were being photographed.

**Shot list per outing:** arrival and queue (the anticipation), the space before people arrive (the venue), candid conversation pairs (the connection), the event itself (the culture), departure and aftermath (the comedown).

**The editorial concept:** The same faces in different rooms. Over 6 months, the body of work shows the same 15-20 people at a screening in Peckham, a gallery in Shoreditch, a supper club in Hackney, a run in Bermondsey. That visual consistency is the brand. That visual consistency is what makes a photo editor say yes.

**Delivery:** RAW + 20-30 edited selects per outing, delivered within 48 hours.

**Budget:** £800/month (emerging photographer rate). Annual photography budget: £9,600.

**Rights:** Photographer retains portfolio usage rights. Culture Club / Avdience Ltd receives perpetual licence for editorial, social media, press kit, and marketing use. No exclusivity requirement.

### No Logo

"Culture Club" in monospace is the wordmark. No symbol. No icon. No mark. The stubs and the photos are the visual identity. Everything else is typography on a black background.

---

## The PR Strategy

### Positioning

The line in every pitch, every interview, every piece of coverage: "A members' club with no house."

The energy is propositional, not oppositional. Culture Club does not attack Soho House. It proposes what comes next. When the journalist draws the comparison (and they will), the response is factual: "Soho House charges £3,800 a year for access to a building. We charge nothing for access to the entire city. The only thing that determines what you unlock is how many times you show up."

### Month-by-Month Plan

**Months 1-2: Build the Archive.** 4-8 outings. Photography from at least 2. The WhatsApp group is 20-30 people. No press. No Instagram. Just the events and the stubs. Build a body of evidence before showing anyone. Minimum assets before Month 3: 40+ photographs, 20+ stubs, 50+ email subscribers, 3+ events with attendance data in Circuit.

**Month 3: Go Visible.** Instagram launches. Not with a "we're launching" post. With 8-10 photos from the first two months. Back-dated energy. It looks like Culture Club has been running for a while. The press kit goes live at cccircuit.com/press.

The press kit contains: a one-paragraph origin narrative, a founder bio with professional headshot, key stats (email list size, WhatsApp group size, attendance count, return rate), 2-3 member quotes, 10+ high-resolution photographs at 300 DPI (print and web formats), brand assets (wordmark in PNG and SVG), and a list of upcoming events. A branded PDF version for email attachments. A Google Drive folder for high-res photography.

**Months 3-4: Substacks First.** Pitch Jim Waterson's London Centric and Nancy Durrant's London Culture Edit simultaneously. Waterson has tens of thousands of subscribers and covers exactly this beat. Durrant was Culture Editor of the Evening Standard for years. A Substack mention from either one is a permanent, linkable URL for the press kit. Lower barrier than legacy outlets, higher signal than social media. This is the credibility anchor for every subsequent pitch.

**Month 4: Time Out Listings.** Submit events via Time Out's Google Form. Free. Attach real photography, not graphics. Lead time: 2 weeks minimum. This is not a feature pitch. This is listing presence — Culture Club events appearing in Time Out's "things to do" feed, building familiarity with the editorial team.

**Month 5: BBC Radio London.** Robert Elms' lunchtime culture show. BBC Radio London is hungry for local interest stories and wants an articulate founder available for live interview at Broadcasting House. Pitch with the Substack coverage as social proof. The hook: "building community without walls in a lonely city."

**Month 6: The Feature.** Target one of: The London Standard (weekly print, or The Independent digital — pitching the Standard's website now means pitching The Independent), Time Out feature, or LadBible. Offer an exclusive. The phrase "you would be the first to cover this" remains journalist catnip.

Outlet-specific angles:
- Evening Standard / Independent: "The most exclusive club in London does not have a front door."
- LadBible: "This London WhatsApp group is the post-Soho House" with a 30-second video clip from the Wildcard.
- Time Out: "The members' club where your membership is how many times you show up."

**Months 7-9: The Critics.** These outlets want to use Culture Club as a lens for a bigger argument.
- Dazed: "What a houseless club says about the death of third places." Pitch to Ted Stansfield (Editor-in-Chief) or Serena Smith (Life & Culture). Format: 1,000+ word cultural criticism. Subject line: "PITCH: Your Headline Here." Under 300 words. Lead time: 2 months for print.
- Monocle: "A new model for urban belonging." Start with The Urbanist radio show (lower barrier), then aim for print. Pitch to Andrew Tuck or Robert Bound.
- It's Nice That: "Designing community without a building." They want the creative process story with strong visuals embedded in the email. Pitch to Jenny Brewer (Head of Content).

### Exclusive Strategy

Offer the first feature as a publication exclusive, not a topic exclusive. The exclusive is: first access to the founder for interview, first access to an outing for photography. The topic — venue-less members' club, post-Soho House positioning — cannot be exclusive because it is a trend, not a scoop. After the exclusive window (2 weeks from publication), all outlets can cover the same story with their own angle.

---

## The Circuit Integration

Culture Club is Circuit's first organiser. Its most visible organiser. The organiser that exists specifically to demonstrate what Circuit does.

### Invisible at launch, visible at Month 6

Months 1-5: members experience Culture Club as an email list and a WhatsApp group that does interesting things together. Circuit enters their life when they RSVP (the consent gate), when they get a Digital Stub (the screenshot moment), and when they hit 3 outings and notice the RSVP link arrives earlier. The technology feels like a natural consequence of the club working well, not a product being tested on them.

Month 6: Circuit becomes the story. The SEIS traction slide is not "we built an app." It is "we ran a 200-person culture club for 6 months and here is what the data shows."

### The dataset

After 6 months of outings, Culture Club's Circuit dashboard contains the most interesting small attendance dataset in London:

**Cross-format return rates.** Who comes to film and food? Who only comes to one format? Which format has the highest retention?

**Regular identification.** The 8-10 people who have been to 15+ outings. Named, counted, recognised.

**Lapse patterns.** Who came to 5 outings and then stopped? When? After which format?

**Ambassador effectiveness.** Which Key holders' invites converted to regulars? Who brings people who stick?

**Venue and organiser performance.** Which organiser's events had the highest return rate from Culture Club members?

### The three audiences for this data

**The SEIS deck.** The traction slide: "We run a 200-person culture club with a 68% return rate across 4 formats over 6 months." This is real longitudinal attendance data, not projections.

**The organiser pitch.** When you approach an organiser and say "we brought 15 people to your screening and 11 came back the next month," you are giving them something they have never seen. The pitch to use Circuit is no longer theoretical.

**The enterprise pitch.** When you sit down with an enterprise buyer post-September 2026, you show Culture Club's dashboard. "This is what your community programming data could look like. Except instead of 200 members it is 5,000 across 40 stores."

### IP and legal structure

Culture Club operates as a trading name under Avdience Ltd. No separate entity. UK law (Companies Act 2006) allows a limited company to trade under multiple brand names. All business documents, invoices, and the website display "Avdience Ltd," its registration number, and registered address. No licensing, no franchise, no separate company.

The term "members' club" carries no legal obligations. Culture Club has no premises, does not serve alcohol or food, and is a commercial enterprise, not a mutual organisation. No Club Premises Certificate, no Premises Licence, no Temporary Event Notices required. All licensing obligations sit with the third-party venues.

Public liability insurance: £180/year for £1-2M cover. Mandatory.

---

## The Network Effect

Culture Club is the seed of Circuit's guest-side network.

A Culture Club member attends a screening run by an independent organiser. They check in through Culture Club. But the organiser also uses Circuit. Now that member has a GlobalProfile that spans both organisers. They are recognised in two places. They start expecting recognition everywhere.

Multiply this across 10 organisers whose events Culture Club attends over a year. Every organiser sees Circuit in action at their own event, through your members. Some of them sign up. Now their regular attendees are also building GlobalProfiles. The network densifies.

By month 12, the question is not whether Circuit works. The question is why any organiser running recurring events in London is not using it. Culture Club created that inevitability by being the first, most visible, most data-rich proof point.

---

## The Risk Register

**1. Members do not post stubs (the viral loop fails).**
Early warning: fewer than 10% of stubs appear on Instagram Stories in the first 3 months.
Mitigation: ensure the stub is beautiful enough to screenshot. If the design is right, posting is natural. Do not ask people to post. Do not incentivise posting.
Kill condition: none. The viral loop is a bonus, not the business model. The organiser acquisition channel works without it.

**2. Organisers say no or feel commodified.**
Early warning: more than 2 of the first 5 organiser approaches result in rejection or hostility.
Mitigation: lead with the value exchange. "We bring 15 people. We are your best audience. We are not a competitor." Never position as "we are using your event for our thing." Position as "we are your most reliable attendees."
Kill condition: if the collaborative relationship does not work, Culture Club cannot programme events and the model fails. Pivot to producing events directly (which changes the economics entirely).

**3. The WhatsApp group becomes noisy or cliquey.**
Early warning: new members report feeling excluded within their first 3 outings. Message volume exceeds 50/day.
Mitigation: set group rules (no off-topic, no spam, no sub-group coordination). The curator is the moderator. The group exists for event coordination and post-event conversation, not general chat. If necessary, mute the group between Monday and Sunday.
Kill condition: none. Replace with a different platform if WhatsApp dynamics prove unmanageable at 200. Telegram is the backup (200,000 member capacity, bot support, topic threads).

**4. Someone copies the format before you have traction.**
Early warning: another London group launches multi-format cultural programming with attendance tracking.
Mitigation: speed. The first 6 months of longitudinal data are the moat. A copycat starting in Month 3 is already 3 months behind on the dataset. Culture Club's head start is measured in attendance records, not features.
Kill condition: none. If the format spreads before Year 2, it validates the thesis. If they use Circuit, you win. If they use something else, your data advantage still holds.

**5. Culture Club succeeds as a club but fails to drive Circuit organiser sign-ups.**
Early warning: after 6 months, zero organisers from Culture Club events have signed up for Circuit.
Mitigation: the organiser pitch must happen in person, at the event, after the third visit. Not via cold email. Not via the website. The founder walks up to the organiser and says "I am the person who keeps bringing 15 people to your event. Let me show you what I can see about your audience that you cannot."
Kill condition: if the organiser acquisition channel produces zero conversions after 12 months, Culture Club is a successful social club but a failed go-to-market strategy. Evaluate whether the club has standalone value (membership fees, sponsorship) or should be wound down.

---

## The Replication Thesis

Year 1: Culture Club London is owned and operated by Circuit's founder. It is not a template yet. It is a proof point. It is the SEIS traction story. It is the organiser acquisition channel. The playbook is not published.

Year 2: if the format works, publish the playbook. "How to start a culture club in your city." The playbook is free. The infrastructure — Circuit — is the product. The key constraint: replication only works if every culture club runs on Circuit. The playbook makes this a requirement, not an option. The value exchange is clear: you get the format, the programming model, the name permission. Circuit gets the data.

Every new city's culture club generates more attendance data on Circuit. More stubs. More GlobalProfiles. More organisers seeing the product in action. The club scales the network effect. The product scales the club.

The format is the gift. The platform is the price.

---

## The Geographic Focus

The research identified London's densest independent culture neighbourhoods. Culture Club's first 12 months should programme primarily from these areas:

**Peckham.** Bussey Building / Copeland Park, South London Gallery, Peckhamplex (£6.99 tickets), Rooftop Film Club, Frank's Cafe. Named coolest neighbourhood in London by Time Out.

**Hackney Wick.** Canal-side warehouses, Community Sauna Baths flagship, Colour Factory, craft breweries.

**Dalston.** EartH (750-capacity Art Deco theatre), Dalston Superstore, Brilliant Corners, MOTH Club.

**Bermondsey.** Beer Mile brewery trail, White Cube gallery, Community Sauna Baths, London City Runners.

**Deptford.** High Street voted coolest street in the world by Time Out, 2022. Rising fastest.

**Shoreditch.** Close-Up Film Centre, Rich Mix, Condo London venues. The serious art and film anchor.

---

## What We Ship

Culture Club ships when a member can:

1. Submit their email on cccircuit.com and receive the weekly shortlist within 7 days
2. RSVP to an outing through Circuit in under 30 seconds
3. Attend, get checked in, and receive a Digital Stub
4. After 3 outings, notice the RSVP link arrives 24 hours earlier
5. After their first outing, get added to the WhatsApp group
6. See their attendance history on their Circuit recognition page
7. Screenshot a stub that looks good enough to post without being asked

Everything else is iteration.

---

Powered by Circuit. March 2026.
