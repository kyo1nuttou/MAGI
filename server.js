const http = require("node:http");
const { existsSync, readFileSync } = require("node:fs");
const { readFile } = require("node:fs/promises");
const path = require("node:path");

loadLocalEnv();

const PORT = Number(process.env.PORT || 4173);
const PUBLIC_DIR = path.join(__dirname, "public");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const personas = [
  {
    id: "romantic",
    label: "ROMANTIC",
    jp: "ロマンチスト",
    stanceBias: "可能性、憧れ、美しさ、人間関係、長期的な意味を重視する。",
    voice:
      "詩的だが実用を捨てない。人がなぜそれを望むのかを見つめ、心が動く未来像を言語化する。",
  },
  {
    id: "rational",
    label: "RATIONAL",
    jp: "理性",
    stanceBias: "根拠、制約、コスト、リスク、検証可能性、優先順位を重視する。",
    voice:
      "冷静で明晰。仮説と事実を切り分け、次に確認すべき条件を短く提示する。",
  },
  {
    id: "entertainer",
    label: "ENTERTAINER",
    jp: "エンターテイナー",
    stanceBias: "楽しさ、驚き、巻き込みやすさ、話題性、継続したくなる体験を重視する。",
    voice:
      "軽やかで大胆。場が動くアイデアを探し、退屈さや伝わりにくさを見逃さない。",
  },
];

const sampleQuestions = [
  "新しい個人アプリを週末だけで作るべきか？",
  "会社を辞めて半年だけ創作に集中するべきか？",
  "友人に本音を伝えるべきか、それとも少し待つべきか？",
  "この企画を小さく試すべきか、最初から大きく出すべきか？",
];

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const splitAt = trimmed.indexOf("=");
    if (splitAt === -1) continue;

    const key = trimmed.slice(0, splitAt).trim();
    const rawValue = trimmed.slice(splitAt + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function normalizeStance(value) {
  const normalized = String(value || "").toUpperCase();
  if (
    normalized.includes("YES") ||
    normalized.includes("GO") ||
    normalized.includes("APPROVE") ||
    normalized.includes("賛成") ||
    normalized.includes("承認")
  ) {
    return "APPROVE";
  }
  if (
    normalized.includes("NO") ||
    normalized.includes("DENY") ||
    normalized.includes("REJECT") ||
    normalized.includes("反対") ||
    normalized.includes("否定") ||
    normalized.includes("却下")
  ) {
    return "DENY";
  }
  return "";
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-100, Math.min(100, Math.round(number)));
}

function extractJson(text) {
  const cleaned = String(text || "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
  }
  throw new Error("Model response was not valid JSON.");
}

function parseOpenAIText(data) {
  if (typeof data.output_text === "string") return data.output_text;

  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.output_text === "string") parts.push(content.output_text);
    }
  }
  if (parts.length) return parts.join("\n");

  const chatText = data.choices?.[0]?.message?.content;
  if (typeof chatText === "string") return chatText;

  return "";
}

function buildPersonaPrompt(persona, question, context) {
  return [
    `あなたは三人格合議システムの「${persona.jp}としての人格」です。`,
    persona.stanceBias,
    persona.voice,
    "",
    "次の相談を、あなたの人格だけの観点から判定してください。",
    "出力はJSONオブジェクトのみ。Markdown、コードフェンス、余談は禁止。",
    "",
    "JSON schema:",
    `{
  "stance": "APPROVE | DENY",
  "confidence": 0-100,
  "score": -100-100,
  "headline": "18文字以内の日本語見出し",
  "reasoning": ["理由1", "理由2", "理由3"],
  "risk": "最も注意すべき落とし穴",
  "proposal": "次に取るべき具体的な一手",
  "line": "人格らしい短い一言"
}`,
    "stanceは必ずAPPROVEかDENYのどちらかにしてください。保留は禁止です。",
    "",
    `相談: ${question}`,
    `補足条件: ${context || "指定なし"}`,
  ].join("\n");
}

