import { findRoster } from "../../characters/roster.js";
import { XP_NEED } from "../../systems/xp.js";
import { CAMPAIGN, START_EVOLUTION, START_XP } from "../../multiplayer/mission.js";

const ARENA = { left: 48, right: 1232, top: 450, floor: 572, exit: 1125 };
const MAX_EVENTS = 32;
const ABILITY_RULES = Object.freeze({
  ukulele: [42, 750, 230], hula: [68, 2200, 260], ohana: [132, 5200, 300],
  plasma: [48, 700, 240], rollo: [74, 1900, 250], caos: [118, 4800, 300],
  chain: [46, 650, 250], blink: [72, 1800, 260], storm: [126, 5000, 310],
  yarn: [40, 600, 230], purr: [34, 2100, 240, 16], ninetails: [120, 5000, 300],
  breath: [48, 700, 260], gust: [72, 1800, 280], meteor: [130, 5000, 300],
  bite: [52, 700, 190], charge: [82, 2100, 280], quake: [124, 5200, 290],
  salt: [42, 650, 220], ketchup: [70, 1800, 250], fryer: [122, 4900, 290],
  pepperoni: [42, 650, 250], cheese: [70, 1900, 260], oven: [126, 5000, 300],
  ofuda: [46, 650, 230], sleeve: [72, 1900, 260], maw: [126, 5100, 290],
  gleam: [44, 650, 280], gallop: [78, 1900, 260], rainbow: [122, 5000, 310],
});

const QUEEN_PATTERNS = ["swoop", "claw", "shockwave"];

function definitionFor(player) { return findRoster(player.characterId); }
function formFor(player) {
  const definition = definitionFor(player);
  return definition?.forms?.[Math.max(0, Math.min(4, player.evolution ?? START_EVOLUTION))] || definition;
}

function recordEvent(combat, event) {
  const seq = ++combat.eventSequence;
  const stored = { ...event, id: event.id ?? `${combat.startedAt}:${seq}`, seq, at: event.at ?? Date.now() };
  combat.events.push(stored);
  if (combat.events.length > MAX_EVENTS) combat.events.splice(0, combat.events.length - MAX_EVENTS);
  combat.lastEvent = stored;
  return stored;
}

function enemyFor(stage, entry, index, now) {
  return {
    ...entry,
    y: ARENA.floor,
    maxHp: entry.hp,
    alive: true,
    mode: "idle",
    cycle: 0,
    targetSlot: null,
    lockX: null,
    lockY: null,
    modeUntil: 0,
    nextAttackAt: now + 1800 + index * 500,
    roomId: stage.id,
  };
}

function createQueen(players, now) {
  const target = players.find((player) => player.slot === 1) || players[0];
  return {
    id: "queen-of-the-nest",
    name: "Reina del Nido",
    hp: 1800,
    maxHp: 1800,
    phase: 1,
    x: 640,
    y: 452,
    mode: "telegraph",
    targetSlot: target.slot,
    cycle: 1,
    pattern: QUEEN_PATTERNS[0],
    lockX: target.x,
    lockY: target.y,
    attackAt: now + 7000,
    modeUntil: 0,
    dodgeSuccess: false,
    facing: -1,
  };
}

function enterStage(room, stageIndex, now) {
  const combat = room.combat;
  const stage = CAMPAIGN[stageIndex];
  combat.campaign.stageIndex = stageIndex;
  combat.campaign.roomId = stage.id;
  combat.campaign.exitOpen = false;
  combat.campaign.stageStartedAt = now;
  combat.scene = {
    kind: stage.boss ? "queen-intro" : "room-entry",
    stageIndex,
    startedAt: now,
    durationMs: stage.boss ? 4200 : 1900,
  };
  combat.enemies = stage.enemies.map((enemy, index) => enemyFor(stage, enemy, index, now));
  for (const player of room.players) {
    player.x = player.slot === 0 ? 390 : 880;
    player.y = ARENA.floor;
    player.facing = player.slot === 0 ? 1 : -1;
    player.lastMoveAt = now;
    player.dodgeUntil = 0;
  }
  combat.boss = stage.boss ? createQueen(room.players, now) : null;
  recordEvent(combat, {
    kind: stage.boss ? "queen-intro" : "room-entry",
    roomId: stage.id,
    worldId: stage.worldId,
    text: stage.boss ? "La Reina del Nido se alza ante la familia." : `${stage.name}: ${stage.hint}`,
    at: now,
  });
}

