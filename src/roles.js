export const FACTIONS = {
  TOWN: "Town",
  SYNDICATE: "Syndicate",
  NEUTRAL: "Neutral"
};

export const ROLES = {
  Citizen: {
    faction: FACTIONS.TOWN,
    team: "town",
    description: "No power. Read the room, catch contradictions, and vote carefully.",
    ability: null
  },
  Investigator: {
    faction: FACTIONS.TOWN,
    team: "town",
    description: "Check one player each night for alignment clues.",
    ability: "investigate",
    priority: 20
  },
  Medic: {
    faction: FACTIONS.TOWN,
    team: "town",
    description: "Protect one player each night from one attack.",
    ability: "protect",
    priority: 10
  },
  Guardian: {
    faction: FACTIONS.TOWN,
    team: "town",
    description: "Guard a player. A successful save may reveal you.",
    ability: "guard",
    priority: 9
  },
  Tracker: {
    faction: FACTIONS.TOWN,
    team: "town",
    description: "Follow one player at night and learn who they visited.",
    ability: "track",
    priority: 21
  },
  Vigilante: {
    faction: FACTIONS.TOWN,
    team: "town",
    description: "Shoot at night. You have two shots and bad shots help the Syndicate.",
    ability: "shoot",
    priority: 30,
    charges: 2
  },
  Mayor: {
    faction: FACTIONS.TOWN,
    team: "town",
    description: "A town leader. Reveal during voting to make your vote count triple.",
    ability: "revealMayor"
  },
  Boss: {
    faction: FACTIONS.SYNDICATE,
    team: "syndicate",
    description: "Lead the Syndicate. You may appear innocent to weaker checks.",
    ability: "command",
    priority: 25
  },
  Enforcer: {
    faction: FACTIONS.SYNDICATE,
    team: "syndicate",
    description: "Carry out the Syndicate elimination.",
    ability: "kill",
    priority: 26
  },
  Cleaner: {
    faction: FACTIONS.SYNDICATE,
    team: "syndicate",
    description: "Clean a death to hide that player's role reveal.",
    ability: "clean",
    priority: 27,
    charges: 2
  },
  Deceiver: {
    faction: FACTIONS.SYNDICATE,
    team: "syndicate",
    description: "Plant false evidence and make another player look suspicious.",
    ability: "frame",
    priority: 8
  },
  Jester: {
    faction: FACTIONS.NEUTRAL,
    team: "jester",
    description: "Win by getting voted out during the day.",
    ability: null
  },
  Assassin: {
    faction: FACTIONS.NEUTRAL,
    team: "assassin",
    description: "You have a personal target. Win if that target is voted out while you are alive.",
    ability: null
  },
  Survivor: {
    faction: FACTIONS.NEUTRAL,
    team: "survivor",
    description: "Stay alive until the end. Vest at night up to three times.",
    ability: "vest",
    priority: 7,
    charges: 3
  }
};

const townPowerRoles = ["Investigator", "Medic", "Tracker", "Guardian", "Vigilante", "Mayor"];
const syndicateRoles = ["Boss", "Enforcer", "Cleaner", "Deceiver"];
const neutralRoles = ["Jester", "Assassin", "Survivor"];

export function defaultRoleSettings(size) {
  const syndicateCount = Math.max(1, Math.min(4, Math.floor(size / 4)));
  const neutralCount = size >= 8 ? 1 : 0;
  const townPowerCount = Math.max(1, Math.min(size - syndicateCount - neutralCount - 1, Math.round(size / 3)));
  return { syndicateCount, neutralCount, townPowerCount };
}

export function buildRoleDeck(size, roleSettings = {}) {
  const defaults = defaultRoleSettings(size);
  const settings = {
    syndicateCount: clampCount(roleSettings.syndicateCount ?? defaults.syndicateCount, 1, Math.max(1, Math.floor((size - 1) / 2))),
    neutralCount: clampCount(roleSettings.neutralCount ?? defaults.neutralCount, 0, Math.max(0, size - 3)),
    townPowerCount: clampCount(roleSettings.townPowerCount ?? defaults.townPowerCount, 0, Math.max(0, size - 2))
  };

  while (settings.syndicateCount + settings.neutralCount + settings.townPowerCount > size) {
    if (settings.neutralCount > 0) settings.neutralCount -= 1;
    else if (settings.townPowerCount > 0) settings.townPowerCount -= 1;
    else settings.syndicateCount -= 1;
  }

  const deck = [
    ...takeRoles(syndicateRoles, settings.syndicateCount),
    ...takeRoles(neutralRoles, settings.neutralCount),
    ...takeRoles(townPowerRoles, settings.townPowerCount)
  ];
  while (deck.length < size) deck.push("Citizen");
  return shuffle(deck).slice(0, size);
}

export function visibleRole(player) {
  if (!player.dead) return "Hidden";
  if (player.cleaned) return "Cleaned";
  return player.role;
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function takeRoles(pool, count) {
  const result = [];
  let cycle = shuffle(pool);
  for (let i = 0; i < count; i += 1) {
    if (!cycle.length) cycle = shuffle(pool);
    result.push(cycle.shift());
  }
  if (result.includes("Enforcer") && !result.includes("Boss")) result[0] = "Boss";
  if (pool.includes("Boss") && count === 1) result[0] = "Boss";
  return result;
}

function clampCount(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}