async function callOpenAIPersona(persona, question, context) {
  const prompt = buildPersonaPrompt(persona, question, context);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "あなたは日本語で意思決定支援を行うAIです。危険な助言や断定を避け、ユーザーが次に試せる小さな行動へ落とし込みます。",
        },
        { role: "user", content: prompt },
      ],
      max_output_tokens: 800,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `OpenAI API error (${response.status})`;
    throw new Error(message);
  }

  const parsed = extractJson(parseOpenAIText(data));
  return normalizePersonaResult(persona, parsed);
}

function normalizePersonaResult(persona, raw) {
  const reasoning = Array.isArray(raw.reasoning) ? raw.reasoning : [];
  return {
    id: persona.id,
    label: persona.label,
    jp: persona.jp,
    stance: normalizeStance(raw.stance) || (clampScore(raw.score) > 0 ? "APPROVE" : "DENY"),
    confidence: Math.max(0, Math.min(100, Math.round(Number(raw.confidence) || 50))),
    score: clampScore(raw.score),
    headline: String(raw.headline || "判定完了").slice(0, 28),
    reasoning: reasoning.slice(0, 3).map((item) => String(item).slice(0, 120)),
    risk: String(raw.risk || "前提条件を確認する必要があります。").slice(0, 160),
    proposal: String(raw.proposal || "小さく試して、結果を見て調整します。").slice(0, 180),
    line: String(raw.line || "").slice(0, 120),
  };
}

function fallbackPersona(persona, question, context) {
  const text = `${question} ${context}`.toLowerCase();
  const riskWords = ["辞め", "借金", "投資", "結婚", "離婚", "契約", "医療", "法律", "炎上", "危険"];
  const creativeWords = ["作る", "企画", "創作", "アプリ", "イベント", "発表", "挑戦", "旅"];
  const hasRisk = riskWords.some((word) => text.includes(word));
  const hasCreative = creativeWords.some((word) => text.includes(word));

  const base = persona.id === "rational" ? 5 : persona.id === "romantic" ? 18 : 14;
  const riskPenalty = hasRisk ? (persona.id === "rational" ? 48 : persona.id === "romantic" ? 30 : 28) : 0;
  const creativeBonus = hasCreative ? (persona.id === "entertainer" ? 28 : 16) : 4;
  const score = clampScore(base + creativeBonus - riskPenalty);
  const stance = score > 0 ? "APPROVE" : "DENY";

  const templates = {
    romantic: {
      headline: hasCreative ? "物語が始まる" : "願いの輪郭を見る",
      reasoning: [
        "その選択には、今の自分が何を大切にしたいかが表れています。",
        "完璧な確信よりも、心が動く方向に小さく窓を開ける価値があります。",
        hasRisk
          ? "ただし生活や信頼を傷つける賭けにしない設計が必要です。"
          : "誰かに見せられる形にすると、願いは現実へ近づきます。",
      ],
      risk: "憧れだけで走ると、疲れた時に理由を見失いやすくなります。",
      proposal: "まず一晩で作れる最小の形にして、なぜ惹かれるのかを言葉にします。",
      line: "夢を見るなら、戻れる橋も一緒に架けましょう。",
    },
    rational: {
      headline: hasRisk ? "条件未確定" : "小規模検証",
      reasoning: [
        "判断には、成功条件・失敗条件・撤退条件の3つが必要です。",
        "現時点では大きなコミットより、検証可能な実験に分解するのが堅実です。",
        hasRisk
          ? "不可逆な影響があるため、期限と予算の上限を先に固定すべきです。"
          : "得られる情報量に対して、初期コストを抑えられます。",
      ],
      risk: "成果の定義が曖昧なまま進むと、続行と中止の判断が遅れます。",
      proposal: "48時間以内に検証項目を3つ書き、最も安く試せる手段を1つ選びます。",
      line: "熱量は採用。ただし、検証条件を先に置きます。",
    },
    entertainer: {
      headline: hasCreative ? "見せ場あり" : "伝え方を磨く",
      reasoning: [
        "人に話したくなる要素があるほど、行動は継続しやすくなります。",
        "最初から完成形を狙うより、反応が返ってくる演出を入れると強いです。",
        hasRisk
          ? "ただし盛り上がりでリスクを隠すと、後で空気が重くなります。"
          : "小さな公開やデモで、場の温度を測れます。",
      ],
      risk: "面白さを優先しすぎると、相手が本当に欲しいものからズレます。",
      proposal: "1分で伝わるタイトルとデモを作り、近い人に反応をもらいます。",
      line: "退屈になった瞬間、計画は眠ります。見せ場を置きましょう。",
    },
  };

  return {
    id: persona.id,
    label: persona.label,
    jp: persona.jp,
    stance,
    confidence: hasRisk ? 62 : 72,
    score,
    ...templates[persona.id],
  };
}

