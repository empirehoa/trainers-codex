// i18n string map.
//
// Journey Mode ships with ZERO hardcoded English in its components — every
// user-visible string resolves through `t()`. That is a launch requirement,
// not future-proofing: Copero shipped 8+ languages and LATAM plus Japan are
// outsized Pokémon markets, so the cost of retrofitting later is exactly the
// cost we're avoiding by doing it now.
//
// Populated at launch: EN, ES.
// Structure shipped, translations to follow: PT, JA. An untranslated key falls
// back to EN, so a partial locale renders a working (mixed) UI rather than a
// screen of raw key names. See docs/JOURNEY_MODE.md § i18n workflow.
//
// Interpolation is `{name}`. Missing vars render as empty strings rather than
// leaving a literal `{name}` on screen.

export type Locale = 'en' | 'es' | 'pt' | 'ja';

export const LOCALES: { id: Locale; label: string; complete: boolean }[] = [
  { id: 'en', label: 'English',    complete: true },
  { id: 'es', label: 'Español',    complete: true },
  { id: 'pt', label: 'Português',  complete: false },
  { id: 'ja', label: '日本語',      complete: false },
];

export type StringMap = Record<string, string>;

// ============================================================
// ENGLISH — the reference locale. Every key must exist here.
// ============================================================

