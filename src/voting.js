import { chooseVote, explainVote } from "./ai.js";
import { kill } from "./nightActions.js";

export function resolveVotes(game, humanVote) {
  const votes = [];
  for (const voter of game.living()) {
    const targetId = voter.isHuman ? humanVote : game.pendingVotes?.[voter.id] ?? chooseVote(game, voter);
    if (!targetId) continue;
    voter.lastVote = targetId;
    const weight = voter.role === "Mayor" && voter.revealedMayor ? 3 : 1;
    votes.push({ voterId: voter.id, targetId, weight });
    const target = game.byId(targetId);
    if (target) {
      game.history.push(`${voter.name} voted ${target.name}.`);
      for (const ai of game.players.filter((p) => !p.isHuman && p.id !== voter.id)) {
        if (target.team === ai.team && ai.team === "syndicate") ai.suspicion[voter.id] += 7;
        ai.memories.push(`${game.dayLabel()}: ${voter.name} voted ${target.name}.`);
      }
    }
  }

  const tally = new Map();
  for (const vote of votes) tally.set(vote.targetId, (tally.get(vote.targetId) ?? 0) + vote.weight);
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const [targetId, top] = sorted[0] ?? [];
  const tied = sorted.filter(([, n]) => n === top);
  const speeches = votes.filter((v) => !game.byId(v.voterId).isHuman).slice(0, 6).map((v) => ({
    speaker: game.byId(v.voterId),
    text: explainVote(game, game.byId(v.voterId), v.targetId)
  }));

  if (!targetId || tied.length > 1) {
    game.history.push("The vote tied. No one was eliminated.");
    return { eliminated: null, votes, speeches, summary: "The vote tied. No one was eliminated." };
  }

  const eliminated = game.byId(targetId);
  kill(game, eliminated);
  const assassin = game.players.find((p) => p.role === "Assassin" && p.alive);
  if (assassin?.target === eliminated.id) assassin.assassinSuccess = true;
  game.history.push(`${eliminated.name} was eliminated by vote. ${eliminated.cleaned ? "Their role was hidden." : `They were the ${eliminated.role}.`}`);
  return {
    eliminated,
    votes,
    speeches,
    summary: `${eliminated.name} was eliminated by vote. ${eliminated.cleaned ? "Their role was hidden." : `They were the ${eliminated.role}.`}`
  };
}
