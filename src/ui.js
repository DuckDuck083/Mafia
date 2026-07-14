import { GameEngine } from "./gameEngine.js";
import { ROLES, defaultRoleSettings, visibleRole } from "./roles.js";
import { loadSettings, saveSettings } from "./saveData.js";

const app = document.querySelector("#app");
let game = null;
let selectedActionTarget = null;
let selectedVote = null;
let deathAcknowledged = false;
let timer = null;
let revealTimer = null;
let talkTimer = null;
let remaining = 0;

export function renderMenu() {
  const saved = loadSettings();
  const playerCount = Number(saved.playerCount ?? 13);
  const defaults = defaultRoleSettings(playerCount);
  const settings = { playerCount, dayLength: 75, ...defaults, ...saved };
  app.innerHTML = `
    <main class="screen">
      <section class="menu">
        <div class="titleBlock">
          <h1>Midnight Verdict</h1>
          <p class="subtitle">A hidden-role party game for one player against a table of scheming AI characters. Read the room, lie when needed, and survive the vote.</p>
        </div>
        <aside class="menuPanel">
          <h2>New Match</h2>
          <label class="settingRow">Players
            <select id="playerCount">
              ${range(5, 15).map((n) => `<option value="${n}" ${settings.playerCount === n ? "selected" : ""}>${n} players</option>`).join("")}
            </select>
          </label>
          <div class="roleMix">
            <h3>Role Mix</h3>
            <label class="settingRow">Syndicate
              <select id="syndicateCount">${range(1, 4).map((n) => `<option value="${n}" ${settings.syndicateCount === n ? "selected" : ""}>${n}</option>`).join("")}</select>
            </label>
            <label class="settingRow">Neutral
              <select id="neutralCount">${range(0, 3).map((n) => `<option value="${n}" ${settings.neutralCount === n ? "selected" : ""}>${n}</option>`).join("")}</select>
            </label>
            <label class="settingRow">Town Power
              <select id="townPowerCount">${range(0, 8).map((n) => `<option value="${n}" ${settings.townPowerCount === n ? "selected" : ""}>${n}</option>`).join("")}</select>
            </label>
          </div>
          <label class="settingRow">Discussion Timer
            <select id="dayLength">
              ${[45, 75, 105, 150].map((n) => `<option value="${n}" ${settings.dayLength === n ? "selected" : ""}>${n} seconds</option>`).join("")}
            </select>
          </label>
          <button class="primary" id="startGame">Start Game</button>
          <button id="tutorialBtn">Tutorial</button>
          <div class="small">Every match reshuffles roles, personalities, trust, suspicion, targets, and night decisions.</div>
        </aside>
      </section>
    </main>`;
  document.querySelector("#startGame").addEventListener("click", () => {
    const next = {
      playerCount: Number(document.querySelector("#playerCount").value),
      dayLength: Number(document.querySelector("#dayLength").value),
      syndicateCount: Number(document.querySelector("#syndicateCount").value),
      neutralCount: Number(document.querySelector("#neutralCount").value),
      townPowerCount: Number(document.querySelector("#townPowerCount").value)
    };
    normalizeRoleMix(next);
    saveSettings(next);
    game = new GameEngine(next);
    deathAcknowledged = false;
    renderReveal();
  });
  document.querySelector("#tutorialBtn").addEventListener("click", renderTutorial);
}

function normalizeRoleMix(settings) {
  settings.syndicateCount = Math.max(1, Math.min(settings.syndicateCount, Math.max(1, Math.floor((settings.playerCount - 1) / 2))));
  settings.neutralCount = Math.max(0, Math.min(settings.neutralCount, settings.playerCount - settings.syndicateCount - 1));
  settings.townPowerCount = Math.max(0, Math.min(settings.townPowerCount, settings.playerCount - settings.syndicateCount - settings.neutralCount));
}

