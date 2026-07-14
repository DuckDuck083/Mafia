import { ROLES } from "./roles.js";

const suspiciousWords = ["suspicious", "sus", "changed", "lying", "fake", "vote", "kill", "guilty", "contradiction"];
const defenseWords = ["trust", "innocent", "clear", "defend", "safe", "protected"];
const roleAliases = {
  sheriff: "Investigator",
  cop: "Investigator",
  detective: "Investigator",
  investigator: "Investigator",
  doc: "Medic",
  doctor: "Medic",
  medic: "Medic",
  bodyguard: "Guardian",
  guardian: "Guardian",
  tracker: "Tracker",
  vig: "Vigilante",
  vigilante: "Vigilante",
  mayor: "Mayor",
  citizen: "Citizen"
};

export function ingestPlayerMessage(game, text) {
  const lower = text.toLowerCase();
  const context = parsePlayerMessage(game, text);
  for (const ai of game.living().filter((p) => !p.isHuman)) {
    for (const target of context.mentioned) {
      if (target.isHuman) continue;
      const delta = context.kind === "accuse" ? 12 : context.kind === "defend" ? -8 : 2;
      ai.suspicion[target.id] = clamp(ai.suspicion[target.id] + delta, 0, 100);
      ai.memories.push(`${game.dayLabel()}: the player ${context.kind === "accuse" ? "pushed" : context.kind === "defend" ? "defended" : "mentioned"} ${target.name}.`);
    }
    if (context.claimedRole) {
      game.human.claims.push({ day: game.day, role: context.claimedRole, text });
      const believable = context.claimedRole === game.human.role || Math.random() < ai.personality.intelligence * 0.22;
      ai.suspicion[game.human.id] = clamp(ai.suspicion[game.human.id] + (believable ? -5 : 8), 0, 100);
      ai.memories.push(`${game.dayLabel()}: the player claimed ${context.claimedRole}.`);
    } else if (suspiciousWords.some((w) => lower.includes(w))) {
      ai.suspicion[game.human.id] = clamp(ai.suspicion[game.human.id] + 4, 0, 100);
    }
  }
  return context;
}

export function ingestSyndicateMessage(game, text) {
  const lower = text.toLowerCase();
  const mentioned = game.living().filter((p) => p.team !== "syndicate" && lower.includes(p.name.toLowerCase()));
  const target = mentioned[0] ?? null;
  let intent = "plan";
  if (/\b(frame|make .* sus|suspicious)\b/.test(lower)) intent = "frame";
  if (/\b(clean|hide)\b/.test(lower)) intent = "clean";
  if (/\b(kill|hit|remove|attack)\b/.test(lower)) intent = "kill";
  return { fromHuman: true, channel: "syndicate", text, lower, target, intent };
}

export function aiNightAction(game, actor) {
  if (!actor.alive || actor.isHuman || !actor.ability) return null;
  const living = game.living().filter((p) => p.id !== actor.id);
  const enemies = living.filter((p) => p.team !== actor.team);
  const townish = living.filter((p) => p.team !== "syndicate");
  const suspicious = mostSuspicious(actor, living);
  const trusted = mostTrusted(actor, living);
  const syndicateKillTarget = pickSyndicateKill(game, actor, townish);

  if (actor.ability === "investigate") return action(actor, suspicious, "investigate");
  if (actor.ability === "protect") return action(actor, actor.suspicion[actor.id] > 60 ? actor : trusted, "protect");
  if (actor.ability === "guard") return action(actor, trusted, "guard");
  if (actor.ability === "track") return action(actor, suspicious, "track");
  if (actor.ability === "shoot" && actor.charges > 0 && actor.suspicion[suspicious.id] > 72) return action(actor, suspicious, "shoot");
  if (actor.ability === "command") return action(actor, syndicateKillTarget, "command");
  if (actor.ability === "kill") return action(actor, syndicateKillTarget, "kill");
  if (actor.ability === "clean" && actor.charges > 0) return action(actor, syndicateKillTarget, "clean");
  if (actor.ability === "frame") return action(actor, mostTrusted(actor, enemies), "frame");
  if (actor.ability === "vest" && actor.charges > 0 && averageSuspicionOf(game, actor) > 44) return action(actor, actor, "vest");
  return null;
}

