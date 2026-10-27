
'use strict';

/* =========================================
   SPARE PARTS & MACHINERY CATALOG
   GitHub Pages + Supabase
   ========================================= */

// ---------- Utilities ----------

const $ = selector => document.querySelector(selector);

const esc = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]
  );

const PAGE_SIZE = 12;

// ---------- Application State ----------

let db = {
  records: [],
  photos: [],
  categories: []
};

let page = 'dashboard';
let q = '';
let cat = '';
let kind = 'all';
let offset = 0;
let detail = null;
let form = null;
let busy = false;
let initialRoute = true;

let selected = new Set();
let qrSelected = new Set();

let reportKind = 'part';
let reportQuery = '';
let reportCategory = '';

let qrKind = 'part';
let qrCategory = '';

// ---------- Navigation ----------

const nav = [
  ['dashboard', '⌂', 'Dashboard'],
  ['catalog', '▤', 'Catalog'],
  ['machines', '⚙', 'เครื่องจักร'],
  ['add', '+', 'เพิ่มอะไหล่/เครื่องจักร'],
  ['qr', '▦', 'QR Code'],
  ['reports', '▥', 'รายงานสรุป']
];

// ---------- Form Fields ----------

const fields = {
  machine: [
    ['equipment', 'Equipment no.'],
    ['item', 'Item number'],
    ['serial', 'Serial no.'],
    ['description', 'Description']
  ],

  part: [
    ['remark', 'Remark'],
    ['description', 'Description'],
    ['category', 'Category / หมวดหมู่'],
    ['price', 'Unit price (บาท/หน่วย)'],
    ['supplier', 'Supplier'],
    ['note', 'Note / หมายเหตุ']
  ]
};



// ---------- Messages ----------

function msg(text = '', error = false) {
  const element = $('#message');

  if (!element) return;

  element.textContent = text;
  element.className = error ? 'error' : '';
}

// ---------- API ----------

async function api(url, options = {}) {
  return CatalogAPI.request(url, options);
}

// ---------- Load Data ----------

async function load() {
  try {
    db = await api('/api/catalog');

    db.records.sort(compareRecords);

    if (initialRoute) {
      const params = new URLSearchParams(location.search);

      if (params.get('record')) {
        detail = params.get('record');
      }

      if (params.get('category')) {
        page = 'catalog';
        cat = params.get('category');
      }

      initialRoute = false;
    }

    render();
  } catch (error) {
    msg(error.message, true);

    $('#content').innerHTML = `
      <section class="box">
        <h2>เชื่อมต่อฐานข้อมูล</h2>
        <p>กรุณาตรวจสอบ config.js และการเชื่อมต่อ Supabase</p>
        <p>จากนั้นกดโหลดข้อมูลล่าสุดอีกครั้ง</p>
      </section>
    `;
  }
}

// ---------- Data Helpers ----------

function photos(record) {
  return db.photos.filter(
    photo => photo.recordId === record.id
  );
}

function rel(record) {
  const ids = record.related || [];

  return db.records.filter(
    item => ids.includes(item.id)
  );
}

function name(record) {
  return record.data.description || record.code;
}

function money(value) {
  if (value === '' || value == null) {
    return '—';
  }

  return (
    Number(value).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' บาท'
  );
}

function machineLabel(record) {
  return (
    record.code +
    ' · Serial: ' +
    (record.serial || '—') +
    ' · ' +
    name(record)
  );
}

function compareRecords(a, b) {
  return (
    String(a.code || '').localeCompare(
      String(b.code || ''),
      'en',
      { numeric: true, sensitivity: 'base' }
    ) ||
    String(a.serial || '').localeCompare(
      String(b.serial || ''),
      'en',
      { numeric: true }
    )
  );
}

function photoUrl(photo) {
  return esc(photo.url || '');
}

// ---------- Page Navigation ----------

function go(nextPage) {
  page = nextPage;
  detail = null;
  q = '';
  cat = '';
  kind = 'all';
  offset = 0;

  history.replaceState(null, '', location.pathname);

  msg();
  render();

  window.scrollTo(0, 0);
}

// ---------- Page Heading ----------

function heading(title, subtitle = '', actions = '') {
  return `
    <div class="heading no-print">
      <div>
        <h1>${title}</h1>
        ${
          subtitle &&
          subtitle !== 'Spare Parts & Machinery Catalog'
            ? `<p>${subtitle}</p>`
            : ''
        }
      </div>

      <div class="actions">
        ${actions}
      </div>
    </div>
  `;
}

// ---------- Horizontal Record List ----------


function cards(records) {
  if (!records.length) {
    return '<div class="empty">ไม่พบข้อมูล</div>';
  }

  return `
    <div class="catalog-compact-list">
      ${records.map(record => `
        <div class="catalog-compact-item">
          <span class="catalog-compact-name">
            ${esc(name(record))}
          </span>

          <button
            type="button"
            class="primary"
            data-open="${esc(record.id)}"
          >
            ดูรายละเอียด
          </button>
        </div>
      `).join('')}
    </div>
  `;
}


// ---------- Categories ----------