function awardExperience(room, amount, now, source) {
  if (!(amount > 0)) return;
  const combat = room.combat;
  for (const player of room.players) {
    player.experience = (player.experience || 0) + amount;
    let nextForm = Math.max(0, Math.min(4, player.evolution ?? START_EVOLUTION));
    while (nextForm < 4 && player.experience >= (XP_NEED[nextForm + 1] ?? Infinity)) nextForm += 1;
    if (nextForm === (player.evolution ?? START_EVOLUTION)) continue;
    const oldMax = player.maxHealth || 1;
    player.evolution = nextForm;
    player.maxHealth = formFor(player)?.hp || oldMax;
    player.health = Math.min(player.maxHealth, (player.health || 0) + Math.max(0, player.maxHealth - oldMax));
    recordEvent(combat, {
      kind: "evolution",
      playerSlot: player.slot,
      from: nextForm - 1,
      to: nextForm,
      source,
      text: `${definitionFor(player)?.name || "El personaje"} evoluciona a su forma ${nextForm + 1}.`,
      at: now,
    });
  }
}

function finishIfNeeded(room, now) {
  const combat = room.combat;
  if (combat.boss?.hp <= 0) {
    combat.boss.hp = 0;
    room.phase = "won";
    combat.ending = { kind: "victory", startedAt: now, durationMs: 7600 };
    recordEvent(combat, { kind: "victory", text: "La familia ha derrotado a la Reina del Nido. Nadie se queda atrás.", at: now });
  } else if (room.players.some((player) => player.health <= 0)) {
    room.phase = "lost";
    combat.ending = { kind: "defeat", startedAt: now, durationMs: 5200 };
    recordEvent(combat, { kind: "defeat", text: "La familia ha caído. La misión termina para los dos.", at: now });
  }
}

function openExitIfClear(room, now) {
  const combat = room.combat;
  const stage = CAMPAIGN[combat.campaign.stageIndex];
  if (!stage || stage.boss || combat.campaign.exitOpen || combat.enemies.some((enemy) => enemy.alive)) return;
  combat.campaign.exitOpen = true;
  combat.campaign.roomsCleared += 1;
  awardExperience(room, stage.clearXp, now, "room-clear");
  recordEvent(combat, {
    kind: "room-clear",
    roomId: stage.id,
    text: `${stage.name} despejada. La familia recibe ${stage.clearXp} XP. Reuníos en el portal del este.`,
    at: now,
  });
}

function maybeEnterNextRoom(room, now) {
  const combat = room.combat;
  if (!combat.campaign.exitOpen || combat.campaign.stageIndex >= CAMPAIGN.length - 1) return;
  if (!room.players.every((player) => player.connected && player.x >= ARENA.exit)) return;
  enterStage(room, combat.campaign.stageIndex + 1, now);
}

function distanceFromLock(player, attack) {
  return Math.hypot(player.x - (attack.lockX ?? player.x), player.y - (attack.lockY ?? player.y));
}

function resolveEnemyAttacks(room, now) {
  const combat = room.combat;
  let changed = false;
  for (const enemy of combat.enemies) {
    if (!enemy.alive || combat.campaign.exitOpen) continue;
    if (enemy.mode === "idle" && now >= enemy.nextAttackAt) {
      const target = room.players
        .filter((player) => player.health > 0)
        .sort((a, b) => Math.abs(a.x - enemy.x) - Math.abs(b.x - enemy.x))[0];
      if (!target || Math.abs(target.x - enemy.x) > enemy.range) {
        enemy.nextAttackAt = now + 800;
        continue;
      }
      enemy.mode = "telegraph";
      enemy.targetSlot = target.slot;
      enemy.lockX = target.x;
      enemy.lockY = target.y;
      enemy.modeUntil = now + 820;
      enemy.cycle += 1;
      recordEvent(combat, {
        kind: "enemy-telegraph",
        enemyId: enemy.id,
        targetSlot: target.slot,
        text: `${enemy.name} prepara un ataque contra Jugador ${target.slot + 1}.`,
        at: now,
      });
      changed = true;
      continue;
    }
    if (enemy.mode === "telegraph" && now >= enemy.modeUntil) {
      const target = room.players.find((player) => player.slot === enemy.targetSlot);
      if (target && target.health > 0 && !(target.dodgeUntil > now) && distanceFromLock(target, enemy) < 96) {
        target.health = Math.max(0, target.health - enemy.damage);
        recordEvent(combat, {
          kind: "enemy-hit",
          enemyId: enemy.id,
          targetSlot: target.slot,
          damage: enemy.damage,
          text: `${enemy.name} alcanza a Jugador ${target.slot + 1}.`,
          at: now,
        });
        finishIfNeeded(room, now);
      } else {
        recordEvent(combat, {
          kind: "enemy-miss",
          enemyId: enemy.id,
          targetSlot: enemy.targetSlot,
          text: `${enemy.name} falla: buena esquiva.`,
          at: now,
        });
      }
      enemy.mode = "recover";
      enemy.modeUntil = now + 650;
      changed = true;
      continue;
    }
    if (enemy.mode === "recover" && now >= enemy.modeUntil) {
      enemy.mode = "idle";
      enemy.nextAttackAt = now + enemy.interval;
      enemy.targetSlot = null;
      changed = true;
    }
  }
  return changed;
}