function renderTutorial() {
  app.innerHTML = `
    <main class="screen">
      <section class="panel tutorial">
        <h1>How to Play</h1>
        <div class="tutorialGrid">
          <div><h3>1. Learn Your Role</h3><p>Your card is secret. Town finds enemies, Syndicate lies and kills, Neutral roles have their own win conditions.</p></div>
          <div><h3>2. Use Night Actions</h3><p>Power roles investigate, protect, track, frame, clean, or attack. Some results are private and some appear publicly in the morning.</p></div>
          <div><h3>3. Talk During Day</h3><p>Type in chat. Bots react to names, accusations, defenses, claims, votes, and contradictions they remember from earlier rounds.</p></div>
          <div><h3>4. Vote at Meeting</h3><p>The voting board shows every player. Living players get a Voted tag once their vote is locked. Pick a suspect and confirm.</p></div>
          <div><h3>5. Win Conditions</h3><p>Town wins by removing the Syndicate. Syndicate wins at parity with all non-mafia. Assassin wins if their target is voted out.</p></div>
          <div><h3>6. If You Die</h3><p>Restart or spectate. Spectating shows conversations, night actions, votes, reveals, and the final winner.</p></div>
        </div>
        <button class="primary" id="tutorialBack">Back</button>
      </section>
    </main>`;
  document.querySelector("#tutorialBack").addEventListener("click", renderMenu);
}

function renderReveal() {
  const role = ROLES[game.human.role];
  app.innerHTML = `
    <main class="screen">
      <section class="panel roleCard reveal winner">
        <div class="faction">${role.faction}</div>
        <div class="roleName">${game.human.role}</div>
        <p>${role.description}</p>
        ${game.human.role === "Assassin" ? `<p class="small">Your target is ${game.byId(game.human.target)?.name}. Get them voted out.</p>` : ""}
        <button class="primary" id="continue">Enter Night</button>
      </section>
    </main>`;
  document.querySelector("#continue").addEventListener("click", () => {
    game.start();
    startTimer(999);
    renderGame();
  });
}

function renderGame() {
  if (game.phase === "ended") return renderWinner();
  if (!game.human.alive && !game.spectating && !deathAcknowledged && !["voteReveal", "nightResult"].includes(game.phase)) return renderDeath();

  app.innerHTML = `
    <main class="game">
      <header class="topbar">
        <div class="phase"><div class="moon ${game.phase === "day" || game.phase === "vote" ? "sun" : ""}"></div><div><div>${phaseTitle()}</div><div class="small">${statusLine()}</div></div></div>
        <div class="timer" id="timer">${formatTime(remaining)}</div>
        <div><button class="ghost" id="menuBtn">Main Menu</button></div>
      </header>
      <aside class="sidebar">
        ${rolePanel()}
        <section class="panel"><h3>Players</h3><div class="playerList">${playerList()}</div></section>
      </aside>
      <section class="center">
        ${centerPanel()}
        ${composer()}
      </section>
      <aside class="rightbar">
        <section class="panel actions">${actionPanel()}</section>
        <section class="panel votes">${votePanel()}</section>
        <section class="panel"><h3>History</h3><div class="history">${historyPanel()}</div></section>
      </aside>
    </main>`;

  bindGameEvents();
  scheduleAutoAdvance();
  scheduleTableTalk();
  const chat = document.querySelector("#chat");
  if (chat) chat.scrollTop = chat.scrollHeight;
}

function centerPanel() {
  if (game.phase === "vote") return meetingBoard();
  if (game.phase === "voteReveal") return voteRevealBoard();
  if (game.phase === "nightResult") return nightResultBoard();
  return `<section class="panel chat" id="chat">${messages()}</section>`;
}