export function generateDiscussion(game, count = 5, context = null) {
  let speakers = game.living().filter((p) => !p.isHuman);
  if (!context) {
    const target = tableSuspect(game);
    context = { tableTopic: true, target, kind: "case" };
    const caseMaker = speakers.filter((p) => p.id !== target?.id).sort((a, b) => (b.suspicion[target?.id] ?? 0) - (a.suspicion[target?.id] ?? 0))[0];
    speakers = [
      caseMaker,
      target,
      ...speakers.filter((p) => p.id !== caseMaker?.id && p.id !== target?.id)
    ].filter(Boolean);
  }
  if (context?.mentioned?.length) {
    const mentionedIds = new Set(context.mentioned.map((p) => p.id));
    speakers = [
      ...speakers.filter((p) => mentionedIds.has(p.id)),
      ...speakers.filter((p) => !mentionedIds.has(p.id))
    ];
  } else if (!context?.tableTopic) {
    speakers = speakers.sort(() => Math.random() - 0.5);
  }
  const results = [];
  let thread = context;
  for (const speaker of speakers.slice(0, count)) {
    const text = speak(game, speaker, thread);
    const target = inferTargetFromText(game, text);
    results.push({ speaker, text });
    thread = { fromBot: true, speaker, text, target, kind: target?.id === speaker.id ? "defense" : "case" };
  }
  return results;
}

export function generateSyndicateDiscussion(game, context = null) {
  const speakers = game.living().filter((p) => p.team === "syndicate" && !p.isHuman);
  const town = game.living().filter((p) => p.team !== "syndicate");
  if (!speakers.length || !town.length) return [];
  const priority = rankKillTargets(game, speakers[0], town)[0];
  const backup = rankKillTargets(game, speakers[0], town)[1] ?? priority;
  const first = context?.target ?? priority;

  return speakers.slice(0, 3).map((speaker, index) => {
    if (context?.fromHuman) {
      if (context.intent === "kill" && context.target) {
        return { speaker, text: pick([
          `${context.target.name} is workable. ${killReason(game, context.target)} I would still keep ${backup.name} as backup.`,
          `I am good with ${context.target.name} if we think Medic is elsewhere. ${killReason(game, context.target)}`,
          `${context.target.name} makes sense. If they survive, we push the save tomorrow.`
        ]) };
      }
      if (context.intent === "frame" && context.target) {
        return { speaker, text: pick([
          `Frame ${context.target.name}, then we say their reactions have been off.`,
          `That works. ${context.target.name} already has enough heat for a fake check to stick.`,
          `I like framing ${context.target.name} more than killing them. Leave them alive and messy.`
        ]) };
      }
      return { speaker, text: pick([
        `Main priority is killing information roles. I have ${priority.name} highest.`,
        `We should not waste the hit on someone getting voted tomorrow. ${priority.name} is cleaner.`,
        `If nobody has a better read, I say ${priority.name}. ${killReason(game, priority)}`
      ]) };
    }
    if (index === 0) return { speaker, text: `Priority kill is ${first.name}. ${killReason(game, first)}` };
    if (index === 1) return { speaker, text: `I would avoid anyone already under heavy suspicion. ${backup.name} is quieter and more dangerous.` };
    return { speaker, text: `If the hit fails, we claim the Medic saved correctly and push whoever defended ${first.name}.` };
  });
}

export function chooseVote(game, voter) {
  if (!voter.alive) return null;
  if (voter.isHuman) return null;
  if (isEarlyDay(game) && Math.random() < 0.45) {
    const pool = game.living().filter((p) => p.id !== voter.id);
    return pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
  }
  if (voter.role === "Jester") {
    const loudest = game.living().filter((p) => p.id !== voter.id).sort((a, b) => (voter.trust[b.id] ?? 0) - (voter.trust[a.id] ?? 0))[0];
    return loudest?.id ?? null;
  }
  if (voter.team === "syndicate") {
    const heat = averageSuspicionOf(game, voter);
    const teammateInDanger = game.living().find((p) => p.team === "syndicate" && p.id !== voter.id && averageSuspicionOf(game, p) > 58);
    if (teammateInDanger && heat < 48 && Math.random() < 0.28) return teammateInDanger.id;
    return mostSuspicious(voter, game.living().filter((p) => p.team !== "syndicate")).id;
  }
  return mostSuspicious(voter, game.living().filter((p) => p.id !== voter.id)).id;
}