function resolveQueenAttack(room, now) {
  const combat = room.combat;
  const boss = combat.boss;
  if (!boss) return false;
  if (boss.mode === "telegraph" && now >= boss.attackAt) {
    const target = room.players.find((player) => player.slot === boss.targetSlot && player.health > 0);
    boss.mode = "charge";
    boss.modeUntil = now + 620;
    boss.dodgeSuccess = false;
    boss.x = Math.max(ARENA.left + 100, Math.min(ARENA.right - 100, boss.lockX));
    boss.facing = target ? Math.sign(target.x - 640) || 1 : 1;
    recordEvent(combat, {
      kind: "queen-attack",
      pattern: boss.pattern,
      targetSlot: boss.targetSlot,
      lockX: boss.lockX,
      lockY: boss.lockY,
      text: boss.pattern === "shockwave" ? "La Reina golpea el suelo. ¡Salid del círculo!" : "La Reina se lanza sobre su objetivo. ¡Esquiva!",
      at: now,
    });
    return true;
  }
  if (boss.mode === "charge" && now >= boss.modeUntil) {
    const target = room.players.find((player) => player.slot === boss.targetSlot);
    if (target && target.health > 0 && !(target.dodgeUntil > now) && !boss.dodgeSuccess && distanceFromLock(target, boss) < (boss.pattern === "shockwave" ? 132 : 92)) {
      const damage = (boss.pattern === "shockwave" ? 27 : boss.pattern === "claw" ? 22 : 24) + (boss.phase - 1) * 4;
      target.health = Math.max(0, target.health - damage);
      recordEvent(combat, {
        kind: "queen-hit",
        targetSlot: target.slot,
        damage,
        pattern: boss.pattern,
        text: `La Reina alcanza a Jugador ${target.slot + 1}: −${damage} HP.`,
        at: now,
      });
      finishIfNeeded(room, now);
      boss.mode = "recover";
      boss.modeUntil = now + 1250;
    } else {
      boss.mode = "break";
      boss.modeUntil = now + 2700;
      recordEvent(combat, {
        kind: "break",
        targetSlot: target?.slot ?? boss.targetSlot,
        text: "¡Esquiva perfecta! La Reina queda expuesta; aprovechad la apertura.",
        at: now,
      });
    }
    return true;
  }
  if ((boss.mode === "break" || boss.mode === "recover") && now >= boss.modeUntil) {
    boss.cycle += 1;
    boss.targetSlot = boss.cycle % 2;
    const target = room.players.find((player) => player.slot === boss.targetSlot) || room.players[0];
    boss.lockX = target?.x ?? 640;
    boss.lockY = target?.y ?? ARENA.floor;
    boss.pattern = QUEEN_PATTERNS[(boss.cycle - 1) % QUEEN_PATTERNS.length];
    boss.x = 640;
    boss.mode = "telegraph";
    boss.dodgeSuccess = false;
    boss.attackAt = now + Math.max(2300, 3100 - boss.phase * 220);
    return true;
  }
  return false;
}

