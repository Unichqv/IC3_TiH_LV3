const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbxzEgOwFhQxaXCZCvIR6BsHLyg3rUpTFu-ahjmkTXD97DoW1039ocw3Yep31lcC7WS-/exec";

/* =========================================================
   CẤU HÌNH
========================================================= */

const SHUFFLE_QUESTIONS = false;
const SHUFFLE_ANSWERS = true;
const SHUFFLE_TRUE_FALSE = true;

let activeQuestions = [];
let trueFalseChoices = [true, false];
let slideTimer = null;

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
  return Number.isInteger(lives) && lives >= 0 ? lives : 10;
}

let state = {
  screen: "intro",
  name: "",
  grade: 5,
  className: "",
  gender: "Không cung cấp",
  index: 0,
  lives: getInitialLives(),
  score: 0,
  correct: 0,
  attemptNumber: null,
  answered: false,
  answerCorrect: null,
  slideRemaining: 30,
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

function getGradeNumber(value) {
  const match = String(value || "").trim().match(/^(?:lớp\s*)?(?:năm\s*)?([1-6])(?=$|[\sA-Za-z])/i);
  return match ? Number(match[1]) : null;
}

function getAvailableClasses(grade) {
  const classes = new Map();

  function addClass(value, explicitGrade) {
    const name = typeof value === "string"
      ? value
      : value?.className ?? value?.name ?? value?.class;
    const normalized = normalizeClassName(name);
    if (!normalized || /^Năm\s*[1-6]$/i.test(normalized)) return;

    const classGrade = Number(explicitGrade) || getGradeNumber(normalized);
    if (classGrade === Number(grade)) classes.set(normalized, normalized);
  }

  try {
    const savedClasses = JSON.parse(localStorage.getItem("tinHocClasses_v1") || "[]");
    const classList = Array.isArray(savedClasses)
      ? savedClasses
      : savedClasses?.classes ?? savedClasses?.data ?? [];
    if (Array.isArray(classList)) {
      classList.forEach(item => addClass(item));
    }

    const db = JSON.parse(localStorage.getItem("tinHocStudentData_v1") || "null");
    addClass(db?.classInfo, db?.classInfo?.grade);

    if (Array.isArray(db?.students)) {
      db.students.forEach(student => addClass(student?.className, student?.grade));
    }
  } catch (error) {
    console.error("Không thể đọc danh sách lớp đã lưu:", error);
  }

  return [...classes.keys()].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
}

async function getSpreadsheetSheetNames() {
  if (!SCRIPT_URL) return [];
  try {
    const response = await fetch(SCRIPT_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const sheets = Array.isArray(result)
      ? result
      : result?.classes ?? result?.sheets ?? result?.data ?? [];

    return Array.isArray(sheets)
      ? sheets.map(item => typeof item === "string" ? item : item?.className ?? item?.name ?? item?.class ?? "").filter(Boolean)
      : [];
  } catch (error) {
    console.error("Không thể tải danh sách lớp từ Google Sheets:", error);
    return [];
  }
}

async function getStudentNamesForClass(className) {
  const names = new Set();
  let requestFailed = false;

  try {
    const db = JSON.parse(localStorage.getItem("tinHocStudentData_v1") || "null");
    if (Array.isArray(db?.students)) {
      db.students.forEach(student => {
        if (normalizeClassName(student?.className) === normalizeClassName(className)) {
          const name = String(student?.fullName || student?.studentName || student?.name || "").trim();
          if (name) names.add(name);
        }
      });
    }
  } catch (error) {
    console.error("Không thể đọc danh sách học sinh đã lưu:", error);
  }

  const isNameHeader = value => {
    const header = normalizeHeader(value);
    return ["fullname", "name", "studentname", "hoten", "hovaten", "tenhocsinh"].includes(header) ||
      header.startsWith("hoten") || header.startsWith("hovaten") || header.startsWith("fullname");
  };

  const getRows = result => {
    if (Array.isArray(result)) return result;
    if (!result || typeof result !== "object") return [];
    for (const key of ["students", "rows", "data", "names"]) {
      if (result[key] !== undefined) {
        const nested = getRows(result[key]);
        if (nested.length) return nested;
        if (Array.isArray(result[key])) return result[key];
      }
    }
    return [];
  };

  const addRows = result => {
    const rows = getRows(result);
    if (!Array.isArray(rows)) return;

    if (rows.every(row => typeof row === "string")) {
      rows.forEach(value => {
        const name = value.trim();
        if (name && !["họ tên", "họ và tên", "full name", "name"].includes(name.toLocaleLowerCase("vi"))) names.add(name);
      });
      return;
    }

    let firstDataRow = 0;
    let nameIndex = 1;
    if (Array.isArray(rows[0])) {
      const headers = rows[0].map(normalizeHeader);
      const detectedIndex = headers.findIndex(isNameHeader);
      if (detectedIndex >= 0) {
        nameIndex = detectedIndex;
        firstDataRow = 1;
      } else if (headers.some(header => ["stt", "id", "mahs", "studentid"].includes(header))) {
        firstDataRow = 1;
      }
    }

    rows.slice(firstDataRow).forEach(row => {
      let name = "";
      if (Array.isArray(row)) {
        name = String(row[nameIndex] ?? row[1] ?? row[0] ?? "").trim();
      } else if (row && typeof row === "object") {
        const fields = Object.entries(row);
        const match = fields.find(([key]) => isNameHeader(key));
        name = String(match?.[1] ?? "").trim();
      }
      if (name && !["họ tên", "họ và tên", "full name", "name"].includes(name.toLocaleLowerCase("vi"))) names.add(name);
    });
  };

  if (SCRIPT_URL) {
    const rawClassName = String(className || "").trim();
    const normalizedClassName = normalizeClassName(rawClassName);
    const classAliases = [...new Set([rawClassName, normalizedClassName, `Lớp ${normalizedClassName}`].filter(Boolean))];
    let receivedResponse = false;

    for (const requestedClass of classAliases) {
      try {
        const url = `${SCRIPT_URL}?className=${encodeURIComponent(requestedClass)}`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        addRows(await response.json());
        receivedResponse = true;
        if (names.size) break;
      } catch (error) {
        requestFailed = true;
        console.error(`Không thể tải học sinh lớp ${requestedClass} từ Google Sheets:`, error);
      }
    }
    requestFailed = requestFailed && !receivedResponse;
  }

  const compareVietnamese = (a, b) => a.localeCompare(b, "vi", { sensitivity: "base" });
  const getNameParts = fullName => String(fullName).trim().split(/\s+/).filter(Boolean);
  const sortedNames = [...names].sort((a, b) => {
    const partsA = getNameParts(a);
    const partsB = getNameParts(b);
    const nameComparison = compareVietnamese(partsA.pop() || "", partsB.pop() || "");
    if (nameComparison !== 0) return nameComparison;
    const middleA = partsA.reverse();
    const middleB = partsB.reverse();
    const length = Math.min(middleA.length, middleB.length);
    for (let i = 0; i < length; i++) {
      const middleComparison = compareVietnamese(middleA[i], middleB[i]);
      if (middleComparison !== 0) return middleComparison;
    }
    return middleA.length - middleB.length || compareVietnamese(a, b);
  });

  return { names: sortedNames, requestFailed };
}

async function populateClassOptions() {
  const select = document.getElementById("className");
  if (!select) return;

  const currentValue = normalizeClassName(select.value || state.className || "");
  select.disabled = true;
  select.replaceChildren();

  const loading = document.createElement("option");
  loading.value = "";
  loading.textContent = "Đang tải danh sách lớp...";
  select.appendChild(loading);

  const localClasses = [1, 2, 3, 4, 5, 6].flatMap(getAvailableClasses);
  const sheetNames = await getSpreadsheetSheetNames();
  const classes = [...new Set([
    ...localClasses,
    ...sheetNames.map(normalizeClassName).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));

  if (!select.isConnected) return;
  select.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = classes.length ? "-- Chọn lớp --" : "Chưa có lớp";
  select.appendChild(placeholder);

  classes.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  select.disabled = classes.length === 0;
  if (classes.includes(currentValue)) {
    select.value = currentValue;
    state.className = currentValue;
    state.grade = getGradeNumber(currentValue) || state.grade;
    await populateStudentOptions(currentValue);
  } else {
    select.value = "";
    state.className = "";
    await populateStudentOptions("");
  }
}

function parseCSV(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function importStudentCSV(text) {
  const rows = parseCSV(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("Tệp không có dữ liệu học sinh.");

  const headers = rows[0].map(normalizeHeader);
  const classIndex = headers.findIndex(header => ["class", "classname", "lop", "tenlop"].includes(header));
  const nameIndex = headers.findIndex(header => ["fullname", "name", "studentname", "hoten", "hovaten", "tenhocsinh"].includes(header));
  if (classIndex < 0 || nameIndex < 0) {
    throw new Error("Không tìm thấy cột lớp và họ tên. Hãy đặt tiêu đề là Lớp và Họ tên.");
  }

  const importedStudents = rows.slice(1)
    .map(row => ({
      className: normalizeClassName(row[classIndex] || ""),
      fullName: String(row[nameIndex] || "").trim()
    }))
    .filter(student => student.className && student.fullName);

  if (!importedStudents.length) throw new Error("Không có dòng nào chứa đủ thông tin lớp và họ tên.");

  let previousDb = null;
  try {
    previousDb = JSON.parse(localStorage.getItem("tinHocStudentData_v1") || "null");
  } catch (error) {
    console.warn("Không thể đọc dữ liệu học sinh cũ:", error);
  }

  const previousStudents = Array.isArray(previousDb?.students) ? previousDb.students : [];
  const mergedStudents = [...previousStudents];
  importedStudents.forEach((student, index) => {
    const existingIndex = mergedStudents.findIndex(saved =>
      normalizeClassName(saved?.className) === student.className &&
      String(saved?.fullName || "").trim().toLocaleLowerCase("vi") === student.fullName.toLocaleLowerCase("vi")
    );
    if (existingIndex >= 0) {
      mergedStudents[existingIndex] = {
        ...mergedStudents[existingIndex],
        fullName: student.fullName,
        className: student.className
      };
    } else {
      mergedStudents.push({
        studentId: `CSV${Date.now()}-${index + 1}`,
        fullName: student.fullName,
        className: student.className,
        grade: 5,
        exams: []
      });
    }
  });

  const db = {
    ...(previousDb && typeof previousDb === "object" ? previousDb : {}),
    version: previousDb?.version || "1.0",
    classInfo: { ...(previousDb?.classInfo || {}), name: importedStudents[0].className, grade: 5, description: "Dữ liệu nhập từ Excel" },
    students: mergedStudents
  };
  localStorage.setItem("tinHocStudentData_v1", JSON.stringify(db));
  localStorage.setItem("tinHocClasses_v1", JSON.stringify([...new Set(mergedStudents.map(student => normalizeClassName(student?.className)).filter(Boolean))]));
  return importedStudents.length;
}

async function populateStudentOptions(className = document.getElementById("className")?.value || "") {
  const select = document.getElementById("studentName");
  const classSelect = document.getElementById("className");
  if (!select || !classSelect) return;

  const selectedClass = normalizeClassName(className);
  select.replaceChildren();

  const loading = document.createElement("option");
  loading.value = "";
  loading.textContent = selectedClass ? "Đang tải danh sách học sinh..." : "Trước tiên hãy chọn lớp";
  select.appendChild(loading);
  select.disabled = true;
  if (!selectedClass) return;

  const result = await getStudentNamesForClass(selectedClass);
  if (!select.isConnected || normalizeClassName(classSelect.value) !== selectedClass) return;

  const { names, requestFailed } = result;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = names.length
    ? "-- Chọn học sinh --"
    : requestFailed
      ? "Không kết nối được nguồn dữ liệu học sinh"
      : "-- Lớp chưa có dữ liệu học sinh --";
  select.appendChild(placeholder);

  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });

  select.disabled = names.length === 0;
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
          <h1>${quiz.title}<br></h1>
          <form id="startForm" class="form-group">
            <div style="margin-bottom:16px;">
              <label>Chọn Lớp Học</label>
              <select id="className"></select>
            </div>

            <div>
              <label>Họ và Tên Dũng Sĩ <span style="color:#f44336;">*</span></label>
              <select id="studentName" required></select>
            </div>

            <div id="startError"></div>

            <button type="submit" class="btn btn-primary">BẮT ĐẦU CHƠI NGAY!</button>
          </form>
        </div>
      </div>
    </div>
  `;

  populateClassOptions();

  document.getElementById("className").onchange = event => {
    state.className = normalizeClassName(event.target.value);
    state.grade = getGradeNumber(state.className) || state.grade;
    state.name = "";
    populateStudentOptions(state.className);
  };

  document.getElementById("studentName").onchange = event => {
    state.name = event.target.value.trim();
  };

  document.getElementById("startForm").onsubmit = event => {
    event.preventDefault();
    const name = document.getElementById("studentName").value.trim();
    const className = document.getElementById("className").value.trim();
    const errorBox = document.getElementById("startError");

    if (!className) {
      errorBox.innerHTML = `<div class="error-msg">⚠️ Chưa có dữ liệu lớp. Vui lòng kiểm tra dữ liệu Excel đã được nhập vào hệ thống!</div>`;
      return;
    }

    if (!name) {
      errorBox.innerHTML = `<div class="error-msg">⚠️ Vui lòng chọn học sinh trong lớp đã chọn!</div>`;
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
  clearInterval(slideTimer);
  slideTimer = null;
  const slideDuration = Number(activeQuestions[state.index]?.duration);
  state.slideRemaining = Number.isFinite(slideDuration) && slideDuration > 0
    ? Math.floor(slideDuration)
    : 30;
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

function getScoredQuestionCount() {
  return activeQuestions.filter(question => question.type !== "slide").length;
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
  } else if (getInitialLives() > 0) {
    state.lives = Math.max(0, state.lives - 1);
  }

  render();
}

/* =========================================================
   CÂU TIẾP THEO
========================================================= */

function next() {
  if (getInitialLives() > 0 && state.lives <= 0) {
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

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function renderSlideContent(q) {
  const content = q.content ?? q.text ?? "";
  const formatSlideText = value => escapeHTML(value)
    .replace(/\r\n?|\n/g, "<br>")
    .replace(/&lt;br\s*\/?&gt;/gi, "<br>");

  if (!Array.isArray(content)) {
    return formatSlideText(content);
  }

  return content.map(line => {
    const item = typeof line === "string" ? { type: "p", text: line } : line;
    const type = String(item.type || "p").toLowerCase();
    const text = escapeHTML(item.text ?? item.content ?? "");

    if (type === "pic" || type === "image") {
      const width = Number(item.width);
      const widthStyle = Number.isFinite(width) && width > 0 ? ` style="width:${width}px"` : "";
      return `<img class="slide-image" src="${escapeHTML(item.src ?? "")}" alt="${escapeHTML(item.alt ?? "")}"${widthStyle}>`;
    }

    if (["h1", "h2", "h3"].includes(type)) {
      return `<${type} class="slide-${type}">${formatSlideText(item.text ?? item.content ?? "")}</${type}>`;
    }

    if (type === "p") {
      return `<p class="slide-paragraph">${formatSlideText(item.text ?? item.content ?? "")}</p>`;
    }

    const styles = [];
    if (Number.isFinite(Number(item.size)) && Number(item.size) > 0) {
      styles.push(`font-size:${Number(item.size)}px`);
    }
    if (item.color) styles.push(`color:${escapeHTML(item.color)}`);
    if (item.font) styles.push(`font-family:${escapeHTML(item.font)}`);
    if (item.bold) styles.push("font-weight:700");

    return `<div${styles.length ? ` style="${styles.join(";")}"` : ""}>${text.replace(/\r\n?|\n/g, "<br>")}</div>`;
  }).join("");
}

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

  /* SLIDE */
  if (q.type === "slide") {
    bodyHTML = `
      <div class="slide-content">${renderSlideContent(q)}</div>
      <div class="slide-controls">
        <span>Skip sau <strong id="slideCountdown">${state.slideRemaining}</strong> giây</span>
        <button class="btn btn-secondary" id="skipSlide" hidden>Skip</button>
      </div>
    `;
  }

  /* MULTIPLE CHOICE */
  else if (q.type === "multiple-choice") {
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
              ${getInitialLives() > 0 ? `<span class="stat-badge life"><svg class="heart-icon" aria-hidden="true"><use href="#heart-icon"></use></svg> ${state.lives}</span>` : ""}
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
                <div class="question-category">${q.category || (q.type === "slide" ? "Nội dung" : "")}</div>
                <h2 class="question-text">${q.type === "slide" ? (q.title || "Nội dung") : q.text}</h2>
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
  if (q.type === "slide") {
    const countdown = document.getElementById("slideCountdown");
    const skipButton = document.getElementById("skipSlide");
    skipButton.onclick = next;
    slideTimer = setInterval(() => {
      state.slideRemaining = Math.max(0, state.slideRemaining - 1);
      countdown.textContent = state.slideRemaining;

      if (state.slideRemaining === 0) {
        clearInterval(slideTimer);
        slideTimer = null;
        countdown.parentElement.textContent = "Bạn có thể bỏ qua nội dung này.";
        skipButton.hidden = false;
      }
    }, 1000);
  }

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
  const scoredQuestionCount = getScoredQuestionCount();
  const score10 = scoredQuestionCount
    ? Number((state.correct / scoredQuestionCount * 10).toFixed(1))
    : 0;
  const wrongAnswers = scoredQuestionCount - state.correct;
  const submittedAt = new Date().toISOString();

  const payload = {
    fullName: state.name,
    className: state.className,
    examTitle: quiz.title,
    gender: state.gender,
    score: score10,
    correctAnswers: state.correct,
    wrongAnswers,
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
        grade: state.grade,
        description: `Lớp Tin học nâng cao khối ${state.grade}`
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
    grade: state.grade,
    description: `Lớp Tin học nâng cao khối ${state.grade}`
  };

  let student = db.students.find(
    s => s.fullName === state.name && normalizeClassName(s.className) === normalizeClassName(state.className)
  );

  if (!student) {
    student = {
      studentId: "HS" + String(Date.now()).slice(-6),
      fullName: state.name,
      className: normalizeClassName(state.className) || "Năm 5",
      grade: state.grade,
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
    wrongAnswers,
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
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload)
    }).catch(error => console.error("Lỗi gửi Google Apps Script:", error));
  }
}

/* =========================================================
   MÀN HÌNH KẾT QUẢ & THẤT BẠI
========================================================= */

function renderResult() {
  const scoredQuestionCount = getScoredQuestionCount();
  const score10 = scoredQuestionCount
    ? (state.correct / scoredQuestionCount * 10).toFixed(1)
    : "0.0";

  app.innerHTML = `
    <div class="app">
      <div class="container">
        <div class="card result-card">
          <div class="trophy">🏆</div>
          <h1>HOÀN THÀNH THỬ THÁCH!</h1>
          <p>Chúc mừng <strong>${state.name}</strong> đã xuất sắc hoàn thành bài thi!</p>
          
          <div class="score-big">${score10} / 10 Điểm</div>
          
          <div class="info-box">
            <p><strong>Số câu đúng:</strong> ${state.correct} / ${getScoredQuestionCount()}</p>
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
            <p><strong>Số câu trả lời đúng:</strong> ${state.correct} / ${getScoredQuestionCount()}</p>
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