function rolePanel() {
  const role = ROLES[game.human.role];
  return `<section class="panel roleCard">
    <div class="faction">${role.faction}</div>
    <div class="roleName">${game.human.role}</div>
    <p class="small">${role.description}</p>
    ${Number.isFinite(game.human.charges) ? `<div class="small">Charges: ${game.human.charges}</div>` : ""}
    ${game.human.role === "Assassin" ? `<div class="small">Target: ${game.byId(game.human.target)?.name} must be voted out.</div>` : ""}
    ${game.spectating ? `<div class="small">Spectating. You cannot influence the match.</div>` : ""}
  </section>`;
}

function playerList(targetMode = null) {
  return game.players.map((p) => `
    <div class="person ${p.dead ? "dead" : ""} ${targetMode && p.alive && p.id !== game.human.id ? "targetable" : ""} ${selectedActionTarget === p.id || selectedVote === p.id ? "selected" : ""}" data-player="${p.id}">
      <div class="avatar" style="background:${p.color}">${p.name[0]}</div>
      <div><div class="name">${p.name}</div><div class="meta">${p.isHuman ? "Player" : p.personality.type} - ${visibleRole(p)}</div></div>
      <div class="statusPill">${p.alive ? "Alive" : "Dead"}</div>
    </div>`).join("");
}

function messages() {
  return game.messages.map((m) => {
    const speaker = game.byId(m.speakerId);
    return `<article class="msg ${m.type}">
      ${speaker ? `<div class="speaker">${speaker.name}</div>` : ""}
      <div class="bubble">${escapeHtml(m.text)}</div>
    </article>`;
  }).join("");
}

function composer() {
  const canDayChat = game.phase === "day";
  const canSyndicateChat = game.phase === "night" && game.human.team === "syndicate";
  const disabled = (!canDayChat && !canSyndicateChat) || game.spectating || !game.human.alive;
  const placeholder = canSyndicateChat ? "Syndicate chat: suggest a kill, frame, clean, or fake claim" : disabled ? "Chat is unavailable right now" : "Type to accuse, defend, claim, or bluff";
  return `<form class="composer" id="composer">
    <input type="text" id="chatInput" placeholder="${placeholder}" ${disabled ? "disabled" : ""} />
    <button class="primary" ${disabled ? "disabled" : ""}>Send</button>
  </form>`;
}

function actionPanel() {
  if (game.phase === "nightResult") return `<h3>Night Ability</h3><p class="small">Actions are resolving. Read the morning report.</p>`;
  if (game.phase !== "night") return `<h3>Night Ability</h3><p class="small">Night actions are available after voting resolves.</p>`;
  if (game.spectating || !game.human.alive) {
    return `<h3>Night Actions</h3><div class="small">${spectatorActions()}</div><button class="primary" id="autoNight">Resolve Night</button>`;
  }
  const ability = game.human.ability === "revealMayor" ? null : game.human.ability;
  if (!ability || game.human.charges === 0) return `<h3>Night Ability</h3><p class="small">You have no available action tonight.</p><button class="primary" id="skipNight">Sleep</button>`;
  const targets = game.living().filter((p) => ability === "vest" ? p.id === game.human.id : p.id !== game.human.id);
  const target = selectedActionTarget ? game.byId(selectedActionTarget) : null;
  return `<h3>Night Planner</h3><p class="small">${abilityCopy(ability)}</p>
  ${target ? `<div class="nightPlan">Target: <b>${target.name}</b><br>${nightTargetHint(ability, target)}</div>` : ""}
  <div class="actionGrid">
    ${targets.map((p) => `<button data-action-target="${p.id}" class="${selectedActionTarget === p.id ? "primary" : ""}">${p.name}</button>`).join("")}
  </div><button class="primary" id="confirmNight" ${selectedActionTarget ? "" : "disabled"}>Confirm</button>`;
}

