const state = {
  samples: [
    "新しい個人アプリを週末だけで作るべきか？",
    "会社を辞めて半年だけ創作に集中するべきか？",
    "友人に本音を伝えるべきか、それとも少し待つべきか？",
    "この企画を小さく試すべきか、最初から大きく出すべきか？",
  ],
  sampleIndex: 0,
  busy: false,
};

const elements = {
  form: document.querySelector("#councilForm"),
  question: document.querySelector("#questionInput"),
  context: document.querySelector("#contextInput"),
  runButton: document.querySelector("#runButton"),
  clearButton: document.querySelector("#clearButton"),
  sampleButton: document.querySelector("#sampleButton"),
  statusDot: document.querySelector("#statusDot"),
  statusText: document.querySelector("#statusText"),
  modelPill: document.querySelector("#modelPill"),
  coreStage: document.querySelector("#coreStage"),
  decisionLabel: document.querySelector("#decisionLabel"),
  scoreLabel: document.querySelector("#scoreLabel"),
  verdict: document.querySelector("#verdict"),
  nextSteps: document.querySelector("#nextSteps"),
  approveCount: document.querySelector("#approveCount"),
  denyCount: document.querySelector("#denyCount"),
  logList: document.querySelector("#logList"),
  cards: {
    romantic: document.querySelector("#romanticCard"),
    rational: document.querySelector("#rationalCard"),
    entertainer: document.querySelector("#entertainerCard"),
  },
};

function setStatus(kind, text) {
  elements.statusDot.className = `status-dot ${kind}`;
  elements.statusText.textContent = text;
}

function addLog(text) {
  const item = document.createElement("p");
  const time = new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  item.textContent = `[${time}] ${text}`;
  elements.logList.prepend(item);
}

function setBusy(isBusy) {
  state.busy = isBusy;
  elements.runButton.disabled = isBusy;
  elements.sampleButton.disabled = isBusy;
  elements.clearButton.disabled = isBusy;
  elements.coreStage.classList.toggle("processing", isBusy);
  elements.runButton.querySelector("span").textContent = isBusy ? "審議中" : "決議開始";
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function stanceLabel(stance) {
  return {
    APPROVE: "承認",
    DENY: "否定",
  }[stance] || "待機";
}

function formatScore(score) {
  const number = Number(score) || 0;
  const sign = number > 0 ? "+" : "";
  return `${sign}${number}`;
}

function setCounts(counts = {}) {
  elements.approveCount.textContent = counts.APPROVE || 0;
  elements.denyCount.textContent = counts.DENY || 0;
}

function resetCards() {
  Object.values(elements.cards).forEach((card) => {
    card.classList.remove("approved", "denied", "booting");
    card.querySelector(".vote").textContent = "待機";
    card.querySelector(".persona-score span").style.width = "50%";
    card.querySelector(".headline").textContent = card.classList.contains("romantic")
      ? "ロマンチストとしての人格"
      : card.classList.contains("rational")
        ? "理性としての人格"
        : "エンターテイナーとしての人格";
    card.querySelector("ul").replaceChildren();
    card.querySelector(".risk").textContent = "";
    card.querySelector(".line").textContent = "";
  });
  setCounts();
}

function bootCards() {
  Object.values(elements.cards).forEach((card) => {
    card.classList.remove("approved", "denied");
    card.classList.add("booting");
    card.querySelector(".vote").textContent = "起動";
    card.querySelector(".persona-score span").style.width = "100%";
    card.querySelector(".headline").textContent = "人格起動中";

    const list = card.querySelector("ul");
    list.replaceChildren();
    ["入力解析", "判断基準同期", "評決準備"].forEach((step) => {
      const item = document.createElement("li");
      item.textContent = step;
      list.append(item);
    });

    card.querySelector(".risk").textContent = "";
    card.querySelector(".line").textContent = "MAGI LINK ESTABLISHED";
  });
}

function renderPersona(result) {
  const card = elements.cards[result.id];
  if (!card) return;

  card.classList.remove("approved", "denied", "booting");
  card.classList.add(result.stance === "APPROVE" ? "approved" : "denied");
  card.querySelector(".vote").textContent = stanceLabel(result.stance);
  card.querySelector(".headline").textContent = result.headline;
  card.querySelector(".persona-score span").style.width = `${Math.max(4, (result.score + 100) / 2)}%`;
  card.querySelector(".risk").textContent = `注意: ${result.risk}`;
  card.querySelector(".line").textContent = result.line;

  const list = card.querySelector("ul");
  list.replaceChildren();
  result.reasoning.forEach((reason) => {
    const item = document.createElement("li");
    item.textContent = reason;
    list.append(item);
  });
}

function renderSynthesis(synthesis) {
  elements.verdict.classList.toggle("is-error", Boolean(synthesis.error));
  elements.decisionLabel.textContent = synthesis.decision;
  elements.scoreLabel.textContent = formatScore(synthesis.averageScore);
  elements.modelPill.textContent = synthesis.usedAI ? synthesis.model : "demo-fallback";
  elements.verdict.innerHTML = "";

  const tone = document.createElement("p");
  tone.className = "verdict-tone";
  tone.textContent = synthesis.tone;

  const summary = document.createElement("p");
  summary.className = "verdict-summary";
  summary.textContent = synthesis.summary;

  elements.verdict.append(tone, summary);
  elements.nextSteps.replaceChildren();
  synthesis.nextSteps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    elements.nextSteps.append(item);
  });

  setCounts(synthesis.counts);
  if (synthesis.error) {
    addLog(`API応答に失敗。デモ判定へ切替: ${synthesis.error}`);
  }
  addLog(`決議完了: ${synthesis.decision} / 評決指数 ${synthesis.averageScore}`);
}