const en: StringMap = {
  // ---------- shell ----------
  'journey.title': 'Journey Mode',
  'journey.tagline': 'Live an entire trainer career in three minutes.',
  'journey.open': 'Journey Mode',
  'journey.close': 'Close',
  'journey.back': 'Back',
  'journey.locale.label': 'Language',

  // ---------- setup ----------
  'journey.setup.heading': 'Start your career',
  'journey.setup.sub': 'Age 10. One partner. Everything ahead of you.',
  'journey.setup.name': 'Trainer name',
  'journey.setup.nameRandom': 'Roll a name',
  'journey.setup.region': 'Home region',
  'journey.setup.starter': 'First partner',
  'journey.setup.archetype': 'Playstyle',
  'journey.setup.pace': 'Pace',
  'journey.setup.start': 'Start Journey →',
  'journey.setup.seedLabel': 'Seed',
  'journey.setup.seedShared': 'Playing a shared journey — seed {seed}.',
  'journey.setup.seedClear': 'Start fresh instead',
  'journey.setup.dailyBanner': 'Daily Journey #{issue} — everyone plays this seed today.',
  'journey.setup.dailyPlay': 'Play the Daily',
  'journey.setup.seedInvalid': "That link's seed wasn't valid, so we rolled you a fresh one.",

  // ---------- archetypes ----------
  'journey.archetype.aggro': 'Aggro',
  'journey.archetype.aggro.desc': 'Win now. Push every advantage.',
  'journey.archetype.stall': 'Stall',
  'journey.archetype.stall.desc': 'Outlast everyone. Longevity over fireworks.',
  'journey.archetype.balance': 'Balance',
  'journey.archetype.balance.desc': 'Good at everything, hostage to nothing.',
  'journey.archetype.collector': 'Collector',
  'journey.archetype.collector.desc': 'The dex is the point. Battles fund it.',
  'journey.archetype.shiny-hunter': 'Shiny Hunter',
  'journey.archetype.shiny-hunter.desc': 'Chase the odds. Fame follows rarity.',

  // ---------- pace ----------
  'journey.pace.express': 'Express',
  'journey.pace.express.desc': 'Three chapters at a time · {minutes} min',
  'journey.pace.normal': 'Normal',
  'journey.pace.normal.desc': 'A decision every other chapter · {minutes} min',
  'journey.pace.intense': 'Intense',
  'journey.pace.intense.desc': 'A decision every chapter · {minutes} min',

  // ---------- simulation ----------
  'journey.sim.simulating': 'Simulating…',
  'journey.sim.chapter': 'Chapter {chapter} of {total}',
  'journey.sim.age': 'Age {age}',
  'journey.sim.continue': 'Continue →',
  'journey.sim.skipToEnd': 'Auto-resolve the rest',
  'journey.sim.undo': 'Undo that choice',

  // ---------- party + pokédex ----------
  'journey.party.title': 'Your Six',
  'journey.party.ace': 'Ace',
  'journey.party.dex': 'Pokédex',
  'journey.party.dexCount': '{caught} caught · {seen} seen',
  'journey.party.caughtHeading': 'Caught this run',
  'journey.party.evolveReady': 'Ready to evolve',
  'journey.party.empty': 'Your team fills as you journey.',

  // ---------- prepare step ----------
  'journey.prepare.title': 'Prepare your team',
  'journey.prepare.subtitle': 'Evolve, use an item, set your ace — then choose.',
  'journey.prepare.show': 'Prepare team',
  'journey.prepare.hide': 'Hide',
  'journey.prepare.evolve': 'Evolve',
  'journey.prepare.evolveInto': 'Evolve into {name}',
  'journey.prepare.evolveLocked': 'Needs more time together',
  'journey.prepare.candyEvolve': 'Evolve now (Rare Candy)',
  'journey.prepare.setAce': 'Make ace',
  'journey.prepare.isAce': 'Ace',
  'journey.prepare.fullyEvolved': 'Fully evolved',
  'journey.prepare.items': 'Items',
  'journey.prepare.noItems': 'No items yet — win and explore to earn them.',
  'journey.prepare.useItem': 'Use',
  'journey.prepare.undoPrep': 'Undo last prep',
  'journey.prepare.done': 'Team ready',

  // ---------- items ----------
  'journey.item.soothe-bell.name': 'Soothe Bell',
  'journey.item.soothe-bell.desc': 'Deepens the bond with your team (+bond).',
  'journey.item.energy-root.name': 'Energy Root',
  'journey.item.energy-root.desc': 'Shakes off fatigue (−fatigue).',
  'journey.item.rare-candy.name': 'Rare Candy',
  'journey.item.rare-candy.desc': 'Evolve a partner right now, ahead of schedule.',

  // ---------- levels / box / regions / stakes / events (v9) ----------
  'journey.prepare.lv': 'Lv.{n}',
  'journey.prepare.box': 'Box',
  'journey.prepare.swap': 'Swap from box',
  'journey.prepare.needLevel': 'Lv.{n} needed',
  'journey.prepare.needBond': 'Bond {n} needed',
  'journey.prepare.nickname': 'Nickname',
  'journey.prepare.nickSave': 'Save',
  'journey.prepare.needStone': 'Needs an Evolution Stone',
  'journey.prepare.needCord': 'Needs a Link Cord',
  'journey.item.evo-stone.name': 'Evolution Stone',
  'journey.item.evo-stone.desc': 'Triggers a stone evolution for a partner that needs one.',
  'journey.item.link-cord.name': 'Link Cord',
  'journey.item.link-cord.desc': 'Completes a trade evolution without trading away your partner.',
  'journey.item.exp-share.name': 'Exp. Share',
  'journey.item.exp-share.desc': 'Shares a burst of experience with the whole team.',
  'journey.region.badges': '{n}/{total} badges',
  'journey.region.badgeN': 'Badge {n}',
  'journey.region.tourPos': '· region {n} of {total}',
  'journey.stake.ante': 'Ante {n}',
  'journey.stake.target': 'target {n}',
  'journey.campaign.label': 'Campaign',
  'journey.campaign.short.name': 'Single region',
  'journey.campaign.short.desc': 'One region, one gym circuit. A three-minute career.',
  'journey.campaign.season.name': 'Season',
  'journey.campaign.season.desc': 'Three regions. Pick it up across a week.',
  'journey.campaign.saga.name': 'Saga',
  'journey.campaign.saga.desc': 'All nine regions. A month-long career.',
  'journey.event.heading': 'Events',
  'journey.event.lucky-find.title': 'A lucky find',
  'journey.event.lucky-find.body': 'Something useful turns up on the roadside.',
  'journey.event.crowd-favour.title': 'The crowd turns',
  'journey.event.crowd-favour.body': 'A packed hall starts chanting your name.',
  'journey.event.training-break.title': 'A good week of training',
  'journey.event.training-break.body': 'Everything clicks in practice for once.',
  'journey.event.old-mentor.title': 'An old mentor calls',
  'journey.event.old-mentor.body': 'One conversation reframes your whole approach.',
  'journey.event.swarm.title': 'A swarm!',
  'journey.event.swarm.body': 'The route floods with a species nobody expected.',
  'journey.event.perfect-run.title': 'A perfect run',
  'journey.event.perfect-run.body': 'Not a single set dropped all weekend.',
  'journey.event.sponsor-bidding.title': 'A bidding war',
  'journey.event.sponsor-bidding.body': 'Two sponsors want your name on the jersey.',
  'journey.event.shiny-flash.title': 'An impossible colour',
  'journey.event.shiny-flash.body': 'You catch a glimpse most trainers never get.',
  'journey.event.legendary-stirs.title': 'SOMETHING LEGENDARY STIRS',
  'journey.event.legendary-stirs.body': 'The air changes. What answers you should not exist.',
  'journey.event.hall-of-fame.title': 'HALL OF FAME',
  'journey.event.hall-of-fame.body': 'They carve your name where everyone will see it.',
  'journey.event.world-record.title': 'WORLD RECORD',
  'journey.event.world-record.body': 'Nobody has ever done it this way. Now it is the record.',
  'journey.save.title': 'Saved runs',
  'journey.save.save': 'Save run',
  'journey.save.resume': 'Resume',
  'journey.save.delete': 'Delete',
  'journey.save.saved': 'Run saved',
  'journey.save.none': 'No saved runs yet.',
  'journey.save.slot': '{name} · {region} · ch.{chapter}',

  // ---------- stat labels ----------
  'journey.stat.badges': 'Badges',
  'journey.stat.wins': 'Wins',
  'journey.stat.losses': 'Losses',
  'journey.stat.winRate': 'Win rate',
  'journey.stat.catches': 'Catches',
  'journey.stat.shinies': 'Shinies',
  'journey.stat.titles': 'Titles',
  'journey.stat.peakRank': 'Peak rank',
  'journey.stat.fame': 'Fame',
  'journey.stat.fatigue': 'Team fatigue',
  'journey.stat.bond': 'Bond',
  'journey.stat.unranked': 'Unranked',
  'journey.stat.age': 'Age',

  // ---------- score components ----------
  'journey.score.winRate': 'Win rate',
  'journey.score.titles': 'Titles',
  'journey.score.peak': 'Peak ranking',
  'journey.score.badges': 'Badges',
  'journey.score.catches': 'Catches',
  'journey.score.shinies': 'Shinies',
  'journey.score.fame': 'Fame',
  'journey.score.bond': 'Team bond',
  'journey.score.durability': 'Durability',
  'journey.score.longevity': 'Longevity',

  // ---------- chapter titles ----------
  'journey.chapterTitle.gym-circuit': 'The Gym Circuit',
  'journey.chapterTitle.regional': 'Regionals',
  'journey.chapterTitle.national': 'Nationals',
  'journey.chapterTitle.worlds': 'Worlds',
  'journey.chapterTitle.veteran': 'The Veteran Years',
  'journey.chapterTitle.retirement': 'Retirement',

  // ---------- chapter beats: gym circuit ----------
  'journey.beat.first-badge': 'A gym leader underestimates {ace}. {badges} badges on the case now.',
  'journey.beat.route-grind': 'Weeks on the routes. {wins}-{losses} across {battles} battles, and calluses to show for it.',
  'journey.beat.gym-upset': 'A gym you were told to skip goes down in three turns.',
  'journey.beat.crowd-notices': 'Someone films the last set. The clip travels further than you do.',
  'journey.beat.lost-close': 'A loss you replay for a month. One turn, one read, one wrong click.',
  'journey.beat.training-camp': 'A quiet camp season. No trophies, better fundamentals.',

  // ---------- chapter beats: regional ----------
  'journey.beat.bracket-run': 'A regional bracket run that nobody had you down for.',
  'journey.beat.regional-final': 'Regional final. Placement {placement}.',
  'journey.beat.meta-read': 'You call the format two weeks early and build for it.',
  'journey.beat.sponsor-scout': 'A scout leaves a card. You keep it in your bag for a year.',
  'journey.beat.bad-matchup': 'The bracket hands you the one matchup you cannot beat.',
  'journey.beat.clutch-set': 'Down to your last member, you take the set anyway.',

  // ---------- chapter beats: national ----------
  'journey.beat.national-stage': 'Nationals. Bigger room, thinner air, same six.',
  'journey.beat.travel-toll': 'Four countries in five weeks. The team feels it.',
  'journey.beat.top-cut': 'Top cut. Placement {placement} out of the field.',
  'journey.beat.rival-rematch': 'Your rival again, on stream this time.',
  'journey.beat.format-lock': 'The format locks and your build ages badly overnight.',
  'journey.beat.press-row': 'Press row wants a quote. You give them {ace}.',

  // ---------- chapter beats: worlds ----------
  'journey.beat.worlds-debut': 'Worlds debut. Age {age}, and the lights are brighter than the stream suggested.',
  'journey.beat.day-two': 'Day two. Still here. {wins}-{losses}.',
  'journey.beat.stage-lights': 'Main stage. You remember none of it afterwards except the noise.',
  'journey.beat.heartbreak': 'One turn from the cut. Placement {placement}.',
  'journey.beat.trophy-lift': 'You lift it. {ace} gets the confetti shot.',
  'journey.beat.stream-clip': 'The clip does numbers. Fame at {fame}.',

  // ---------- chapter beats: veteran ----------
  'journey.beat.veteran-grind': 'Age {age}. Fewer events, sharper preparation.',
  'journey.beat.young-guns': 'Teenagers with better reflexes and worse fundamentals.',
  'journey.beat.legacy-set': 'You win a set the old way and the room notices.',
  'journey.beat.body-aches': 'Travel hurts differently now.',
  'journey.beat.mentor-role': 'Two juniors start copying your builds.',
  'journey.beat.last-ladder': 'One more ladder season. {wins}-{losses}.',

  // ---------- chapter beats: retirement ----------
  'journey.beat.final-bow': 'A last event, announced quietly, entered loudly.',
  'journey.beat.hall-of-fame': 'The record stands: {badges} badges, {catches} caught this year alone.',
  'journey.beat.quiet-exit': 'No press release. You just stop entering.',
  'journey.beat.passing-torch': '{ace} retires with you. Neither of you needed the ceremony.',

  // ---------- decision cards ----------
  'journey.card.underdog-gym.prompt': 'A gym two tiers above you has an open slot this week. Take it, or train another season?',
  'journey.card.underdog-gym.challenge.label': 'Take the challenge',
  'journey.card.underdog-gym.challenge.flavor': 'Fame either way. Bruises likely.',
  'journey.card.underdog-gym.train.label': 'Train one more season',
  'journey.card.underdog-gym.train.flavor': 'Slower, steadier, closer to {ace}.',

  'journey.card.rare-encounter.prompt': 'A rare encounter surfaces the week before a tournament. {subject} is already stretched thin.',
  'journey.card.rare-encounter.catch.label': 'Burn resources on the catch',
  'journey.card.rare-encounter.catch.flavor': 'You may not see this again.',
  'journey.card.rare-encounter.prepare.label': 'Protect tournament prep',
  'journey.card.rare-encounter.prepare.flavor': 'The bracket does not care what you saw.',
  'journey.card.rare-encounter.both.label': 'Try to do both',
  'journey.card.rare-encounter.both.flavor': 'Ambitious. Expensive.',

  'journey.card.rival-wager.prompt': 'Your rival offers a wager battle, in public, on their terms.',
  'journey.card.rival-wager.accept.label': 'Accept the wager',
  'journey.card.rival-wager.accept.flavor': 'High variance, high visibility.',
  'journey.card.rival-wager.decline.label': 'Decline it',
  'journey.card.rival-wager.decline.flavor': 'Consistency over spectacle.',

  'journey.card.evolve-timing.prompt': '{subject} is ready to evolve. Now, or hold for a higher ceiling?',
  'journey.card.evolve-timing.now.label': 'Evolve now',
  'journey.card.evolve-timing.now.flavor': 'Power this season.',
  'journey.card.evolve-timing.delay.label': 'Hold a while longer',
  'journey.card.evolve-timing.delay.flavor': 'Better ceiling, later.',

  'journey.card.go-pro.prompt': 'The overseas circuit will take you. Staying regional keeps you winning.',
  'journey.card.go-pro.overseas.label': 'Go pro overseas',
  'journey.card.go-pro.overseas.flavor': 'Bigger stage, harsher variance.',
  'journey.card.go-pro.regional.label': 'Stay regional',
  'journey.card.go-pro.regional.flavor': 'Own {region} first.',

  'journey.card.comeback-tour.prompt': "You're {age}. There's a comeback tour on the table, or a clean exit at the top.",
  'journey.card.comeback-tour.comeback.label': 'Run the comeback tour',
  'journey.card.comeback-tour.comeback.flavor': 'One more run at it.',
  'journey.card.comeback-tour.retire.label': 'Retire on top',
  'journey.card.comeback-tour.retire.flavor': 'Leave the record where it is.',

  'journey.card.sponsor-offer.prompt': 'A sponsor wants your name on their gear. The contract has opinions about your roster.',
  'journey.card.sponsor-offer.sign.label': 'Sign the deal',
  'journey.card.sponsor-offer.sign.flavor': 'Reach, at a cost to the team.',
  'journey.card.sponsor-offer.refuse.label': 'Stay independent',
  'journey.card.sponsor-offer.refuse.flavor': 'Nobody edits your six.',

  'journey.card.team-fatigue.prompt': 'Team fatigue is at {fatigue}. The season is not over.',
  'journey.card.team-fatigue.rest.label': 'Rest the team',
  'journey.card.team-fatigue.rest.flavor': 'Skip events, recover properly.',
  'journey.card.team-fatigue.push.label': 'Push through',
  'journey.card.team-fatigue.push.flavor': 'Points now, bill later.',
  'journey.card.team-fatigue.rotate.label': 'Rotate in fresh members',
  'journey.card.team-fatigue.rotate.flavor': 'Rested, but less familiar.',

  'journey.card.shiny-rumor.prompt': 'A credible rumour puts a rare colour variant two routes away.',
  'journey.card.shiny-rumor.hunt.label': 'Go hunt it',
  'journey.card.shiny-rumor.hunt.flavor': 'Days of your life, possibly for nothing.',
  'journey.card.shiny-rumor.ignore.label': 'Let it go',
  'journey.card.shiny-rumor.ignore.flavor': 'Stay on the ladder.',

  'journey.card.mentor-request.prompt': 'A junior squad asks you to coach them through the season.',
  'journey.card.mentor-request.mentor.label': 'Take them on',
  'journey.card.mentor-request.mentor.flavor': 'Costs hours, buys legacy.',
  'journey.card.mentor-request.focus.label': 'Stay focused on your own run',
  'journey.card.mentor-request.focus.flavor': 'Selfish. Effective.',

  'journey.card.format-shift.prompt': 'The format shifts and your core is suddenly a tier off.',
  'journey.card.format-shift.adapt.label': 'Rebuild for the new meta',
  'journey.card.format-shift.adapt.flavor': 'New members, old bonds strained.',
  'journey.card.format-shift.commit.label': 'Commit to your six',
  'journey.card.format-shift.commit.flavor': 'Ride it out together.',

  'journey.card.injury-scare.prompt': '{subject} picks up a strain the week of a major.',
  'journey.card.injury-scare.withdraw.label': 'Withdraw and recover',
  'journey.card.injury-scare.withdraw.flavor': 'The season is longer than one event.',
  'journey.card.injury-scare.compete.label': 'Compete anyway',
  'journey.card.injury-scare.compete.flavor': 'Glory, or a longer recovery.',

  'journey.card.trade-offer.prompt': 'Someone offers a straight trade for {subject}. Their side is stronger on paper.',
  'journey.card.trade-offer.trade.label': 'Make the trade',
  'journey.card.trade-offer.trade.flavor': 'Better stats, colder bench.',
  'journey.card.trade-offer.keep.label': 'Keep them',
  'journey.card.trade-offer.keep.flavor': 'Some things are not upgrades.',

  'journey.card.documentary.prompt': 'A film crew wants a season of access.',
  'journey.card.documentary.allow.label': 'Let them film',
  'journey.card.documentary.allow.flavor': 'Enormous reach. No privacy.',
  'journey.card.documentary.refuse.label': 'Turn them down',
  'journey.card.documentary.refuse.flavor': 'The season stays yours.',

  'journey.card.dex-completion.prompt': 'The dex is close. So is the ranked season.',
  'journey.card.dex-completion.chase.label': 'Chase the dex',
  'journey.card.dex-completion.chase.flavor': 'Finish what you started.',
  'journey.card.dex-completion.ladder.label': 'Chase the ladder',
  'journey.card.dex-completion.ladder.flavor': 'Points are also a record.',

  'journey.card.final-roster.prompt': 'Last serious season. Ride with the six who got you here, or build the strongest possible team?',
  'journey.card.final-roster.loyal.label': 'Ride with your six',
  'journey.card.final-roster.loyal.flavor': 'The ones who were there.',
  'journey.card.final-roster.meta.label': 'Build the best team available',
  'journey.card.final-roster.meta.flavor': 'Optimal, and a little cold.',

  // ---------- verdicts ----------
  'journey.verdict.undefeated.title': 'THE UNDEFEATED',
  'journey.verdict.undefeated.blurb': 'Three titles and a loss column nobody believed. The record is the argument.',
  'journey.verdict.apex-predator.title': 'APEX PREDATOR',
  'journey.verdict.apex-predator.blurb': 'You were the matchup everyone prepared for and nobody solved.',
  'journey.verdict.ranked-terror.title': 'RANKED TERROR',
  'journey.verdict.ranked-terror.blurb': 'A name people checked the bracket for.',
  'journey.verdict.glass-cannon.title': 'THE GLASS CANNON',
  'journey.verdict.glass-cannon.blurb': 'Devastating on your day. Your day was not every day.',
  'journey.verdict.brawler.title': 'THE BRAWLER',
  'journey.verdict.brawler.blurb': 'No format ever scared you. Several of them beat you.',

  'journey.verdict.immovable.title': 'THE IMMOVABLE',
  'journey.verdict.immovable.blurb': 'Twenty years, one core six, and nobody ever ran you out of resources.',
  'journey.verdict.attrition-master.title': 'MASTER OF ATTRITION',
  'journey.verdict.attrition-master.blurb': 'You did not out-damage anyone. You outlasted all of them.',
  'journey.verdict.wall-of-record.title': 'THE WALL',
  'journey.verdict.wall-of-record.blurb': 'A career measured in seasons survived, not turns won.',
  'journey.verdict.long-game.title': 'THE LONG GAME',
  'journey.verdict.long-game.blurb': 'Never the favourite, never eliminated early.',
  'journey.verdict.patient-one.title': 'THE PATIENT ONE',
  'journey.verdict.patient-one.blurb': 'You outlasted more careers than you beat trainers.',

  'journey.verdict.complete-trainer.title': 'THE COMPLETE TRAINER',
  'journey.verdict.complete-trainer.blurb': 'Titles, a full dex, and a team that stayed. Nobody gets all three.',
  'journey.verdict.all-format-threat.title': 'ALL-FORMAT THREAT',
  'journey.verdict.all-format-threat.blurb': 'Whatever the season asked for, you already had it.',
  'journey.verdict.steady-hand.title': 'THE STEADY HAND',
  'journey.verdict.steady-hand.blurb': 'Never spectacular, never a wasted season.',
  'journey.verdict.journeyman.title': 'THE JOURNEYMAN',
  'journey.verdict.journeyman.blurb': 'Every circuit, every format, every year. Rarely the story.',

  'journey.verdict.professors-pride.title': "THE PROFESSOR'S PRIDE",
  'journey.verdict.professors-pride.blurb': 'A dex that ended arguments, and battle results nobody expected alongside it.',
  'journey.verdict.the-collector.title': 'THE COLLECTOR',
  'journey.verdict.the-collector.blurb': 'The record you cared about was never the win column.',
  'journey.verdict.archivist.title': 'THE ARCHIVIST',
  'journey.verdict.archivist.blurb': 'You catalogued a generation while everyone else laddered.',
  'journey.verdict.field-researcher.title': 'FIELD RESEARCHER',
  'journey.verdict.field-researcher.blurb': 'More routes walked than sets played.',
  'journey.verdict.dex-filler.title': 'THE COMPLETIONIST',
  'journey.verdict.dex-filler.blurb': 'Unfinished, but further along than most ever get.',

  'journey.verdict.chromatic-legend.title': 'CHROMATIC LEGEND',
  'journey.verdict.chromatic-legend.blurb': 'Four impossible colours in one career. The odds filed a complaint.',
  'journey.verdict.odds-breaker.title': 'THE ODDS-BREAKER',
  'journey.verdict.odds-breaker.blurb': 'You made rarity look like a strategy.',
  'journey.verdict.rare-light.title': 'RARE LIGHT',
  'journey.verdict.rare-light.blurb': 'A career people remember in colour.',
  'journey.verdict.sparkle-chaser.title': 'THE SPARKLE CHASER',
  'journey.verdict.sparkle-chaser.blurb': 'Thousands of encounters for a handful of moments.',
  'journey.verdict.patient-hunter.title': 'THE PATIENT HUNTER',
  'journey.verdict.patient-hunter.blurb': 'The odds held. You kept going anyway.',

  'journey.verdict.nearly-man.title': 'THE NEARLY-MAN',
  'journey.verdict.nearly-man.blurb': 'Top four, more than once, and never the trophy.',
  'journey.verdict.cult-hero.title': 'CULT HERO OF {region}',
  'journey.verdict.cult-hero.blurb': 'No titles. A packed room every single time you entered.',
  'journey.verdict.one-region-legend.title': 'ONE-REGION LEGEND',
  'journey.verdict.one-region-legend.blurb': 'You never left, and {region} never stopped turning up.',
  'journey.verdict.road-walker.title': 'THE ROAD-WALKER',
  'journey.verdict.road-walker.blurb': 'It did not come together. You walked the whole road anyway.',

  // ---------- result screen ----------
  'journey.result.heading': 'Career complete',
  'journey.result.scoreLabel': 'Career score',
  'journey.result.seedLine': 'Seed {seed}',
  'journey.result.of': 'of',
  'journey.result.breakdown': 'Where the score came from',
  'journey.result.roster': 'Final six',
  'journey.result.replay': 'Run it back',
  'journey.result.newSeed': 'New journey',
  'journey.result.rendering': 'Rendering your card…',
  'journey.result.renderFailed': 'The card could not be rendered.',
  'journey.result.retry': 'Retry',

  // ---------- share ----------
  'journey.share.heading': 'Share your Legend Card',
  'journey.share.web': 'Share',
  'journey.share.copyImage': 'Copy image',
  'journey.share.copyLink': 'Copy link',
  'journey.share.download': 'Download PNG',
  'journey.share.copied': 'Copied',
  'journey.share.linkCopied': 'Link copied',
  'journey.share.failed': 'Sharing failed — try downloading instead.',
  'journey.share.text': '{verdict} — career score {score}. My trainer journey on Trainer\'s Codex (seed {seed}). Play the same journey: {url}',
  'journey.share.dailyText': 'Daily Journey #{issue} — {verdict}, career score {score}. Can you beat it? {url}',

  // ---------- CTAs ----------
  'journey.cta.builder': 'Open this team in the Builder',
  'journey.cta.builderSub': 'Your final six, loaded and ready to tune',
  'journey.cta.merch': 'Print your Legend Card',
  'journey.cta.merchSub': 'Poster or shirt, print-ready at 300 DPI',

  // ---------- daily ----------
  'journey.daily.heading': 'Daily Journey',
  'journey.daily.issue': 'Daily Journey #{issue}',
  'journey.daily.sub': 'One seed. Everyone plays it today. Only your choices differ.',
  'journey.daily.play': "Play today's journey",
  'journey.daily.done': "You've played today. Come back tomorrow.",
  'journey.daily.streak': '{days}-day streak',
  'journey.daily.streakNone': 'No streak yet',
  'journey.daily.bestStreak': 'Best: {days} days',
  'journey.daily.replayFree': 'Replay for fun (does not change your streak)',

  // ---------- legend card (baked into the PNG) ----------
  'journey.card.wordmark': 'TRAINER\'S CODEX',
  'journey.card.careerScore': 'CAREER SCORE',
  'journey.card.seed': 'SEED',
  'journey.card.finalSix': 'FINAL SIX',
  'journey.card.disclaimer': 'Independent fan project · not affiliated with Nintendo / Game Freak / The Pokémon Company',

  // ---------- misc ----------
  'journey.disabled': 'Journey Mode is not enabled on this build.',
  'journey.abandon': 'Abandon this run?',
  'journey.abandonConfirm': 'Abandon',
  'journey.abandonCancel': 'Keep playing',
};