export function createCombat(players, now) {
  for (const player of players) {
    const definition = findRoster(player.characterId);
    player.evolution = START_EVOLUTION;
    player.experience = START_XP;
    player.maxHealth = definition?.forms?.[START_EVOLUTION]?.hp || definition?.health || 100;
    player.health = player.maxHealth;
    player.cooldowns = {};
    player.combo = 0;
    player.lastComboAt = 0;
  }
  const stage = CAMPAIGN[0];
  const combat = {
    startedAt: now,
    boss: null,
    enemies: stage.enemies.map((enemy, index) => enemyFor(stage, enemy, index, now)),
    campaign: { stageIndex: 0, roomId: stage.id, roomsCleared: 0, exitOpen: false, stageStartedAt: now },
    scene: { kind: "opening", stageIndex: 0, startedAt: now, durationMs: 5600 },
    ending: null,
    events: [],
    eventSequence: 0,
    lastEvent: null,
    lastTeamHitAt: 0,
    lastTeamHitSlot: null,
    teamCombo: 0,
  };
  recordEvent(combat, {
    kind: "start",
    roomId: stage.id,
    worldId: stage.worldId,
    text: "Dos caminos, una familia. La misión empieza en Costa Hoku.",
    at: now,
  });
  return combat;
}

export function advanceCombat(room, now) {
  const combat = room.combat;
  if (!combat || room.phase !== "playing") return false;
  let changed = false;
  if (combat.scene && now >= combat.scene.startedAt + combat.scene.durationMs) {
    combat.scene = null;
    changed = true;
  }
  if (combat.scene) return changed;
  if (room.phase !== "playing") return changed;
  changed = resolveEnemyAttacks(room, now) || changed;
  changed = resolveQueenAttack(room, now) || changed;
  openExitIfClear(room, now);
  const boss = combat.boss;
  if (boss) {
    const ratio = boss.hp / boss.maxHp;
    const phase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
    if (boss.phase !== phase) {
      boss.phase = phase;
      recordEvent(combat, { kind: "queen-phase", phase, text: `La Reina entra en su fase ${phase}.`, at: now });
      changed = true;
    }
  }
  return changed;
}

export function moveCombatPlayer(room, player, x, y, now) {
  const combat = room.combat;
  if (!combat || room.phase !== "playing" || combat.scene) return false;
  const elapsed = Math.max(0, Math.min(0.3, (now - player.lastMoveAt) / 1000));
  const speed = formFor(player)?.speed || definitionFor(player)?.speed || 4.5;
  player.x = Math.max(ARENA.left, Math.min(ARENA.right, player.x + x * speed * 60 * elapsed));
  player.y = Math.max(ARENA.top, Math.min(ARENA.floor, player.y + y * speed * 60 * elapsed));
  if (x) player.facing = Math.sign(x);
  player.lastMoveAt = now;
  maybeEnterNextRoom(room, now);
  return true;
}

function hitEvent(room, player, target, profile, damage, now, bonus = {}) {
  const combat = room.combat;
  return recordEvent(combat, {
    kind: target.id === "queen-of-the-nest" ? "queen-damage" : "enemy-damage",
    playerSlot: player.slot,
    targetId: target.id,
    targetX: target.x,
    targetY: target.y,
    actionKind: profile.id === "basic" ? "attack" : "ability",
    abilityId: profile.id,
    damage,
    combo: player.combo,
    ...bonus,
    text: `${definitionFor(player)?.name || "El personaje"} golpea a ${target.name} por ${damage}.`,
    at: now,
  });
}