export function explainVote(game, voter, targetId) {
  const target = game.byId(targetId);
  if (!target) return "";
  const reasons = evidenceFor(game, voter, target);
  return stylize(voter, pick([
    `I voted ${target.name}. ${reasons}`,
    `My vote is on ${target.name}. ${reasons}`,
    `${target.name} is my vote. ${reasons}`
  ]));
}

function speak(game, speaker, context = null) {
  if (context?.fromHuman) {
    const direct = respondToPlayer(game, speaker, context);
    if (direct) return stylize(speaker, direct);
  }
  if (context?.fromBot) {
    const reply = respondToBot(game, speaker, context);
    if (reply) return stylize(speaker, reply);
  }
  if (context?.tableTopic && context.target) {
    return stylize(speaker, makeCase(game, speaker, context.target));
  }

  const living = game.living().filter((p) => p.id !== speaker.id);
  const target = mostSuspicious(speaker, living);
  const trusted = mostTrusted(speaker, living);
  const heat = averageSuspicionOf(game, speaker);
  const known = speaker.memories[speaker.memories.length - 1];
  const evil = speaker.team === "syndicate";
  const jester = speaker.role === "Jester";

  if (jester && Math.random() < 0.45) return stylize(speaker, pick([
    `Honestly, vote me if you want. I still think ${trusted.name} is getting a free pass.`,
    `${target.name} feels off, but maybe I am just bad at this.`,
    `I do not love how fast everyone moved on from me. That was weird.`
  ]));
  if (evil && heat > 52) return stylize(speaker, pick([
    `This feels like an easy pile-on. Ask ${target.name} why they keep nudging it.`,
    `I get why I look bad, but ${target.name} is using that to dodge questions.`,
    `If I go out here, look at ${target.name} tomorrow.`
  ]));
  if (evil && Math.random() < 0.35) return stylize(speaker, pick([
    `${trusted.name} sounds fine to me. I am more worried about ${target.name}.`,
    `I would not vote ${trusted.name} today. ${target.name} has been way less direct.`,
    `${target.name} is giving answers that sound prepared.`
  ]));
  if (speaker.role === "Investigator" && known?.includes("check")) return stylize(speaker, cleanMemory(known));
  if (speaker.role === "Tracker" && known?.includes("visited")) return stylize(speaker, cleanMemory(known));
  if (speaker.personality.intelligence > 0.8 && game.history.length) {
    return stylize(speaker, pick([
      `${target.name} is my best vote right now. ${evidenceFor(game, speaker, target)}`,
      `I keep coming back to ${target.name}. ${evidenceFor(game, speaker, target)}`,
      `Before we split votes, can ${target.name} answer one thing? ${evidenceFor(game, speaker, target)}`
    ]));
  }
  if (speaker.personality.confidence < 0.48) return stylize(speaker, pick([
    `I might be wrong, but ${target.name} made me nervous.`,
    `Can ${target.name} explain their vote again? I did not like that.`,
    `I am not ready to hard push it, but ${target.name} is not sitting right with me.`
  ]));
  if (isEarlyDay(game)) {
    return stylize(speaker, pick([
      `I want to hear more from ${target.name} before I vote there.`,
      `${target.name}, give us two suspects and one person you trust.`,
      `I am not voting off vibes yet, but ${target.name} has been too quiet.`
    ]));
  }
  return stylize(speaker, pick([
    `I want to hear more from ${target.name}.`,
    `${target.name}, who are your top two suspects?`,
    `I trust ${trusted.name} a little more than ${target.name} right now.`,
    `${target.name} has been around the vote but not really on it.`
  ]));
}