// ============================================================
// SPANISH — complete at launch.
// ============================================================

const es: StringMap = {
  'journey.title': 'Modo Travesía',
  'journey.tagline': 'Vive una carrera entera de entrenador en tres minutos.',
  'journey.open': 'Modo Travesía',
  'journey.close': 'Cerrar',
  'journey.back': 'Atrás',
  'journey.locale.label': 'Idioma',

  'journey.setup.heading': 'Comienza tu carrera',
  'journey.setup.sub': '10 años. Un compañero. Todo por delante.',
  'journey.setup.name': 'Nombre del entrenador',
  'journey.setup.nameRandom': 'Generar nombre',
  'journey.setup.region': 'Región de origen',
  'journey.setup.starter': 'Primer compañero',
  'journey.setup.archetype': 'Estilo de juego',
  'journey.setup.pace': 'Ritmo',
  'journey.setup.start': 'Empezar la travesía →',
  'journey.setup.seedLabel': 'Semilla',
  'journey.setup.seedShared': 'Estás jugando una travesía compartida — semilla {seed}.',
  'journey.setup.seedClear': 'Empezar de cero',
  'journey.setup.dailyBanner': 'Travesía Diaria n.º {issue} — hoy todos juegan esta semilla.',
  'journey.setup.dailyPlay': 'Jugar la Diaria',
  'journey.setup.seedInvalid': 'La semilla de ese enlace no era válida, así que te generamos una nueva.',

  'journey.archetype.aggro': 'Agresivo',
  'journey.archetype.aggro.desc': 'Ganar ya. Aprovechar cada ventaja.',
  'journey.archetype.stall': 'Defensivo',
  'journey.archetype.stall.desc': 'Aguantar más que nadie. Constancia antes que fuegos artificiales.',
  'journey.archetype.balance': 'Equilibrado',
  'journey.archetype.balance.desc': 'Bueno en todo, rehén de nada.',
  'journey.archetype.collector': 'Coleccionista',
  'journey.archetype.collector.desc': 'El dex es el objetivo. Los combates lo financian.',
  'journey.archetype.shiny-hunter': 'Cazador de variocolor',
  'journey.archetype.shiny-hunter.desc': 'Perseguir las probabilidades. La fama sigue a la rareza.',

  'journey.pace.express': 'Exprés',
  'journey.pace.express.desc': 'Tres capítulos de golpe · {minutes} min',
  'journey.pace.normal': 'Normal',
  'journey.pace.normal.desc': 'Una decisión cada dos capítulos · {minutes} min',
  'journey.pace.intense': 'Intenso',
  'journey.pace.intense.desc': 'Una decisión por capítulo · {minutes} min',

  'journey.sim.simulating': 'Simulando…',
  'journey.sim.chapter': 'Capítulo {chapter} de {total}',
  'journey.sim.age': '{age} años',
  'journey.sim.continue': 'Continuar →',
  'journey.sim.skipToEnd': 'Resolver el resto automáticamente',
  'journey.sim.undo': 'Deshacer esa decisión',

  // ---------- equipo + pokédex ----------
  'journey.party.title': 'Tu equipo',
  'journey.party.ace': 'As',
  'journey.party.dex': 'Pokédex',
  'journey.party.dexCount': '{caught} capturados · {seen} vistos',
  'journey.party.caughtHeading': 'Capturados en esta travesía',
  'journey.party.evolveReady': 'Listo para evolucionar',
  'journey.party.empty': 'Tu equipo crece a medida que avanzas.',

  // ---------- preparación ----------
  'journey.prepare.title': 'Prepara tu equipo',
  'journey.prepare.subtitle': 'Evoluciona, usa un objeto, elige a tu as — luego decide.',
  'journey.prepare.show': 'Preparar equipo',
  'journey.prepare.hide': 'Ocultar',
  'journey.prepare.evolve': 'Evolucionar',
  'journey.prepare.evolveInto': 'Evolucionar a {name}',
  'journey.prepare.evolveLocked': 'Necesita más tiempo contigo',
  'journey.prepare.candyEvolve': 'Evolucionar ya (Caramelo Raro)',
  'journey.prepare.setAce': 'Hacer as',
  'journey.prepare.isAce': 'As',
  'journey.prepare.fullyEvolved': 'Totalmente evolucionado',
  'journey.prepare.items': 'Objetos',
  'journey.prepare.noItems': 'Aún no tienes objetos — gana y explora para conseguirlos.',
  'journey.prepare.useItem': 'Usar',
  'journey.prepare.undoPrep': 'Deshacer preparación',
  'journey.prepare.done': 'Equipo listo',

  // ---------- objetos ----------
  'journey.item.soothe-bell.name': 'Cascabel Alivio',
  'journey.item.soothe-bell.desc': 'Fortalece el vínculo con tu equipo (+vínculo).',
  'journey.item.energy-root.name': 'Raíz Energía',
  'journey.item.energy-root.desc': 'Elimina la fatiga (−fatiga).',
  'journey.item.rare-candy.name': 'Caramelo Raro',
  'journey.item.rare-candy.desc': 'Evoluciona a un compañero ahora mismo, antes de tiempo.',

  // ---------- niveles / caja / regiones / apuestas / eventos (v9) ----------
  'journey.prepare.lv': 'Nv.{n}',
  'journey.prepare.box': 'Caja',
  'journey.prepare.swap': 'Cambiar desde la caja',
  'journey.prepare.needLevel': 'Requiere Nv.{n}',
  'journey.prepare.needBond': 'Requiere vínculo {n}',
  'journey.prepare.nickname': 'Apodo',
  'journey.prepare.nickSave': 'Guardar',
  'journey.prepare.needStone': 'Necesita una Piedra Evolutiva',
  'journey.prepare.needCord': 'Necesita un Cordón Unión',
  'journey.item.evo-stone.name': 'Piedra Evolutiva',
  'journey.item.evo-stone.desc': 'Provoca una evolución por piedra en el compañero que la necesite.',
  'journey.item.link-cord.name': 'Cordón Unión',
  'journey.item.link-cord.desc': 'Completa una evolución por intercambio sin perder a tu compañero.',
  'journey.item.exp-share.name': 'Repartir Exp.',
  'journey.item.exp-share.desc': 'Reparte una ráfaga de experiencia a todo el equipo.',
  'journey.region.badges': '{n}/{total} medallas',
  'journey.region.badgeN': 'Medalla {n}',
  'journey.region.tourPos': '· región {n} de {total}',
  'journey.stake.ante': 'Apuesta {n}',
  'journey.stake.target': 'objetivo {n}',
  'journey.campaign.label': 'Campaña',
  'journey.campaign.short.name': 'Una región',
  'journey.campaign.short.desc': 'Una región, un circuito de gimnasios. Tres minutos.',
  'journey.campaign.season.name': 'Temporada',
  'journey.campaign.season.desc': 'Tres regiones. Para jugar a lo largo de una semana.',
  'journey.campaign.saga.name': 'Saga',
  'journey.campaign.saga.desc': 'Las nueve regiones. Una carrera de un mes.',
  'journey.event.heading': 'Eventos',
  'journey.event.lucky-find.title': 'Un hallazgo afortunado',
  'journey.event.lucky-find.body': 'Aparece algo útil al borde del camino.',
  'journey.event.crowd-favour.title': 'El público se rinde',
  'journey.event.crowd-favour.body': 'Una sala llena empieza a corear tu nombre.',
  'journey.event.training-break.title': 'Una buena semana de entrenamiento',
  'journey.event.training-break.body': 'Por una vez, todo encaja en los entrenos.',
  'journey.event.old-mentor.title': 'Llama un viejo mentor',
  'journey.event.old-mentor.body': 'Una conversación replantea todo tu enfoque.',
  'journey.event.swarm.title': '¡Un enjambre!',
  'journey.event.swarm.body': 'La ruta se llena de una especie que nadie esperaba.',
  'journey.event.perfect-run.title': 'Una actuación perfecta',
  'journey.event.perfect-run.body': 'No cediste ni un solo combate en todo el fin de semana.',
  'journey.event.sponsor-bidding.title': 'Guerra de ofertas',
  'journey.event.sponsor-bidding.body': 'Dos patrocinadores quieren tu nombre en la camiseta.',
  'journey.event.shiny-flash.title': 'Un color imposible',
  'journey.event.shiny-flash.body': 'Vislumbras algo que casi ningún entrenador llega a ver.',
  'journey.event.legendary-stirs.title': 'ALGO LEGENDARIO DESPIERTA',
  'journey.event.legendary-stirs.body': 'El aire cambia. Lo que responde no debería existir.',
  'journey.event.hall-of-fame.title': 'SALÓN DE LA FAMA',
  'journey.event.hall-of-fame.body': 'Graban tu nombre donde todos puedan verlo.',
  'journey.event.world-record.title': 'RÉCORD MUNDIAL',
  'journey.event.world-record.body': 'Nadie lo había hecho así. Ahora es el récord.',
  'journey.save.title': 'Partidas guardadas',
  'journey.save.save': 'Guardar partida',
  'journey.save.resume': 'Continuar',
  'journey.save.delete': 'Borrar',
  'journey.save.saved': 'Partida guardada',
  'journey.save.none': 'Aún no hay partidas guardadas.',
  'journey.save.slot': '{name} · {region} · cap.{chapter}',

  'journey.stat.badges': 'Medallas',
  'journey.stat.wins': 'Victorias',
  'journey.stat.losses': 'Derrotas',
  'journey.stat.winRate': 'Ratio de victorias',
  'journey.stat.catches': 'Capturas',
  'journey.stat.shinies': 'Variocolor',
  'journey.stat.titles': 'Títulos',
  'journey.stat.peakRank': 'Mejor puesto',
  'journey.stat.fame': 'Fama',
  'journey.stat.fatigue': 'Fatiga del equipo',
  'journey.stat.bond': 'Vínculo',
  'journey.stat.unranked': 'Sin clasificar',
  'journey.stat.age': 'Edad',

  'journey.score.winRate': 'Ratio de victorias',
  'journey.score.titles': 'Títulos',
  'journey.score.peak': 'Mejor clasificación',
  'journey.score.badges': 'Medallas',
  'journey.score.catches': 'Capturas',
  'journey.score.shinies': 'Variocolor',
  'journey.score.fame': 'Fama',
  'journey.score.bond': 'Vínculo del equipo',
  'journey.score.durability': 'Resistencia',
  'journey.score.longevity': 'Longevidad',

  'journey.chapterTitle.gym-circuit': 'El circuito de gimnasios',
  'journey.chapterTitle.regional': 'Regionales',
  'journey.chapterTitle.national': 'Nacionales',
  'journey.chapterTitle.worlds': 'Mundial',
  'journey.chapterTitle.veteran': 'Los años de veterano',
  'journey.chapterTitle.retirement': 'Retirada',

  'journey.beat.first-badge': 'Un líder de gimnasio infravalora a {ace}. Ya llevas {badges} medallas.',
  'journey.beat.route-grind': 'Semanas en las rutas. {wins}-{losses} en {battles} combates, y callos que lo demuestran.',
  'journey.beat.gym-upset': 'Un gimnasio que te dijeron que evitaras cae en tres turnos.',
  'journey.beat.crowd-notices': 'Alguien graba el último combate. El clip llega más lejos que tú.',
  'journey.beat.lost-close': 'Una derrota que repasas un mes entero. Un turno, una lectura, un clic mal dado.',
  'journey.beat.training-camp': 'Una temporada tranquila de entrenamiento. Ningún trofeo, mejores fundamentos.',

  'journey.beat.bracket-run': 'Una racha en el cuadro regional que nadie había previsto.',
  'journey.beat.regional-final': 'Final regional. Puesto {placement}.',
  'journey.beat.meta-read': 'Predices el formato dos semanas antes y construyes para él.',
  'journey.beat.sponsor-scout': 'Un ojeador te deja su tarjeta. La guardas un año en la mochila.',
  'journey.beat.bad-matchup': 'El cuadro te asigna el único emparejamiento que no puedes ganar.',
  'journey.beat.clutch-set': 'Con un solo miembro en pie, te llevas el combate igualmente.',

  'journey.beat.national-stage': 'Nacionales. Sala más grande, aire más fino, los mismos seis.',
  'journey.beat.travel-toll': 'Cuatro países en cinco semanas. El equipo lo nota.',
  'journey.beat.top-cut': 'Fase final. Puesto {placement} del total.',
  'journey.beat.rival-rematch': 'Tu rival otra vez, esta vez en directo.',
  'journey.beat.format-lock': 'El formato se cierra y tu equipo envejece de golpe.',
  'journey.beat.press-row': 'La prensa quiere una declaración. Les hablas de {ace}.',

  'journey.beat.worlds-debut': 'Debut mundial. {age} años, y los focos queman más de lo que parecía en el directo.',
  'journey.beat.day-two': 'Segundo día. Sigues ahí. {wins}-{losses}.',
  'journey.beat.stage-lights': 'Escenario principal. Después no recuerdas nada salvo el ruido.',
  'journey.beat.heartbreak': 'A un turno de la fase final. Puesto {placement}.',
  'journey.beat.trophy-lift': 'Lo levantas. {ace} se lleva la foto con el confeti.',
  'journey.beat.stream-clip': 'El clip arrasa. Fama en {fame}.',

  'journey.beat.veteran-grind': '{age} años. Menos torneos, mejor preparación.',
  'journey.beat.young-guns': 'Adolescentes con mejores reflejos y peores fundamentos.',
  'journey.beat.legacy-set': 'Ganas un combate a la antigua y la sala se da cuenta.',
  'journey.beat.body-aches': 'Viajar duele de otra manera ahora.',
  'journey.beat.mentor-role': 'Dos juniors empiezan a copiar tus equipos.',
  'journey.beat.last-ladder': 'Una última temporada clasificatoria. {wins}-{losses}.',

  'journey.beat.final-bow': 'Un último torneo, anunciado en voz baja, jugado a lo grande.',
  'journey.beat.hall-of-fame': 'El registro queda: {badges} medallas, {catches} capturas solo este año.',
  'journey.beat.quiet-exit': 'Sin comunicado. Simplemente dejas de inscribirte.',
  'journey.beat.passing-torch': '{ace} se retira contigo. Ninguno de los dos necesitaba ceremonia.',

  'journey.card.underdog-gym.prompt': 'Un gimnasio dos niveles por encima tiene hueco esta semana. ¿Lo intentas o entrenas otra temporada?',
  'journey.card.underdog-gym.challenge.label': 'Aceptar el desafío',
  'journey.card.underdog-gym.challenge.flavor': 'Fama en cualquier caso. Golpes, seguro.',
  'journey.card.underdog-gym.train.label': 'Entrenar otra temporada',
  'journey.card.underdog-gym.train.flavor': 'Más lento, más firme, más cerca de {ace}.',

  'journey.card.rare-encounter.prompt': 'Aparece un encuentro raro la semana antes de un torneo. {subject} ya va justo.',
  'journey.card.rare-encounter.catch.label': 'Gastar recursos en la captura',
  'journey.card.rare-encounter.catch.flavor': 'Puede que no vuelvas a verlo.',
  'journey.card.rare-encounter.prepare.label': 'Proteger la preparación',
  'journey.card.rare-encounter.prepare.flavor': 'Al cuadro le da igual lo que viste.',
  'journey.card.rare-encounter.both.label': 'Intentar las dos cosas',
  'journey.card.rare-encounter.both.flavor': 'Ambicioso. Caro.',

  'journey.card.rival-wager.prompt': 'Tu rival propone un combate con apuesta, en público y en sus términos.',
  'journey.card.rival-wager.accept.label': 'Aceptar la apuesta',
  'journey.card.rival-wager.accept.flavor': 'Mucha varianza, mucha visibilidad.',
  'journey.card.rival-wager.decline.label': 'Rechazarla',
  'journey.card.rival-wager.decline.flavor': 'Constancia antes que espectáculo.',

  'journey.card.evolve-timing.prompt': '{subject} está listo para evolucionar. ¿Ahora o esperas por un techo más alto?',
  'journey.card.evolve-timing.now.label': 'Evolucionar ya',
  'journey.card.evolve-timing.now.flavor': 'Potencia esta temporada.',
  'journey.card.evolve-timing.delay.label': 'Esperar un poco más',
  'journey.card.evolve-timing.delay.flavor': 'Mejor techo, más tarde.',

  'journey.card.go-pro.prompt': 'El circuito internacional te acepta. Quedarte en lo regional te mantiene ganando.',
  'journey.card.go-pro.overseas.label': 'Pasar al circuito internacional',
  'journey.card.go-pro.overseas.flavor': 'Escenario mayor, varianza más dura.',
  'journey.card.go-pro.regional.label': 'Quedarte en lo regional',
  'journey.card.go-pro.regional.flavor': 'Domina {region} primero.',

  'journey.card.comeback-tour.prompt': 'Tienes {age} años. Hay una gira de regreso sobre la mesa, o una salida limpia en lo más alto.',
  'journey.card.comeback-tour.comeback.label': 'Hacer la gira de regreso',
  'journey.card.comeback-tour.comeback.flavor': 'Un intento más.',
  'journey.card.comeback-tour.retire.label': 'Retirarte en lo más alto',
  'journey.card.comeback-tour.retire.flavor': 'Deja el registro donde está.',

  'journey.card.sponsor-offer.prompt': 'Un patrocinador quiere tu nombre en su equipación. El contrato opina sobre tu plantilla.',
  'journey.card.sponsor-offer.sign.label': 'Firmar el acuerdo',
  'journey.card.sponsor-offer.sign.flavor': 'Alcance, a costa del equipo.',
  'journey.card.sponsor-offer.refuse.label': 'Seguir independiente',
  'journey.card.sponsor-offer.refuse.flavor': 'Nadie edita tus seis.',

  'journey.card.team-fatigue.prompt': 'La fatiga del equipo está en {fatigue}. La temporada no ha terminado.',
  'journey.card.team-fatigue.rest.label': 'Descansar el equipo',
  'journey.card.team-fatigue.rest.flavor': 'Saltarte torneos, recuperarte bien.',
  'journey.card.team-fatigue.push.label': 'Seguir forzando',
  'journey.card.team-fatigue.push.flavor': 'Puntos ahora, factura después.',
  'journey.card.team-fatigue.rotate.label': 'Rotar miembros frescos',
  'journey.card.team-fatigue.rotate.flavor': 'Descansados, pero menos conocidos.',

  'journey.card.shiny-rumor.prompt': 'Un rumor fiable sitúa una variante de color raro a dos rutas de distancia.',
  'journey.card.shiny-rumor.hunt.label': 'Ir a buscarla',
  'journey.card.shiny-rumor.hunt.flavor': 'Días de tu vida, posiblemente para nada.',
  'journey.card.shiny-rumor.ignore.label': 'Dejarlo pasar',
  'journey.card.shiny-rumor.ignore.flavor': 'Seguir en la clasificatoria.',

  'journey.card.mentor-request.prompt': 'Un equipo junior te pide que los entrenes esta temporada.',
  'journey.card.mentor-request.mentor.label': 'Aceptar entrenarlos',
  'journey.card.mentor-request.mentor.flavor': 'Cuesta horas, compra legado.',
  'journey.card.mentor-request.focus.label': 'Centrarte en tu propia carrera',
  'journey.card.mentor-request.focus.flavor': 'Egoísta. Eficaz.',

  'journey.card.format-shift.prompt': 'El formato cambia y tu núcleo se queda de golpe un nivel por debajo.',
  'journey.card.format-shift.adapt.label': 'Reconstruir para el nuevo meta',
  'journey.card.format-shift.adapt.flavor': 'Miembros nuevos, vínculos tensados.',
  'journey.card.format-shift.commit.label': 'Apostar por tus seis',
  'journey.card.format-shift.commit.flavor': 'Aguantar juntos.',

  'journey.card.injury-scare.prompt': '{subject} sufre una lesión la semana de un torneo importante.',
  'journey.card.injury-scare.withdraw.label': 'Retirarte y recuperarte',
  'journey.card.injury-scare.withdraw.flavor': 'La temporada es más larga que un torneo.',
  'journey.card.injury-scare.compete.label': 'Competir igualmente',
  'journey.card.injury-scare.compete.flavor': 'Gloria, o una recuperación más larga.',

  'journey.card.trade-offer.prompt': 'Alguien te ofrece un intercambio directo por {subject}. Su lado es mejor sobre el papel.',
  'journey.card.trade-offer.trade.label': 'Hacer el intercambio',
  'journey.card.trade-offer.trade.flavor': 'Mejores números, banquillo más frío.',
  'journey.card.trade-offer.keep.label': 'Quedártelo',
  'journey.card.trade-offer.keep.flavor': 'Hay cosas que no son mejoras.',

  'journey.card.documentary.prompt': 'Un equipo de rodaje quiere acceso durante toda una temporada.',
  'journey.card.documentary.allow.label': 'Dejarles grabar',
  'journey.card.documentary.allow.flavor': 'Alcance enorme. Cero intimidad.',
  'journey.card.documentary.refuse.label': 'Rechazarlo',
  'journey.card.documentary.refuse.flavor': 'La temporada sigue siendo tuya.',

  'journey.card.dex-completion.prompt': 'El dex está cerca. La temporada clasificatoria también.',
  'journey.card.dex-completion.chase.label': 'Perseguir el dex',
  'journey.card.dex-completion.chase.flavor': 'Termina lo que empezaste.',
  'journey.card.dex-completion.ladder.label': 'Perseguir la clasificación',
  'journey.card.dex-completion.ladder.flavor': 'Los puntos también son un registro.',

  'journey.card.final-roster.prompt': 'Última temporada en serio. ¿Sigues con los seis que te trajeron hasta aquí o montas el mejor equipo posible?',
  'journey.card.final-roster.loyal.label': 'Seguir con tus seis',
  'journey.card.final-roster.loyal.flavor': 'Los que estuvieron ahí.',
  'journey.card.final-roster.meta.label': 'Montar el mejor equipo disponible',
  'journey.card.final-roster.meta.flavor': 'Óptimo, y un poco frío.',

  'journey.verdict.undefeated.title': 'EL INVICTO',
  'journey.verdict.undefeated.blurb': 'Tres títulos y una columna de derrotas que nadie se creía. El registro es el argumento.',
  'journey.verdict.apex-predator.title': 'DEPREDADOR ALFA',
  'journey.verdict.apex-predator.blurb': 'Eras el emparejamiento que todos preparaban y nadie resolvía.',
  'journey.verdict.ranked-terror.title': 'TERROR DE LA CLASIFICATORIA',
  'journey.verdict.ranked-terror.blurb': 'Un nombre que la gente buscaba en el cuadro.',
  'journey.verdict.glass-cannon.title': 'EL CAÑÓN DE CRISTAL',
  'journey.verdict.glass-cannon.blurb': 'Devastador en tu día. Tu día no era todos los días.',
  'journey.verdict.brawler.title': 'EL PELEADOR',
  'journey.verdict.brawler.blurb': 'Ningún formato te dio miedo. Varios te ganaron.',

  'journey.verdict.immovable.title': 'EL INAMOVIBLE',
  'journey.verdict.immovable.blurb': 'Veinte años, los mismos seis, y nadie te agotó nunca los recursos.',
  'journey.verdict.attrition-master.title': 'MAESTRO DEL DESGASTE',
  'journey.verdict.attrition-master.blurb': 'No superaste a nadie en daño. Los sobreviviste a todos.',
  'journey.verdict.wall-of-record.title': 'EL MURO',
  'journey.verdict.wall-of-record.blurb': 'Una carrera medida en temporadas sobrevividas, no en turnos ganados.',
  'journey.verdict.long-game.title': 'EL JUEGO LARGO',
  'journey.verdict.long-game.blurb': 'Nunca el favorito, nunca eliminado pronto.',
  'journey.verdict.patient-one.title': 'EL PACIENTE',
  'journey.verdict.patient-one.blurb': 'Sobreviviste a más carreras que entrenadores derrotaste.',

  'journey.verdict.complete-trainer.title': 'EL ENTRENADOR COMPLETO',
  'journey.verdict.complete-trainer.blurb': 'Títulos, un dex lleno y un equipo que se quedó. Nadie consigue las tres cosas.',
  'journey.verdict.all-format-threat.title': 'AMENAZA EN TODO FORMATO',
  'journey.verdict.all-format-threat.blurb': 'Lo que pedía la temporada, ya lo tenías.',
  'journey.verdict.steady-hand.title': 'EL PULSO FIRME',
  'journey.verdict.steady-hand.blurb': 'Nunca espectacular, nunca una temporada perdida.',
  'journey.verdict.journeyman.title': 'EL TRABAJADOR',
  'journey.verdict.journeyman.blurb': 'Todos los circuitos, todos los formatos, todos los años. Rara vez la noticia.',

  'journey.verdict.professors-pride.title': 'EL ORGULLO DEL PROFESOR',
  'journey.verdict.professors-pride.blurb': 'Un dex que zanjaba discusiones, y resultados que nadie esperaba junto a él.',
  'journey.verdict.the-collector.title': 'EL COLECCIONISTA',
  'journey.verdict.the-collector.blurb': 'El registro que te importaba nunca fue la columna de victorias.',
  'journey.verdict.archivist.title': 'EL ARCHIVISTA',
  'journey.verdict.archivist.blurb': 'Catalogaste una generación mientras los demás subían en la clasificatoria.',
  'journey.verdict.field-researcher.title': 'INVESTIGADOR DE CAMPO',
  'journey.verdict.field-researcher.blurb': 'Más rutas caminadas que combates jugados.',
  'journey.verdict.dex-filler.title': 'EL COMPLETISTA',
  'journey.verdict.dex-filler.blurb': 'Sin terminar, pero más lejos de lo que llega casi nadie.',

  'journey.verdict.chromatic-legend.title': 'LEYENDA CROMÁTICA',
  'journey.verdict.chromatic-legend.blurb': 'Cuatro colores imposibles en una carrera. Las probabilidades pusieron una queja.',
  'journey.verdict.odds-breaker.title': 'EL ROMPE-PROBABILIDADES',
  'journey.verdict.odds-breaker.blurb': 'Hiciste que la rareza pareciera una estrategia.',
  'journey.verdict.rare-light.title': 'LUZ RARA',
  'journey.verdict.rare-light.blurb': 'Una carrera que la gente recuerda en color.',
  'journey.verdict.sparkle-chaser.title': 'EL CAZADOR DE DESTELLOS',
  'journey.verdict.sparkle-chaser.blurb': 'Miles de encuentros para un puñado de momentos.',
  'journey.verdict.patient-hunter.title': 'EL CAZADOR PACIENTE',
  'journey.verdict.patient-hunter.blurb': 'Las probabilidades aguantaron. Tú seguiste igualmente.',

  'journey.verdict.nearly-man.title': 'EL ETERNO SEGUNDO',
  'journey.verdict.nearly-man.blurb': 'Top cuatro, más de una vez, y nunca el trofeo.',
  'journey.verdict.cult-hero.title': 'HÉROE DE CULTO DE {region}',
  'journey.verdict.cult-hero.blurb': 'Ningún título. Una sala llena cada vez que te inscribías.',
  'journey.verdict.one-region-legend.title': 'LEYENDA DE UNA REGIÓN',
  'journey.verdict.one-region-legend.blurb': 'Nunca te fuiste, y {region} nunca dejó de aparecer.',
  'journey.verdict.road-walker.title': 'EL CAMINANTE',
  'journey.verdict.road-walker.blurb': 'No salió. Recorriste el camino entero igualmente.',

  'journey.result.heading': 'Carrera completada',
  'journey.result.scoreLabel': 'Puntuación de carrera',
  'journey.result.seedLine': 'Semilla {seed}',
  'journey.result.of': 'de',
  'journey.result.breakdown': 'De dónde salió la puntuación',
  'journey.result.roster': 'Los seis finales',
  'journey.result.replay': 'Repetir',
  'journey.result.newSeed': 'Nueva travesía',
  'journey.result.rendering': 'Generando tu tarjeta…',
  'journey.result.renderFailed': 'No se pudo generar la tarjeta.',
  'journey.result.retry': 'Reintentar',

  'journey.share.heading': 'Comparte tu Tarjeta de Leyenda',
  'journey.share.web': 'Compartir',
  'journey.share.copyImage': 'Copiar imagen',
  'journey.share.copyLink': 'Copiar enlace',
  'journey.share.download': 'Descargar PNG',
  'journey.share.copied': 'Copiado',
  'journey.share.linkCopied': 'Enlace copiado',
  'journey.share.failed': 'No se pudo compartir — prueba a descargarla.',
  'journey.share.text': '{verdict} — puntuación {score}. Mi travesía de entrenador en Trainer\'s Codex (semilla {seed}). Juega la misma travesía: {url}',
  'journey.share.dailyText': 'Travesía Diaria n.º {issue} — {verdict}, puntuación {score}. ¿Puedes superarlo? {url}',

  'journey.cta.builder': 'Abrir este equipo en el Constructor',
  'journey.cta.builderSub': 'Tus seis finales, cargados y listos para ajustar',
  'journey.cta.merch': 'Imprime tu Tarjeta de Leyenda',
  'journey.cta.merchSub': 'Póster o camiseta, lista para imprenta a 300 PPP',

  'journey.daily.heading': 'Travesía Diaria',
  'journey.daily.issue': 'Travesía Diaria n.º {issue}',
  'journey.daily.sub': 'Una semilla. Hoy la juegan todos. Solo cambian tus decisiones.',
  'journey.daily.play': 'Jugar la travesía de hoy',
  'journey.daily.done': 'Ya jugaste hoy. Vuelve mañana.',
  'journey.daily.streak': 'Racha de {days} días',
  'journey.daily.streakNone': 'Aún sin racha',
  'journey.daily.bestStreak': 'Mejor: {days} días',
  'journey.daily.replayFree': 'Repetir por diversión (no cambia tu racha)',

  'journey.card.wordmark': 'TRAINER\'S CODEX',
  'journey.card.careerScore': 'PUNTUACIÓN',
  'journey.card.seed': 'SEMILLA',
  'journey.card.finalSix': 'LOS SEIS FINALES',
  'journey.card.disclaimer': 'Proyecto fan independiente · sin relación con Nintendo / Game Freak / The Pokémon Company',

  'journey.disabled': 'El Modo Travesía no está activado en esta versión.',
  'journey.abandon': '¿Abandonar esta partida?',
  'journey.abandonConfirm': 'Abandonar',
  'journey.abandonCancel': 'Seguir jugando',
};