function categories() {
  return `
    <section class="box">
      <h2>หมวดหมู่อะไหล่</h2>

      <div class="cats">
        ${db.categories.map(category => {
          const count = db.records.filter(
            record =>
              record.kind === 'part' &&
              record.data.category === category.code
          ).length;

          return `
            <button
              class="cat ${cat === category.code ? 'selected' : ''}"
              data-cat="${esc(category.code)}"
            >
              <strong>${esc(category.code)}</strong>
              <span>${esc(category.name)}</span>
              <span>${count} รายการ</span>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

// ---------- Search ----------

function filterRecords() {
  const search = q.trim().toLowerCase();

  return db.records.filter(record => {
    if (page === 'machines' && record.kind !== 'machine') {
      return false;
    }

    if (page === 'catalog' && record.kind !== 'part') {
      return false;
    }

    if (kind !== 'all' && record.kind !== kind) {
      return false;
    }

    if (
      cat &&
      (
        record.kind !== 'part' ||
        record.data.category !== cat
      )
    ) {
      return false;
    }

    const searchable = [
      record.code,
      record.serial,
      ...Object.values(record.data)
    ].join(' ').toLowerCase();

    return searchable.includes(search);
  });
}

// ---------- Pagination ----------


/* แสดงรายการทั้งหมดต่อเนื่อง ไม่แบ่งหน้า */
function paged(records, container = '#results') {
  const element = document.querySelector(container);

  if (!element) return;

  element.innerHTML = `
    ${cards(records)}

    <div class="catalog-total">
      แสดงทั้งหมด ${records.length.toLocaleString('th-TH')} รายการ
    </div>
  `;
}


// ---------- Main Render ----------

function render() {
  $('#nav').innerHTML = nav.map(
    ([id, icon, label]) => `
      <button
        data-page="${id}"
        class="${page === id ? 'active' : ''}"
      >
        ${icon}　${label}
      </button>
    `
  ).join('');

  const element = $('#content');

  if (detail) {
    renderDetail();
    return;
  }

  if (['dashboard', 'catalog', 'machines'].includes(page)) {
    const machines = db.records.filter(
      record => record.kind === 'machine'
    );

    const parts = db.records.filter(
      record => record.kind === 'part'
    );

    const title =
      page === 'dashboard'
        ? 'Dashboard'
        : page === 'catalog'
          ? 'Catalog'
          : 'เครื่องจักร';

    const actions = `
      <button data-import>นำเข้า Excel</button>

      <a class="button" href="#" data-export>
        ส่งออก Excel
      </a>

      <button class="primary" data-page="add">
        + เพิ่มข้อมูล
      </button>
    `;

    let stats = '';

    if (page === 'dashboard') {
      const values = [
        ['⚙', 'เครื่องจักรทั้งหมด', machines.length],
        ['◉', 'อะไหล่ทั้งหมด', parts.length],
        ['▤', 'หมวดหมู่ทั้งหมด', db.categories.length]
      ];

      stats = `
        <div class="stats">
          ${values.map(([icon, label, count]) => `
            <div class="stat">
              <div class="icon">${icon}</div>

              <div>
                ${label}
                <strong>${count.toLocaleString('th-TH')}</strong>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    element.innerHTML = `
      ${heading(title, '', actions)}

      ${stats}

      <div class="search no-print">
        <input
          id="query"
          name="catalog-search-no-history"
          type="search"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          value="${esc(q)}"
          placeholder="ค้นหารหัส รายละเอียด Item number หรือ Serial no."
          aria-label="ค้นหา"
        >

        ${page === 'dashboard' ? `
          <select id="kind">
            <option value="all">ทั้งหมด</option>
            <option value="machine">เครื่องจักร</option>
            <option value="part">อะไหล่</option>
          </select>
        ` : ''}

        <button id="search-button" class="primary">
          ค้นหา
        </button>

        <button data-clear>
          ล้างตัวกรอง
        </button>
      </div>

      ${page !== 'machines' ? categories() : ''}

      <section class="box">
        <h2>
          ${page === 'machines'
            ? 'รายการเครื่องจักร'
            : 'รายการแคตตาล็อก'}
          ${cat ? '· ' + esc(cat) : ''}
        </h2>

        <div id="results" aria-live="polite"></div>
      </section>
    `;

    if ($('#kind')) {
      $('#kind').value = kind;
    }

    paged(filterRecords());

    $('#query').oninput = event => {
      q = event.target.value;
      offset = 0;
      paged(filterRecords());
    };

    
  const searchAndOpen = () => {
      q = $('#query').value.trim();
      offset = 0;

    const matches = filterRecords();

    const exactMatch = matches.find(record =>
      String(record.code || '').trim().toLowerCase() === q.toLowerCase()
    );

    if (exactMatch) {
      detail = exactMatch.id;
      render();
      window.scrollTo(0, 0);
     return;
    }

      paged(matches);
  };

    $('#search-button').onclick = searchAndOpen;

    $('#query').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        searchAndOpen();
      }
    });


    $('#query').addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        $('#search-button').click();
        $('#query').blur();
      }
    });

    if ($('#kind')) {
      $('#kind').onchange = event => {
        kind = event.target.value;

        if (kind !== 'part') {
          cat = '';
        }

        offset = 0;
        render();
      };
    }
  } else if (page === 'add') {
    element.innerHTML = `
      ${heading(
        'เพิ่มอะไหล่/เครื่องจักร',
        'เลือกประเภทข้อมูลที่ต้องการเพิ่ม'
      )}

      <div class="actions">
        <button class="primary" data-new="part">
          + เพิ่มอะไหล่
        </button>

        <button data-new="machine">
          + เพิ่มเครื่องจักร
        </button>

        <button data-import>
          นำเข้า Excel
        </button>
      </div>

      <section class="box" style="margin-top:20px">
        <p>
          เครื่องจักรตรวจซ้ำด้วย Equipment no. คู่กับ Serial no.
          อะไหล่ตรวจซ้ำด้วย Remark
        </p>
      </section>
    `;
  } else if (page === 'qr') {
    renderQr();
  } else {
    renderReports();
  }

  element.insertAdjacentHTML(
    'beforeend',
    '<footer>SPARE PARTS & MACHINERY CATALOG</footer>'
  );
}

// ---------- Record Detail ----------

function renderDetail() {
  const record = db.records.find(
    item => item.id === detail
  );

  if (!record) {
    detail = null;
    msg('ไม่พบข้อมูล', true);
    render();
    return;
  }

  const isMachine = record.kind === 'machine';
  const images = photos(record);

  const actions = `
    <button data-back>← กลับหน้าค้นหา</button>
    <button data-edit="${esc(record.id)}">แก้ไข</button>
    <button class="danger" data-delete="${esc(record.id)}">
      ลบ
    </button>
  `;

  const mainImage = isMachine
    ? ''
    : `
      <div>
        ${images[0]
          ? `<img
              class="detailimg"
              src="${photoUrl(images[0])}"
              alt="${esc(name(record))}"
            >`
          : '<div class="empty">ยังไม่มีรูปภาพ</div>'
        }
      </div>
    `;

  const details = fields[record.kind].map(
    ([key, label]) => `
      <div>
        <span>${label}</span>
        <strong>
          ${key === 'price'
            ? money(record.data[key])
            : esc(record.data[key] || '—')}
        </strong>
      </div>
    `
  ).join('');

  const gallery = isMachine
    ? ''
    : `
      <section class="box">
        <div class="row">
          <h2>รูปภาพ</h2>

          <div class="actions">
            <label class="button">
              เลือกภาพ
              <input
                hidden
                id="gallery-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
              >
            </label>

            <label class="button">
              ถ่ายรูป
              <input
                hidden
                id="camera-file"
                type="file"
                accept="image/*"
                capture="environment"
              >
            </label>
          </div>
        </div>

        <p>JPG, PNG หรือ WebP ไม่เกิน 10 MB ต่อรูป</p>

        <div class="gallery">
          ${images.map(photo => `
            <div>
              <img
                src="${photoUrl(photo)}"
                alt="${esc(photo.name)}"
              >

              <button
                class="danger"
                data-delete-photo="${esc(photo.id)}"
              >
                ลบรูป
              </button>
            </div>
          `).join('')}
        </div>
      </section>
    `;

  $('#content').innerHTML = `
    ${heading(
      esc(name(record)),
      esc(record.code) +
        (isMachine
          ? ' · Serial: ' + esc(record.serial || '—')
          : ''),
      actions
    )}

    <section class="box detail ${isMachine ? 'machine-detail' : ''}">
      ${mainImage}

      <div class="details">
        ${details}
      </div>
    </section>

    ${gallery}

    <section class="box">
      <h2>
        ${isMachine ? 'อะไหล่' : 'เครื่องจักร'}ที่เกี่ยวข้อง
        (${(record.related || []).length})
      </h2>

      ${cards(rel(record))}
    </section>
  `;

  if ($('#gallery-file')) {
    $('#gallery-file').onchange = uploadPhotos;
  }

  if ($('#camera-file')) {
    $('#camera-file').onchange = uploadPhotos;
  }
}

// ---------- Add / Edit Form ----------



