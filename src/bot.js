import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const questionFile = join(__dirname, "..", "TEST_70_QUESTIONS.md");
const apiBase = `https://api.telegram.org/bot${token}`;
const sessions = new Map();
const allQuestions = parseQuestionMarkdown(readFileSync(questionFile, "utf8"));
const learningQuestions = allQuestions.filter((q) => q.id.startsWith("L"));
const mockQuestions = allQuestions.filter((q) => q.id.startsWith("M"));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      mode: null,
      current: null,
      learningIndex: 0,
      learningCorrect: 0,
      mockIndex: 0,
      mockCorrect: 0,
      wrong: []
    });
  }
  return sessions.get(chatId);
}

function commandOf(text) {
  const [command] = text.trim().split(/\s+/);
  return command.toLowerCase().split("@")[0];
}

function parseQuestionMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const questions = [];
  let activePassage = "";

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^#### (L|M)(\d{3})(?:-(?:L|M)?(\d{3}))?$/);
    if (!heading) continue;

    const prefix = heading[1];
    const startNumber = Number(heading[2]);
    const endNumber = heading[3] ? Number(heading[3]) : null;
    const id = `${prefix}${String(startNumber).padStart(3, "0")}`;
    const block = [];
    index += 1;

    while (index < lines.length && !lines[index].startsWith("#### ")) {
      block.push(lines[index]);
      index += 1;
    }
    index -= 1;

    if (endNumber) {
      const inlineQuestions = parseInlineGroup(prefix, startNumber, block);
      if (inlineQuestions.length > 0) {
        questions.push(...inlineQuestions);
      } else {
        activePassage = cleanText(block.join("\n"));
      }
      continue;
    }

    const parsed = parseSingleQuestion(id, block, activePassage);
    if (parsed) {
      questions.push(parsed);
    }
  }

  return questions;
}

function parseInlineGroup(prefix, startNumber, block) {
  const firstQuestionIndex = block.findIndex((line) => /^\d+\. A\. /.test(line));
  if (firstQuestionIndex === -1) return [];

  const passage = cleanText(block.slice(0, firstQuestionIndex).join("\n"));
  const questions = [];

  for (let index = firstQuestionIndex; index < block.length; index += 1) {
    const choiceLine = block[index].match(/^(\d+)\. A\. (.+) \/ B\. (.+) \/ C\. (.+) \/ D\. (.+)$/);
    if (!choiceLine) continue;

    const localNumber = Number(choiceLine[1]);
    const answerLine = block[index + 1]?.match(/^Answer: ([A-D])$/);
    const explanationLine = block[index + 2]?.match(/^Explanation: (.+)$/);

    questions.push({
      id: `${prefix}${String(startNumber + localNumber - 1).padStart(3, "0")}`,
      part: "Part 6",
      passage,
      question: `(${localNumber})`,
      choices: [choiceLine[2], choiceLine[3], choiceLine[4], choiceLine[5]],
      answer: answerLetterToIndex(answerLine?.[1]),
      explanation: explanationLine?.[1] ?? ""
    });
  }

  return questions;
}

function parseSingleQuestion(id, block, activePassage) {
  const answerIndex = block.findIndex((line) => /^Answer: [A-D]$/.test(line));
  if (answerIndex === -1) return null;

  const answer = answerLetterToIndex(block[answerIndex].slice(-1));
  const explanation = block[answerIndex + 2]?.replace(/^Explanation: /, "") ?? "";
  const beforeAnswer = block.slice(0, answerIndex);
  const choiceStart = beforeAnswer.findIndex((line) => /^A\. /.test(line));
  const isVerticalChoices = choiceStart !== -1;

  if (isVerticalChoices) {
    return {
      id,
      part: id.startsWith("M") ? "Mock" : "Part 5",
      passage: "",
      question: cleanText(beforeAnswer.slice(0, choiceStart).join("\n")),
      choices: beforeAnswer.slice(choiceStart, choiceStart + 4).map((line) => line.replace(/^[A-D]\. /, "")),
      answer,
      explanation
    };
  }

  const question = cleanText(beforeAnswer.join("\n"));
  const choiceLineIndex = beforeAnswer.findIndex((line) => /^A\. /.test(line));
  const choices = choiceLineIndex === -1 ? [] : beforeAnswer.slice(choiceLineIndex, choiceLineIndex + 4);

  return {
    id,
    part: "Part 7",
    passage: activePassage,
    question,
    choices: choices.map((line) => line.replace(/^[A-D]\. /, "")),
    answer,
    explanation
  };
}

