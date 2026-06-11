/**
 * Pick & Roll Lab — 攻防阅读解释器 · 数据层
 *
 * 编号规范（按场上位置）：
 *   进攻 A1-A5：A1 控卫(持球) / A2 分卫 / A3 小前 / A4 大前 / A5 中锋(掩护人)
 *   防守 D1-D5：与同号进攻人对位
 *
 * 坐标系（与球场 SVG 一致，不翻转）：
 *   x: 0(左) ~ 100(右)；y: 0(顶/篮筐侧) ~ 100(半场底/中线)
 *   篮筐 ≈ (50,11)，三分弧顶 ≈ y48，高位挡拆在弧顶三分外 ≈ y70。
 *
 * 每个机会点带 play：一段「完整攻防回合」分步脚本。
 *   每步 { note, ball, actors:[{id,x,y}] } —— 多名球员可同时移动，球跟随 ball 指定球员或独立坐标。
 *   终结统一为球飞向篮筐（由引擎在 play 末尾自动追加）。
 *
 * 设计原则：机会点的轨迹本身就代表对应打法——
 *   突破型机会点演"杀进去攻框"，投射型演"拉出来投"，传球型演"分球"。
 */

const PNR_DATA = {
  rim: { x: 50, y: 11 },

  baseSetup: {
    offense: [
      { id: "A1", num: "A1", label: "控卫·持球", x: 42, y: 70, role: "ballHandler" },
      { id: "A2", num: "A2", label: "分卫·左底角", x: 7,  y: 24, role: "wing" },
      { id: "A3", num: "A3", label: "小前·右翼", x: 91, y: 32, role: "wing" },
      { id: "A4", num: "A4", label: "大前·高位", x: 80, y: 54, role: "spacer" },
      { id: "A5", num: "A5", label: "中锋·掩护", x: 52, y: 62, role: "screener" }
    ],
    defense: [
      { id: "D1", num: "D1", label: "防控卫", x: 41, y: 64 },
      { id: "D2", num: "D2", label: "防分卫", x: 13, y: 30 },
      { id: "D3", num: "D3", label: "防小前", x: 87, y: 37 },
      { id: "D4", num: "D4", label: "防大前", x: 74, y: 49 },
      { id: "D5", num: "D5", label: "防中锋", x: 54, y: 55 }
    ],
    ball: { x: 44, y: 68 }
  },

  playerTypes: {
    ballHandler: [
      { id: "shooter", name: "投射型后卫", desc: "三分威胁大，防守不敢放投。" },
      { id: "slasher", name: "突破型后卫", desc: "第一步快，擅长直接攻框。" },
      { id: "passer", name: "传球型后卫", desc: "阅读强，擅长在夹击/换防时分球。" }
    ],
    screener: [
      { id: "roller", name: "顺下型中锋", desc: "掩护后直插篮下吃饼。" },
      { id: "popper", name: "空间型内线", desc: "掩护后外弹三分，拉开空间。" },
      { id: "playmaker", name: "策应型中锋", desc: "掩护后在罚球线短顺下做轴。" }
    ]
  },

  defenseReactions: {
    over: {
      id: "over",
      name: "挤过 Over",
      tier: "advanced",
      oneLine: "死贴着追上方，专防你的投篮。",
      description:
        "防控卫的 D1 追着持球人、从掩护上方挤过去（fight over），死贴不放投。对付强投后卫的首选；极端版是“追屁股/top-lock”。代价是身后空间被让出，容易被加速突破。",
      defensePositions: [{ id: "D1", x: 50, y: 56 }, { id: "D5", x: 52, y: 46 }],
      steps: [
        { text: "对方投篮太准，D1 不敢绕下，死贴着从掩护上方挤过去。", move: [{ id: "D1", x: 50, y: 56 }], focus: ["D1", "A1"] },
        { text: "他贴得很紧封死了投篮——但人一旦贴上来，身后就空了。", move: [], focus: ["D1"] },
        { text: "D5 还在沉退护框，中间这段加速突破的通道，露出来了。", move: [], focus: ["A1", "D5"] }
      ],
      opportunities: [
        { id: "over-drive", name: "借掩护加速突破", quality: "high", target: "A1", x: 48, y: 36, finish: "drive",
          timing: { phase: "brief", hint: "短暂窗口：趁 D1 挤过失去重心那一下加速，慢了他就跟上来了。" },
          explanation: "D1 贴身挤过会失去重心，持球人借掩护那一下加速，从其身侧杀向篮筐。",
          goodFor: ["突破型后卫"], badFor: ["投射型后卫"],
          play: [
            { note: "A1 借 A5 掩护，向右侧加速启动", ball: "A1", actors: [{ id: "A1", x: 50, y: 58 }] },
            { note: "D1 被掩护挡住、贴在身后追不上", ball: "A1", actors: [{ id: "A1", x: 49, y: 46 }, { id: "D1", x: 53, y: 52 }] },
            { note: "D5 仍沉退，A1 直接从缝隙杀进去", ball: "A1", actors: [{ id: "A1", x: 48, y: 34 }, { id: "D5", x: 50, y: 28 }] }
          ] },
        { id: "over-roll", name: "顺下吃饼", quality: "high", target: "A5", x: 50, y: 24, finish: "drive",
          timing: { phase: "brief", hint: "短暂窗口：要在 D5 决定是否上来补防的那一下喂出顺下。" },
          explanation: "持球人吸引贴身追防后，A5 顺下；防中锋若来补持球人就漏了顺下。",
          goodFor: ["顺下型中锋", "传球型后卫"], badFor: ["空间型内线"],
          play: [
            { note: "A1 借掩护吸引 D1、D5 注意", ball: "A1", actors: [{ id: "A1", x: 49, y: 50 }, { id: "D1", x: 52, y: 54 }] },
            { note: "A5 做完掩护立刻顺下篮筐", ball: "A1", actors: [{ id: "A5", x: 50, y: 30 }, { id: "D5", x: 49, y: 42 }] },
            { note: "D5 被牵制，A1 喂球给顺下的 A5", ball: "A5", actors: [{ id: "A5", x: 50, y: 24 }] }
          ] },
        { id: "over-reject", name: "拒绝掩护反向走", quality: "medium", target: "A1", x: 64, y: 44, finish: "drive",
          timing: { phase: "fleeting", hint: "一瞬即逝：只有 D1 已经往掩护侧偏了、来不及变向那一刻有效。" },
          explanation: "防守预判挤过方向时，持球人“拒绝掩护”反向走，打防守者的预判。",
          goodFor: ["突破型后卫"], badFor: [],
          play: [
            { note: "D1 提前往掩护一侧偏，预判挤过", ball: "A1", actors: [{ id: "D1", x: 47, y: 58 }] },
            { note: "A1 反向往无掩护侧突破", ball: "A1", actors: [{ id: "A1", x: 60, y: 54 }] },
            { note: "甩开 D1，杀向篮筐", ball: "A1", actors: [{ id: "A1", x: 64, y: 42 }] }
          ] }
      ],
      readOrder: ["确认防守是贴着你挤过、专防投篮", "第一选择是借掩护加速，打他失去的重心", "若内线上来补，立刻看顺下的 A5"],
      takeaway: "Over 是在说“我不让你投”。所以它怕的是突破——会冲的后卫最爱别人挤过。"
    },

    under: {
      id: "under",
      name: "绕下 Under",
      tier: "advanced",
      oneLine: "从掩护下面钻过去，放掉外线投篮。",
      description:
        "D1 从掩护人靠篮筐一侧绕过，抢先落到持球人和篮筐之间防突破。代价是放出掩护上沿的投篮空间——只敢对不准的后卫用。",
      defensePositions: [{ id: "D1", x: 50, y: 46 }, { id: "D5", x: 52, y: 46 }],
      steps: [
        { text: "D1 赌你投不进，不追上方，从掩护下方钻过去。", move: [{ id: "D1", x: 50, y: 46 }], focus: ["D1"] },
        { text: "他抢先落到你和篮筐之间，把突破路线堵死了。", move: [], focus: ["D1", "A1"] },
        { text: "代价是：持球人在掩护上沿，拿到了一大片投篮空间。", move: [], focus: ["A1"] }
      ],
      opportunities: [
        { id: "under-three", name: "掩护上沿三分", quality: "high", target: "A1", x: 50, y: 64, finish: "shot",
          timing: { phase: "stable", hint: "从容窗口：D1 既然绕下了，上沿这片空间就摆在那，敢投就有时间。" },
          explanation: "D1 绕下后，持球人在掩护上沿获得大片空间，投射型后卫直接起跳三分。",
          goodFor: ["投射型后卫"], badFor: ["突破型后卫"],
          play: [
            { note: "A5 做掩护，D1 从下方钻过", ball: "A1", actors: [{ id: "D1", x: 50, y: 46 }] },
            { note: "A1 不进攻篮筐，原地拔起到掩护上沿", ball: "A1", actors: [{ id: "A1", x: 50, y: 66 }] },
            { note: "D1 还在篮下，A1 大空位起跳三分", ball: "A1", actors: [] }
          ] },
        { id: "under-rescreen", name: "重新做掩护", quality: "medium", target: "A5", x: 56, y: 54, finish: "drive",
          timing: { phase: "stable", hint: "可重置：没有时间压力，重新做掩护逼防守再选一次。" },
          explanation: "若不擅长投射，A5 调整角度再做一次掩护，逼防守者重新做选择。",
          goodFor: ["顺下型中锋", "策应型中锋"], badFor: ["空间型内线"],
          play: [
            { note: "A5 看到 D1 绕下，重新调整角度卡位", ball: "A1", actors: [{ id: "A5", x: 56, y: 60 }] },
            { note: "A1 借第二次掩护再次发起", ball: "A1", actors: [{ id: "A1", x: 54, y: 56 }, { id: "D1", x: 52, y: 52 }] },
            { note: "A5 顺下，A1 喂球攻框", ball: "A5", actors: [{ id: "A5", x: 54, y: 34 }] }
          ] },
        { id: "under-closeout", name: "突破扑防", quality: "medium", target: "A1", x: 48, y: 38, finish: "drive",
          timing: { phase: "brief", hint: "短暂窗口：趁 D1 扑出来重心前压、还没站稳的那一下突破。" },
          explanation: "防守者意识到投篮威胁而扑出时，持球人顺势突破其扑防（closeout）攻框。",
          goodFor: ["突破型后卫"], badFor: ["投射型后卫"],
          play: [
            { note: "A1 摆出投篮姿态，逼 D1 扑出来", ball: "A1", actors: [{ id: "D1", x: 50, y: 60 }] },
            { note: "D1 重心前压，A1 顺势从侧面突破", ball: "A1", actors: [{ id: "A1", x: 47, y: 50 }] },
            { note: "过掉扑防，杀向篮筐", ball: "A1", actors: [{ id: "A1", x: 48, y: 36 }] }
          ] }
      ],
      readOrder: ["确认防守是从掩护下方绕过、放你投篮", "会投就第一时间在上沿起跳三分", "若防守扑出，再突破扑防或重新做掩护"],
      takeaway: "Go Under 是在赌“你投不进”。所以面对会投的后卫，没人敢绕下。"
    },

    drop: {
      id: "drop",
      name: "沉退 Drop",
      tier: "core",
      oneLine: "大个后撤护框，放掉中距离。",
      description:
        "D5 后撤到禁区前沿保护篮筐，D1 追着持球人绕过掩护。宁可让对手投中距离，也不让他轻松上篮。",
      defensePositions: [{ id: "D1", x: 48, y: 52 }, { id: "D5", x: 50, y: 30 }],
      steps: [
        { text: "D5 选择沉退，主动退到禁区前保护篮筐。", move: [{ id: "D5", x: 50, y: 30 }], focus: ["D5"] },
        { text: "D1 追着持球人绕过掩护，但慢了半拍。", move: [{ id: "D1", x: 48, y: 52 }], focus: ["D1"] },
        { text: "看——持球人面前这片中距离，暂时没人管了。", move: [], focus: ["A1"] }
      ],
      opportunities: [
        { id: "drop-midrange", name: "弧顶中距离急停", quality: "high", target: "A1", x: 46, y: 50, finish: "shot",
          timing: { phase: "stable", hint: "从容窗口：Drop 本来就放你投中距离，只要你敢投，时间很充裕。" },
          explanation: "Drop 主动让出中距离，持球人借掩护后顺势急停跳投，是最稳定的得分点。",
          goodFor: ["投射型后卫"], badFor: ["突破型后卫", "传球型后卫"],
          play: [
            { note: "A1 借 A5 掩护向中路运球", ball: "A1", actors: [{ id: "A1", x: 47, y: 56 }, { id: "D1", x: 50, y: 52 }] },
            { note: "D5 沉退在篮下，不上来逼", ball: "A1", actors: [{ id: "A1", x: 46, y: 50 }] },
            { note: "A1 在中距离急停拔起", ball: "A1", actors: [] }
          ] },
        { id: "drop-pocket", name: "口袋传球喂顺下", quality: "medium", target: "A5", x: 58, y: 36, finish: "drive",
          timing: { phase: "brief", hint: "短暂窗口：要抢在沉退的 D5 完全落位前喂出，晚了篮下就被堵死。" },
          explanation: "D5 沉退留出短传空间，持球人低手口袋传球给顺下中锋，抢在沉退者落位前接球。",
          goodFor: ["传球型后卫", "顺下型中锋"], badFor: ["空间型内线"],
          play: [
            { note: "A1 运球牵制 D1，A4 拉到弧顶拉开空间", ball: "A1", actors: [{ id: "A1", x: 48, y: 54 }, { id: "D1", x: 50, y: 50 }, { id: "A4", x: 72, y: 64 }] },
            { note: "A5 顺下，钻到 D5 身前的口袋区", ball: "A1", actors: [{ id: "A5", x: 56, y: 42 }] },
            { note: "A1 低手口袋传球给 A5", ball: "A5", actors: [{ id: "A5", x: 58, y: 36 }] }
          ] },
        { id: "drop-attack", name: "中段加速攻框", quality: "medium", target: "A1", x: 40, y: 26, finish: "drive",
          timing: { phase: "brief", hint: "短暂窗口：趁 D5 站得深、还没决定上不上来的那一下提速。" },
          explanation: "若 D5 站位偏深，持球人在中段提速攻框，迫使内线提前做选择。",
          goodFor: ["突破型后卫"], badFor: ["投射型后卫"],
          play: [
            { note: "A1 借掩护加速过中线，A4 沉底角清空突破路线", ball: "A1", actors: [{ id: "A1", x: 45, y: 48 }, { id: "D1", x: 49, y: 52 }, { id: "A4", x: 84, y: 22 }] },
            { note: "D5 站得太深，A1 提速冲击", ball: "A1", actors: [{ id: "A1", x: 42, y: 36 }, { id: "D5", x: 48, y: 26 }] },
            { note: "杀到篮下逼 D5 做选择", ball: "A1", actors: [{ id: "A1", x: 40, y: 26 }] }
          ] }
      ],
      readOrder: ["先看自己有没有舒服的中距离急停空间", "其次看沉退的 A5 是否留出口袋传球角度", "如果内线站得很深，再考虑加速攻框"],
      takeaway: "Drop 用篮下安全换中距离风险。所以它是投射型后卫的最爱——他们就吃这口。"
    },

    hard_hedge: {
      id: "hard_hedge",
      name: "强延误 Hard Hedge / Show",
      tier: "advanced",
      oneLine: "大个冲出弧顶强干扰，逼你后撤。",
      description:
        "D5 在挡拆瞬间大幅冲出弧顶，强力阻断持球人中路路线，逼其后撤，随后再赶紧回防。破坏性强，但大个一旦冲出去，身后空间巨大、回防压力极大。",
      defensePositions: [{ id: "D1", x: 48, y: 56 }, { id: "D5", x: 52, y: 58 }],
      steps: [
        { text: "D5 大幅冲出弧顶，和 D1 一起在持球人面前形成一道墙。", move: [{ id: "D5", x: 52, y: 58 }, { id: "D1", x: 48, y: 56 }], focus: ["D5", "D1", "A1"] },
        { text: "持球人被逼得后撤运球，正面路线被强力封死。", move: [], focus: ["A1"] },
        { text: "但 D5 冲这么高，他身后的篮下，已经唱了空城计。", move: [], focus: ["A5"] }
      ],
      opportunities: [
        { id: "hh-roll", name: "大个身后顺下", quality: "high", target: "A5", x: 50, y: 26, finish: "drive",
          timing: { phase: "fleeting", hint: "窗口极短：D5 冲出去到回防归位，只有这一两秒。慢一拍，篮下就补上了。" },
          explanation: "D5 冲得越高，身后篮下越空。A5 顺下接球，几乎是空篮——但必须在 D5 回防前出球。",
          goodFor: ["顺下型中锋", "传球型后卫"], badFor: ["空间型内线"],
          play: [
            { note: "D5 冲出弧顶延误，A1 后撤运球", ball: "A1", actors: [{ id: "A1", x: 46, y: 62 }] },
            { note: "A5 趁 D5 冲高，立刻往身后篮下顺", ball: "A1", actors: [{ id: "A5", x: 50, y: 38 }] },
            { note: "就是这一下！A1 越过延误传球，A5 空切篮下", ball: "A5", actors: [{ id: "A5", x: 50, y: 26 }] }
          ] },
        { id: "hh-pocket", name: "口袋传球穿缝", quality: "high", target: "A5", x: 50, y: 40, finish: "drive",
          timing: { phase: "brief", hint: "短暂窗口：两人并排延误时缝隙才在，等他们贴拢就没了。" },
          explanation: "两名延误防守人之间有缝隙，一记口袋传球穿过去喂给短顺下的 A5，发起 4 打 3。",
          goodFor: ["传球型后卫", "策应型中锋"], badFor: [],
          play: [
            { note: "D1、D5 并排延误，中间留出缝隙", ball: "A1", actors: [{ id: "A1", x: 47, y: 60 }] },
            { note: "A5 短顺下到罚球线，A4 拉到弧顶接应", ball: "A1", actors: [{ id: "A5", x: 50, y: 46 }, { id: "A4", x: 70, y: 64 }] },
            { note: "A1 一记口袋传球穿过缝隙喂 A5", ball: "A5", actors: [{ id: "A5", x: 50, y: 40 }] }
          ] },
        { id: "hh-weakside", name: "弱侧底角转移", quality: "medium", target: "A2", x: 8, y: 26, finish: "shot",
          timing: { phase: "stable", hint: "二次窗口：等防守收缩补防顺下后才出现，相对从容，是第二落点。" },
          explanation: "防守为补防顺下而收缩，弱侧底角射手被放空，是第二落点的空位三分。",
          goodFor: ["传球型后卫", "投射型后卫"], badFor: [],
          play: [
            { note: "A5 短顺下吸引防守收缩，A3 弱侧上提拉开", ball: "A1", actors: [{ id: "A5", x: 50, y: 44 }, { id: "D2", x: 16, y: 36 }, { id: "A3", x: 88, y: 50 }] },
            { note: "弱侧 D2 内收补防，A2 底角被放空", ball: "A1", actors: [{ id: "A1", x: 30, y: 58 }] },
            { note: "球转移到弱侧底角 A2 空位三分", ball: "A2", actors: [] }
          ] }
      ],
      readOrder: ["先确认延误的 D5 冲得有多高（越高身后越空）", "第一时间看他身后顺下的 A5", "防守收缩补防后，再把球甩到弱侧底角 A2"],
      takeaway: "强延误用“封死正面”换“放空身后”。出球越快，越能惩罚那个冲太高的大个。"
    },

    soft_hedge: {
      id: "soft_hedge",
      name: "弱延误 Soft Hedge / Flat",
      tier: "advanced",
      oneLine: "小幅虚晃保阵型，逼你投中距离。",
      description:
        "D5 只做小幅度上前虚晃（或平移站位 Flat），象征性干扰一下就迅速回到原位，更保守、保持防守阵型完整。逼持球人出手不那么舒服的中距离。",
      defensePositions: [{ id: "D1", x: 48, y: 54 }, { id: "D5", x: 50, y: 48 }],
      steps: [
        { text: "D5 只小幅上前虚晃一下，并不真的扑出去。", move: [{ id: "D5", x: 50, y: 48 }], focus: ["D5"] },
        { text: "他迅速回到原位，整条防线几乎没被撕开。", move: [], focus: ["D5", "D1"] },
        { text: "进攻没有大空当，但持球人手里有一记不太舒服的中距离。", move: [], focus: ["A1"] }
      ],
      opportunities: [
        { id: "sh-midrange", name: "抬手中距离", quality: "medium", target: "A1", x: 50, y: 44, finish: "shot",
          timing: { phase: "stable", hint: "相对从容：弱延误回防快，但中距离这口是它默认让给你的。" },
          explanation: "弱延误不放突也不放篮下，留给持球人的主要是中距离跳投，质量中等。",
          goodFor: ["投射型后卫"], badFor: ["突破型后卫"],
          play: [
            { note: "A1 借掩护运到中路", ball: "A1", actors: [{ id: "A1", x: 49, y: 50 }, { id: "D1", x: 50, y: 52 }] },
            { note: "D5 虚晃后退回，留出中距离", ball: "A1", actors: [{ id: "A1", x: 50, y: 44 }, { id: "D5", x: 50, y: 40 }] },
            { note: "A1 抬手出手中距离", ball: "A1", actors: [] }
          ] },
        { id: "sh-slip", name: "掩护人溜底", quality: "medium", target: "A5", x: 50, y: 30, finish: "drive",
          timing: { phase: "fleeting", hint: "一瞬即逝：必须抢在弱延误阵型收拢前，晚一步篮下就没了。" },
          explanation: "弱延误回防快，A5 若提前溜底（slip），可在阵型收拢前抢一个攻框机会。",
          goodFor: ["顺下型中锋"], badFor: ["空间型内线"],
          play: [
            { note: "A5 不做实掩护，提前溜向篮下", ball: "A1", actors: [{ id: "A5", x: 51, y: 42 }] },
            { note: "D5 还在虚晃位置，没跟上", ball: "A1", actors: [{ id: "A5", x: 50, y: 34 }] },
            { note: "A1 抢在阵型收拢前喂球给 A5", ball: "A5", actors: [{ id: "A5", x: 50, y: 30 }] }
          ] },
        { id: "sh-reset", name: "回传重新组织", quality: "low", target: "A4", x: 78, y: 50, finish: "shot",
          timing: { phase: "stable", hint: "无窗口压力：本就是没机会时的稳妥选择，重置进攻。" },
          explanation: "弱延误本就为破坏节奏，没有好机会时回传给 A4 重新发起，比强行处理更稳。",
          goodFor: ["传球型后卫"], badFor: ["突破型后卫"],
          play: [
            { note: "A1 发现没有空当", ball: "A1", actors: [{ id: "A1", x: 52, y: 58 }] },
            { note: "回传给高位的 A4 重置进攻", ball: "A4", actors: [{ id: "A4", x: 78, y: 52 }] },
            { note: "A4 持球重新组织阵地", ball: "A4", actors: [] }
          ] }
      ],
      readOrder: ["先确认 D5 只是虚晃、很快回防", "没有大空当时，接受中距离或寻找溜底", "都没有就回传重新组织，别强行出手"],
      takeaway: "弱延误赌的是“你投不死它的中距离”。它最怕被一两记中投打醒。"
    },

    switch: {
      id: "switch",
      name: "换防 Switch",
      tier: "core",
      oneLine: "干脆换人，但会换出错位。",
      description:
        "D1 与 D5 直接交换对位：大个换防持球人、小个换防掩护人。消除了掩护制造的空当，代价是产生体型/速度错位。",
      defensePositions: [{ id: "D1", x: 58, y: 56 }, { id: "D5", x: 48, y: 50 }],
      steps: [
        { text: "掩护一到，D1、D5 喊“Switch！”，直接交换对位。", move: [{ id: "D1", x: 58, y: 56 }, { id: "D5", x: 48, y: 50 }], focus: ["D1", "D5"] },
        { text: "现在大个 D5 被换到外线，对位灵活的持球后卫。", move: [], focus: ["D5", "A1"] },
        { text: "而内线里，你的中锋 A5 面对的是个小个 D1——错位出现了。", move: [], focus: ["A5", "D1"] }
      ],
      opportunities: [
        { id: "switch-iso", name: "持球人打大个错位", quality: "high", target: "A1", x: 50, y: 50, finish: "drive",
          timing: { phase: "stable", hint: "持续窗口：错位换出来就一直在，不急，可以从容选时机单打。" },
          explanation: "换防后大个 D5 对位后卫，速度劣势。突破型后卫直接面框单打错位攻框。",
          goodFor: ["突破型后卫", "投射型后卫"], badFor: ["传球型后卫"],
          play: [
            { note: "换防后慢脚的 D5 对位 A1", ball: "A1", actors: [{ id: "A1", x: 50, y: 58 }, { id: "D5", x: 50, y: 54 }] },
            { note: "A1 面框，用速度晃开 D5", ball: "A1", actors: [{ id: "A1", x: 48, y: 46 }, { id: "D5", x: 52, y: 50 }] },
            { note: "过掉大个，杀向篮筐", ball: "A1", actors: [{ id: "A1", x: 49, y: 32 }] }
          ] },
        { id: "switch-post", name: "中锋低位打小个", quality: "high", target: "A5", x: 38, y: 24, finish: "post",
          timing: { phase: "stable", hint: "持续窗口：体型错位也一直在，但要趁防守包夹来之前把球喂进低位。" },
          explanation: "换防后小个 D1 对位 A5，把球转移到低位要位，利用身高体重错位强打。",
          goodFor: ["顺下型中锋", "策应型中锋"], badFor: ["空间型内线"],
          play: [
            { note: "A5 看到对位小个 D1，立刻下低位要位", ball: "A1", actors: [{ id: "A5", x: 40, y: 34 }, { id: "D1", x: 36, y: 32 }] },
            { note: "A1 把球转移到低位 A5", ball: "A5", actors: [{ id: "A5", x: 38, y: 28 }] },
            { note: "A5 背身强打小个", ball: "A5", actors: [{ id: "A5", x: 38, y: 24 }] }
          ] },
        { id: "switch-slip", name: "提前溜底（slip）", quality: "medium", target: "A5", x: 50, y: 30, finish: "drive",
          timing: { phase: "fleeting", hint: "一瞬即逝：只有“换防交接”那半秒没人管 A5，错过就被接管。" },
          explanation: "预判换防，A5 不实掩护而提前溜向篮下，抢在换防完成前接球攻框。",
          goodFor: ["顺下型中锋"], badFor: ["空间型内线"],
          play: [
            { note: "A5 预判换防，不掩护直接溜底", ball: "A1", actors: [{ id: "A5", x: 51, y: 42 }] },
            { note: "D 还在交换中，没人跟 A5", ball: "A1", actors: [{ id: "A5", x: 50, y: 34 }] },
            { note: "A1 抢在换防完成前喂球", ball: "A5", actors: [{ id: "A5", x: 50, y: 30 }] }
          ] }
      ],
      readOrder: ["先判断换防制造了哪种错位", "持球人优先面框单打速度劣势的大个", "若内线有体型优势，把球喂到低位打小个"],
      takeaway: "Switch 消灭了空当，却送出了错位。看懂球的人第一时间找的就是这个错位。"
    },

    trap: {
      id: "trap",
      name: "夹击 Trap",
      tier: "core",
      oneLine: "两人包夹逼出球，但放空了一个人。",
      description:
        "D1、D5 同时扑向持球人，逼他提前出球，制造失误或迫使非持球点处理球。代价是场上必然放空一名进攻人。",
      defensePositions: [{ id: "D1", x: 46, y: 56 }, { id: "D5", x: 54, y: 56 }],
      steps: [
        { text: "掩护一到，D5 不退反进，冲上来和 D1 一起包夹！", move: [{ id: "D5", x: 54, y: 56 }, { id: "D1", x: 46, y: 56 }], focus: ["D1", "D5"] },
        { text: "持球人被两人围住，必须马上把球传出去。", move: [], focus: ["A1"] },
        { text: "关键：D5 冲出来夹击了，他身后的篮下，空了。", move: [], focus: ["A5"] }
      ],
      opportunities: [
        { id: "short-roll", name: "短顺下", quality: "high", target: "A5", x: 50, y: 36, finish: "drive",
          timing: { phase: "fleeting", hint: "一瞬即逝：包夹一形成就得马上出球，慢半拍夹击就把你的球掏了。" },
          explanation: "夹击持球人后，A5 身后出现短暂空档。传给短顺下中锋，可形成 4 打 3。",
          goodFor: ["传球型后卫", "策应型中锋", "顺下型中锋"], badFor: ["空间型内线"],
          play: [
            { note: "D1、D5 包夹 A1", ball: "A1", actors: [{ id: "A1", x: 45, y: 60 }] },
            { note: "A5 短顺下到罚球线接应", ball: "A1", actors: [{ id: "A5", x: 50, y: 44 }] },
            { note: "A1 越过包夹传给 A5，4 打 3 发起", ball: "A5", actors: [{ id: "A5", x: 50, y: 36 }] }
          ] },
        { id: "trap-corner", name: "弱侧底角", quality: "medium", target: "A2", x: 8, y: 26, finish: "shot",
          timing: { phase: "brief", hint: "二次窗口：短顺下逼防守收缩之后才出现，是“多打少”的第二传。" },
          explanation: "防守收缩补防短顺下后，弱侧底角射手被放空，是短顺下之后的二次出球点。",
          goodFor: ["传球型后卫", "投射型后卫"], badFor: [],
          play: [
            { note: "A5 短顺下吸引防守收缩", ball: "A1", actors: [{ id: "A5", x: 50, y: 42 }, { id: "D2", x: 16, y: 36 }] },
            { note: "A5 再分球，弱侧 A2 被放空", ball: "A5", actors: [{ id: "A5", x: 50, y: 40 }] },
            { note: "球转移到底角 A2 空位三分", ball: "A2", actors: [] }
          ] },
        { id: "trap-finish", name: "顺下攻框", quality: "medium", target: "A5", x: 50, y: 22, finish: "drive",
          timing: { phase: "brief", hint: "短暂窗口：补防不及时才有，A5 接球得果断，否则协防就到位了。" },
          explanation: "若补防不及时，短顺下中锋直接持球攻框，在 4 打 3 中完成终结。",
          goodFor: ["顺下型中锋"], badFor: ["空间型内线"],
          play: [
            { note: "A1 出球给短顺下的 A5", ball: "A1", actors: [{ id: "A5", x: 50, y: 40 }] },
            { note: "补防不及时，A5 持球直接推进", ball: "A5", actors: [{ id: "A5", x: 50, y: 30 }] },
            { note: "A5 攻框终结", ball: "A5", actors: [{ id: "A5", x: 50, y: 22 }] }
          ] },
        { id: "trap-shot", name: "持球人抢投/脱困", quality: "low", target: "A1", x: 52, y: 56, finish: "shot",
          timing: { phase: "fleeting", hint: "几乎没有窗口：合围前的电光石火，勉强出手，不推荐当首选。" },
          explanation: "夹击合围前的瞬间，投射型后卫抢在合围前出手，但时间窗口极小，质量偏低。",
          goodFor: ["投射型后卫"], badFor: ["突破型后卫", "传球型后卫"],
          play: [
            { note: "D1、D5 正在合围但还没贴死", ball: "A1", actors: [{ id: "D1", x: 47, y: 58 }, { id: "D5", x: 53, y: 58 }] },
            { note: "A1 抢在合围前抬手", ball: "A1", actors: [{ id: "A1", x: 52, y: 58 }] },
            { note: "极小窗口出手（勉强）", ball: "A1", actors: [] }
          ] }
      ],
      readOrder: ["先确认持球人是否被双人夹击", "第一时间看身后短顺下的 A5", "如果弱侧协防收缩，再看底角射手 A2"],
      takeaway: "Trap 用“放空一个人”换“逼你失误”。出球快不快，决定这次夹击是赚是赔。"
    }
  }
};