// ============================================================
// PORTUGUESE / JAPANESE — structure ships now, translations follow.
//
// A key present here overrides EN; a key absent falls back to EN. The seed
// entries below exist so the shape is obvious to whoever picks up the
// translation pass, and so the locale toggle has something visible to prove
// it is wired. See docs/JOURNEY_MODE.md § i18n workflow for the process.
// ============================================================

const pt: StringMap = {
  'journey.title': 'Modo Jornada',
  'journey.tagline': 'Viva uma carreira inteira de treinador em três minutos.',
  'journey.open': 'Modo Jornada',
  'journey.setup.heading': 'Comece sua carreira',
  'journey.setup.start': 'Começar a jornada →',
  'journey.result.heading': 'Carreira concluída',
  'journey.result.scoreLabel': 'Pontuação da carreira',
  'journey.share.web': 'Compartilhar',
  'journey.daily.heading': 'Jornada Diária',
};

const ja: StringMap = {
  'journey.title': 'ジャーニーモード',
  'journey.tagline': '3分でトレーナーの一生を体験。',
  'journey.open': 'ジャーニーモード',
  'journey.setup.heading': 'キャリアを始める',
  'journey.setup.start': 'ジャーニー開始 →',
  'journey.result.heading': 'キャリア完了',
  'journey.result.scoreLabel': 'キャリアスコア',
  'journey.share.web': '共有',
  'journey.daily.heading': 'デイリージャーニー',
};

