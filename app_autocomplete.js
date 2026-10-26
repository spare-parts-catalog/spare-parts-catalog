
'use strict';

(() => {
  let panel = null;

  function closeSuggestions() {
    if (panel) {
      panel.remove();
      panel = null;
    }
  }

  function showSuggestions(input) {
    closeSuggestions();

    const keyword = input.value.trim().toLowerCase();
    if (!keyword || !Array.isArray(db.records)) return;

    const results = db.records.filter(r => {
      if (page === 'catalog' && r.kind !== 'part') return false;
      if (page === 'machines' && r.kind !== 'machine') return false;
      if (kind !== 'all' && r.kind !== kind) return false;
      if (cat && (r.kind !== 'part' || r.data?.category !== cat)) {
        return false;
      }

      const text = [
        r.code,
        r.serial,
        ...Object.values(r.data || {})
      ].join(' ').toLowerCase();

      return text.includes(keyword);
    }).slice(0, 12);

    if (!results.length) return;

    // ไม่ย้ายช่อง input เพื่อให้พิมพ์ต่อได้ตามปกติ
    const parent = input.parentElement;
    parent.style.position = 'relative';

    panel = document.createElement('div');
    panel.className = 'autocomplete-panel';

    Object.assign(panel.style, {
      position: 'absolute',
      top: (input.offsetTop + input.offsetHeight) + 'px',
      left: input.offsetLeft + 'px',
      width: input.offsetWidth + 'px',
      maxHeight: '320px',
      overflowY: 'auto',
      background: '#fff',
      border: '1px solid #cbd5e1',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      zIndex: '9999'
    });

    results.forEach(r => {
      const option = document.createElement('button');
      option.type = 'button';

      option.textContent =
        r.code + ' — ' +
        (r.data?.description || r.serial || '');

      Object.assign(option.style, {
        display: 'block',
        width: '100%',
        padding: '12px',
        textAlign: 'left',
        background: '#fff',
        border: 'none',
        borderBottom: '1px solid #eee',
        cursor: 'pointer',
        color: '#123456'
      });

      option.addEventListener('click', () => {
        closeSuggestions();
        detail = r.id;
        render();
        window.scrollTo(0, 0);
      });

      panel.appendChild(option);
    });

    parent.appendChild(panel);
  }

  document.addEventListener('input', e => {
    if (e.target.id === 'query') {
      showSuggestions(e.target);
    }
  });

  document.addEventListener('click', e => {
    if (panel &&
        !panel.contains(e.target) &&
        e.target.id !== 'query') {
      closeSuggestions();
    }
  });
})();
