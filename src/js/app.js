/**
 * Pick & Roll Lab — 攻防阅读解释器 · 交互逻辑
 *
 * 流程：选防守 → 分步剧情(聚焦+字幕+防守反应动作) → 顺序揭示机会点 → 一句话总结。
 * 点机会点：球流转到机会点 → 再飞向篮筐终结（所有终结统一为"飞向篮筐"，只是起点远近不同）。
 *
 * 坐标：data 已与球场 SVG 同系（y 0=篮筐侧, 100=半场底），不再翻转。
 */

(function () {
  "use strict";

  const state = {
    defense: null,
    handler: "shooter",
    screener: "roller",
    selectedOpp: null,
    stepIndex: 0,
    phase: "intro",
    playTimers: [],   // 当前演示的所有定时器，便于中断
    stageSnapshot: null // 防守到位后的站位快照，作为每次演示起点
  };

  const el = {
    defenseOptions: document.getElementById("defense-options"),
    defenseOptionsAdv: document.getElementById("defense-options-adv"),
    advToggle: document.getElementById("adv-toggle"),
    handlerOptions: document.getElementById("handler-options"),
    screenerOptions: document.getElementById("screener-options"),
    playerToggle: document.getElementById("player-toggle"),
    playerBody: document.getElementById("player-body"),
    dotLayer: document.getElementById("dot-layer"),
    oppLayer: document.getElementById("opp-layer"),
    pathLayer: document.getElementById("path-layer"),
    narrator: document.getElementById("narrator"),
    narratorText: document.getElementById("narrator-text"),
    stageControls: document.getElementById("stage-controls"),
    btnNext: document.getElementById("btn-next"),
    btnReset: document.getElementById("btn-reset"),
    defenseName: document.getElementById("defense-name"),
    defenseOne: document.getElementById("defense-one"),
    defenseDesc: document.getElementById("defense-desc"),
    readOrder: document.getElementById("read-order"),
    oppList: document.getElementById("opp-list"),
    oppDetail: document.getElementById("opp-detail"),
    takeawayBlock: document.getElementById("takeaway-block"),
    takeawayText: document.getElementById("takeaway-text")
  };

  const dots = {};
  const qualityLabel = { high: "高质量机会", medium: "中等机会", low: "低质量机会" };

  function setDotPos(node, x, y) {
    node.style.left = x + "%";
    node.style.top = y + "%";
  }

  function say(text, flash) {
    el.narratorText.textContent = text;
    if (flash !== false) {
      el.narrator.classList.remove("flash");
      void el.narrator.offsetWidth;
      el.narrator.classList.add("flash");
    }
  }

  /* ---------- 圆点 ---------- */
  function buildDots() {
    el.dotLayer.innerHTML = "";
    const base = PNR_DATA.baseSetup;

    base.offense.forEach((p) => {
      const d = document.createElement("div");
      d.className = "dot dot-offense" + (p.role === "ballHandler" ? " dot-handler" : "");
      d.innerHTML = `${p.num}<span class="dot-tag">${p.label}</span>`;
      d.dataset.id = p.id;
      setDotPos(d, p.x, p.y);
      el.dotLayer.appendChild(d);
      dots[p.id] = d;
    });

    base.defense.forEach((p) => {
      const d = document.createElement("div");
      d.className = "dot dot-defense";
      d.innerHTML = `${p.num}<span class="dot-tag">${p.label}</span>`;
      d.dataset.id = p.id;
      setDotPos(d, p.x, p.y);
      el.dotLayer.appendChild(d);
      dots[p.id] = d;
    });

    const ball = document.createElement("div");
    ball.className = "dot dot-ball";
    ball.dataset.id = "BALL";
    setDotPos(ball, base.ball.x, base.ball.y);
    el.dotLayer.appendChild(ball);
    dots.BALL = ball;
  }

  function focusDots(ids) {
    Object.values(dots).forEach((d) => d.classList.remove("focused"));
    if (!ids || !ids.length) {
      el.dotLayer.classList.remove("focusing");
      return;
    }
    el.dotLayer.classList.add("focusing");
    ids.forEach((id) => dots[id] && dots[id].classList.add("focused"));
  }

  /* ---------- 控制项 ---------- */
  function buildControls() {
    el.defenseOptions.innerHTML = "";
    el.defenseOptionsAdv.innerHTML = "";
    Object.values(PNR_DATA.defenseReactions).forEach((r) => {
      const b = document.createElement("button");
      b.className = "opt";
      b.dataset.id = r.id;
      b.innerHTML =
        `<span class="opt-name">${r.name}</span>` +
        `<span class="opt-desc">${r.oneLine}</span>`;
      b.onclick = () => chooseDefense(r.id);
      // 核心防守默认显示，进阶防守收进折叠区
      (r.tier === "advanced" ? el.defenseOptionsAdv : el.defenseOptions).appendChild(b);
    });

    renderPlayerOptions(el.handlerOptions, PNR_DATA.playerTypes.ballHandler, "handler");
    renderPlayerOptions(el.screenerOptions, PNR_DATA.playerTypes.screener, "screener");
  }

  function renderPlayerOptions(container, list, kind) {
    container.innerHTML = "";
    list.forEach((p) => {
      const b = document.createElement("button");
      b.className = "opt" + (p.id === state[kind] ? " active" : "");
      b.innerHTML = `<span class="opt-name">${p.name}</span>`;
      b.onclick = () => {
        state[kind] = p.id;
        syncActive();
        if (state.phase === "reveal") {
          renderOppList();
          // 球员配置变了 → 重新按新配置选中主推机会点并演示
          const primary = pickPrimaryOpp(PNR_DATA.defenseReactions[state.defense]);
          selectOpportunity(primary.id);
        }
      };
      container.appendChild(b);
    });
  }

  function syncActive() {
    // 防守按钮分布在核心/进阶两个容器，用 data-id 匹配
    [...el.defenseOptions.children, ...el.defenseOptionsAdv.children].forEach((b) => {
      b.classList.toggle("active", b.dataset.id === state.defense);
    });
    const sets = [
      [el.handlerOptions, PNR_DATA.playerTypes.ballHandler, state.handler],
      [el.screenerOptions, PNR_DATA.playerTypes.screener, state.screener]
    ];
    sets.forEach(([c, list, active]) => {
      [...c.children].forEach((b, i) => b.classList.toggle("active", list[i].id === active));
    });
  }

  /* ---------- 选防守 → 剧情 ---------- */
  function chooseDefense(id) {
    state.defense = id;
    state.stepIndex = 0;
    state.phase = "story";
    state.selectedOpp = null;
    state.stageSnapshot = null;
    syncActive();

    clearPlay();
    resetBoardPositions();
    el.oppLayer.innerHTML = "";
    el.takeawayBlock.classList.add("hidden");
    clearDetail();

    const r = PNR_DATA.defenseReactions[id];
    el.defenseName.textContent = r.name;
    el.defenseOne.textContent = r.oneLine;
    el.defenseDesc.textContent = r.description;
    el.readOrder.innerHTML = "";
    el.oppList.innerHTML = "";

    el.stageControls.classList.remove("hidden");
    el.btnNext.textContent = "下一步 →";
    el.btnNext.disabled = false;

    say(`你选择了「${r.name}」：${r.oneLine} 点“下一步”，看防守怎么动。`);
  }

  function resetBoardPositions() {
    PNR_DATA.baseSetup.offense.forEach((p) => setDotPos(dots[p.id], p.x, p.y));
    PNR_DATA.baseSetup.defense.forEach((p) => setDotPos(dots[p.id], p.x, p.y));
    setDotPos(dots.BALL, PNR_DATA.baseSetup.ball.x, PNR_DATA.baseSetup.ball.y);
    focusDots(null);
    el.pathLayer.innerHTML = "";
    Object.values(dots).forEach((d) => d.classList.remove("receiving"));
  }

  function runStep() {
    const r = PNR_DATA.defenseReactions[state.defense];
    const steps = r.steps;
    if (state.stepIndex >= steps.length) { enterReveal(); return; }

    const step = steps[state.stepIndex];
    say(step.text);
    (step.move || []).forEach((m) => setDotPos(dots[m.id], m.x, m.y));
    focusDots(step.focus || []);

    state.stepIndex++;

    // 最后一步走完：不再要求用户多点一次，自动进入机会点揭示
    if (state.stepIndex >= steps.length) {
      el.btnNext.textContent = "揭示机会点…";
      el.btnNext.disabled = true;
      const t = setTimeout(() => {
        el.btnNext.disabled = false;
        enterReveal();
      }, 1400);
      state.playTimers.push(t);
    }
  }

  function enterReveal() {
    state.phase = "reveal";
    focusDots(null);
    el.stageControls.classList.add("hidden");
    const r = PNR_DATA.defenseReactions[state.defense];

    // 保存"防守到位后"的站位，作为每次演示回放的起点
    state.stageSnapshot = {};
    Object.keys(dots).forEach((id) => {
      state.stageSnapshot[id] = { left: dots[id].style.left, top: dots[id].style.top };
    });

    // 主推机会点：契合当前球员配置、质量最高的那个（球员类型接入演示）
    const primary = pickPrimaryOpp(r);
    const h = PNR_DATA.playerTypes.ballHandler.find((p) => p.id === state.handler);
    const s = PNR_DATA.playerTypes.screener.find((p) => p.id === state.screener);
    say(`按你的配置（${h.name} + ${s.name}），首选是「${primary.name}」。其余机会按看球顺序依次亮起。`);

    el.readOrder.innerHTML = "";
    r.readOrder.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      el.readOrder.appendChild(li);
    });

    el.oppLayer.innerHTML = "";
    // 按"看球顺序"揭示：主推先亮，其余按数据顺序依次出现，牵引视线
    const order = revealOrder(r, primary);
    order.forEach((opp, i) => {
      const t = setTimeout(() => spawnOpp(opp), 420 * (i + 1));
      state.playTimers.push(t);
    });
    renderOppList();

    const tEnd = 420 * (order.length + 1);
    const t1 = setTimeout(() => {
      el.takeawayBlock.classList.remove("hidden");
      el.takeawayText.textContent = r.takeaway;
    }, tEnd);
    // 全部亮完后，自动选中主推机会点并演示一遍（球员配置决定默认演示内容）
    const t2 = setTimeout(() => selectOpportunity(primary.id), tEnd + 300);
    state.playTimers.push(t1, t2);
  }

  // 主推：先取契合球员配置且质量最高者；没有契合的则取整体质量最高者
  function pickPrimaryOpp(r) {
    const rank = { high: 3, medium: 2, low: 1 };
    const fit = r.opportunities.filter(isRecommended);
    const pool = fit.length ? fit : r.opportunities;
    return pool.slice().sort((a, b) => rank[b.quality] - rank[a.quality])[0];
  }

  // 揭示顺序：主推排第一，其余维持数据原顺序
  function revealOrder(r, primary) {
    return [primary, ...r.opportunities.filter((o) => o.id !== primary.id)];
  }

  // 窗口性质 → 显示文案 / class
  const PHASE = {
    fleeting: { label: "转瞬即逝", cls: "phase-fleeting" },
    brief:    { label: "短暂窗口", cls: "phase-brief" },
    stable:   { label: "相对从容", cls: "phase-stable" }
  };
  function phaseOf(opp) {
    return (opp.timing && PHASE[opp.timing.phase]) || PHASE.brief;
  }

  function spawnOpp(opp) {
    const node = document.createElement("div");
    const ph = phaseOf(opp);
    node.className = `opp q-${opp.quality} ${ph.cls}`;
    node.dataset.id = opp.id;
    node.style.left = opp.x + "%";
    node.style.top = opp.y + "%";
    node.innerHTML = `<span class="opp-pulse"></span><span class="opp-tag">${opp.name}</span>`;
    if (isRecommended(opp)) node.style.filter = "brightness(1.3)";
    node.onclick = () => selectOpportunity(opp.id);
    el.oppLayer.appendChild(node);
    requestAnimationFrame(() => node.classList.add("show"));
  }

  /* ---------- 推荐性 ---------- */
  function currentPlayerNames() {
    const h = PNR_DATA.playerTypes.ballHandler.find((p) => p.id === state.handler);
    const s = PNR_DATA.playerTypes.screener.find((p) => p.id === state.screener);
    return [h ? h.name : "", s ? s.name : ""];
  }
  function isRecommended(opp) {
    const names = currentPlayerNames();
    return opp.goodFor.some((g) => names.includes(g));
  }

  /* ---------- 右侧列表 ---------- */
  function renderOppList() {
    if (!state.defense) return;
    const r = PNR_DATA.defenseReactions[state.defense];
    const primary = pickPrimaryOpp(r);   // 随球员配置变化
    el.oppList.innerHTML = "";
    r.opportunities.forEach((opp) => {
      const li = document.createElement("li");
      const ph = phaseOf(opp);
      const isPrimary = opp.id === primary.id;
      li.className = `q-${opp.quality}` + (opp.id === state.selectedOpp ? " selected" : "");
      li.innerHTML =
        `<span class="opp-li-main">` +
          `${opp.name}${isRecommended(opp) ? " ★" : ""}` +
          (isPrimary ? `<span class="primary-tag">本配置首选</span>` : "") +
          `<span class="opp-li-phase ${ph.cls}">⏱ ${ph.label}</span>` +
        `</span>` +
        `<span class="quality-badge q-${opp.quality}">${qualityLabel[opp.quality]}</span>`;
      li.onclick = () => selectOpportunity(opp.id);
      el.oppList.appendChild(li);
    });
  }

  /* ---------- 选中机会点 → 演完整攻防回合 ---------- */
  function selectOpportunity(id) {
    state.selectedOpp = id;
    [...el.oppLayer.children].forEach((n) => n.classList.toggle("selected", n.dataset.id === id));
    [...el.oppList.children].forEach((li, i) => {
      const opp = PNR_DATA.defenseReactions[state.defense].opportunities[i];
      li.classList.toggle("selected", opp.id === id);
    });
    renderDetail(id);
    playSequence(id);
  }

  function clearPlay() {
    state.playTimers.forEach((t) => clearTimeout(t));
    state.playTimers = [];
    el.pathLayer.querySelectorAll(".move-line, .pass-line, .shot-line").forEach((n) => n.remove());
    Object.values(dots).forEach((d) => d.classList.remove("receiving", "shooting", "moving"));
  }

  function restoreStage() {
    if (!state.stageSnapshot) return;
    Object.keys(state.stageSnapshot).forEach((id) => {
      if (dots[id]) {
        dots[id].style.left = state.stageSnapshot[id].left;
        dots[id].style.top = state.stageSnapshot[id].top;
      }
    });
  }

  function later(fn, ms) {
    const t = setTimeout(fn, ms);
    state.playTimers.push(t);
  }

  /**
   * 演一段完整攻防回合：
   *   遍历 opp.play 的每一步 → 同步移动多名球员 + 球 + 画轨迹线 + 字幕；
   *   最后一步后，球（在持球点）飞向篮筐完成终结。
   * 终结飞筐统一处理，不同 finish 仅影响停顿节奏。
   */
  function playSequence(id) {
    const r = PNR_DATA.defenseReactions[state.defense];
    const opp = r.opportunities.find((o) => o.id === id);
    if (!opp || !opp.play) return;

    clearPlay();
    restoreStage();

    const STEP = 850;            // 每步时长
    const rim = PNR_DATA.rim;
    let ballAt = "A1";           // 当前持球人，默认 A1

    // 起始：球回到 A1 手上
    later(() => {
      dots.BALL.style.left = dots.A1.style.left;
      dots.BALL.style.top = dots.A1.style.top;
    }, 0);

    opp.play.forEach((step, i) => {
      later(() => {
        if (step.note) say(step.note);

        // 移动球员，并为每名移动者画一条轨迹线（进攻/防守不同色）
        (step.actors || []).forEach((a) => {
          const node = dots[a.id];
          if (!node) return;
          const x1 = parseFloat(node.style.left);
          const y1 = parseFloat(node.style.top);
          drawLine(x1, y1, a.x, a.y, a.id[0] === "D" ? "move-line def" : "move-line off");
          node.classList.add("moving");
          node.style.left = a.x + "%";
          node.style.top = a.y + "%";
        });

        // 传球：若本步指定了 ball 且与当前持球人不同，画传球线 + 球移动
        if (step.ball && step.ball !== ballAt) {
          const fromX = parseFloat(dots[ballAt].style.left);
          const fromY = parseFloat(dots[ballAt].style.top);
          const target = dots[step.ball];
          // 目标可能本步也在移动，取其本步终点
          const moving = (step.actors || []).find((a) => a.id === step.ball);
          const tx = moving ? moving.x : parseFloat(target.style.left);
          const ty = moving ? moving.y : parseFloat(target.style.top);
          drawLine(fromX, fromY, tx, ty, "pass-line");
          dots.BALL.style.left = tx + "%";
          dots.BALL.style.top = ty + "%";
          target.classList.add("receiving");
          ballAt = step.ball;
        } else {
          // 球跟随当前持球人到其本步位置
          const moving = (step.actors || []).find((a) => a.id === ballAt);
          if (moving) {
            dots.BALL.style.left = moving.x + "%";
            dots.BALL.style.top = moving.y + "%";
          }
        }
      }, STEP * i + 200);
    });

    // 终结：最后一步后，球从持球点飞向篮筐
    const endAt = STEP * opp.play.length + 200;
    const holdMap = { shot: 500, drive: 250, post: 700 };
    later(() => {
      const finisher = dots[ballAt] || dots.A1;
      const fx = parseFloat(finisher.style.left);
      const fy = parseFloat(finisher.style.top);
      finisher.classList.add("shooting");
      const hint = opp.timing ? `（${phaseOf(opp).label}：${opp.timing.hint}）` : "";
      say(`${opp.name}：${finishWord(opp.finish)}，球飞向篮筐完成终结。${hint}`);
      drawLine(fx, fy, rim.x, rim.y, "shot-line");
      dots.BALL.style.left = rim.x + "%";
      dots.BALL.style.top = rim.y + "%";
    }, endAt + (holdMap[opp.finish] || 400));
  }

  function finishWord(finish) {
    return finish === "shot" ? "起跳出手" : finish === "post" ? "低位强打" : "突进攻框";
  }

  function drawLine(x1, y1, x2, y2, cls) {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
    line.setAttribute("class", cls);
    el.pathLayer.appendChild(line);
    requestAnimationFrame(() => line.classList.add("show"));
  }

  function renderDetail(id) {
    const r = PNR_DATA.defenseReactions[state.defense];
    const opp = r.opportunities.find((o) => o.id === id);
    if (!opp) return;
    const names = currentPlayerNames();
    const fit = opp.goodFor.length
      ? opp.goodFor.map((g) => `<span class="tag good">${g}${names.includes(g) ? " ★" : ""}</span>`).join("")
      : `<span class="tag">通用</span>`;
    const bad = opp.badFor && opp.badFor.length
      ? opp.badFor.map((b) => `<span class="tag bad">${b}</span>`).join("")
      : `<span class="tag">无明显限制</span>`;

    const ph = phaseOf(opp);
    const timingHint = opp.timing ? opp.timing.hint : "";
    el.oppDetail.classList.remove("empty");
    el.oppDetail.innerHTML = `
      <div class="d-name">${opp.name}</div>
      <div class="d-row"><span class="d-label">机会质量</span>
        <span class="quality-badge q-${opp.quality}">${qualityLabel[opp.quality]}</span></div>
      <div class="d-row"><span class="d-label">时间窗口</span>
        <span class="phase-badge ${ph.cls}">⏱ ${ph.label}</span>
        <div class="timing-hint">${timingHint}</div></div>
      <div class="d-row"><span class="d-label">为什么成立</span>${opp.explanation}</div>
      <div class="d-row"><span class="d-label">适合的球员（★ = 当前配置）</span>
        <span class="tags">${fit}</span></div>
      <div class="d-row"><span class="d-label">什么时候不适合</span>
        <span class="tags">${bad}</span></div>
    `;
  }

  function clearDetail() {
    el.oppDetail.className = "opp-detail empty";
    el.oppDetail.textContent = "点击场上或列表中的机会点，看它为什么成立。";
  }

  /* ---------- 重置 ---------- */
  function resetAll() {
    clearPlay();
    state.defense = null;
    state.selectedOpp = null;
    state.stepIndex = 0;
    state.phase = "intro";
    state.stageSnapshot = null;
    buildDots();
    focusDots(null);
    el.pathLayer.innerHTML = "";
    el.oppLayer.innerHTML = "";
    el.oppList.innerHTML = "";
    el.readOrder.innerHTML = "";
    el.stageControls.classList.add("hidden");
    el.takeawayBlock.classList.add("hidden");
    el.defenseName.textContent = "— 等待你的选择 —";
    el.defenseOne.textContent = "";
    el.defenseDesc.textContent = "从左侧选一种防守应对方式，看看它会暴露哪些机会。";
    clearDetail();
    syncActive();
    say("挡拆已经发起：中锋上来给持球后卫做掩护。如果你是防守，你会怎么应对？", false);
  }

  /* ---------- 折叠 ---------- */
  el.playerToggle.onclick = () => {
    el.playerToggle.classList.toggle("collapsed");
    el.playerBody.classList.toggle("collapsed");
  };
  el.advToggle.onclick = () => {
    el.advToggle.classList.toggle("collapsed");
    el.defenseOptionsAdv.classList.toggle("collapsed");
  };

  /* ---------- 绑定 + 启动 ---------- */
  el.btnNext.onclick = runStep;
  el.btnReset.onclick = resetAll;

  buildControls();
  buildDots();
  syncActive();
})();
