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
    description: "You have a personal target. Win only if your own assassination kills that target.",
    ability: "assassinate",
    priority: 29,
    charges: 1
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

export function buildRoleDeck(size) {
  const base = [
    "Investigator",
    "Medic",
    "Tracker",
    "Vigilante",
    "Mayor",
    "Boss",
    "Enforcer",
    "Cleaner",
    "Deceiver",
    "Jester",
    "Assassin",
    "Survivor"
  ];
  while (base.length < size) base.splice(1 + Math.floor(Math.random() * 4), 0, "Citizen");
  return shuffle(base).slice(0, size);
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
