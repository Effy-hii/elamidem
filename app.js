(() => {
  const data = Array.isArray(window.LOMDIM_DIRECTORY) ? window.LOMDIM_DIRECTORY : [];
  const kind = document.body.dataset.directory;
  const sourceNote = document.getElementById('sourceNote');
  if (sourceNote && window.LOMDIM_DIRECTORY_SOURCE === 'demo') {
    sourceNote.textContent = 'נתוני דוגמה פיקטיביים בלבד — רשימת הלקוחות ואנשי הקשר אינה כלולה בעותק הציבורי.';
  } else if (sourceNote && window.LOMDIM_DIRECTORY_SOURCE === 'public-schools') {
    sourceNote.textContent = kind === 'community'
      ? 'רשימת הקהילות ופרטי הקשר אינם כלולים בעותק הציבורי של המאגר.'
      : kind === 'school'
        ? 'רשימת בתי הספר מוצגת ללא פרטי קשר.'
        : 'בעותק הציבורי מופיעה רשימת בתי הספר בלבד, ללא פרטי קשר או נתוני קהילות.';
  }
  const schoolCount = document.getElementById('schoolCount');
  const communityCount = document.getElementById('communityCount');
  if (schoolCount) schoolCount.textContent = `${data.filter(item => item.kind === 'school').length.toLocaleString('he-IL')} רשומות`;
  if (communityCount) communityCount.textContent = `${data.filter(item => item.kind === 'community').length.toLocaleString('he-IL')} רשומות`;

  if (!kind) return;
  const items = data.filter(item => item.kind === kind);
  const collator = new Intl.Collator('he');
  items.sort((a, b) => collator.compare(a.name || a.city, b.name || b.city));
  const regions = ['הכול', 'צפון', 'מרכז', 'ירושלים ויו״ש', 'דרום'];
  if (items.some(item => item.region === 'לא סווג')) regions.push('לא סווג');
  const search = document.getElementById('directorySearch');
  const filters = document.getElementById('regionFilters');
  const rows = document.getElementById('directoryRows');
  const total = document.getElementById('totalCount');
  const result = document.getElementById('resultCount');
  const shown = document.getElementById('shownCount');
  const loadMore = document.getElementById('loadMore');
  total.textContent = items.length.toLocaleString('he-IL');
  let selectedRegion = 'הכול';
  let pageSize = 50;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }
  function displayName(item) {
    if (item.name) return item.name;
    return item.kind === 'school' ? 'שם בית הספר לא צוין' : 'שם הקהילה לא צוין';
  }
  function contactField(parent, label, values) {
    if (!values || !values.length) return;
    const line = el('div', 'contact-field');
    line.append(el('span', 'contact-label', `${label}: `), el('span', 'contact-values', values.join(' · ')));
    parent.append(line);
  }
  function contactCell(item) {
    const cell = document.createElement('td');
    cell.className = 'contacts-cell';
    const contacts = item.contacts || [];
    const loose = item.unassignedContactDetails || {};
    const hasLoose = ['role', 'phone', 'email'].some(field => (loose[field] || []).length);
    if (!contacts.length && !hasLoose) {
      cell.append(el('span', 'missing', 'לא צוינו אנשי קשר'));
      return cell;
    }
    const details = document.createElement('details');
    details.className = 'contacts-details';
    const summary = document.createElement('summary');
    summary.append(el('strong', '', contacts.length ? `${contacts.length} אנשי קשר` : 'פרטי קשר'));
    if (contacts.length) summary.append(el('span', 'contact-preview', contacts.slice(0, 2).map(contact => contact.name).join(' · ')));
    details.append(summary);
    const content = el('div', 'contacts-content');
    for (const contact of contacts) {
      const card = el('div', 'contact-card');
      card.append(el('strong', 'contact-name', contact.name));
      contactField(card, 'תפקיד', contact.role);
      contactField(card, 'טלפון', contact.phone);
      contactField(card, 'מייל', contact.email);
      content.append(card);
    }
    if (hasLoose) {
      const extra = el('div', 'contact-card unassigned-contact');
      extra.append(el('strong', 'contact-name', 'פרטים שלא ניתן לשייך בוודאות לאדם מסוים'));
      contactField(extra, 'תפקידים', loose.role);
      contactField(extra, 'טלפונים', loose.phone);
      contactField(extra, 'מיילים', loose.email);
      content.append(extra);
    }
    details.append(content);
    cell.append(details);
    return cell;
  }
  function renderFilters() {
    filters.replaceChildren();
    for (const region of regions) {
      const count = region === 'הכול' ? items.length : items.filter(item => item.region === region).length;
      const chip = el('button', 'region-chip');
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(region === selectedRegion));
      chip.append(document.createTextNode(region), el('span', 'chip-count', count.toLocaleString('he-IL')));
      chip.addEventListener('click', () => { selectedRegion = region; pageSize = 50; renderFilters(); renderRows(); });
      filters.append(chip);
    }
  }
  function renderRows() {
    const query = search.value.trim().toLocaleLowerCase('he');
    const visible = items.filter(item => {
      if (selectedRegion !== 'הכול' && item.region !== selectedRegion) return false;
      return !query || [item.name, item.symbol, item.city, item.type, item.sourceRegion].some(value => String(value || '').toLocaleLowerCase('he').includes(query));
    });
    const slice = visible.slice(0, pageSize);
    rows.replaceChildren();
    if (!visible.length) {
      const tr = document.createElement('tr');
      const td = el('td', 'empty-row', 'לא נמצאו רשומות מתאימות.');
      td.colSpan = 5; tr.append(td); rows.append(tr);
    }
    for (const item of slice) {
      const tr = document.createElement('tr');
      tr.append(el('td', item.name ? 'item-name' : 'missing', displayName(item)));
      if (kind === 'school') tr.append(el('td', item.symbol ? 'symbol' : 'missing', item.symbol || 'לא צוין'));
      else tr.append(el('td', '', item.type || 'לא צוין'));
      tr.append(el('td', item.city ? '' : 'missing', item.city || 'לא צוין'));
      const regionCell = document.createElement('td');
      regionCell.append(el('span', 'type-tag', item.region));
      if (item.region !== item.sourceRegion && item.sourceRegion) regionCell.title = `אזור מקורי: ${item.sourceRegion}`;
      tr.append(regionCell);
      tr.append(contactCell(item));
      rows.append(tr);
    }
    result.textContent = `${visible.length.toLocaleString('he-IL')} תוצאות`;
    shown.textContent = `מוצגות ${slice.length.toLocaleString('he-IL')} מתוך ${visible.length.toLocaleString('he-IL')}`;
    loadMore.hidden = slice.length >= visible.length;
  }
  search.addEventListener('input', () => { pageSize = 50; renderRows(); });
  loadMore.addEventListener('click', () => { pageSize += 50; renderRows(); });
  renderFilters(); renderRows();
})();