function openForm(record, recordKind = 'part') {
  form = record
    ? {
        ...record,
        data: { ...record.data },
        related: [...(record.related || [])]
      }
    : {
        kind: recordKind,
        data: {
          category: db.categories[0]?.code || ''
        },
        related: []
      };

  const formFields = fields[form.kind].map(([key, label]) => {
    const required = [
      'equipment',
      'remark',
      'description',
      'category'
    ].includes(key);

    if (key === 'category') {
      return `
        <label class="field">
          ${label} *
          <select data-field="category" required>
            ${db.categories.map(category => `
              <option
                value="${esc(category.code)}"
                ${form.data.category === category.code
                  ? 'selected'
                  : ''}
              >
                ${esc(category.code + ' — ' + category.name)}
              </option>
            `).join('')}
          </select>
        </label>

        <div class="category-add-row">
          <button
            type="button"
            id="add-category-button"
            class="category-add-button"
          >
            + เพิ่มหมวดหมู่
          </button>
        </div>

        <div
          id="new-category-panel"
          class="new-category-panel"
          hidden
        >
          <div class="new-category-title">
            เพิ่มหมวดหมู่ใหม่
          </div>

          <div class="category-input-row">
            <label class="field">
              รหัสหมวดหมู่ใหม่
              <input
                id="new-category-code"
                maxlength="20"
                placeholder="เช่น 70MAC"
              >
            </label>

            <label class="field">
              ชื่อหมวดหมู่ใหม่
              <input
                id="new-category-name"
                maxlength="200"
                placeholder="ชื่อหมวดหมู่"
              >
            </label>
          </div>

          <div class="new-category-actions">
            <button
              type="button"
              id="cancel-category-button"
            >
              ยกเลิก
            </button>

            <button
              type="button"
              id="save-category-button"
              class="primary"
            >
              บันทึกหมวดหมู่
            </button>
          </div>

          <p id="category-error" role="alert"></p>
        </div>
      `;
    }

    return `
      <label class="field">
        ${label}${required ? ' *' : ''}
        <input
          data-field="${key}"
          value="${esc(form.data[key] ?? '')}"
          ${required ? 'required' : ''}
          ${key === 'price'
            ? 'type="number" min="0" step="0.01"'
            : ''}
          maxlength="2000"
        >
      </label>
    `;
  }).join('');

  $('#modal-body').innerHTML = `
    <div class="row">
      <h2>
        ${record ? 'แก้ไข' : 'เพิ่ม'}
        ${form.kind === 'part' ? 'อะไหล่' : 'เครื่องจักร'}
      </h2>

      <button type="button" data-close>✕ ปิด</button>
    </div>

    <form id="edit-form">
      <div class="formgrid">
        ${formFields}
      </div>

      <h3 style="margin-top:24px">
        ${form.kind === 'part' ? 'เครื่องจักร' : 'อะไหล่'}
        ที่เกี่ยวข้อง
      </h3>

      <input
        id="link-query"
        aria-label="ค้นหารายการที่เกี่ยวข้อง"
        placeholder="ค้นหารหัส รายละเอียด หรือ Serial no."
      >

      <p id="link-count"></p>
      <div class="linklist" id="link-list"></div>

      <div class="row" style="margin-top:22px">
        <span>เลือกได้หลายรายการ</span>

        <button
          type="submit"
          id="save-button"
          class="primary"
        >
          บันทึกข้อมูล
        </button>
      </div>

      <p id="form-error" role="alert"></p>
    </form>
  `;

  if (form.kind === 'part') {
    const select = $('[data-field="category"]');
    const addButton = $('#add-category-button');
    const panel = $('#new-category-panel');
    const cancelButton = $('#cancel-category-button');
    const saveButton = $('#save-category-button');
    const codeInput = $('#new-category-code');
    const nameInput = $('#new-category-name');
    const errorText = $('#category-error');

    addButton.onclick = () => {
      panel.hidden = !panel.hidden;

      if (!panel.hidden) {
        codeInput.focus();
      }
    };

    cancelButton.onclick = () => {
      panel.hidden = true;
      codeInput.value = '';
      nameInput.value = '';
      errorText.textContent = '';
    };

    saveButton.onclick = async () => {
      const code = codeInput.value.trim().toUpperCase();
      const categoryName = nameInput.value.trim();

      errorText.textContent = '';

      if (!code || !categoryName) {
        errorText.textContent =
          'กรุณากรอกรหัสและชื่อหมวดหมู่ให้ครบ';
        return;
      }

      if (code.length > 20) {
        errorText.textContent =
          'รหัสหมวดหมู่ต้องไม่เกิน 20 ตัวอักษร';
        return;
      }

      const exists = db.categories.some(
        category =>
          category.code.toUpperCase() === code
      );

      if (exists) {
        errorText.textContent =
          'รหัสหมวดหมู่นี้มีอยู่แล้ว';
        return;
      }

      saveButton.disabled = true;
      saveButton.textContent = 'กำลังบันทึก...';

      try {
        await CatalogAPI.createCategory(
          code,
          categoryName
        );

        db.categories.push({
          code,
          name: categoryName
        });

        const option = new Option(
          code + ' — ' + categoryName,
          code
        );

        select.add(option);
        select.value = code;
        form.data.category = code;

        panel.hidden = true;
        codeInput.value = '';
        nameInput.value = '';

      } catch (error) {
        errorText.textContent =
          error.message || 'บันทึกหมวดหมู่ไม่สำเร็จ';

      } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'บันทึกหมวดหมู่';
      }
    };
  }

  showLinks('');

  $('#link-query').oninput = event => {
    showLinks(event.target.value);
  };

  $('#edit-form').onsubmit = saveForm;

  $('#modal').showModal();
}


// ---------- Related Records ----------

function showLinks(search) {
  const candidates = db.records.filter(record => {
    if (record.kind === form.kind) {
      return false;
    }

    const text = [
      record.code,
      record.serial,
      ...Object.values(record.data)
    ].join(' ').toLowerCase();

    return text.includes(search.toLowerCase());
  });

  const updateCount = () => {
    $('#link-count').textContent =
      `พบ ${candidates.length} รายการ · ` +
      `เลือกแล้ว ${form.related.length} รายการ`;
  };

  updateCount();

  $('#link-list').innerHTML = candidates.map(
    record => `
      <label class="check">
        <input
          type="checkbox"
          data-link="${esc(record.id)}"
          ${form.related.includes(record.id) ? 'checked' : ''}
        >

        <span>
          ${esc(
            record.kind === 'machine'
              ? machineLabel(record)
              : record.code + ' · ' + name(record)
          )}
        </span>
      </label>
    `
  ).join('') || '<div class="empty">ไม่พบข้อมูล</div>';

  $('#link-list').onchange = event => {
    const id = event.target.dataset.link;

    if (!id) return;

    if (event.target.checked) {
      form.related = [
        ...new Set([...form.related, id])
      ];
    } else {
      form.related = form.related.filter(
        value => value !== id
      );
    }

    updateCount();
  };
}

// ---------- Save Form ----------

async function saveForm(event) {
  event.preventDefault();

  if (busy) return;

  busy = true;
  $('#save-button').disabled = true;

  try {
    $('#edit-form')
      .querySelectorAll('[data-field]')
      .forEach(input => {
        form.data[input.dataset.field] = input.value;
      });

    const result = await api('/api/catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(form)
    });

    $('#modal').close();

    detail = result.id;

    await load();

    msg('บันทึกข้อมูลเรียบร้อย');
  } catch (error) {
    $('#form-error').textContent = error.message;
  } finally {
    busy = false;

    if ($('#save-button')) {
      $('#save-button').disabled = false;
    }
  }
}