function makeCase(game, speaker, target) {
  if (target.id === speaker.id) {
    return pick([
      `I will answer it. I do not have hard info yet, but I can give reads if people want them.`,
      `I am here. If the issue is that I have been quiet, ask me something specific.`,
      `I get why my slot is easy to question, but there is not an actual catch on me yet.`
    ]);
  }
  const reason = evidenceFor(game, speaker, target);
  if (isEarlyDay(game) && !hasHardEvidence(game, target)) {
    return pick([
      `I do not want to hammer ${target.name} on Day 1. I just want them to give real reads.`,
      `${target.name}, talk more. Who do you trust and who feels fake?`,
      `I am not voting ${target.name} off nothing, but they need to stop sitting back.`
    ]);
  }
  const question = pick([
    `${target.name}, explain that.`,
    `${target.name}, who are you actually voting today?`,
    `${target.name}, give us your full read list.`
  ]);
  return pick([
    `I want pressure on ${target.name}. ${reason} ${question}`,
    `${target.name} is the vote I am looking at because ${lowerFirst(reason)}`,
    `Can we stop ignoring ${target.name}? ${reason}`
  ]);
}

function respondToBot(game, speaker, context) {
  const target = context.target;
  if (!target || target.dead || target.id === speaker.id) {
    const accuser = context.speaker;
    if (target?.id === speaker.id) {
      if (isEarlyDay(game)) {
        return pick([
          `I can answer. There has not even been a vote yet, so ask me for reads instead of calling it a case.`,
          `I am not hiding. I just do not have hard info yet.`,
          `If the problem is that I am quiet, fine. My current lean is that the loud pushers need scrutiny too.`
        ]);
      }
      return pick([
        `That is not a real case on me. My last vote was explainable, and nobody countered it at the time.`,
        `You are skipping context. I pushed before the vote, I did not just appear at the end.`,
        `If you think I am Syndicate, name a partner. Otherwise this is just an easy push.`
      ]);
    }
    return null;
  }
  const mySuspicion = speaker.suspicion[target.id] ?? 30;
  const accuser = context.speaker;
  if (isEarlyDay(game) && !hasHardEvidence(game, target)) {
    return pick([
      `I agree they should talk, but I am not voting ${target.name} just for being quiet.`,
      `Pressure is fine. Voting there right now would be lazy.`,
      `${target.name} should answer, but we need more than that before we send them out.`
    ]);
  }
  if (mySuspicion > 58) {
    return pick([
      `I agree on ${target.name}. ${evidenceFor(game, speaker, target)}`,
      `That is where I am too. ${target.name} has not answered the vote issue.`,
      `${accuser.name} is right about ${target.name}. The timeline around yesterday's vote is bad.`
    ]);
  }
  if ((speaker.trust[target.id] ?? 45) > 58) {
    const counter = mostSuspicious(speaker, game.living().filter((p) => p.id !== speaker.id && p.id !== target.id));
    return pick([
      `I do not like that push. ${target.name} has been consistent, but ${counter.name} keeps moving with the room.`,
      `I would not vote ${target.name} yet. ${counter.name} has a worse record.`,
      `That case skips over ${target.name}'s earlier read. I think ${counter.name} is more likely.`
    ]);
  }
  return pick([
    `Maybe, but I need ${target.name} to answer before I vote there.`,
    `I see the point. ${target.name}, explain your last vote and why your read changed.`,
    `That is a decent point, but I do not want a lazy pile-on. Let ${target.name} respond.`
  ]);
}

