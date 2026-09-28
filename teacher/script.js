

const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbzD2RrjPX50yqR06kh-0hVb_4ranZ4Im7v23JEv7urUtkW4NqnMeHfHup_qikC8LkGP/exec";

/* =========================================================
   CẤU HÌNH
========================================================= */

const SHUFFLE_QUESTIONS = false;
const SHUFFLE_ANSWERS = true;
const SHUFFLE_TRUE_FALSE = true;

let activeQuestions = [];
let trueFalseChoices = [true, false];
let teacherDraftQuestions = [];
let teacherDraftTitle = "";
let teacherDraftTeacherName = "";

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
  screen: "teacher",
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

  function addClass(name, explicitGrade) {
    const normalized = normalizeClassName(name);
    if (!normalized || /^Năm\s*[1-6]$/i.test(normalized)) return;

    const classGrade = Number(explicitGrade) || getGradeNumber(normalized);
    if (classGrade === Number(grade)) classes.set(normalized, normalized);
  }

  try {
    const savedClasses = JSON.parse(localStorage.getItem("tinHocClasses_v1") || "[]");
    if (Array.isArray(savedClasses)) {
      savedClasses.forEach(item => {
        if (typeof item === "string") addClass(item);
        else if (item && typeof item === "object") addClass(item.name || item.className, item.grade);
      });
    }

    const db = JSON.parse(localStorage.getItem("tinHocStudentData_v1") || "null");
    addClass(db?.classInfo?.name, db?.classInfo?.grade);

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
    const sheets = await response.json();
    return Array.isArray(sheets) ? sheets.filter(name => typeof name === "string") : [];
  } catch (error) {
    console.error("Không thể tải danh sách lớp từ Google Sheets:", error);
    return [];
  }
}

async function getStudentNamesForClass(className) {
  const names = new Set();

  try {
    const db = JSON.parse(localStorage.getItem("tinHocStudentData_v1") || "null");
    if (Array.isArray(db?.students)) {
      db.students.forEach(student => {
        if (normalizeClassName(student?.className) === normalizeClassName(className)) {
          const name = String(student?.fullName || student?.name || "").trim();
          if (name) names.add(name);
        }
      });
    }
  } catch (error) {
    console.error("Không thể đọc danh sách học sinh đã lưu:", error);
  }

  if (SCRIPT_URL) {
    try {
      const url = `${SCRIPT_URL}?className=${encodeURIComponent(className)}`;
      const response = await fetch(url, { cache: "no-store" });
      const rows = await response.json();
      if (Array.isArray(rows)) {
        rows.slice(1).forEach(row => {
          const name = Array.isArray(row) ? String(row[1] || "").trim() : "";
          if (name) names.add(name);
        });
      }
    } catch (error) {
      console.error("Không thể tải danh sách học sinh từ Google Sheets:", error);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, "vi"));
}

async function populateStudentOptions(className) {
  const studentSelect = document.getElementById("studentName");
  if (!studentSelect) return;

  studentSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = className ? "Đang tải danh sách học sinh..." : "Trước tiên hãy chọn lớp";
  studentSelect.appendChild(placeholder);
  studentSelect.disabled = true;

  if (!className) return;

  const names = await getStudentNamesForClass(className);
  if (!studentSelect.isConnected || normalizeClassName(document.getElementById("className")?.value) !== normalizeClassName(className)) return;

  studentSelect.replaceChildren();
  const optionPlaceholder = document.createElement("option");
  optionPlaceholder.value = "";
  optionPlaceholder.textContent = names.length ? "-- Chọn họ và tên --" : "Chưa có học sinh trong lớp này";
  studentSelect.appendChild(optionPlaceholder);

  names.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    studentSelect.appendChild(option);
  });
  studentSelect.disabled = names.length === 0;
}