function cleanText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function answerLetterToIndex(letter) {
  return ["A", "B", "C", "D"].indexOf(letter);
}

async function telegram(method, payload) {
  const response = await fetch(`${apiBase}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`${method} failed: ${data.description}`);
  }
  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...extra
  });
}

async function sendQuestion(chatId, question, progressText) {
  const choices = question.choices
    .map((choice, index) => `${index + 1}. ${escapeHtml(choice)}`)
    .join("\n");
  const passage = question.passage ? `${escapeHtml(question.passage)}\n\n` : "";

  await sendMessage(
    chatId,
    [
      progressText,
      "",
      `${escapeHtml(question.id)} ${escapeHtml(question.part)}`,
      "",
      passage + escapeHtml(question.question),
      "",
      choices,
      "",
      "답은 1, 2, 3, 4 중 하나로 보내세요."
    ].join("\n"),
    {
      reply_markup: {
        keyboard: [["1", "2", "3", "4"], ["/learn", "/mock", "/status"], ["/wrong", "/reset"]],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }
  );
}

async function startLearning(chatId) {
  const session = getSession(chatId);
  session.mode = "learning";

  if (session.learningIndex >= learningQuestions.length) {
    await sendMessage(chatId, "오늘 학습 60문제를 모두 완료했습니다. /mock 으로 모의 퀴즈를 시작하세요.");
    return;
  }

  session.current = learningQuestions[session.learningIndex];
  await sendQuestion(chatId, session.current, `학습 진행도: ${session.learningIndex + 1}/60`);
}

async function startMock(chatId) {
  const session = getSession(chatId);

  if (session.learningIndex < learningQuestions.length) {
    await sendMessage(chatId, `오늘 학습 60문제를 완료해야 모의 퀴즈를 볼 수 있습니다.\n현재 진행도: ${session.learningIndex}/60`);
    return;
  }

  if (session.mockIndex >= mockQuestions.length) {
    await sendMockResult(chatId, session);
    return;
  }

  session.mode = "mock";
  session.current = mockQuestions[session.mockIndex];
  await sendQuestion(chatId, session.current, `모의 퀴즈: ${session.mockIndex + 1}/10`);
}

async function handleAnswer(chatId, text) {
  const session = getSession(chatId);

  if (!session.current) {
    await sendMessage(chatId, "진행 중인 문제가 없습니다. /learn 으로 학습을 시작하세요.");
    return;
  }

  const selected = Number(text.trim()) - 1;
  const question = session.current;
  const isCorrect = selected === question.answer;

  if (isCorrect) {
    if (session.mode === "mock") session.mockCorrect += 1;
    if (session.mode === "learning") session.learningCorrect += 1;
  } else {
    session.wrong.push(question);
  }

  await sendMessage(
    chatId,
    [
      isCorrect ? "정답입니다." : "오답입니다.",
      `정답: ${question.answer + 1}. ${escapeHtml(question.choices[question.answer])}`,
      `해설: ${escapeHtml(question.explanation)}`
    ].join("\n")
  );

  session.current = null;

  if (session.mode === "learning") {
    session.learningIndex += 1;
    await startLearning(chatId);
    return;
  }

  if (session.mode === "mock") {
    session.mockIndex += 1;
    if (session.mockIndex >= mockQuestions.length) {
      await sendMockResult(chatId, session);
    } else {
      await startMock(chatId);
    }
  }
}

function randomInteger(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function mockRank(correctCount) {
  const total = randomInteger(34275, 97211);
  const ranges = {
    10: [1, 1],
    9: [0.81, 0.87],
    8: [0.71, 0.8],
    7: [0.61, 0.7],
    6: [0.51, 0.7],
    5: [0.31, 0.5],
    4: [0.26, 0.3],
    3: [0.21, 0.25],
    2: [0.11, 0.2],
    1: [0.03, 0.1],
    0: [0.01, 0.02]
  };
  const [minRatio, maxRatio] = ranges[correctCount] ?? ranges[0];
  const rank = correctCount === 10
    ? total
    : randomInteger(Math.max(1, Math.floor(total * minRatio)), Math.max(1, Math.floor(total * maxRatio)));

  return {
    total,
    rank: Math.min(rank, total)
  };
}

async function sendMockResult(chatId, session) {
  const { rank, total } = mockRank(session.mockCorrect);
  await sendMessage(
    chatId,
    [
      "오늘의 모의 퀴즈가 끝났습니다.",
      `오늘의 점수: ${session.mockCorrect}/10`,
      `오늘의 전국 랭킹: ${rank.toLocaleString("ko-KR")} / ${total.toLocaleString("ko-KR")}`,
      "",
      "테스트해 주셔서 감사합니다."
    ].join("\n")
  );
}

async function sendStatus(chatId) {
  const session = getSession(chatId);
  await sendMessage(
    chatId,
    [
      "현재 상태",
      `학습: ${session.learningIndex}/60`,
      `학습 정답: ${session.learningCorrect}/${session.learningIndex}`,
      `모의 퀴즈: ${session.mockIndex}/10`,
      `모의 정답: ${session.mockCorrect}/${session.mockIndex}`,
      `오답 수: ${session.wrong.length}`
    ].join("\n")
  );
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (!text) return;

  if (/^[1-4]$/.test(text)) {
    await handleAnswer(chatId, text);
    return;
  }

  const command = commandOf(text);

  if (command === "/start" || command === "/help") {
    await sendMessage(
      chatId,
      [
        "TOEIC RC 문법 봇 테스트 버전입니다.",
        "",
        "현재 테스트 기간에는 모든 사용자를 유료 사용자 기준으로 처리합니다.",
        "",
        "/learn - 오늘 학습 60문제 시작 또는 이어풀기",
        "/mock - 학습 60문제 완료 후 모의 퀴즈 10문제",
        "/status - 진행도 확인",
        "/wrong - 오답 확인",
        "/reset - 내 테스트 기록 초기화"
      ].join("\n")
    );
    return;
  }

  if (command === "/learn" || command === "/quiz") {
    await startLearning(chatId);
    return;
  }

  if (command === "/mock") {
    await startMock(chatId);
    return;
  }

  if (command === "/status" || command === "/score") {
    await sendStatus(chatId);
    return;
  }

  if (command === "/wrong") {
    const recent = getSession(chatId).wrong.slice(-10);
    if (recent.length === 0) {
      await sendMessage(chatId, "아직 오답이 없습니다.");
      return;
    }

    await sendMessage(
      chatId,
      recent
        .map((q) => `${escapeHtml(q.id)} ${escapeHtml(q.question)}\n정답: ${q.answer + 1}. ${escapeHtml(q.choices[q.answer])}\n해설: ${escapeHtml(q.explanation)}`)
        .join("\n\n")
    );
    return;
  }

  if (command === "/reset") {
    sessions.delete(chatId);
    await sendMessage(chatId, "테스트 기록을 초기화했습니다. /learn 으로 다시 시작하세요.");
    return;
  }

  await sendMessage(chatId, "알 수 없는 메시지입니다. /help 를 보내 명령어를 확인하세요.");
}

async function poll(offset) {
  const updates = await telegram("getUpdates", {
    offset,
    timeout: 30,
    allowed_updates: ["message"]
  });

  for (const update of updates) {
    offset = update.update_id + 1;
    try {
      if (update.message) {
        await handleMessage(update.message);
      }
    } catch (error) {
      console.error(error);
      if (update.message?.chat?.id) {
        await sendMessage(update.message.chat.id, "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    }
  }

  return offset;
}

async function main() {
  console.log(`TOEIC RC bot started with ${learningQuestions.length} learning questions and ${mockQuestions.length} mock questions.`);
  let offset = 0;

  while (true) {
    try {
      offset = await poll(offset);
    } catch (error) {
      console.error(error.message);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

main();
