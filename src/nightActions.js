import { aiNightAction } from "./ai.js";

export function collectNightActions(game, playerAction) {
  const actions = [];
  if (playerAction) actions.push(playerAction);
  const humanDirectedKill = playerAction && ["kill", "command"].includes(playerAction.type);
  let syndicateKillAdded = Boolean(humanDirectedKill);
  for (const actor of game.players) {
    const aiAction = aiNightAction(game, actor);
    if (aiAction && ["kill", "command"].includes(aiAction.type)) {
      if (syndicateKillAdded) continue;
      syndicateKillAdded = true;
    }
    if (aiAction) actions.push(aiAction);
  }
  return actions.sort((a, b) => a.priority - b.priority);
}

export function resolveNight(game, actions) {
  const attacks = [];
  const cleanedTargets = new Set();
  const visits = new Map();
  const morning = [];
  const humanInfo = [];

  for (const p of game.players) {
    p.protected = false;
    p.guardedBy = null;
    p.vested = false;
    p.framed = false;
  }

  for (const act of actions) {
    const actor = game.byId(act.actorId);
    const target = game.byId(act.targetId);
    if (!actor?.alive || !target?.alive) continue;
    visits.set(actor.id, target.id);
    if (Number.isFinite(actor.charges) && ["shoot", "clean", "assassinate", "vest"].includes(act.type)) actor.charges -= 1;

    if (act.type === "protect") target.protected = true;
    if (act.type === "guard") target.guardedBy = actor.id;
    if (act.type === "vest") target.vested = true;
    if (act.type === "frame") target.framed = true;
    if (act.type === "clean") cleanedTargets.add(target.id);
    if (["kill", "shoot", "assassinate"].includes(act.type)) attacks.push(act);
    if (act.type === "investigate") {
      const suspicious = target.framed || (target.team === "syndicate" && target.role !== "Boss");
      const clue = target.role === "Boss" ? `${target.name} appears organized but not openly criminal.` : `${target.name} reads as ${suspicious ? "suspicious" : "not suspicious"}.`;
      remember(actor, `${game.dayLabel()}: my check says ${clue}`);
      if (actor.isHuman) humanInfo.push(clue);
    }
    if (act.type === "track") {
      const visited = visits.get(target.id);
      const clue = visited ? `${target.name} visited ${game.byId(visited).name}.` : `${target.name} did not seem to visit anyone.`;
      remember(actor, `${game.dayLabel()}: I tracked ${clue}`);
      if (actor.isHuman) humanInfo.push(clue);
    }
  }

  const dead = [];
  for (const attack of attacks) {
    const actor = game.byId(attack.actorId);
    const target = game.byId(attack.targetId);
    if (!actor?.alive || !target?.alive) continue;
    if (target.protected || target.vested) {
      morning.push(`${target.name} was attacked but survived.`);
      raiseSuspicion(game, actor, 8);
      continue;
    }
    if (target.guardedBy) {
      const guardian = game.byId(target.guardedBy);
      morning.push(`${target.name} was saved by a Guardian.`);
      if (guardian) {
        guardian.revealed = true;
        remember(guardian, `${game.dayLabel()}: I saved ${target.name}.`);
      }
      raiseSuspicion(game, actor, 12);
      continue;
    }
    kill(game, target, attack.type === "shoot" ? actor : null);
    if (attack.type === "assassinate" && actor.role === "Assassin" && actor.target === target.id) {
      actor.assassinSuccess = true;
    }
    if (cleanedTargets.has(target.id)) target.cleaned = true;
    dead.push(target);
  }

  if (!dead.length && !morning.length) morning.push("The town wakes to an uneasy silence. No bodies were found.");
  for (const body of dead) {
    morning.push(`${body.name} died during the night. ${body.cleaned ? "Their role was cleaned." : `They were the ${body.role}.`}`);
  }

  for (const action of actions) {
    const actor = game.byId(action.actorId);
    const target = game.byId(action.targetId);
    if (actor && target) remember(actor, `${game.dayLabel()}: I visited ${target.name}.`);
  }

  return { morning, humanInfo, dead, actions };
}

export function kill(game, player, killer = null) {
  player.alive = false;
  player.dead = true;
  if (killer?.team === "town" && player.team === "town") {
    for (const ai of game.players.filter((p) => !p.isHuman)) {
      ai.suspicion[killer.id] = Math.min(100, (ai.suspicion[killer.id] ?? 35) + 24);
    }
  }
}

function remember(player, memory) {
  player.memories.push(memory);
  if (player.memories.length > 24) player.memories.shift();
}

function raiseSuspicion(game, actor, amount) {
  for (const p of game.players.filter((x) => !x.isHuman && x.id !== actor.id)) {
    p.suspicion[actor.id] = Math.min(100, (p.suspicion[actor.id] ?? 25) + amount);
  }
}