export function resolveCombatAction(room, player, action, now) {
  const combat = room.combat;
  if (!combat || room.phase !== "playing") return { accepted: false, reason: "La misión no está activa." };
  if (combat.scene) return { accepted: false, reason: "La escena de entrada está terminando." };
  if (combat.campaign.exitOpen) return { accepted: false, reason: "Enemigos despejados. Reuníos en el portal del este." };

  const definition = definitionFor(player);

  if (action.kind === "dodge") {
    const readyAt = Number(player.cooldowns?.dodge) || 0;
    if (now < readyAt) return { accepted: false, reason: "La esquiva aún se está recargando." };
    player.cooldowns.dodge = now + 700;
    player.dodgeUntil = now + 520;
    const direction = player.facing || 1;
    player.x = Math.max(ARENA.left, Math.min(ARENA.right, player.x + direction * 78));
    const event = recordEvent(combat, {
      kind: "dodge",
      playerSlot: player.slot,
      targetX: player.x,
      targetY: player.y,
      actionKind: "dodge",
      text: `${definitionFor(player)?.name || "El personaje"} esquiva.`,
      at: now,
    });
    return { accepted: true, target: null, damage: 0, eventId: event.id, abilityId: "dodge" };
  }

  let profile = { id: "basic", damage: 38, cooldown: 420, range: 218, heal: 0 };
  if (action.kind === "ability") {
    const slot = Number(action.slot);
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return { accepted: false, reason: "La habilidad no es válida." };
    const id = definition?.abilities?.[slot];
    const values = ABILITY_RULES[id];
    if (!values) return { accepted: false, reason: "Esa habilidad no está disponible." };
    profile = { id, damage: values[0], cooldown: values[1], range: values[2], heal: values[3] || 0 };
  }
  const readyAt = Number(player.cooldowns?.[profile.id]) || 0;
  if (now < readyAt) return { accepted: false, reason: "La habilidad aún se está recargando." };

  const targetEnemy = combat.enemies
    .filter((enemy) => enemy.alive && Math.abs(enemy.x - player.x) <= profile.range)
    .sort((a, b) => Math.abs(a.x - player.x) - Math.abs(b.x - player.x))[0];
  const boss = combat.boss;
  const targetBoss = !targetEnemy && boss && Math.abs(boss.x - player.x) <= profile.range && Math.abs(boss.y - player.y) <= 180;
  const target = targetEnemy || (targetBoss ? boss : null);
  if (!target) {
    return { accepted: false, reason: boss ? "Acércate a la Reina para que tu golpe llegue." : "Acércate a un enemigo para que tu golpe llegue." };
  }

  player.cooldowns[profile.id] = now + profile.cooldown;
  const elapsed = now - (player.lastComboAt || 0);
  player.combo = elapsed <= 2200 ? Math.min(8, (player.combo || 0) + 1) : 1;
  player.lastComboAt = now;
  const alternating = combat.lastTeamHitSlot !== player.slot && now - combat.lastTeamHitAt <= 4200;
  combat.teamCombo = alternating ? Math.min(8, combat.teamCombo + 1) : (combat.teamCombo > 0 && now - combat.lastTeamHitAt <= 4200 ? combat.teamCombo : 0);
  combat.lastTeamHitAt = now;
  combat.lastTeamHitSlot = player.slot;
  const evolutionMultiplier = [1, 1, 1.1, 1.22, 1.35][player.evolution || 0];
  const comboMultiplier = 1 + Math.min(5, Math.max(0, player.combo - 1)) * 0.035;
  const teamMultiplier = alternating ? 1.12 : 1;
  const breakBonus = targetBoss && boss.mode === "break" && now <= boss.modeUntil;
  const damage = Math.round(profile.damage * evolutionMultiplier * comboMultiplier * teamMultiplier * (breakBonus ? 1.45 : 1));
  target.hp = Math.max(0, target.hp - damage);
  if (targetEnemy) {
    targetEnemy.alive = targetEnemy.hp > 0;
    if (!targetEnemy.alive) {
      awardExperience(room, targetEnemy.xp, now, "enemy-defeat");
      recordEvent(combat, {
        kind: "enemy-defeated",
        enemyId: targetEnemy.id,
        targetId: targetEnemy.id,
        targetX: targetEnemy.x,
        targetY: targetEnemy.y,
        xp: targetEnemy.xp,
        text: `${targetEnemy.name} derrotado. +${targetEnemy.xp} XP para los dos.`,
        at: now,
      });
    }
  } else if (targetBoss) {
    if (profile.heal) player.health = Math.min(player.maxHealth, player.health + profile.heal);
    const ratio = boss.hp / boss.maxHp;
    boss.phase = ratio <= 0.33 ? 3 : ratio <= 0.66 ? 2 : 1;
  }
  const event = hitEvent(room, player, target, profile, damage, now, { breakBonus, teamCombo: combat.teamCombo });
  finishIfNeeded(room, now);
  openExitIfClear(room, now);
  return {
    accepted: true,
    target: target.id,
    damage,
    abilityId: profile.id,
    hp: target.hp,
    bossHp: targetBoss ? target.hp : undefined,
    phase: targetBoss ? target.phase : undefined,
    breakBonus,
    eventId: event.id,
    combo: player.combo,
    teamCombo: combat.teamCombo,
  };
}
