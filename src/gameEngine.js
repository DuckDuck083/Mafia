import { ROLES } from "./roles.js";
import { createPlayers, initializeRelationships } from "./players.js";
import { collectNightActions, resolveNight } from "./nightActions.js";
import { chooseVote, generateDiscussion, generateSyndicateDiscussion, ingestPlayerMessage, ingestSyndicateMessage } from "./ai.js";
import { resolveVotes } from "./voting.js";

export class GameEngine {
  constructor(settings = {}) {
    this.settings = { playerCount: 13, dayLength: 75, ...settings };
    this.players = createPlayers(this.settings.playerCount);
    initializeRelationships(this.players);
    this.human = this.players[0];
    this.phase = "reveal";
    this.day = 1;
    this.messages = [];
    this.history = [];
    this.lastNightActions = [];
    this.lastNightResult = null;
    this.lastVoteResult = null;
    this.pendingVotes = {};
    this.pendingAfterNightWinner = null;
    this.pendingAfterVoteWinner = null;
    this.spectating = false;
    this.winner = null;
    this.startedAt = Date.now();
  }

  living() {
    return this.players.filter((p) => p.alive);
  }

  byId(id) {
    return this.players.find((p) => p.id === id);
  }

  dayLabel() {
    return `Day ${this.day}`;
  }

  addSystem(text) {
    this.messages.push({ type: "system", text, at: Date.now() });
  }

  addMessage(speaker, text) {
    this.messages.push({ type: speaker?.isHuman ? "me" : "ai", speakerId: speaker?.id, text, at: Date.now() });
  }

  addSyndicateMessage(speaker, text) {
    this.messages.push({ type: speaker?.isHuman ? "me syndicate" : "ai syndicate", speakerId: speaker?.id, text, at: Date.now() });
  }

  start() {
    this.phase = "night";
    this.addSystem(`Your role is ${this.human.role}: ${ROLES[this.human.role].description}`);
    this.addSystem("Night falls. Choose your action if your role has one.");
    this.openSyndicateChat();
  }

  submitPlayerMessage(text) {
    if (!text.trim() || this.spectating || !this.human.alive) return;
    if (this.phase === "night" && this.human.team === "syndicate") {
      this.addSyndicateMessage(this.human, text.trim());
      const context = ingestSyndicateMessage(this, text.trim());
      generateSyndicateDiscussion(this, context).forEach((r) => this.addSyndicateMessage(r.speaker, r.text));
      return;
    }
    if (this.phase !== "day") return;
    this.addMessage(this.human, text.trim());
    const context = ingestPlayerMessage(this, text.trim());
    const replies = generateDiscussion(this, 4, context);
    replies.forEach((r) => this.addMessage(r.speaker, r.text));
  }

  resolveNightWith(playerAction) {
    const actions = collectNightActions(this, playerAction);
    this.lastNightActions = actions;
    const result = resolveNight(this, actions);
    this.lastNightResult = result;
    result.morning.forEach((m) => this.addSystem(m));
    result.humanInfo.forEach((m) => this.addSystem(`Private result: ${m}`));
    const win = this.checkWin();
    this.pendingAfterNightWinner = win;
    this.phase = "nightResult";
    return win;
  }

  advanceAfterNightResult() {
    if (this.pendingAfterNightWinner) {
      this.phase = "ended";
      return;
    }
    this.phase = "day";
    this.addSystem(`Day ${this.day} discussion begins.`);
    generateDiscussion(this, 5).forEach((r) => this.addMessage(r.speaker, r.text));
  }

  goToVote() {
    if (this.phase !== "day") return;
    this.phase = "vote";
    this.pendingVotes = {};
    for (const voter of this.living().filter((p) => !p.isHuman)) {
      this.pendingVotes[voter.id] = chooseVote(this, voter);
      voter.lastVote = this.pendingVotes[voter.id];
    }
    this.addSystem("Voting begins. Choose someone to eliminate.");
  }

  revealMayor() {
    if (this.human.role === "Mayor" && this.human.alive) {
      this.human.revealedMayor = true;
      this.addSystem("You reveal as Mayor. Your vote now counts as three.");
    }
  }

  resolveVoteWith(targetId) {
    const result = resolveVotes(this, targetId);
    this.lastVoteResult = result;
    result.speeches.forEach((s) => this.addMessage(s.speaker, s.text));
    this.addSystem(result.summary);
    const win = this.checkWin();
    this.pendingAfterVoteWinner = win;
    this.phase = "voteReveal";
    return result;
  }

  advanceAfterVoteReveal() {
    if (this.pendingAfterVoteWinner) {
      this.phase = "ended";
      return;
    }
    this.day += 1;
    this.phase = "night";
    this.pendingVotes = {};
    this.addSystem(`Night ${this.day} begins.`);
    this.openSyndicateChat();
  }

  openSyndicateChat() {
    if (this.human.team !== "syndicate" || !this.human.alive) return;
    const teammates = this.living().filter((p) => p.team === "syndicate" && p.id !== this.human.id);
    if (!teammates.length) return;
    this.addSystem(`Syndicate chat is open. Teammates: ${teammates.map((p) => p.name).join(", ")}.`);
    generateSyndicateDiscussion(this).forEach((r) => this.addSyndicateMessage(r.speaker, r.text));
  }

  checkWin() {
    const alive = this.living();
    const syndicate = alive.filter((p) => p.team === "syndicate");
    const town = alive.filter((p) => p.team === "town");
    const nonSyndicate = alive.filter((p) => p.team !== "syndicate");
    const jester = this.players.find((p) => p.role === "Jester");
    const assassin = this.players.find((p) => p.role === "Assassin");
    const survivor = this.players.find((p) => p.role === "Survivor");

    if (jester?.dead && this.history.at(-1)?.includes(`${jester.name} was eliminated by vote`)) {
      this.winner = { faction: "Jester", text: `${jester.name} wins by getting voted out.` };
    } else if (assassin?.alive && assassin.assassinSuccess) {
      this.winner = { faction: "Assassin", text: `${assassin.name} wins by personally assassinating their target.` };
    } else if (syndicate.length >= nonSyndicate.length && syndicate.length > 0) {
      this.winner = { faction: "Syndicate", text: "The Syndicate controls the vote and takes the town." };
    } else if (syndicate.length === 0) {
      const survivorText = survivor?.alive ? " The Survivor also lives to the end." : "";
      this.winner = { faction: "Town", text: `Town eliminated every Syndicate member.${survivorText}` };
    }
    if (this.winner) this.phase = "ended";
    return this.winner;
  }
}