async function loadStatus() {
  try {
    const response = await fetch("/api/status");
    const status = await response.json();
    elements.modelPill.textContent = status.aiReady ? status.model : "OPENAI_API_KEY未設定";
    setStatus(status.aiReady ? "ready" : "demo", status.aiReady ? "AI接続済み" : "AI未接続 / デモ");
  } catch {
    elements.modelPill.textContent = "local-demo";
    setStatus("demo", "ローカル表示");
  }
}

async function runCouncil(question, context) {
  setBusy(true);
  resetCards();
  bootCards();
  elements.decisionLabel.textContent = "審議中";
  elements.scoreLabel.textContent = "---";
  addLog("三人格へ審議対象を送信。");

  try {
    const response = await Promise.all([
      fetch("/api/council", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, context }),
      }),
      delay(700),
    ]).then(([apiResponse]) => apiResponse);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "決議に失敗しました。");

    state.samples = payload.samples || state.samples;
    payload.results.forEach(renderPersona);
    renderSynthesis(payload.synthesis);
    setStatus(
      payload.synthesis.usedAI ? "ready" : "demo",
      payload.synthesis.usedAI ? "AI接続済み" : "AI未接続 / デモ"
    );
  } catch (error) {
    setStatus("error", "エラー");
    elements.decisionLabel.textContent = "ERROR";
    elements.scoreLabel.textContent = "!!!";
    addLog(error.message || "決議に失敗しました。");
  } finally {
    setBusy(false);
  }
}

elements.form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (state.busy) return;

  const question = elements.question.value.trim();
  const context = elements.context.value.trim();
  if (!question) {
    elements.question.focus();
    addLog("議題が空です。入力待機。");
    return;
  }

  runCouncil(question, context);
});

elements.question.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    elements.form.requestSubmit();
  }
});

elements.clearButton.addEventListener("click", () => {
  elements.question.value = "";
  elements.context.value = "";
  resetCards();
  elements.decisionLabel.textContent = "決議待機";
  elements.scoreLabel.textContent = "--";
  elements.verdict.innerHTML =
    '<p class="verdict-tone">審議対象を待機しています</p><p class="verdict-summary">三人格は未接続。審議対象を入力すると、各AIが承認または否定を提出します。</p>';
  elements.nextSteps.replaceChildren();
  addLog("入力と判定表示をクリア。");
});

elements.sampleButton.addEventListener("click", () => {
  const sample = state.samples[state.sampleIndex % state.samples.length];
  state.sampleIndex += 1;
  elements.question.value = sample;
  elements.context.value = "短時間で試せる方法を優先したい。";
  addLog("サンプル議題を入力。");
});

resetCards();
loadStatus();