// ---------- Photo Upload ----------

async function uploadPhotos(event) {
  if (busy) return;

  busy = true;
  let done = 0;

  try {
    for (const file of event.target.files) {
      const data = new FormData();

      data.set('recordId', detail);
      data.set('file', file);

      await api('/api/photos', {
        method: 'POST',
        body: data
      });

      done++;
    }

    await load();

    msg(`เพิ่มรูปภาพ ${done} รูปเรียบร้อย`);
  } catch (error) {
    await load();

    msg(
      `เพิ่มสำเร็จ ${done} รูป\n${error.message}`,
      true
    );
  } finally {
    busy = false;
  }
}

// ---------- Excel Import ----------

function importDialog() {
  $('#modal-body').innerHTML = `
    <div class="row">
      <h2>นำเข้า Excel</h2>
      <button data-close>✕ ปิด</button>
    </div>

    <form id="import-form">
      <label class="field">
        ประเภทข้อมูล

        <select name="kind">
          <option value="part">อะไหล่</option>
          <option value="machine">เครื่องจักร</option>
        </select>
      </label>

      <p>
        เลือกชีตแรกที่มีหัวคอลัมน์ตรงกับไฟล์ต้นฉบับ
        นำเข้าได้สูงสุด 5,000 รายการ / 15 MB
      </p>

      <input
        type="file"
        name="file"
        accept=".xlsx"
        required
      >

      <label class="check">
        <input
          type="checkbox"
          name="update"
          value="1"
        >
        อัปเดตรายการเดิมที่รหัสตรงกัน
      </label>

      <p>
        เครื่องจักรจับคู่ด้วย Equipment no. + Serial no.
        รายการที่เกี่ยวข้องและรูปเดิมจะคงอยู่
      </p>

      <button id="import-button" class="primary">
        ยืนยันนำเข้า
      </button>

      <p id="import-error" role="alert"></p>
    </form>
  `;

  $('#import-form').onsubmit = async event => {
    event.preventDefault();

    if (busy) return;

    busy = true;
    $('#import-button').disabled = true;

    try {
      const result = await api('/api/import', {
        method: 'POST',
        body: new FormData(event.target)
      });

      $('#modal').close();

      await load();

      msg(`นำเข้า ${result.count} รายการเรียบร้อย`);
    } catch (error) {
      $('#import-error').textContent = error.message;
    } finally {
      busy = false;

      if ($('#import-button')) {
        $('#import-button').disabled = false;
      }
    }
  };

  $('#modal').showModal();
}

// ---------- QR Code ----------

function qrUrl(type, id) {
  const url = new URL(location.href);

  url.search = '';
  url.hash = '';

  url.searchParams.set(
    type === 'category' ? 'category' : 'record',
    id
  );

  return url.href;
}

const qrCache = new Map();

function qrImage(type, id) {
  const url = qrUrl(type, id);

  if (!qrCache.has(url)) {
    const qr = qrcode(0, 'M');

    qr.addData(url);
    qr.make();

    const svg = qr.createSvgTag({
      cellSize: 3,
      margin: 12,
      scalable: true
    });

    qrCache.set(
      url,
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(svg)
    );
  }

  return qrCache.get(url);
}

function qrCard(record) {
  return `
    <div class="qrcard">
      <label class="check no-print">
        <input
          type="checkbox"
          data-qr-select="${esc(record.id)}"
          ${qrSelected.has(record.id) ? 'checked' : ''}
        >
        เลือก
      </label>

      <img
        src="${qrImage(record.kind, record.id)}"
        alt="QR Code"
      >

      <h3>${esc(record.code)}</h3>
      <p>${esc(name(record))}</p>

      ${record.kind === 'machine'
        ? `<small>Serial: ${esc(record.serial || '—')}</small>`
        : ''}

      <p class="no-print">
        <a
          class="button"
          download="qr-${esc(
            record.code.replace(/[^\w-]/g, '_')
          )}.svg"
          href="${qrImage(record.kind, record.id)}"
        >
          ดาวน์โหลด SVG
        </a>
      </p>
    </div>
  `;
}

function qrMatches() {
  return db.records.filter(record => {
    if (record.kind !== qrKind) return false;

    if (
      qrCategory &&
      record.data.category !== qrCategory
    ) {
      return false;
    }

    const text = [
      record.code,
      record.serial,
      ...Object.values(record.data)
    ].join(' ').toLowerCase();

    return text.includes(q.toLowerCase());
  });
}

function renderQr() {
  $('#content').innerHTML = `
    ${heading(
      'QR Code',
      'เลือกอะไหล่หรือเครื่องจักร แล้วพิมพ์ป้ายที่ต้องการ',
      `<button
        id="print-selected"
        class="primary"
        ${!qrSelected.size ? 'disabled' : ''}
      >
        พิมพ์ที่เลือก (${qrSelected.size})
      </button>`
    )}

    <section class="box no-print">
      <div class="search">
        <select id="qr-kind">
          <option value="part">อะไหล่</option>
          <option value="machine">เครื่องจักร</option>
        </select>

        <input
          id="qr-query"
          value="${esc(q)}"
          placeholder="ค้นหาทุกฟิลด์"
        >

        <select id="qr-category">
          <option value="">ทุกหมวดหมู่</option>

          ${db.categories.map(category => `
            <option value="${esc(category.code)}">
              ${esc(category.code + ' ' + category.name)}
            </option>
          `).join('')}
        </select>
      </div>

      <button id="qr-all">
        เลือก/ยกเลิกผลค้นหาทั้งหมด
      </button>

      <button id="qr-clear">
        ล้างการเลือก
      </button>

      <p>
        QR Code ใช้ที่อยู่เว็บที่กำลังเปิดอยู่
        ควรพิมพ์หลังเผยแพร่บน GitHub Pages แล้ว
      </p>
    </section>

    <section class="box">
      <div id="qr-results"></div>
    </section>
  `;

  $('#qr-kind').value = qrKind;
  $('#qr-category').value = qrCategory;
  $('#qr-category').disabled = qrKind === 'machine';

  function draw() {
    const rows = qrMatches();

    $('#qr-results').innerHTML = rows.length
      ? `
        <div class="qrgrid">
          ${rows
            .slice(offset, offset + PAGE_SIZE)
            .map(qrCard)
            .join('')}
        </div>

        <div class="pagination no-print">
          <button
            data-qr-prev
            ${offset === 0 ? 'disabled' : ''}
          >
            ก่อนหน้า
          </button>

          <span>${rows.length} รายการ</span>

          <button
            data-qr-next
            ${offset + PAGE_SIZE >= rows.length ? 'disabled' : ''}
          >
            ถัดไป
          </button>
        </div>
      `
      : '<div class="empty">ไม่พบข้อมูล</div>';

    return rows;
  }

  $('#qr-query').oninput = event => {
    q = event.target.value;
    offset = 0;
    draw();
  };

  $('#qr-kind').onchange = event => {
    qrKind = event.target.value;
    qrCategory = '';
    offset = 0;
    renderQr();
  };

  $('#qr-category').onchange = event => {
    qrCategory = event.target.value;
    offset = 0;
    draw();
  };

  $('#qr-all').onclick = () => {
    const rows = qrMatches();

    const allSelected =
      rows.length > 0 &&
      rows.every(record => qrSelected.has(record.id));

    rows.forEach(record => {
      if (allSelected) {
        qrSelected.delete(record.id);
      } else {
        qrSelected.add(record.id);
      }
    });

    renderQr();
  };

  $('#qr-clear').onclick = () => {
    qrSelected.clear();
    renderQr();
  };

  $('#print-selected').onclick = printQr;

  draw();
}