function votePanel() {
  if (game.phase === "day") return `<h3>Voting</h3><button class="primary" id="toVote">Start Vote</button>${game.human.role === "Mayor" && !game.human.revealedMayor && game.human.alive ? `<button id="revealMayor">Reveal Mayor</button>` : ""}`;
  if (game.phase === "voteReveal") return `<h3>Voting</h3><p class="small">Votes are being revealed.</p>`;
  if (game.phase !== "vote") return `<h3>Voting</h3><p class="small">No vote is active.</p>`;
  const target = selectedVote ? game.byId(selectedVote) : null;
  return `<h3>Voting</h3>
    <p class="small">${target ? `Confirm or cancel on ${target.name}'s tile.` : "Choose a player on the meeting board."}</p>`;
}

function meetingBoard() {
  return `<section class="panel meetingBoard">
    <div class="meetingHeader">
      <div><h2>Emergency Meeting</h2><div class="small">Pick a suspect. Voted tags show who has locked in, not who they voted for.</div></div>
      <div class="meetingCount">${votedCount()}/${game.living().length} Voted</div>
    </div>
    <div class="meetingGrid">
      ${game.players.map((p) => meetingTile(p)).join("")}
    </div>
  </section>`;
}

function meetingTile(p) {
  const canVote = game.phase === "vote" && p.alive && !p.isHuman && !game.spectating && game.human.alive;
  const voted = p.isHuman ? Boolean(selectedVote) : Boolean(p.lastVote);
  const tag = p.dead ? "Dead" : voted ? p.isHuman ? "I Voted" : "Voted" : "Waiting";
  const selected = selectedVote === p.id;
  return `<div class="meetingTile ${p.dead ? "dead" : ""} ${selected ? "selected" : ""} ${canVote ? "clickable" : ""}" ${canVote ? `data-vote="${p.id}"` : ""}>
    <div class="avatar meetingAvatar" style="background:${p.color}">${p.name[0]}</div>
    <div class="meetingName">${p.name}</div>
    <div class="meetingRole">${p.isHuman ? "You" : p.personality.type}</div>
    ${selected ? `<div class="voteControls"><button class="confirmIcon" data-vote-confirm="${p.id}" title="Confirm vote">OK</button><button class="cancelIcon" data-vote-cancel title="Cancel vote">X</button></div>` : ""}
    <div class="voteTag ${voted ? "done" : ""}">${tag}</div>
  </div>`;
}

function voteRevealBoard() {
  const result = game.lastVoteResult;
  const rows = result?.votes ?? [];
  const tally = new Map();
  for (const vote of rows) tally.set(vote.targetId, (tally.get(vote.targetId) ?? 0) + vote.weight);
  return `<section class="panel voteRevealBoard">
    <div class="meetingHeader">
      <div><h2>Votes Revealed</h2><div class="small">The table sees who voted for whom.</div></div>
      <div class="meetingCount">Continuing...</div>
    </div>
    <div class="voteRevealList">
      ${rows.map((vote) => {
        const voter = game.byId(vote.voterId);
        const target = game.byId(vote.targetId);
        return `<div class="voteRevealRow">
          <span>${voter?.name}</span><b>-&gt;</b><span>${target?.name}</span>${vote.weight > 1 ? `<em>x${vote.weight}</em>` : ""}
        </div>`;
      }).join("")}
    </div>
    <div class="voteTally">
      ${[...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id, total]) => `<div><b>${game.byId(id)?.name}</b><span>${total} vote${total === 1 ? "" : "s"}</span></div>`).join("")}
    </div>
    <div class="eliminationBanner">${escapeHtml(result?.summary ?? "No vote result.")}</div>
  </section>`;
}

function nightResultBoard() {
  const result = game.lastNightResult;
  const publicLines = result?.morning ?? [];
  const privateLines = result?.humanInfo ?? [];
  return `<section class="panel nightResultBoard">
    <div class="meetingHeader">
      <div><h2>Morning Report</h2><div class="small">Night actions resolved by priority. Public information is shown first.</div></div>
      <div class="meetingCount">Dawn</div>
    </div>
    <div class="nightReport">
      ${publicLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
      ${privateLines.length ? `<h3>Private Results</h3>${privateLines.map((line) => `<div class="privateResult">${escapeHtml(line)}</div>`).join("")}` : ""}
    </div>
    <div class="nightActionSummary">
      ${game.spectating ? spectatorActions() : "Hidden actions stay hidden unless you are spectating."}
    </div>
  </section>`;
}