const DICTS: Record<Locale, StringMap> = { en, es, pt, ja };

// ============================================================
// RESOLUTION
// ============================================================

const LOCALE_KEY = 'trainerscodex.locale';

function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && v in DICTS;
}

/**
 * Resolve the active locale: explicit user choice first, then the browser's
 * preferred language, then English.
 */
export function detectLocale(): Locale {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (isLocale(stored)) return stored;
  } catch { /* private mode — fall through to navigator */ }
  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const base = tag.toLowerCase().split('-')[0];
      if (isLocale(base)) return base;
    }
  } catch { /* no navigator — fall through */ }
  return 'en';
}

export function setStoredLocale(locale: Locale): void {
  try { localStorage.setItem(LOCALE_KEY, locale); } catch { /* private mode — locale stays session-only */ }
}

export type Vars = Record<string, string | number | undefined>;

const INTERP = /\{(\w+)\}/g;

function interpolate(template: string, vars?: Vars): string {
  // Runs even when `vars` is undefined. Short-circuiting on a missing vars
  // object would leave a literal `{seed}` in the UI for any caller that forgot
  // to pass one, which is the exact failure this function exists to prevent.
  return template.replace(INTERP, (_, name: string) => {
    const v = vars?.[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

/**
 * Translate `key` in `locale`, interpolating `vars`.
 *
 * Fallback chain: requested locale → English → the key itself. Returning the
 * key (rather than throwing or rendering blank) means a typo shows up loudly
 * in the UI during development without breaking the screen for a user.
 */
export function translate(key: string, locale: Locale, vars?: Vars): string {
  const template = DICTS[locale]?.[key] ?? en[key];
  if (template === undefined) return key;
  return interpolate(template, vars);
}

/** Does this key exist in the reference locale? Used by the i18n audit test. */
export function hasKey(key: string): boolean {
  return key in en;
}

export function localeKeys(locale: Locale): string[] {
  return Object.keys(DICTS[locale] ?? {});
}

export function referenceKeys(): string[] {
  return Object.keys(en);
}

/** Translation coverage for a locale, 0..1 — surfaced in the language picker. */
export function localeCoverage(locale: Locale): number {
  const total = Object.keys(en).length;
  if (total === 0) return 1;
  const present = Object.keys(DICTS[locale] ?? {}).filter(k => k in en).length;
  return present / total;
}