function synthesize(question, results, usedAI, error) {
  const counts = results.reduce(
    (acc, result) => {
      acc[result.stance] += 1;
      return acc;
    },
    { APPROVE: 0, DENY: 0 }
  );
  const averageScore = Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
  const topStance = counts.APPROVE >= 2 ? "APPROVE" : "DENY";

  const decisionMap = {
    APPROVE: {
      label: "決議 承認",
      tone: "承認。実行条件を満たしました。",
      summary:
        "三人格のうち過半数が承認しました。実行へ進めますが、各人格が提示した注意点を条件として扱うのが妥当です。",
    },
    DENY: {
      label: "決議 否定",
      tone: "否定。現条件での実行は却下されました。",
      summary:
        "三人格のうち過半数が否定しました。現案のまま進めるより、条件変更、縮小案、または別案を再投入するべきです。",
    },
  };

  const proposals = results.map((result) => result.proposal);
  return {
    question,
    decision: decisionMap[topStance].label,
    tone: decisionMap[topStance].tone,
    summary: decisionMap[topStance].summary,
    stance: topStance,
    averageScore,
    counts,
    nextSteps: proposals,
    usedAI,
    model: usedAI ? OPENAI_MODEL : "demo-fallback",
    error: error || "",
    timestamp: new Date().toISOString(),
  };
}

async function handleCouncil(request, response) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 20_000) {
      sendJson(response, 413, { error: "Request is too large." });
      return;
    }
  }

  let payload;
  try {
    payload = JSON.parse(body || "{}");
  } catch {
    sendJson(response, 400, { error: "Invalid JSON." });
    return;
  }

  const question = String(payload.question || "").trim();
  const context = String(payload.context || "").trim();
  if (!question) {
    sendJson(response, 400, { error: "相談内容を入力してください。" });
    return;
  }

  let results;
  let usedAI = false;
  let error = "";

  if (OPENAI_API_KEY) {
    try {
      results = await Promise.all(personas.map((persona) => callOpenAIPersona(persona, question, context)));
      usedAI = true;
    } catch (apiError) {
      error = apiError.message || "OpenAI API call failed.";
      results = personas.map((persona) => fallbackPersona(persona, question, context));
    }
  } else {
    results = personas.map((persona) => fallbackPersona(persona, question, context));
  }

  sendJson(response, 200, {
    results,
    synthesis: synthesize(question, results, usedAI, error),
    samples: sampleQuestions,
  });
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";

  const safePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!safePath.startsWith(PUBLIC_DIR)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(safePath);
    const ext = path.extname(safePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/api/status") {
    sendJson(response, 200, {
      aiReady: Boolean(OPENAI_API_KEY),
      model: OPENAI_API_KEY ? OPENAI_MODEL : "demo-fallback",
      personas: personas.map(({ id, label, jp }) => ({ id, label, jp })),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/api/council") {
    await handleCouncil(request, response);
    return;
  }

  if (request.method === "GET") {
    await serveStatic(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`MAGI SYSTEM is running at http://localhost:${PORT}`);
  console.log(OPENAI_API_KEY ? `AI mode: ${OPENAI_MODEL}` : "AI mode: demo fallback (set OPENAI_API_KEY to enable OpenAI)");
});