function votedCount() {
  return game.living().filter((p) => p.isHuman ? selectedVote : p.lastVote).length;
}

function bindGameEvents() {
  document.querySelector("#menuBtn").addEventListener("click", () => {
    clearInterval(timer);
    clearTimeout(talkTimer);
    renderMenu();
  });
  document.querySelector("#composer").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector("#chatInput");
    game.submitPlayerMessage(input.value);
    input.value = "";
    renderGame();
  });
  document.querySelectorAll("[data-action-target]").forEach((btn) => btn.addEventListener("click", () => {
    selectedActionTarget = btn.dataset.actionTarget;
    renderGame();
  }));
  document.querySelector("#confirmNight")?.addEventListener("click", () => {
    const action = buildHumanAction(selectedActionTarget);
    selectedActionTarget = null;
    game.resolveNightWith(action);
    startTimer(4);
    renderGame();
  });
  document.querySelector("#skipNight")?.addEventListener("click", () => {
    game.resolveNightWith(null);
    startTimer(4);
    renderGame();
  });
  document.querySelector("#autoNight")?.addEventListener("click", () => {
    game.resolveNightWith(null);
    startTimer(4);
    renderGame();
  });
  document.querySelector("#toVote")?.addEventListener("click", () => {
    game.goToVote();
    startTimer(45);
    renderGame();
  });
  document.querySelector("#revealMayor")?.addEventListener("click", () => {
    game.revealMayor();
    renderGame();
  });
  document.querySelectorAll("[data-vote]").forEach((btn) => btn.addEventListener("click", () => {
    selectedVote = btn.dataset.vote;
    renderGame();
  }));
  document.querySelectorAll("[data-vote-confirm]").forEach((btn) => btn.addEventListener("click", (event) => {
    event.stopPropagation();
    game.resolveVoteWith(btn.dataset.voteConfirm);
    selectedVote = null;
    selectedActionTarget = null;
    startTimer(5);
    renderGame();
  }));
  document.querySelectorAll("[data-vote-cancel]").forEach((btn) => btn.addEventListener("click", (event) => {
    event.stopPropagation();
    selectedVote = null;
    renderGame();
  }));
}

function scheduleAutoAdvance() {
  clearTimeout(revealTimer);
  if (game.phase === "voteReveal") {
    revealTimer = setTimeout(() => {
      game.advanceAfterVoteReveal();
      startTimer(game.phase === "night" ? 999 : 0);
      renderGame();
    }, 4700);
  }
  if (game.phase === "nightResult") {
    revealTimer = setTimeout(() => {
      game.advanceAfterNightResult();
      startTimer(game.phase === "day" ? game.settings.dayLength : 0);
      renderGame();
    }, 4200);
  }
}

function scheduleTableTalk() {
  clearTimeout(talkTimer);
  if (!game || game.phase !== "day") return;
  talkTimer = setTimeout(() => {
    if (game?.phase !== "day") return;
    game.aiTableTalk();
    renderGame();
  }, 4500 + Math.floor(Math.random() * 3500));
}

function buildHumanAction(targetId) {
  const role = ROLES[game.human.role];
  if (!role.ability || !targetId) return null;
  return { actorId: game.human.id, targetId, type: normalizeHumanAbility(role.ability), priority: role.priority ?? 50 };
}

function normalizeHumanAbility(ability) {
  if (ability === "command") return "kill";
  if (ability === "revealMayor") return null;
  return ability;
}