function respondToPlayer(game, speaker, context) {
  const target = context.mentioned.find((p) => p.id === speaker.id) ?? context.mentioned[0];
  const claim = context.claimedRole;
  const resultTarget = context.resultTarget ?? target;

  if (claim) {
    if (claim === "Investigator") {
      if (context.result) {
        if (resultTarget?.id === speaker.id) {
          return pick([
            `Nope. Your check on me is wrong, or you are fake claiming.`,
            `That is not a real result on me. Say exactly what night you checked me.`,
            `You are calling me ${context.result}, but that does not match anything I did.`
          ]);
        }
        return pick([
          `Okay, if you are Sheriff, give the full list of checks, not just ${resultTarget?.name}.`,
          `That claim matters. Did anyone else get info on ${resultTarget?.name}?`,
          `I can work with that, but Sheriff claims are easy to fake. Keep talking.`
        ]);
      }
      return pick([
        `If you are Sheriff, post your checks.`,
        `Claiming Sheriff without results does not help. Who did you check?`,
        `I am not voting around a bare Sheriff claim. Give names.`
      ]);
    }
    return pick([
      `Okay, you are claiming ${claim}. What did you do last night?`,
      `${claim} claim noted. That buys you a little time, not a free pass.`,
      `If that claim is real, your actions should line up with the nights.`
    ]);
  }

  if (context.kind === "accuse" && target) {
    if (target.id === speaker.id) {
      return pick([
        `You are pushing me, but your reason is thin. What exactly changed?`,
        `That is a reach. I have been consistent today.`,
        `If you want me out, give a real reason, not just vibes.`
      ]);
    }
      return pick([
        `I see the case on ${target.name}. ${evidenceFor(game, speaker, target)}`,
        `${target.name} has been odd, yeah. The vote history is the part I care about.`,
        `I am not fully there yet, but ${target.name} should answer why their read changed.`
      ]);
  }

  if (context.kind === "defend" && target) {
    return pick([
      `Why are you clearing ${target.name}? What did they do that was towny?`,
      `I do not hate that defense, but ${target.name} still needs to explain their vote.`,
      `Maybe, but defending ${target.name} that hard makes me want details.`
    ]);
  }

  if (context.kind === "question") {
    return pick([
      `My top suspect is ${mostSuspicious(speaker, game.living().filter((p) => p.id !== speaker.id)).name}.`,
      `I would vote ${mostSuspicious(speaker, game.living().filter((p) => p.id !== speaker.id)).name} right now.`,
      `I need more from the quiet people before I lock anything.`
    ]);
  }

  if (context.mentioned.length) {
    return pick([
      `What are you seeing on ${context.mentioned[0].name}?`,
      `${context.mentioned[0].name} has come up a lot. I want them to answer.`,
      `I am listening, but I need a cleaner reason on ${context.mentioned[0].name}.`
    ]);
  }
  return null;
}

function parsePlayerMessage(game, text) {
  const lower = text.toLowerCase();
  const mentioned = game.players.filter((p) => !p.isHuman && lower.includes(p.name.toLowerCase()));
  const claimedRole = Object.entries(roleAliases).find(([alias]) => new RegExp(`\\b(i'?m|i am|claiming|claim)\\s+(the\\s+)?${alias}\\b`).test(lower))?.[1] ?? null;
  const resultTarget = mentioned[0] ?? null;
  let result = null;
  if (/\b(sus|suspicious|evil|bad|guilty|syndicate)\b/.test(lower)) result = "suspicious";
  if (/\b(inno|innocent|clear|safe|town)\b/.test(lower)) result = "innocent";
  let kind = "statement";
  if (claimedRole) kind = "claim";
  else if (defenseWords.some((w) => lower.includes(w))) kind = "defend";
  else if (suspiciousWords.some((w) => lower.includes(w)) || /\bvote\b/.test(lower)) kind = "accuse";
  else if (text.includes("?")) kind = "question";
  return { fromHuman: true, text, lower, kind, mentioned, claimedRole, resultTarget, result };
}

function evidenceFor(game, speaker, target) {
  const claim = target.claims?.at(-1);
  if (claim) return `${target.name} claimed ${claim.role}, so their nights need to line up.`;
  const memories = speaker.memories.filter((m) => m.includes(target.name)).slice(-2);
  if (memories.length) return cleanMemory(memories[memories.length - 1]);
  const lastVoteTarget = target.lastVote ? game.byId(target.lastVote) : null;
  if (lastVoteTarget) return `${target.name} voted ${lastVoteTarget.name}, and that vote helped shape the day.`;
  const vote = game.history.findLast?.((h) => h.includes(`${target.name} voted`));
  if (vote) return `${vote} That timing stood out to me.`;
  const death = game.lastNightResult?.dead?.[0];
  if (death && speaker.trust[death.id] > 50) return `${death.name} died last night, and ${target.name} never gave a real read there.`;
  const pushed = game.history.findLast?.((h) => h.includes(`the player pushed ${target.name}`));
  if (pushed) return `${target.name} was already getting pushed earlier and never really answered it.`;
  if (speaker.suspicion[target.id] > 70 && !isEarlyDay(game)) return "Too many things point there.";
  if (speaker.suspicion[target.id] > 52 && !isEarlyDay(game)) return "Their story keeps shifting.";
  return `${target.name} has not given enough clear reads yet.`;
}