async function populateClassOptions() {
  const classSelect = document.getElementById("className");
  if (!classSelect) return;

  const currentValue = normalizeClassName(classSelect.value || state.className);
  classSelect.disabled = true;
  classSelect.replaceChildren();

  const loading = document.createElement("option");
  loading.value = "";
  loading.textContent = "Đang tải danh sách lớp...";
  classSelect.appendChild(loading);

  const localClasses = [1, 2, 3, 4, 5, 6].flatMap(getAvailableClasses);
  const sheetNames = await getSpreadsheetSheetNames();
  const classes = [...new Set([
    ...localClasses,
    ...sheetNames.map(normalizeClassName).filter(Boolean)
  ])].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));

  if (!classSelect.isConnected) return;
  classSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = classes.length ? "-- Chọn lớp --" : "Chưa có lớp";
  classSelect.appendChild(placeholder);

  classes.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    classSelect.appendChild(option);
  });

  classSelect.disabled = classes.length === 0;
  if (classes.includes(currentValue)) {
    classSelect.value = currentValue;
    state.className = currentValue;
    state.grade = getGradeNumber(currentValue) || state.grade;
    await populateStudentOptions(currentValue);
  } else {
    classSelect.value = "";
    state.className = "";
    await populateStudentOptions("");
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
  renderTeacher();
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
              <label for="className">Chọn lớp</label>
              <select id="className"></select>
            </div>

            <div>
              <label for="studentName">Chọn họ và tên học sinh <span style="color:#f44336;">*</span></label>
              <select id="studentName" required disabled>
                <option value="">Trước tiên hãy chọn lớp</option>
              </select>
            </div>

            <div id="startError"></div>

            <button type="submit" class="btn btn-primary">BẮT ĐẦU CHƠI NGAY!</button>
          </form>
          <button type="button" id="teacherModeBtn" class="btn btn-secondary">📝 Giáo viên: Soạn bài tập</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("teacherModeBtn").onclick = () => {
    state.screen = "teacher";
    render();
  };

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
      errorBox.innerHTML = `<div class="error-msg">⚠️ Vui lòng chọn lớp!</div>`;
      return;
    }

    if (!name) {
      errorBox.innerHTML = `<div class="error-msg">⚠️ Vui lòng chọn họ và tên học sinh!</div>`;
      return;
    }

    state.name = name;
    state.className = normalizeClassName(className);
    errorBox.innerHTML = "";

    startExam();
  };
}

