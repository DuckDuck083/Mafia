import { ROLES, buildRoleDeck } from "./roles.js";

const names = [
  "Alex", "Blair", "Casey", "Devon", "Emery", "Finley", "Gray", "Harper",
  "Indigo", "Jordan", "Kai", "Logan", "Morgan", "Noel", "Parker", "Quinn"
];

const personalities = [
  { type: "Calm analyst", style: "measured", confidence: 0.62, intelligence: 0.86 },
  { type: "Aggressive accuser", style: "sharp", confidence: 0.86, intelligence: 0.64 },
  { type: "Funny troll", style: "joking", confidence: 0.74, intelligence: 0.52 },
  { type: "Nervous liar", style: "nervous", confidence: 0.38, intelligence: 0.61 },
  { type: "Quiet observer", style: "brief", confidence: 0.46, intelligence: 0.78 },
  { type: "Overconfident player", style: "bold", confidence: 0.94, intelligence: 0.57 },
  { type: "Manipulative strategist", style: "smooth", confidence: 0.78, intelligence: 0.91 },
  { type: "Easily convinced player", style: "agreeable", confidence: 0.44, intelligence: 0.49 }
];

const colors = ["#e7b85a", "#64a9ff", "#62c98b", "#df5f65", "#b18cff", "#7dd3c7", "#f29b76", "#c6d36e"];

export function createPlayers(count, roleSettings = {}) {
  const deck = buildRoleDeck(count, roleSettings);
  const pool = [...names].sort(() => Math.random() - 0.5);
  return deck.map((role, index) => {
    const isHuman = index === 0;
    const personality = personalities[index % personalities.length];
    return {
      id: `p${index}`,
      name: isHuman ? "You" : pool[index],
      role,
      faction: ROLES[role].faction,
      team: ROLES[role].team,
      ability: ROLES[role].ability,
      charges: ROLES[role].charges ?? Infinity,
      isHuman,
      personality,
      color: colors[index % colors.length],
      alive: true,
      dead: false,
      protected: false,
      guardedBy: null,
      vested: false,
      cleaned: false,
      revealedMayor: false,
      assassinSuccess: false,
      target: null,
      suspicion: {},
      trust: {},
      memories: [],
      claims: [],
      lastVote: null
    };
  });
}

export function initializeRelationships(players) {
  for (const p of players) {
    for (const other of players) {
      if (p.id === other.id) continue;
      p.suspicion[other.id] = 20 + Math.round(Math.random() * 18);
      p.trust[other.id] = 44 + Math.round(Math.random() * 18);
      if (p.team === "syndicate" && other.team === "syndicate") {
        p.suspicion[other.id] = 3;
        p.trust[other.id] = 92;
      }
    }
  }
  const assassin = players.find((p) => p.role === "Assassin");
  if (assassin) {
    const possible = players.filter((p) => p.id !== assassin.id && p.team !== "syndicate");
    assassin.target = possible[Math.floor(Math.random() * possible.length)]?.id ?? null;
  }
}