function tableSuspect(game) {
  const candidates = game.living().filter((p) => !p.isHuman);
  if (isEarlyDay(game)) return candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
  return candidates.sort((a, b) => averageSuspicionOf(game, b) - averageSuspicionOf(game, a))[0] ?? candidates[0];
}

function isEarlyDay(game) {
  return game.day <= 1 && game.history.filter((h) => h.includes("voted")).length === 0;
}

function hasHardEvidence(game, target) {
  return Boolean(
    target.claims?.length ||
    target.lastVote ||
    game.history.some((h) => h.includes(`${target.name} voted`) || h.includes(`the player pushed ${target.name}`))
  );
}

function inferTargetFromText(game, text) {
  return game.living().find((p) => !p.isHuman && text.includes(p.name)) ?? game.living().find((p) => text.includes(p.name)) ?? null;
}

function rankKillTargets(game, actor, candidates) {
  return [...candidates].sort((a, b) => killScore(game, actor, b) - killScore(game, actor, a));
}

function killScore(game, actor, target) {
  const power = ["Investigator", "Medic", "Tracker", "Guardian", "Vigilante"].includes(target.role) ? 30 : 0;
  const trusted = actor.trust[target.id] ?? 45;
  const heat = averageSuspicionOf(game, target);
  return power + trusted - heat * 0.7;
}

function killReason(game, target) {
  if (["Investigator", "Tracker"].includes(target.role)) return "They are the kind of slot that can produce hard info.";
  if (["Medic", "Guardian"].includes(target.role)) return "Removing protection makes future nights easier.";
  if ((averageSuspicionOf(game, target) ?? 0) < 35) return "They are too trusted to misvote later.";
  return "They are unlikely to be voted out soon.";
}

function stylize(speaker, text) {
  const style = speaker.personality.style;
  if (style === "nervous" && Math.random() < 0.25 && !/^maybe\b/i.test(text)) return `I might be wrong, but ${lowerFirst(text)}`;
  if (style === "brief") return trimSentence(text);
  if (style === "sharp" && Math.random() < 0.25) return `${trimPunctuation(text)}. Answer the question.`;
  if (style === "agreeable" && Math.random() < 0.25) return `${trimPunctuation(text)}. I can move if there is better info.`;
  return text;
}

function trimSentence(text) {
  const parts = text.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
  return /[.!?]$/.test(parts) ? parts : `${parts}.`;
}

function trimPunctuation(text) {
  return text.replace(/[.!?]+$/, "");
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function cleanMemory(memory) {
  return memory
    .replace(/^Day \d+: /, "")
    .replace(/^my check says /, "My check says ")
    .replace(/^I tracked /, "I tracked ");
}

function pick(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function action(actor, target, type) {
  if (!target) return null;
  return { actorId: actor.id, targetId: target.id, type, priority: ROLES[actor.role].priority ?? 50 };
}

function pickSyndicateKill(game, actor, candidates) {
  const power = candidates.filter((p) => ["Investigator", "Medic", "Tracker", "Guardian", "Vigilante"].includes(p.role));
  const pool = power.length ? power : candidates;
  return pool.sort((a, b) => (actor.trust[a.id] ?? 0) - (actor.trust[b.id] ?? 0))[0] ?? candidates[0];
}

function mostSuspicious(actor, players) {
  return [...players].sort((a, b) => (actor.suspicion[b.id] ?? 0) - (actor.suspicion[a.id] ?? 0))[0] ?? players[0];
}

function mostTrusted(actor, players) {
  return [...players].sort((a, b) => (actor.trust[b.id] ?? 0) - (actor.trust[a.id] ?? 0))[0] ?? players[0];
}

function averageSuspicionOf(game, target) {
  const voters = game.living().filter((p) => p.id !== target.id);
  return voters.reduce((sum, p) => sum + (p.suspicion[target.id] ?? 30), 0) / Math.max(1, voters.length);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