// ---------- Report Search ----------

function reportMatches() {
  return db.records.filter(record => {
    if (record.kind !== reportKind) {
      return false;
    }

    if (
      reportCategory &&
      record.data.category !== reportCategory
    ) {
      return false;
    }

    const text = [
      record.code,
      record.serial,
      ...Object.values(record.data),
      ...rel(record).map(machineLabel)
    ].join(' ').toLowerCase();

    return text.includes(reportQuery.toLowerCase());
  });
}

// ---------- Report Table ----------


function reportHtml(rows) {
  const isMachine = reportKind === 'machine';
  const title = isMachine ? 'รายงานเครื่องจักร' : 'รายงานอะไหล่';

  const headers = isMachine
    ? [
        ['รหัสเครื่องจักร', 'Equipment no.'],
        ['รหัสอะไหล่หลัก', 'Item number'],
        ['หมายเลขเครื่อง', 'Serial no.'],
        ['รายละเอียด', 'Description'],
        ['อะไหล่ที่เกี่ยวข้อง', 'Related spare parts']
      ]
    : [
        ['รูปภาพ', 'Photo'],
        ['Remark / รหัสอะไหล่', 'Part number'],
        ['รายละเอียด', 'Description'],
        ['เครื่องจักรที่เกี่ยวข้อง', 'Related machines']
      ];

  const body = rows.map(record => {
    const related = rel(record)
      .filter(item => item.kind === (isMachine ? 'part' : 'machine'))
      .map(item => isMachine
        ? item.code + ' · ' + name(item)
        : (item.data.description || '—'));

    const relatedHtml = related.length
      ? `<ul class="report-related-list">
          ${related.map(text => `<li>${esc(text)}</li>`).join('')}
        </ul>`
      : '—';

    const imageHtml = photos(record)
      .map(photo => `
        <img class="report-photo"
             src="${photoUrl(photo)}"
             alt="${esc(name(record))}">
      `).join('');

    if (isMachine) {
      return `
        <tr class="report-record">
          <td>
            ${esc(record.code)}
            ${imageHtml
              ? `<div class="report-image-stack">${imageHtml}</div>`
              : ''}
          </td>
          <td>${esc(record.data.item || '—')}</td>
          <td>${esc(record.serial || '—')}</td>
          <td>${esc(name(record))}</td>
          <td class="report-related-cell">${relatedHtml}</td>
        </tr>
      `;
    }

    return `
      <tr class="report-record">
        <td>
          ${imageHtml ||
            '<span class="report-no-image">ไม่มีรูปภาพ</span>'}
        </td>
        <td>${esc(record.code)}</td>
        <td>${esc(name(record))}</td>
        <td class="report-related-cell">${relatedHtml}</td>
      </tr>
    `;
  }).join('');

  return `
    <section class="box parts-report ${isMachine
      ? 'report-type-machine'
      : 'report-type-part'}">

      <div class="report-heading">
        <h2 class="catalog-report-title">
          <span class="report-heading-icon" aria-hidden="true">
            ${isMachine ? '⚙' : '▤'}
          </span>
          ${title}
        </h2>
        <p class="report-count">
          จำนวน ${rows.length.toLocaleString('th-TH')} รายการ
        </p>
      </div>

      <div class="catalog-report-scroll">
        <table class="parts-report-table">
          <thead>
            <tr>
              ${headers.map(([th, en]) => `
                <th>
                  ${esc(th)}
                  <span class="report-header-en">${esc(en)}</span>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>
  `;
}

// ---------- Report Output ----------

function showOutput() {
  const rows = db.records.filter(
    record =>
      record.kind === reportKind &&
      selected.has(record.id)
  );

  $('#report-output').innerHTML = rows.length
    ? reportHtml(rows)
    : `
      <div class="empty no-print">
        เลือกรายการเพื่อแสดงรายงาน
      </div>
    `;

  $('#pdf').disabled = !rows.length;
}

// ---------- Report Page ----------

function renderReports() {
  $('#content').innerHTML = `
    ${heading(
      'รายงานสรุป',
      'เลือกประเภท ค้นหา และเลือกรายการที่ต้องการพิมพ์',
      `<button id="pdf" class="primary" disabled>
        พิมพ์ / บันทึก PDF
      </button>`
    )}

    <section class="box no-print">
      <div class="search">
        <select id="report-kind">
          <option value="part">อะไหล่</option>
          <option value="machine">เครื่องจักร</option>
        </select>

        <input
          id="report-query"
          value="${esc(reportQuery)}"
          placeholder="ค้นหาทุกฟิลด์และรายการที่เกี่ยวข้อง"
        >

        <select id="report-category">
          <option value="">ทุกหมวดหมู่</option>

          ${db.categories.map(category => `
            <option value="${esc(category.code)}">
              ${esc(category.code + ' ' + category.name)}
            </option>
          `).join('')}
        </select>
      </div>

      <div class="actions">
        <button id="select-results">
          เลือก/ยกเลิกผลค้นหาทั้งหมด
        </button>

        <button id="clear-report">
          ล้างตัวกรองและการเลือก
        </button>
      </div>

      <div
        id="report-selection"
        class="linklist"
      ></div>
    </section>

    <div id="report-output"></div>
  `;

  $('#report-kind').value = reportKind;
  $('#report-category').value = reportCategory;
  $('#report-category').disabled =
    reportKind === 'machine';

  function update() {
    const rows = reportMatches();

    $('#report-selection').innerHTML = rows.map(
      record => `
        <label class="check">
          <input
            type="checkbox"
            data-report-select="${esc(record.id)}"
            ${selected.has(record.id) ? 'checked' : ''}
          >

          <span>
            ${esc(
              record.kind === 'machine'
                ? machineLabel(record)
                : record.code + ' · ' + name(record)
            )}
          </span>
        </label>
      `
    ).join('') || '<div class="empty">ไม่พบข้อมูล</div>';

    showOutput();
  }

  $('#report-kind').onchange = event => {
    reportKind = event.target.value;
    reportCategory = '';
    selected.clear();
    renderReports();
  };

  $('#report-query').oninput = event => {
    reportQuery = event.target.value;
    update();
  };

  $('#report-category').onchange = event => {
    reportCategory = event.target.value;
    update();
  };

  $('#select-results').onclick = () => {
    const rows = reportMatches();

    const allSelected =
      rows.length > 0 &&
      rows.every(record => selected.has(record.id));

    rows.forEach(record => {
      if (allSelected) {
        selected.delete(record.id);
      } else {
        selected.add(record.id);
      }
    });

    update();
  };

  $('#clear-report').onclick = () => {
    selected.clear();
    reportCategory = '';
    reportQuery = '';
    renderReports();
  };

  $('#report-selection').onchange = event => {
    const id = event.target.dataset.reportSelect;

    if (!id) return;

    if (event.target.checked) {
      selected.add(id);
    } else {
      selected.delete(id);
    }

    showOutput();
  };

  $('#pdf').onclick = async () => {
    try {
      await readyToPrint($('#report-output'));
      window.print();
    } catch (error) {
      msg(error.message, true);
    }
  };

  update();
}

// ---------- Printing ----------

async function readyToPrint(element) {
  await document.fonts.ready;

  const images = [
    ...element.querySelectorAll('img')
  ];

  await Promise.all(
    images.map(image => new Promise(
      (resolve, reject) => {
        const check = () => {
          if (image.naturalWidth) {
            resolve();
          } else {
            reject(
              Error('รูปบางรูปโหลดไม่สำเร็จ กรุณาโหลดข้อมูลล่าสุดก่อนพิมพ์')
            );
          }
        };

        if (image.complete) {
          check();
          return;
        }

        image.onload = check;

        image.onerror = () => {
          reject(Error('โหลดรูปไม่สำเร็จ'));
        };
      }
    ))
  );
}

async function printQr() {
  const rows = db.records.filter(
    record => qrSelected.has(record.id)
  );

  if (!rows.length) return;

  $('#content').innerHTML = `
    <div class="qrgrid print-qr">
      ${rows.map(qrCard).join('')}
    </div>
  `;

  try {
    await readyToPrint($('#content'));
    window.print();
  } catch (error) {
    msg(error.message, true);
  } finally {
    renderQr();
  }
}


/* ---------- Button Events ---------- */

document.addEventListener('click', async event => {
  const button = event.target.closest('button');

  if (!button) return;

  try {
    if (button.dataset.page) {
      go(button.dataset.page);
    }

    else if (button.dataset.cat) {
      page = 'catalog';
      cat = button.dataset.cat;
      detail = null;
      offset = 0;
      q = '';
      render();
    }

    else if (button.dataset.open) {
      detail = button.dataset.open;
      render();
      window.scrollTo(0, 0);
    }

    else if (button.hasAttribute('data-back')) {
      detail = null;

      history.replaceState(
        null,
        '',
        location.pathname
      );

      render();
    }

    else if (button.hasAttribute('data-clear')) {
      q = '';
      cat = '';
      kind = 'all';
      offset = 0;
      render();
    }

    else if (button.hasAttribute('data-prev')) {
      offset = Math.max(0, offset - PAGE_SIZE);
      paged(filterRecords());
    }

    else if (button.hasAttribute('data-next')) {
      offset += PAGE_SIZE;
      paged(filterRecords());
    }

    else if (button.hasAttribute('data-qr-prev')) {
      offset = Math.max(0, offset - PAGE_SIZE);
      renderQr();
    }

    else if (button.hasAttribute('data-qr-next')) {
      offset += PAGE_SIZE;
      renderQr();
    }

    else if (button.dataset.new) {
      openForm(null, button.dataset.new);
    }

    else if (button.dataset.edit) {
      const record = db.records.find(
        item => item.id === button.dataset.edit
      );

      if (record) {
        openForm(record);
      }
    }

    else if (button.hasAttribute('data-close')) {
      $('#modal').close();
    }

    else if (button.hasAttribute('data-import')) {
      importDialog();
    }

    /* ---------- ลบอะไหล่ / เครื่องจักร ---------- */

    else if (button.dataset.delete) {
      const confirmed = await confirmDeleteDialog(
        'คุณต้องการลบรายการนี้และรูปภาพที่เกี่ยวข้องใช่หรือไม่?'
      );

      if (!confirmed) return;

      await api('/api/catalog', {
        method: 'DELETE',
        body: JSON.stringify({
          id: button.dataset.delete
        })
      });

      selected.delete(button.dataset.delete);
      detail = null;

      history.replaceState(
        null,
        '',
        location.pathname
      );

      await load();

      msg('ลบข้อมูลเรียบร้อย');
    }

    /* ---------- ลบรูปภาพ ---------- */

    else if (button.dataset.deletePhoto) {
      const confirmed = await confirmDeleteDialog(
        'คุณต้องการลบรูปภาพนี้ใช่หรือไม่?'
      );

      if (!confirmed) return;

      await api(
        '/api/photos/' + button.dataset.deletePhoto,
        { method: 'DELETE' }
      );

      await load();

      msg('ลบรูปภาพเรียบร้อย');
    }

  } catch (error) {
    msg(error.message, true);
  }
});


// ---------- QR Selection ----------

document.addEventListener('change', event => {
  const id = event.target.dataset.qrSelect;

  if (!id) return;

  if (event.target.checked) {
    qrSelected.add(id);
  } else {
    qrSelected.delete(id);
  }

  renderQr();
});

// ---------- Excel Export ----------

document.addEventListener('click', async event => {
  const link = event.target.closest('[data-export]');

  if (!link) return;

  event.preventDefault();

  try {
    await CatalogAPI.exportExcel(db);
  } catch (error) {
    msg(error.message, true);
  }
});

// ---------- Layout Styles ----------

(function installCatalogStyles() {
  const existing = document.getElementById(
    'catalog-custom-styles'
  );

  if (existing) {
    existing.remove();
  }

  const style = document.createElement('style');

  style.id = 'catalog-custom-styles';

  style.textContent = `
    .catalog-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
    }

    .catalog-list-item {
      display: flex;
      align-items: center;
      gap: 18px;
      width: 100%;
      min-width: 0;
      padding: 16px 18px;
      background: #ffffff;
      border: 1px solid #dce4ef;
      border-radius: 12px;
      box-sizing: border-box;
    }

    .catalog-list-image {
      width: 100px;
      height: 90px;
      flex: 0 0 100px;
      object-fit: contain;
      border-radius: 8px;
      background: #f3f6fa;
    }

    .catalog-no-image {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      color: #64748b;
    }

    .catalog-list-content {
      flex: 1;
      min-width: 0;
    }

    .catalog-list-content h3 {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.5;
      color: #172b4d;
      margin: 0 0 6px;
      overflow-wrap: anywhere;
    }

    .catalog-list-code {
      font-size: 13px;
      color: #475569;
      margin-bottom: 7px;
      overflow-wrap: anywhere;
    }

    .catalog-list-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 18px;
      color: #64748b;
      font-size: 12px;
      line-height: 1.6;
    }

    .catalog-list-open {
      flex-shrink: 0;
      white-space: nowrap;
    }

    .catalog-report-title {
      text-align: center;
      margin: 0 0 8px;
    }

    .report-count {
      text-align: center;
      margin-bottom: 18px;
    }

    .catalog-report-scroll {
      width: 100%;
      overflow-x: auto;
    }

    .parts-report-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin: 0 auto;
      font-size: 12px;
    }

    .parts-report-table th,
    .parts-report-table td {
      border: 1px solid #cbd5e1;
      padding: 9px;
      vertical-align: top;
      overflow-wrap: anywhere;
    }

    .parts-report-table th {
      background: #edf2f8;
      text-align: center;
      font-weight: 700;
    }

    .parts-report-table td:last-child {
      text-align: center;
    }

    .report-photo {
      display: block;
      width: 85px;
      max-width: 100%;
      height: auto;
      object-fit: contain;
      margin: 3px auto;
    }

    .report-qr {
      display: block;
      width: 76px;
      height: 76px;
      max-width: 100%;
      object-fit: contain;
      margin: 0 auto;
    }

    .report-machine {
      margin-bottom: 5px;
      line-height: 1.5;
    }

    @media (max-width: 650px) {
      .catalog-list-item {
        gap: 10px;
        padding: 12px;
        flex-wrap: wrap;
      }

      .catalog-list-image {
        width: 70px;
        height: 70px;
        flex-basis: 70px;
      }

      .catalog-list-content {
        flex-basis: calc(100% - 90px);
      }

      .catalog-list-content h3 {
        font-size: 14px;
      }

      .catalog-list-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .catalog-list-open {
        margin-left: auto;
      }

      .parts-report-table {
        min-width: 760px;
      }
    }

    @media print {
      .catalog-report-scroll {
        overflow: visible !important;
      }

      .parts-report {
        width: 100% !important;
        margin: 0 auto !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
      }

      .catalog-report-title,
      .report-count {
        text-align: center !important;
      }

      .parts-report-table {
        width: 100% !important;
        min-width: 0 !important;
        font-size: 9px !important;
        table-layout: fixed !important;
      }

      .parts-report-table th,
      .parts-report-table td {
        padding: 5px !important;
        border: 1px solid #777 !important;
      }

      .parts-report-table thead {
        display: table-header-group;
      }

      .parts-report-table tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .report-photo {
        width: 65px !important;
      }

      .report-qr {
        width: 60px !important;
        height: 60px !important;
      }

      @page {
        size: A4 portrait;
        margin: 10mm;
      }
    }
  `;

  document.head.appendChild(style);
})();

// ---------- Start Application ----------

$('#reload').onclick = load;

load();


/* =========================================
   DASHBOARD — CATEGORY PERCENTAGE CHART
   ========================================= */

function renderDashboardChart() {
  if (page !== 'dashboard' || detail) return;

  const results = document.querySelector('#results');
  if (!results) return;

  const parts = db.records.filter(r => r.kind === 'part');
  const total = parts.length;

  const colors = [
    '#2563eb',
    '#10b981',
    '#f59e0b',
    '#a855f7',
    '#f43f5e',
    '#06b6d4',
    '#84cc16',
    '#f97316'
  ];

  const data = db.categories.map((category, index) => {
    const count = parts.filter(
      r => r.data.category === category.code
    ).length;

    return {
      name: `${category.code} — ${category.name || category.code}`,
      code: category.code,
      count,
      percent: total ? (count / total) * 100 : 0,
      color: colors[index % colors.length]
    };
  });

  const listedCount = data.reduce(
    (sum, item) => sum + item.count, 0
  );

  if (listedCount < total) {
    data.push({
      name: 'ไม่ระบุหมวดหมู่ / อื่น ๆ',
      code: 'other',
      count: total - listedCount,
      percent: (total - listedCount) / total * 100,
      color: '#94a3b8'
    });
  }

  let current = 0;

  const gradient = data.map(item => {
    const start = current;
    current += item.percent;

    return `${item.color} ${start}% ${current}%`;
  }).join(', ');

  const chart = total
    ? `conic-gradient(${gradient})`
    : 'conic-gradient(#e2e8f0 0% 100%)';

  const rows = data.map(item => `
    <div class="dashboard-category-row">
      <span
        class="dashboard-category-color"
        style="background:${item.color}"
      ></span>

      <span class="dashboard-category-name">
        ${esc(item.name)}
      </span>

      <strong>${item.percent.toFixed(1)}%</strong>

      <small>${item.count.toLocaleString('th-TH')} รายการ</small>
    </div>
  `).join('');

  const resultsSection = results.closest('section.box');

  if (!resultsSection) return;

  resultsSection.innerHTML = `
    <h2>สัดส่วนอะไหล่ตามหมวดหมู่</h2>

    <div class="dashboard-chart-layout">
      <div
        class="dashboard-donut"
        style="background:${chart}"
      >
        <div class="dashboard-donut-center">
          <strong>${total.toLocaleString('th-TH')}</strong>
          <span>อะไหล่ทั้งหมด</span>
        </div>
      </div>

      <div class="dashboard-category-list">
        ${rows || '<p>ยังไม่มีข้อมูลหมวดหมู่</p>'}
      </div>
    </div>
  `;

  // ซ่อนเฉพาะช่องค้นหาและกล่องหมวดหมู่บน Dashboard
  const search = document.querySelector('#query')?.closest('.search');
  if (search) search.style.display = 'none';

  document.querySelectorAll('#content .cats').forEach(el => {
    const section = el.closest('section.box');
    if (section) section.style.display = 'none';
  });
}

// ทำงานหลัง render() เดิมทุกครั้ง
const originalDashboardRender = render;

render = function () {
  originalDashboardRender();

  if (page === 'dashboard' && !detail) {
    renderDashboardChart();
  }
};

// เพิ่มรูปแบบกราฟ
(function () {
  const style = document.createElement('style');

  style.textContent = `
    .dashboard-chart-layout {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 55px;
      padding: 30px 20px;
      flex-wrap: wrap;
    }

    .dashboard-donut {
      width: 270px;
      height: 270px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      flex-shrink: 0;
    }

    .dashboard-donut-center {
      width: 65%;
      height: 65%;
      background: white;
      border-radius: 50%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }

    .dashboard-donut-center strong {
      font-size: 32px;
      color: #153653;
    }

    .dashboard-donut-center span {
      font-size: 13px;
      color: #64748b;
    }

    .dashboard-category-list {
      flex: 1;
      min-width: 260px;
      max-width: 550px;
    }

    .dashboard-category-row {
      display: grid;
      grid-template-columns: 14px minmax(0, 1fr) 65px 95px;
      align-items: center;
      gap: 12px;
      padding: 12px 4px;
      border-bottom: 1px solid #e2e8f0;
    }

    .dashboard-category-color {
      width: 13px;
      height: 13px;
      border-radius: 4px;
    }

    .dashboard-category-name {
      font-weight: 500;
      overflow-wrap: anywhere;
    }

    .dashboard-category-row strong {
      text-align: right;
      color: #153653;
    }

    .dashboard-category-row small {
      text-align: right;
      color: #64748b;
    }

    @media (max-width: 650px) {
      .dashboard-chart-layout {
        padding: 16px 4px;
        gap: 24px;
      }

      .dashboard-donut {
        width: 210px;
        height: 210px;
      }

      .dashboard-category-row {
        grid-template-columns: 12px minmax(0, 1fr) 55px 75px;
        gap: 7px;
        font-size: 12px;
      }
    }
  `;

  document.head.appendChild(style);
})();

// แสดง Dashboard ใหม่ทันที
render();


/* =========================================
   DASHBOARD — CLICKABLE CATEGORIES
   ========================================= */

function openDashboardCategory(categoryCode) {
  // ไปหน้า Catalog และกรองตามหมวดหมู่
  page = 'catalog';
  detail = null;
  kind = 'part';
  cat = categoryCode;
  q = '';
  offset = 0;

  history.replaceState(
    null,
    '',
    location.pathname
  );

  render();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// เพิ่มการคลิกให้หมวดหมู่บน Dashboard
document.addEventListener('click', function (event) {
  const category = event.target.closest(
    '[data-dashboard-category]'
  );

  if (!category) return;

  openDashboardCategory(
    category.dataset.dashboardCategory
  );
});

// เพิ่มปุ่มคลิกในรายการหมวดหมู่หลังกราฟแสดง
function enableDashboardCategoryLinks() {
  if (page !== 'dashboard' || detail) return;

  const rows = document.querySelectorAll(
    '.dashboard-category-row'
  );

  const categories = db.categories;

  rows.forEach((row, index) => {
    const category = categories[index];

    if (!category) return;

    row.dataset.dashboardCategory = category.code;
    row.setAttribute('role', 'button');
    row.setAttribute('tabindex', '0');

    row.title = 'คลิกเพื่อดูอะไหล่ในหมวดหมู่นี้';

    row.addEventListener('keydown', event => {
      if (
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        openDashboardCategory(category.code);
      }
    });
  });
}

// ทำงานหลังจาก Dashboard สร้างกราฟเสร็จ
const previousRenderWithChart = render;

render = function () {
  previousRenderWithChart();

  if (page === 'dashboard' && !detail) {
    enableDashboardCategoryLinks();
  }
};

// CSS สำหรับรายการหมวดหมู่ที่คลิกได้
(function () {
  const style = document.createElement('style');

  style.textContent = `
    .dashboard-category-row[data-dashboard-category] {
      cursor: pointer;
      border-radius: 8px;
      padding-left: 10px;
      padding-right: 10px;
      transition:
        background 0.2s ease,
        transform 0.2s ease;
    }

    .dashboard-category-row[data-dashboard-category]:hover {
      background: #eff6ff;
      transform: translateX(3px);
    }

    .dashboard-category-row[data-dashboard-category]:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    .dashboard-category-row[data-dashboard-category]:hover
    .dashboard-category-name {
      color: #2563eb;
      text-decoration: underline;
    }

    .dashboard-category-row[data-dashboard-category]::after {
      content: '›';
      font-size: 20px;
      font-weight: bold;
      color: #2563eb;
    }

    .dashboard-category-row[data-dashboard-category] {
      grid-template-columns:
        14px minmax(0, 1fr) 65px 95px 12px;
    }

    @media (max-width: 650px) {
      .dashboard-category-row[data-dashboard-category] {
        grid-template-columns:
          12px minmax(0, 1fr) 55px 75px 10px;
      }
    }
  `;

  document.head.appendChild(style);
})();

// แสดง Dashboard ใหม่พร้อมลิงก์หมวดหมู่
render();


/* ===== กล่องยืนยันการลบ ===== */

function confirmDeleteDialog(
  message = 'คุณต้องการลบรายการนี้ใช่หรือไม่?'
) {
  return new Promise(resolve => {
    const dialog = document.createElement('dialog');
    dialog.className = 'custom-delete-dialog';

    dialog.innerHTML = `
      <div class="delete-dialog-content">
        <div class="delete-dialog-icon">🗑️</div>

        <h2>ยืนยันการลบข้อมูล</h2>

        <p id="delete-dialog-message"></p>

        <p class="delete-dialog-warning">
          การลบไม่สามารถย้อนกลับได้
        </p>

        <div class="delete-dialog-actions">
          <button type="button" data-cancel-delete>
            ยกเลิก
          </button>

          <button
            type="button"
            class="delete-dialog-danger"
            data-confirm-delete
          >
            ยืนยันลบ
          </button>
        </div>
      </div>
    `;

    dialog.querySelector(
      '#delete-dialog-message'
    ).textContent = message;

    document.body.appendChild(dialog);

    let finished = false;

    function finish(confirmed) {
      if (finished) return;
      finished = true;
      dialog.close();
      dialog.remove();
      resolve(confirmed);
    }

    dialog.querySelector(
      '[data-cancel-delete]'
    ).onclick = () => finish(false);

    dialog.querySelector(
      '[data-confirm-delete]'
    ).onclick = () => finish(true);

    dialog.oncancel = event => {
      event.preventDefault();
      finish(false);
    };

    dialog.showModal();
  });
}


/* ซ่อนข้อความแจ้งเตือนอัตโนมัติ */

(function () {
  const messageBox = document.querySelector('#message');

  if (!messageBox) return;

  let hideTimer;

  const observer = new MutationObserver(() => {
    clearTimeout(hideTimer);

    if (!messageBox.textContent.trim()) return;

    hideTimer = setTimeout(() => {
      messageBox.textContent = '';
      messageBox.classList.remove('error');
    }, 3000);
  });

  observer.observe(messageBox, {
    childList: true,
    characterData: true,
    subtree: true
  });
})();


/* รายงาน: หนึ่งรายการต่อหนึ่งแถว ไม่แยกเครื่องจักรที่เกี่ยวข้องเป็นช่อง */
reportHtml = function (rows) {
  const isMachine = reportKind === 'machine';
  const title = isMachine ? 'รายงานเครื่องจักร' : 'รายงานอะไหล่';
  const headers = isMachine
    ? [['รหัสเครื่องจักร','Equipment no.'], ['รหัสอะไหล่หลัก','Item number'], ['หมายเลขเครื่อง','Serial no.'], ['รายละเอียด','Description'], ['อะไหล่ที่เกี่ยวข้อง','Related spare parts']]
    : [['รูปภาพ','Photo'], ['Remark / รหัสอะไหล่','Part number'], ['รายละเอียด','Description'], ['เครื่องจักรที่เกี่ยวข้อง','Related machines']];

  const body = rows.map(record => {
    const related = rel(record)
      .filter(item => item.kind === (isMachine ? 'part' : 'machine'))
      .map(item => isMachine ? item.code + ' · ' + name(item) : (item.data.description || '—'));
    const relatedHtml = related.length
      ? `<ul class="report-related-list">${related.map(text => `<li>${esc(text)}</li>`).join('')}</ul>`
      : '—';
    const imageHtml = photos(record)
      .map(photo => `<img class="report-photo" src="${photoUrl(photo)}" alt="${esc(name(record))}">`)
      .join('') || '<span class="report-no-image">ไม่มีรูปภาพ</span>';
    const cells = isMachine
      ? `<td>${esc(record.code)}</td><td>${esc(record.data.item || '—')}</td><td>${esc(record.serial || '—')}</td><td>${esc(name(record))}</td><td class="report-related-cell">${relatedHtml}</td>`
      : `<td>${imageHtml}</td><td>${esc(record.code)}</td><td>${esc(name(record))}</td><td class="report-related-cell">${relatedHtml}</td>`;
    return `<tr class="report-record">${cells}</tr>`;
  }).join('');

  return `<section class="box parts-report ${isMachine ? 'report-type-machine' : 'report-type-part'}">
    <div class="report-heading"><h2 class="catalog-report-title">${title}</h2><p class="report-count">จำนวน ${rows.length.toLocaleString('th-TH')} รายการ</p></div>
    <div class="catalog-report-scroll"><table class="parts-report-table">
      <thead><tr>${headers.map(([th,en]) => `<th>${esc(th)}<span class="report-header-en">${esc(en)}</span></th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>
  </section>`;
};