/* =========================================================
   CHỨC NĂNG GIÁO VIÊN: SOẠN BÀI TRẮC NGHIỆM
========================================================= */

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function renderTeacher() {
  const typeOptions = [
    ["multiple-choice", "Multiple choice — chọn một đáp án"],
    ["radio", "Radio — chọn một đáp án"],
    ["visual-choice", "Visual choice — chọn hình/biểu tượng"],
    ["fill-in-blank", "Fill in blank — điền vào chỗ trống"],
    ["multiple-select", "Multiple select / Checkbox — chọn nhiều đáp án"],
    ["matching", "Matching — ghép cặp"],
    ["binary", "Binary — đúng hoặc sai"],
    ["process-order", "Process order — sắp xếp thứ tự"]
  ];
  const typeLabels = Object.fromEntries(typeOptions);

  app.innerHTML = `
    <main class="teacher-workspace">
      <header class="teacher-topbar">
        <div class="teacher-brand"><span class="teacher-brand-icon">✦</span><span>KHÔNG GIAN GIÁO VIÊN</span></div>
      </header>
      <div class="teacher-layout">
        <section class="teacher-intro-panel">
          <span class="teacher-eyebrow">QUESTION BUILDER</span>
          <h1>Tạo bài tập<br><span>theo cách của bạn.</span></h1>
          <p>Soạn câu hỏi, chọn dạng trả lời phù hợp rồi lưu bài vào Google Sheets.</p>
        </section>

        <section class="teacher-editor">
          <div class="teacher-editor-heading">
            <div><span class="teacher-eyebrow">BÀI TẬP MỚI</span><h2>Thông tin bài soạn</h2></div>
            <span class="teacher-count">${teacherDraftQuestions.length} câu hỏi</span>
          </div>
          <div class="teacher-meta-grid">
            <div class="teacher-field"><label for="teacherName">Tên giáo viên</label><input id="teacherName" type="text" value="${escapeHTML(teacherDraftTeacherName)}" placeholder="Ví dụ: Cô Lan" required></div>
            <div class="teacher-field"><label for="teacherQuizTitle">Tên bài tập</label><input id="teacherQuizTitle" type="text" value="${escapeHTML(teacherDraftTitle)}" placeholder="Nhập tên bài tập" required></div>
          </div>

          <form id="teacherQuestionForm" class="teacher-question-form">
            <div class="teacher-question-form-heading"><span class="teacher-step">01</span><div><h3>Soạn câu hỏi</h3><p>Chọn dạng câu hỏi; biểu mẫu sẽ thay đổi theo dạng đã chọn.</p></div></div>
            <div class="teacher-field"><label for="teacherCategory">Chủ đề</label><input id="teacherCategory" name="category" type="text" placeholder="Ví dụ: An toàn thông tin" required></div>
            <div class="teacher-field"><label for="teacherQuestionText">Nội dung câu hỏi</label><textarea id="teacherQuestionText" name="questionText" rows="3" placeholder="Nhập câu hỏi..." required></textarea></div>
            <div class="teacher-field teacher-type-field"><label for="teacherQuestionType">Dạng câu hỏi</label><select id="teacherQuestionType" name="questionType">${typeOptions.map(([type, label]) => `<option value="${type}">${escapeHTML(label)}</option>`).join("")}</select></div>
            <div id="teacherTypeFields"></div>
            <div class="teacher-field"><label for="teacherExplain">Giải thích <span>(không bắt buộc)</span></label><textarea id="teacherExplain" name="explain" rows="2" placeholder="Giải thích đáp án đúng..."></textarea></div>
            <button type="submit" class="teacher-add-button">＋ Thêm câu hỏi vào bài</button>
          </form>

          <section class="teacher-question-list">
            <div class="teacher-list-heading"><h3>Câu hỏi trong bài</h3><span>${teacherDraftQuestions.length}</span></div>
            ${teacherDraftQuestions.length ? `<ol>${teacherDraftQuestions.map((question, index) => `
              <li><div><span class="teacher-question-type-tag">${escapeHTML(typeLabels[question.type] || question.type)}</span><span>${escapeHTML(question.text)}</span></div><button type="button" class="teacher-remove-question" data-remove-question="${index}" aria-label="Xóa câu hỏi">Xóa</button></li>
            `).join("")}</ol>` : `<p class="teacher-empty-list">Chưa có câu hỏi. Hoàn thành biểu mẫu phía trên để thêm câu đầu tiên.</p>`}
          </section>

          <div id="teacherSaveStatus" class="teacher-save-status" role="status" aria-live="polite"></div>
          <div class="teacher-actions">
            <button type="button" id="saveTeacherQuiz" class="teacher-save-button" ${teacherDraftQuestions.length ? "" : "disabled"}>Lưu bài vào Google Sheets</button>
          </div>
        </section>
      </div>
    </main>
  `;

  const typeSelect = document.getElementById("teacherQuestionType");
  const typeFields = document.getElementById("teacherTypeFields");
  const renderTypeFields = () => {
    const type = typeSelect.value;
    if (["multiple-choice", "radio", "visual-choice", "multiple-select"].includes(type)) {
      const visual = type === "visual-choice";
      typeFields.innerHTML = `
        <div class="teacher-options-grid">
          ${[0, 1, 2, 3].map(index => `
            <div class="teacher-field"><label for="teacherOption${index}">Đáp án ${String.fromCharCode(65 + index)}</label><input id="teacherOption${index}" name="option${index}" type="text" placeholder="Nhập lựa chọn ${String.fromCharCode(65 + index)}" required></div>
            ${visual ? `<div class="teacher-field"><label for="teacherIcon${index}">Biểu tượng ${String.fromCharCode(65 + index)}</label><input id="teacherIcon${index}" name="icon${index}" type="text" placeholder="Ví dụ: 💻" required></div>` : ""}
          `).join("")}
        </div>
        <fieldset class="teacher-correct-field"><legend>${type === "multiple-select" ? "Chọn các đáp án đúng" : "Chọn một đáp án đúng"}</legend><div id="teacherCorrectOptions"></div></fieldset>
      `;
      updateCorrectOptions();
      [0, 1, 2, 3].forEach(index => {
        document.getElementById(`teacherOption${index}`).oninput = updateCorrectOptions;
      });
    } else if (type === "fill-in-blank") {
      typeFields.innerHTML = `<div class="teacher-field"><label for="teacherAnswers">Các câu trả lời được chấp nhận</label><textarea id="teacherAnswers" name="answers" rows="3" placeholder="Mỗi đáp án đúng trên một dòng" required></textarea></div>`;
    } else if (type === "matching") {
      typeFields.innerHTML = `<p class="teacher-save-status">Nhập các cặp tương ứng ở hai cột.</p><div class="teacher-options-grid">${[0, 1, 2, 3].map(index => `<div class="teacher-field"><label for="matchLeft${index}">Cột A — mục ${index + 1}</label><input id="matchLeft${index}" name="matchLeft${index}" required></div><div class="teacher-field"><label for="matchRight${index}">Cột B — đáp án ${index + 1}</label><input id="matchRight${index}" name="matchRight${index}" required></div>`).join("")}</div>`;
    } else if (type === "binary") {
      typeFields.innerHTML = `<div class="teacher-options-grid">${[0, 1, 2, 3].map(index => `<div class="teacher-field"><label for="binaryText${index}">Nhận định ${index + 1}</label><input id="binaryText${index}" name="binaryText${index}" required></div><div class="teacher-field"><label for="binaryCorrect${index}">Đáp án đúng</label><select id="binaryCorrect${index}" name="binaryCorrect${index}"><option value="true">Đúng</option><option value="false">Sai</option></select></div>`).join("")}</div>`;
    } else {
      typeFields.innerHTML = `<div class="teacher-field"><label for="orderStep0">Các bước theo đúng thứ tự</label><textarea id="orderStep0" name="steps" rows="5" placeholder="Mỗi bước trên một dòng, theo thứ tự đúng" required></textarea></div>`;
    }
  };

  function updateCorrectOptions() {
    const correctOptions = document.getElementById("teacherCorrectOptions");
    if (!correctOptions) return;
    const type = typeSelect.value;
    const optionLabels = [0, 1, 2, 3].map(index => {
      const text = document.getElementById(`teacherOption${index}`)?.value.trim();
      return text || `Đáp án ${String.fromCharCode(65 + index)}`;
    });
    const inputType = type === "multiple-select" ? "checkbox" : "radio";
    correctOptions.innerHTML = optionLabels.map((label, index) => `
      <label class="teacher-correct-option"><input type="${inputType}" name="correctOption" value="${index}" ${inputType === "radio" && index === 0 ? "checked" : ""}><span>${String.fromCharCode(65 + index)}.</span><span>${escapeHTML(label)}</span></label>
    `).join("");
  }

  typeSelect.onchange = renderTypeFields;
  renderTypeFields();

  document.getElementById("teacherQuestionForm").onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const type = String(data.get("questionType"));
    const question = {
      type,
      category: String(data.get("category") || "").trim(),
      text: String(data.get("questionText") || "").trim(),
      explain: String(data.get("explain") || "").trim()
    };

    if (["multiple-choice", "radio", "visual-choice", "multiple-select"].includes(type)) {
      question.options = [0, 1, 2, 3].map(index => String(data.get(`option${index}`) || "").trim());
      const correctAnswers = data.getAll("correctOption").map(Number);
      if (!correctAnswers.length) {
        document.getElementById("teacherSaveStatus").textContent = "Hãy chọn ít nhất một đáp án đúng.";
        return;
      }
      if (type === "multiple-select") question.multipleCorrect = correctAnswers;
      else question.correct = correctAnswers[0];
      if (type === "visual-choice") question.icons = [0, 1, 2, 3].map(index => String(data.get(`icon${index}`) || "").trim());
    } else if (type === "fill-in-blank") {
      question.answers = String(data.get("answers") || "").split(/\n+/).map(answer => answer.trim()).filter(Boolean);
    } else if (type === "matching") {
      question.pairs = [0, 1, 2, 3].map(index => [String(data.get(`matchLeft${index}`)).trim(), String(data.get(`matchRight${index}`)).trim()]);
    } else if (type === "binary") {
      question.items = [0, 1, 2, 3].map(index => [String(data.get(`binaryText${index}`)).trim(), data.get(`binaryCorrect${index}`) === "true"]);
    } else if (type === "process-order") {
      question.steps = String(data.get("steps") || "").split(/\n+/).map(step => step.trim()).filter(Boolean);
      question.correct = question.steps.map((_, index) => index);
    }

    teacherDraftTeacherName = document.getElementById("teacherName").value.trim();
    teacherDraftTitle = document.getElementById("teacherQuizTitle").value.trim();
    teacherDraftQuestions.push(question);
    renderTeacher();
  };

  document.querySelectorAll("[data-remove-question]").forEach(button => {
    button.onclick = () => {
      teacherDraftQuestions.splice(Number(button.dataset.removeQuestion), 1);
      renderTeacher();
    };
  });

  document.getElementById("saveTeacherQuiz").onclick = async () => {
    const status = document.getElementById("teacherSaveStatus");
    teacherDraftTeacherName = document.getElementById("teacherName").value.trim();
    teacherDraftTitle = document.getElementById("teacherQuizTitle").value.trim();
    const teacherName = teacherDraftTeacherName;
    if (!teacherName || !teacherDraftTitle || teacherDraftQuestions.length === 0) {
      status.textContent = "Vui lòng nhập tên giáo viên, tên bài và thêm ít nhất một câu hỏi.";
      return;
    }

    const saveButton = document.getElementById("saveTeacherQuiz");
    saveButton.disabled = true;
    status.textContent = "Đang gửi bài soạn...";
    try {
      await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "saveTeacherQuiz",
          id: `quiz-${Date.now()}`,
          teacherName,
          quizTitle: teacherDraftTitle,
          questions: teacherDraftQuestions,
          createdAt: new Date().toISOString()
        })
      });
      status.textContent = "Đã gửi yêu cầu lưu. Hãy kiểm tra Google Sheets để xác nhận bài đã được lưu.";
    } catch (error) {
      console.error("Không gửi được bài soạn:", error);
      status.textContent = "Không gửi được bài. Hãy kiểm tra kết nối và URL Apps Script.";
      saveButton.disabled = false;
    }
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
    gender: state.gender,
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
        name: state.className,
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
    name: normalizeClassName(state.className),
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
      className: normalizeClassName(state.className),
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
      headers: { "Content-Type": "text/plain" },
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
          <p>Chúc mừng <strong>${state.name}</strong> đã xuất sắc hoàn thành bài thi!</p>
          
          <div class="score-big">${score10} / 10 Điểm</div>
          
          <div class="info-box">
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