function renderDeath() {
  clearInterval(timer);
  app.innerHTML = `<main class="screen"><section class="deathScreen">
    <h1>You Died</h1>
    <p>The table keeps talking after your chair goes cold.</p>
    <button class="primary" id="restart">Restart Game</button>
    <button id="spectate">Spectate</button>
  </section></main>`;
  document.querySelector("#restart").addEventListener("click", renderMenu);
  document.querySelector("#spectate").addEventListener("click", () => {
    deathAcknowledged = true;
    game.spectating = true;
    startTimer(game.phase === "day" ? game.settings.dayLength : 999);
    renderGame();
  });
}

function renderWinner() {
  clearInterval(timer);
  app.innerHTML = `<main class="screen"><section class="panel winner">
    <h1>${game.winner.faction} Wins</h1>
    <p>${game.winner.text}</p>
    <div class="history">${game.players.map((p) => `${p.name}: ${p.role} (${p.alive ? "alive" : "dead"})`).join("<br>")}</div>
    <button class="primary" id="restart">New Match</button>
  </section></main>`;
  document.querySelector("#restart").addEventListener("click", renderMenu);
}

function startTimer(seconds) {
  clearInterval(timer);
  remaining = seconds;
  timer = setInterval(() => {
    remaining = Math.max(0, remaining - 1);
    const node = document.querySelector("#timer");
    if (node) node.textContent = formatTime(remaining);
    if (remaining === 0 && game?.phase === "day") {
      game.goToVote();
      startTimer(45);
      renderGame();
    }
  }, 1000);
}

function phaseTitle() {
  if (game.phase === "night") return `Night ${game.day}`;
  if (game.phase === "nightResult") return `Night ${game.day} Results`;
  if (game.phase === "day") return `Day ${game.day} Discussion`;
  if (game.phase === "vote") return `Day ${game.day} Vote`;
  if (game.phase === "voteReveal") return `Vote Reveal`;
  return "Match";
}

function statusLine() {
  const alive = game.living().length;
  return `${alive}/${game.players.length} alive`;
}

function historyPanel() {
  return game.history.slice(-18).map(escapeHtml).join("<br>") || "No public history yet.";
}

function spectatorActions() {
  if (!game.lastNightActions.length) return "No actions have resolved yet.";
  return game.lastNightActions.map((a) => `${game.byId(a.actorId)?.name} used ${a.type} on ${game.byId(a.targetId)?.name}`).join("<br>");
}

function abilityCopy(ability) {
  const map = {
    investigate: "Check a player for suspicious evidence.",
    protect: "Prevent one attack against a player.",
    guard: "Guard a player and potentially reveal yourself on a save.",
    track: "Learn who your target visits tonight.",
    shoot: "Shoot a player. You have limited shots.",
    kill: "Choose the Syndicate elimination.",
    command: "Choose the Syndicate elimination.",
    clean: "Hide a target's role if they die tonight.",
    frame: "Make a player look suspicious to investigations.",
    vest: "Protect yourself for the night."
  };
  return map[ability] ?? "Choose a target.";
}

function nightTargetHint(ability, target) {
  if (ability === "investigate") return `You will learn whether ${target.name} looks suspicious.`;
  if (ability === "protect") return `You can stop one attack on ${target.name}.`;
  if (ability === "guard") return `You may reveal yourself if ${target.name} is attacked.`;
  if (ability === "track") return `You will learn who ${target.name} visits.`;
  if (ability === "shoot") return `If ${target.name} is town, this will hurt your faction.`;
  if (ability === "vest") return "You will protect yourself tonight.";
  if (["kill", "command"].includes(ability)) return `The Syndicate will try to eliminate ${target.name}.`;
  if (ability === "clean") return `If ${target.name} dies, their role can be hidden.`;
  if (ability === "frame") return `${target.name} may look suspicious to checks.`;
  return "This target will be used for your night action.";
}

function formatTime(seconds) {
  if (seconds > 500) return "--:--";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
