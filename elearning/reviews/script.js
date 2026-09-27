/* =========================================================
   GOOGLE APPS SCRIPT
========================================================= */

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwfu_GYJpkin4655KGvMW1C96HIR42QJs26A3wEb-7D0avwU3ZGD7sXcXkTREP0Tlek1g/exec";

/* =========================================================
   CẤU HÌNH
========================================================= */

const SHUFFLE_QUESTIONS = false;
const SHUFFLE_ANSWERS = true;
const SHUFFLE_TRUE_FALSE = true;

let activeQuestions = [];
let trueFalseChoices = [true, false];

/* =========================================================
   HÀM TRỘN
========================================================= */

function shuffleArray(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function shuffleQuestionAnswers(question) {
  if (!SHUFFLE_ANSWERS) {
    return question;
  }

  const shuffledQuestion = { ...question };

  /* Trộn đáp án */
  if (question.options) {
    const order = shuffleArray(question.options.map((_, index) => index));
    shuffledQuestion.options = order.map(index => question.options[index]);

    if (Number.isInteger(question.correct)) {
      shuffledQuestion.correct = order.indexOf(question.correct);
    }

    if (question.multipleCorrect) {
      shuffledQuestion.multipleCorrect = question.multipleCorrect.map(index => order.indexOf(index));
    }

    if (question.icons) {
      shuffledQuestion.icons = order.map(index => question.icons[index]);
    }
  }

  /* Trộn cặp matching */
  if (question.pairs) {
    shuffledQuestion.pairs = shuffleArray(question.pairs);
  }

  /* Trộn item binary */
  if (question.items) {
    shuffledQuestion.items = shuffleArray(question.items);
  }

  return shuffledQuestion;
}

/* =========================================================
   STATE
========================================================= */
function getInitialLives() {
  const lives = Number(document.getElementById("app")?.dataset.lives);
  return Number.isInteger(lives) && lives > 0 ? lives : 10;
}

let state = {
  screen: "intro",
  name: "",
  className: "Năm 5",
  gender: "Không cung cấp",
  index: 0,
  lives: getInitialLives(),
  score: 0,
  correct: 0,
  attemptNumber: null,
  answered: false,
  answerCorrect: null,
  selected: null,
  multi: [],
  blank: "",
  binary: {},
  matches: {},
  selectedLeft: null,
  order: [],
  matchingRights: []
};

const app = document.getElementById("app");

/* =========================================================
   QUẢN LÝ LỚP HỌC
========================================================= */

function normalizeClassName(name) {
  if (typeof name !== "string") {
    return "";
  }
  let value = name.trim();
  value = value.replace(/^Lớp\s+/i, "");
  return value.trim();
}

function getAvailableClasses() {
  const classes = new Set(["Năm 1", "Năm 2", "Năm 3", "Năm 4", "Năm 5", "Năm 6"]);

  try {
    const savedClasses = JSON.parse(localStorage.getItem("tinHocClasses_v1") || "[]");
    if (Array.isArray(savedClasses)) {
      savedClasses.forEach(name => {
        const normalized = normalizeClassName(name);
        if (normalized) classes.add(normalized);
      });
    }

    const db = JSON.parse(localStorage.getItem("tinHocStudentData_v1") || "null");
    const classInfoName = normalizeClassName(db?.classInfo?.name);
    if (classInfoName) classes.add(classInfoName);

    if (Array.isArray(db?.students)) {
      db.students.forEach(student => {
        const className = normalizeClassName(student?.className);
        if (className) classes.add(className);
      });
    }
  } catch (error) {
    console.error("Không thể đọc danh sách lớp đã lưu:", error);
  }

  return [...classes];
}

function populateClassOptions() {
  const select = document.getElementById("className");
  if (!select) return;

  const currentValue = normalizeClassName(select.value || state.className || "Năm 5");
  const classes = getAvailableClasses();

  select.replaceChildren();

  classes.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  if (classes.includes(currentValue)) {
    select.value = currentValue;
    state.className = currentValue;
  } else if (classes.includes("Năm 5")) {
    select.value = "Năm 5";
    state.className = "Năm 5";
  } else if (classes.length > 0) {
    select.value = classes[0];
    state.className = classes[0];
  }
}

window.addEventListener("storage", event => {
  if (["tinHocClasses_v1", "tinHocStudentData_v1"].includes(event.key) && state.screen === "intro") {
    populateClassOptions();
  }
});

/* =========================================================
   RENDER
========================================================= */

function render() {
  if (state.screen === "intro") {
    renderIntro();
  } else if (state.screen === "playing") {
    renderExam();
  } else if (state.screen === "result") {
    renderResult();
  } else {
    renderFailed();
  }
}

/* =========================================================
   MÀN HÌNH INTRO
========================================================= */

function renderIntro() {
  app.innerHTML = `
    <div class="app">
      <div class="container">
        <div class="card intro">
          <div class="badge">✨ Đấu Trường Tri Thức Số</div>
          <div class="logo">🚀</div>
          <h1>QUẢN LÝ THÔNG TIN<br><span class="gradient-text">PHẦN 1</span></h1>
          <div class="info-box">
            <strong>${quiz.title}</strong><br>
            <small>${quiz.questions.length} câu hỏi thử thách · 10 trái tim sinh mệnh</small>
          </div>

          <form id="startForm" class="form-group">
            <div style="margin-bottom:16px;">
              <label>Chọn Lớp Học</label>
              <select id="className"></select>
            </div>

            <div>
              <label>Họ và Tên Dũng Sĩ <span style="color:#f44336;">*</span></label>
              <input id="studentName" type="text" placeholder="Nhập họ và tên của em..." required>
            </div>

            <div id="startError"></div>

            <button type="submit" class="btn btn-primary">▶ BẮT ĐẦU CHƠI NGAY!</button>
          </form>
        </div>
      </div>
    </div>
  `;

  populateClassOptions();

  document.getElementById("startForm").onsubmit = event => {
    event.preventDefault();
    const name = document.getElementById("studentName").value.trim();
    const className = document.getElementById("className").value.trim();
    const errorBox = document.getElementById("startError");

    if (!name) {
      errorBox.innerHTML = `<div class="error-msg">⚠️ Vui lòng nhập họ và tên của em!</div>`;
      return;
    }

    if (!className) {
      errorBox.innerHTML = `<div class="error-msg">⚠️ Vui lòng chọn lớp!</div>`;
      return;
    }

    state.name = name;
    state.className = normalizeClassName(className);
    errorBox.innerHTML = "";

    startExam();
  };
}

/* =========================================================
   BẮT ĐẦU BÀI THI
========================================================= */

function startExam() {
  state.screen = "playing";
  state.index = 0;
  state.lives = getInitialLives();
  state.score = 0;
  state.correct = 0;
  state.attemptNumber = null;
  state.answered = false;

  activeQuestions = SHUFFLE_QUESTIONS ? shuffleArray(quiz.questions) : [...quiz.questions];
  activeQuestions = activeQuestions.map(shuffleQuestionAnswers);
  trueFalseChoices = SHUFFLE_TRUE_FALSE ? shuffleArray([true, false]) : [true, false];

  prepareQuestion();
  render();
}

/* =========================================================
   CHUẨN BỊ CÂU HỎI
========================================================= */

function prepareQuestion() {
  state.answered = false;
  state.answerCorrect = null;
  state.selected = null;
  state.multi = [];
  state.blank = "";
  state.binary = {};
  state.matches = {};
  state.selectedLeft = null;
  state.matchingRights = [];
  state.order = [];

  const q = activeQuestions[state.index];

  if (q.type === "matching") {
    state.matchingRights = shuffleArray(q.pairs.map(pair => pair[1]));
  }

  if (q.type === "process-order" && q.steps) {
    state.order = shuffleArray(q.steps.map((_, i) => i));
  }
}

/* =========================================================
   CHẤM ĐÁP ÁN
========================================================= */

function answer(correct) {
  if (state.answered) return;

  state.answered = true;
  state.answerCorrect = correct;

  if (correct) {
    state.correct++;
    state.score += 100 + (state.correct > 1 ? state.correct * 15 : 0);
  } else {
    state.lives = Math.max(0, state.lives - 1);
  }

  render();
}

/* =========================================================
   CÂU TIẾP THEO
========================================================= */

function next() {
  if (state.lives <= 0) {
    saveResult();
    state.screen = "failed";
    render();
    return;
  }

  if (state.index + 1 >= activeQuestions.length) {
    saveResult();
    state.screen = "result";
    render();
    return;
  }

  state.index++;
  prepareQuestion();
  render();
}

/* =========================================================
   RENDER CÂU HỎI
========================================================= */

function getCorrectAnswer(q) {
  if (q.type === "multiple-choice" || q.type === "radio" || q.type === "visual-choice") {
    return q.options?.[q.correct] ?? "";
  }

  if (q.type === "fill-in-blank") {
    return q.answers?.join(" / ") ?? "";
  }

  if (q.type === "multiple-select") {
    return (q.multipleCorrect || []).map(index => q.options[index]).join("; ");
  }

  if (q.type === "matching") {
    return q.pairs.map(pair => `${pair[0]} → ${pair[1]}`).join("<br>");
  }

  if (q.type === "binary") {
    return q.items.map(item => `${item[0]} — ${item[1] ? "Đúng" : "Sai"}`).join("<br>");
  }

  if (q.type === "process-order") {
    return (q.correct || []).map((stepIndex, index) => `${index + 1}. ${q.steps[stepIndex]}`).join("<br>");
  }

  return "";
}

function renderExam() {
  const q = activeQuestions[state.index];
  let bodyHTML = "";

  /* MULTIPLE CHOICE */
  if (q.type === "multiple-choice") {
    bodyHTML = `
      <div class="options-grid">
        ${q.options.map((opt, idx) => {
          let cls = "option-btn";
          if (state.answered) {
            if (idx === q.correct) cls += " correct";
            else if (idx === state.selected) cls += " wrong";
          }
          return `
            <button class="${cls}" ${state.answered ? "disabled" : ""} data-i="${idx}">
              <span class="option-letter">${String.fromCharCode(65 + idx)}</span>
              <span>${opt}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  /* RADIO */
  else if (q.type === "radio") {
    bodyHTML = `
      <div class="radio-list">
        ${q.options.map((opt, idx) => {
          let cls = "radio-choice";
          if (state.answered && idx === q.correct) cls += " correct";
          else if (state.answered && idx === state.selected) cls += " wrong";
          return `
            <label class="${cls}">
              <input type="radio" name="radioAnswer" value="${idx}" ${state.selected === idx ? "checked" : ""} ${state.answered ? "disabled" : ""} data-radio="${idx}">
              <span>${opt}</span>
            </label>
          `;
        }).join("")}
      </div>
    `;
  }

  /* VISUAL */
  else if (q.type === "visual-choice") {
    bodyHTML = `
      <div class="visual-grid">
        ${q.options.map((opt, idx) => {
          let cls = "visual-choice";
          if (state.selected === idx) cls += " selected";
          if (state.answered && idx === q.correct) cls += " correct";
          else if (state.answered && idx === state.selected) cls += " wrong";
          return `
            <button class="${cls}" ${state.answered ? "disabled" : ""} data-visual="${idx}">
              <span class="visual-icon" aria-hidden="true">${q.icons[idx]}</span>
              <span>${opt}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  /* FILL BLANK */
  else if (q.type === "fill-in-blank") {
    bodyHTML = `
      <div class="fill-blank-form">
        <input id="blankAnswer" type="text" placeholder="Nhập câu trả lời..." ${state.answered ? "disabled" : ""} autocomplete="off" value="${state.blank}">
        ${!state.answered ? `
          <button class="btn btn-primary" id="submitBlank" style="width:auto;margin-top:0;" ${state.blank.trim() ? "" : "disabled"}>
            Trả lời
          </button>
        ` : ""}
      </div>
    `;
  }

  /* MULTIPLE SELECT */
  else if (q.type === "multiple-select") {
    bodyHTML = `
      <div class="choice-list">
        ${q.options.map((opt, idx) => `
          <label class="choice-btn ${state.multi.includes(idx) ? "selected" : ""}">
            <input type="checkbox" data-multi="${idx}" ${state.multi.includes(idx) ? "checked" : ""} ${state.answered ? "disabled" : ""}>
            <span>${opt}</span>
          </label>
        `).join("")}
      </div>
      ${!state.answered ? `
        <button class="btn btn-primary" id="submitMulti" style="margin-top:14px;" ${state.multi.length === 0 ? "disabled" : ""}>
          Xác Nhận Đáp Án
        </button>
      ` : ""}
    `;
  }

  /* MATCHING */
  else if (q.type === "matching") {
    const rights = state.matchingRights;
    bodyHTML = `
      <div class="matching-grid">
        <div class="matching-col">
          <h4>Cột A - Khái Niệm</h4>
          ${q.pairs.map((pair, idx) => `
            <button class="matching-item ${state.selectedLeft === pair[0] ? "active" : ""} ${state.matches[pair[0]] ? "paired" : ""}" ${state.answered ? "disabled" : ""} data-left="${idx}">
              ${pair[0]}
            </button>
          `).join("")}
        </div>
        <div class="matching-col">
          <h4>Cột B - Mô Tả/Chức Năng</h4>
          ${rights.map((right, idx) => `
            <button class="matching-item ${state.matches[state.selectedLeft] === right ? "paired" : ""}" ${state.answered || !state.selectedLeft ? "disabled" : ""} data-right="${idx}">
              ${right}
            </button>
          `).join("")}
        </div>
      </div>
      ${!state.answered ? `
        <button class="btn btn-primary" id="submitMatch" style="margin-top:14px;" ${Object.keys(state.matches).length !== q.pairs.length ? "disabled" : ""}>
          Xác Nhận Ghép Nối
        </button>
      ` : ""}
    `;
  }

  /* BINARY */
  else if (q.type === "binary") {
    bodyHTML = `
      <div class="binary-items">
        ${q.items.map((item, idx) => `
          <div class="binary-item">
            <span style="flex:1;">${idx + 1}.${item[0]}</span>
            <div class="binary-buttons">
              ${trueFalseChoices.map(value => `
                <button class="binary-btn ${value ? "yes" : "no"} ${state.binary[idx] === value ? "active" : ""}" ${state.answered ? "disabled" : ""} data-bin="${idx}:${value}">
                  ${value ? "Đúng" : "Sai"}
                </button>
              `).join("")}
            </div>
          </div>
        `).join("")}
      </div>
      ${!state.answered ? `
        <button class="btn btn-primary" id="submitBin" style="margin-top:14px;" ${Object.keys(state.binary).length !== q.items.length ? "disabled" : ""}>
          Xác Nhận Đánh Giá
        </button>
      ` : ""}
    `;
  }

  /* PROCESS ORDER */
  else if (q.type === "process-order") {
    bodyHTML = `
      <div class="order-items">
        ${state.order.map((stepIdx, pos) => `
          <div class="order-item">
            <div class="order-step">
              <span class="order-number">${pos + 1}</span>
              <span>${q.steps[stepIdx]}</span>
            </div>
            ${!state.answered ? `
              <div class="order-buttons">
                <button class="order-btn" ${pos === 0 ? "disabled" : ""} data-up="${pos}">⬆️</button>
                <button class="order-btn" ${pos === state.order.length - 1 ? "disabled" : ""} data-down="${pos}">⬇️</button>
              </div>
            ` : ""}
          </div>
        `).join("")}
      </div>
      ${!state.answered ? `
        <button class="btn btn-primary" id="submitOrder" style="margin-top:14px;">
          Xác Nhận Thứ Tự
        </button>
      ` : ""}
    `;
  }

  /* HTML CỦA MÀN HÌNH BÀI THI */
  app.innerHTML = `
    <div class="app">
      <div class="container">
        <div class="card">
          <div class="hud">
            <div class="hud-stats">
              <span class="stat-badge life">❤️ ${state.lives}</span>
              <span class="stat-badge score">⭐ ${state.score}</span>
              ${state.correct >= 2 ? `<span class="stat-badge combo">🔥 x${state.correct}</span>` : ""}
            </div>
            <div style="font-weight:700;color:#667eea;">
              Câu ${state.index + 1} / ${activeQuestions.length}
            </div>
          </div>
          <div class="progress-bar">
            <div style="width:${((state.index + 1) / activeQuestions.length) * 100}%;"></div>
          </div>
        </div>

        <div class="card" style="margin-top:16px;">
          <div class="question-card">
            <div>
              <div class="question-header">
                <div class="question-category">${q.category}</div>
                <h2 class="question-text">${q.text}</h2>
              </div>
              <div class="question-body">
                ${bodyHTML}
              </div>
            </div>

            ${state.answered ? `
              <div class="feedback-overlay">
                <div>
                  <div class="feedback-status ${state.answerCorrect ? "correct" : "wrong"}">
                    ${state.answerCorrect ? "🎉 Chính xác! Xuất sắc lắm!" : "💡 Chưa đúng rồi, cùng xem giải thích nhé!"}
                  </div>
                  ${getCorrectAnswer(q) ? `
                    <div class="feedback-explain"><strong>Đáp án đúng:</strong> <strong>${getCorrectAnswer(q)}</strong></div>
                  ` : ""}
                  ${q.explain ? `
                    <div class="feedback-explain"><strong>Giải thích:</strong> ${q.explain}</div>
                  ` : ""}
                </div>
                <button class="btn-next" id="nextBtn">Câu Tiếp Theo</button>
              </div>
            ` : ""}
          </div>
        </div>
      </div>
    </div>
  `;

  bindExam(q);
}

/* =========================================================
   GẮN SỰ KIỆN CÂU HỎI
========================================================= */

function bindExam(q) {
  document.querySelectorAll("[data-i]").forEach(btn => {
    btn.onclick = () => {
      state.selected = Number(btn.dataset.i);
      answer(state.selected === q.correct);
    };
  });

  document.querySelectorAll("[data-radio], [data-visual]").forEach(choice => {
    choice.onclick = () => {
      state.selected = Number(choice.dataset.radio ?? choice.dataset.visual);
      answer(state.selected === q.correct);
    };
  });

  const blankInput = document.getElementById("blankAnswer");
  const submitBlank = document.getElementById("submitBlank");
  if (blankInput && submitBlank) {
    blankInput.oninput = () => {
      state.blank = blankInput.value;
      submitBlank.disabled = !state.blank.trim();
    };

    submitBlank.onclick = () => {
      const normalize = value =>
        String(value)
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")
          .replace(/Đ/g, "D")
          .toLocaleLowerCase("vi")
          .trim()
          .replace(/\s+/g, " ");

      const userAnswer = normalize(blankInput.value);
      answer(q.answers.some(item => normalize(item) === userAnswer));
    };
  }

  document.querySelectorAll("[data-multi]").forEach(input => {
    input.onchange = () => {
      const idx = Number(input.dataset.multi);
      state.multi = input.checked
        ? [...state.multi, idx]
        : state.multi.filter(x => x !== idx);
      render();
    };
  });

  const submitMulti = document.getElementById("submitMulti");
  if (submitMulti) {
    submitMulti.onclick = () => {
      const userSorted = [...state.multi].sort().join(",");
      const correctSorted = [...q.multipleCorrect].sort().join(",");
      answer(userSorted === correctSorted);
    };
  }

  document.querySelectorAll("[data-left]").forEach(btn => {
    btn.onclick = () => {
      state.selectedLeft = q.pairs[Number(btn.dataset.left)][0];
      render();
    };
  });

  document.querySelectorAll("[data-right]").forEach(btn => {
    btn.onclick = () => {
      if (!state.selectedLeft) return;
      state.matches[state.selectedLeft] = state.matchingRights[Number(btn.dataset.right)];
      state.selectedLeft = null;
      render();
    };
  });

  const submitMatch = document.getElementById("submitMatch");
  if (submitMatch) {
    submitMatch.onclick = () => {
      const isCorrect = q.pairs.every(pair => state.matches[pair[0]] === pair[1]);
      answer(isCorrect);
    };
  }

  document.querySelectorAll("[data-bin]").forEach(btn => {
    btn.onclick = () => {
      const [idx, val] = btn.dataset.bin.split(":");
      state.binary[idx] = val === "true";
      render();
    };
  });

  const submitBin = document.getElementById("submitBin");
  if (submitBin) {
    submitBin.onclick = () => {
      const isCorrect = q.items.every((item, idx) => state.binary[idx] === item[1]);
      answer(isCorrect);
    };
  }

  document.querySelectorAll("[data-up]").forEach(btn => {
    btn.onclick = () => moveOrder(Number(btn.dataset.up), -1);
  });

  document.querySelectorAll("[data-down]").forEach(btn => {
    btn.onclick = () => moveOrder(Number(btn.dataset.down), 1);
  });

  const submitOrder = document.getElementById("submitOrder");
  if (submitOrder) {
    submitOrder.onclick = () => {
      const isCorrect = state.order.every((val, idx) => val === q.correct[idx]);
      answer(isCorrect);
    };
  }

  const nextBtn = document.getElementById("nextBtn");
  if (nextBtn) {
    nextBtn.onclick = next;
  }
}

function moveOrder(pos, dir) {
  const temp = state.order[pos];
  state.order[pos] = state.order[pos + dir];
  state.order[pos + dir] = temp;
  render();
}

/* =========================================================
   LƯU KẾT QUẢ
========================================================= */

function saveResult() {
  const score10 = Number((state.correct / activeQuestions.length * 10).toFixed(1));
  const submittedAt = new Date().toISOString();

  const payload = {
    fullName: state.name,
    className: state.className,
    examTitle: quiz.title,
    score: score10,
    correctAnswers: state.correct,
    wrongAnswers: activeQuestions.length - state.correct,
    submittedAt
  };

  const KEY = "tinHocStudentData_v1";
  let db;

  try {
    db = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch (error) {
    console.error("Dữ liệu localStorage bị lỗi:", error);
    db = null;
  }

  if (!db || typeof db !== "object") {
    db = {
      version: "1.0",
      classInfo: {
        name: state.className || "Năm 5",
        grade: 5,
        description: "Lớp Tin học nâng cao khối 5"
      },
      students: []
    };
  }

  if (!Array.isArray(db.students)) {
    db.students = [];
  }

  db.classInfo = {
    ...(db.classInfo || {}),
    name: normalizeClassName(state.className) || "Năm 5",
    grade: 5,
    description: "Lớp Tin học nâng cao khối 5"
  };

  let student = db.students.find(
    s => s.fullName === state.name && normalizeClassName(s.className) === normalizeClassName(state.className)
  );

  if (!student) {
    student = {
      studentId: "HS" + String(Date.now()).slice(-6),
      fullName: state.name,
      className: normalizeClassName(state.className) || "Năm 5",
      grade: 5,
      gender: state.gender,
      exams: []
    };
    db.students.push(student);
  }

  if (!Array.isArray(student.exams)) {
    student.exams = [];
  }

  let exam = student.exams.find(e => e.examTitle === quiz.title);

  if (!exam) {
    exam = {
      examTitle: quiz.title,
      attempts: []
    };
    student.exams.push(exam);
  }

  if (!Array.isArray(exam.attempts)) {
    exam.attempts = [];
  }

  state.attemptNumber = exam.attempts.length + 1;

  exam.attempts.push({
    attemptNumber: state.attemptNumber,
    examTitle: quiz.title,
    score: score10,
    correctAnswers: state.correct,
    wrongAnswers: activeQuestions.length - state.correct,
    submittedAt
  });

  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (error) {
    console.error("Không thể lưu kết quả:", error);
  }

  payload.attemptNumber = state.attemptNumber;

  if (SCRIPT_URL && !SCRIPT_URL.includes("DÁN_LINK")) {
    fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(error => console.error("Lỗi gửi Google Apps Script:", error));
  }
}

/* =========================================================
   MÀN HÌNH KẾT QUẢ & THẤT BẠI
========================================================= */

function renderResult() {
  const score10 = (state.correct / activeQuestions.length * 10).toFixed(1);

  app.innerHTML = `
    <div class="app">
      <div class="container">
        <div class="card result-card">
          <div class="trophy">🏆</div>
          <h1>HOÀN THÀNH THỬ THÁCH!</h1>
          <p>Chúc mừng <strong>${state.name}</strong> (${state.className}) đã xuất sắc hoàn thành bài thi!</p>
          
          <div class="score-big">${score10} / 10 Điểm</div>
          
          <div class="info-box">
            <p><strong>Tổng điểm trò chơi:</strong> ⭐ ${state.score}</p>
            <p><strong>Số câu đúng:</strong> ${state.correct} / ${activeQuestions.length}</p>
            <p><strong>Lần làm bài:</strong> Lần ${state.attemptNumber || 1}</p>
          </div>

          <div class="result-actions">
            <button class="btn btn-primary" onclick="startExam()">Chơi Lại</button>
            <button class="btn btn-secondary" onclick="state.screen='intro'; render();">Màn Hình Chính</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFailed() {
  app.innerHTML = `
    <div class="app">
      <div class="container">
        <div class="card result-card">
          <div class="trophy">💔</div>
          <h1>HẾT SINH MỆNH!</h1>
          <p>Rất tiếc <strong>${state.name}</strong>, em đã dùng hết trái tim sinh mệnh.</p>
          
          <div class="info-box">
            <p><strong>Số câu trả lời đúng:</strong> ${state.correct} / ${activeQuestions.length}</p>
            <p><strong>Điểm số đạt được:</strong> ⭐ ${state.score}</p>
          </div>

          <div class="result-actions">
            <button class="btn btn-primary" onclick="startExam()">Thử Lại Ngay</button>
            <button class="btn btn-secondary" onclick="state.screen='intro'; render();">Màn Hình Chính</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   KHỞI CHẠY ỨNG DỤNG
========================================================= */
render();
