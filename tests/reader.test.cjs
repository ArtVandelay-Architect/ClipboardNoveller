// Run with: node --test tests/reader.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'Reader.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'ClipboardNovellerReader.js'), 'utf8');

test('HTML loader uses the special book’s latest text chapter and reloads updates', async () => {
  const books = [{ filename: 'Normal book', pages: 1 }, { filename: '__ReaderHTML__', pages: 2, hiddenPages: [2] }];
  const disk = new Map([['/1-1.txt', 'Old HTML'], ['/1-2.txt', html]]);
  const context = vm.createContext({
    files: books,
    file_name_search: name => books.findIndex(book => book.filename === name),
    get_path: (index, number) => '/'+ index + '-' + number + '.txt',
    fm: { fileExists: file => disk.has(file), readString: file => disk.get(file) }
  });
  vm.runInContext(script.slice(script.indexOf('async function load_reader_html()'), script.indexOf('// ---\n// initialise the UI')), context);
  assert.equal(await context.load_reader_html(), html);
  books[1].pages = 3;
  disk.set('/1-3.txt', html + '\n<!-- New version -->');
  assert.equal(await context.load_reader_html(), disk.get('/1-3.txt'));
  disk.set('/1-3.txt', '   ');
  await assert.rejects(context.load_reader_html(), /empty/);
  disk.delete('/1-3.txt');
  await assert.rejects(context.load_reader_html(), /must be a text page/);
  context.get_path = () => '/1-3.png';
  disk.set('/1-3.png', 'PNG');
  await assert.rejects(context.load_reader_html(), /must be a text page/);
  books[1].pages = 0;
  await assert.rejects(context.load_reader_html(), /Create a book named __ReaderHTML__/);
  books.pop();
  await assert.rejects(context.load_reader_html(), /Create a book named __ReaderHTML__/);
});

function reader() {
  const elements = new Map();
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) {
    elements.set(id, {
      value: '', textContent: '', children: [], hidden: false,
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      removeAttribute(key) { delete this[key]; }, focus() {}
    });
  }
  const context = vm.createContext({
    document: {
      getElementById: id => elements.get(id), createElement: () => ({}),
      documentElement: { dataset: {}, style: { setProperty() {} } }
    },
    confirm: () => true, scrollTo() {}
  });
  context.window = context;
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], context);
  context.Reader.setup({ title: 'A <book>', chapters: [{ number: 1 }, { number: 3 }, { number: 4 }] });
  context.Reader.show({ number: 3, type: 'text', content: 'Original' });
  return { context, api: context.Reader, el: id => elements.get(id) };
}

test('text is plain data; navigation starts at the selected page and skips hidden pages', () => {
  const r = reader();
  const text = '</textarea><script>alert(1)</script>\n` ${value} & " 🍁';
  r.api.show({ number: 3, type: 'text', content: text });
  assert.equal(r.el('text').textContent, text);
  assert.equal(r.el('editor').value, text);
  assert.equal(r.el('chapter').value, '3');
  r.el('previous').onclick();
  r.api.receive(request => assert.equal(request.number, 1));
  r.api.show({ number: 1, type: 'text', content: '' });
  assert.equal(r.el('previous').disabled, true);
  r.el('next').onclick();
  r.api.receive(request => assert.equal(request.number, 3));
});

test('edits stay dirty until save acknowledgment; failed saves preserve the draft', () => {
  const r = reader();
  r.el('edit').onclick();
  r.el('editor').value = '';
  r.el('save').onclick();
  r.api.receive(request => {
    assert.equal(request.action, 'save');
    assert.equal(request.number, 3);
    assert.equal(request.content, '');
  });
  assert.equal(r.el('editor').readOnly, true);
  r.api.error('Disk full');
  assert.equal(r.api.draft().content, '');
  assert.equal(r.el('editor').readOnly, false);
  r.api.saved();
  assert.equal(r.api.draft(), null);
  assert.equal(r.el('text').textContent, '');
});

test('cancelled navigation and edit cancellation retain the original chapter', () => {
  const r = reader();
  r.el('edit').onclick(); r.el('editor').value = 'Draft';
  r.context.confirm = () => false;
  r.el('next').onclick();
  assert.equal(r.api.draft().content, 'Draft');
  r.context.confirm = () => true;
  r.el('cancel').onclick();
  assert.equal(r.api.draft(), null);
  assert.equal(r.el('text').textContent, 'Original');
});

test('images replace text, disable editing, and release their source on text navigation', () => {
  const r = reader();
  r.api.show({ number: 4, type: 'image', src: 'data:image/png;base64,AAAA' });
  assert.equal(r.el('picture').hidden, false);
  assert.equal(r.el('text').hidden, true);
  assert.equal(r.el('edit').disabled, true);
  assert.equal(r.el('next').disabled, true);
  r.api.show({ number: 3, type: 'text', content: 'Back' });
  assert.equal(r.el('picture').src, undefined);
});

test('bridge delivers requests queued before a listener and releases a listener on close', () => {
  const r = reader();
  r.el('next').onclick();
  r.api.receive(request => assert.equal(request.action, 'open'));
  let stopped = false;
  r.api.receive(request => { stopped = request.action === 'stop'; });
  r.api.stop();
  assert.equal(stopped, true);
});

async function integration(interact, options = {}) {
  const disk = new Map([['/book1.txt', 'One'], ['/book2.txt', 'Hidden'], ['/book3.txt', 'Three'], ['/book4.png', 'PNG']]);
  const r = reader();
  const alerts = [];
  let resolvePresentation;
  let interaction;
  let failWrite = false;
  class WebView {
    async loadHTML(value) { assert.equal(value, html); }
    evaluateJavaScript(code, callback) {
      if (callback) return new Promise(resolve => {
        r.context.completion = resolve;
        vm.runInContext(code, r.context);
      });
      return Promise.resolve(vm.runInContext(code, r.context));
    }
    present() {
      const result = new Promise(resolve => { resolvePresentation = resolve; });
      interaction = Promise.resolve().then(() => interact({
        ...r, disk, close: resolvePresentation,
        failWrites: () => { failWrite = true; }
      })).finally(() => resolvePresentation());
      return result;
    }
  }
  const context = vm.createContext({
    load_reader_html: async () => html, WebView,
    files: [{ filename: 'Existing book', pages: 4, hiddenPages: [2] }],
    get_path: (_, number) => disk.has('/book' + number + '.txt') ? '/book' + number + '.txt' : number === 4 ? '/book4.png' : undefined,
    fm: {
      readString: file => disk.get(file),
      writeString(file, value) { if (failWrite) throw new Error('Disk full'); disk.set(file, value); }
    },
    Data: { fromFile: file => ({ toBase64String: () => Buffer.from(disk.get(file)).toString('base64') }) },
    Alert: class {
      addAction() {} addCancelAction() {}
      async presentAlert() { alerts.push(this.title); return options.discard ? -1 : 0; }
    },
    update_page_table() {}, pageTable: { reload() {} }
  });
  vm.runInContext(script.slice(script.indexOf('async function reader_page('), script.indexOf('async function quicklook_page(')), context);
  await context.reader_page(0, options.start || 3);
  await interaction;
  assert.ok(!alerts.includes('Reader unavailable'), alerts.join(', '));
  return { disk, alerts };
}

async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.fail('Reader did not reach the expected state');
}

test('Scriptable bridge saves the selected file, navigates over hidden pages, and loads PNG data', async () => {
  const result = await integration(async r => {
    assert.equal(r.el('text').textContent, 'Three');
    r.el('edit').onclick(); r.el('editor').value = 'Edited <text>\n🍁';
    r.el('save').onclick();
    await until(() => r.el('status').textContent === 'Saved');
    r.el('previous').onclick();
    await until(() => r.el('chapter').value === '1');
    r.el('next').onclick();
    await until(() => r.el('chapter').value === '3');
    r.el('next').onclick();
    await until(() => r.el('chapter').value === '4');
    assert.equal(r.el('picture').src, 'data:image/png;base64,UE5H');
    r.close();
  });
  assert.equal(result.disk.get('/book3.txt'), 'Edited <text>\n🍁');
  assert.equal(result.disk.get('/book1.txt'), 'One');
});

test('normal dismissal offers saving an unfinished draft', async () => {
  const result = await integration(async r => {
    r.el('edit').onclick(); r.el('editor').value = 'Unfinished'; r.close();
  });
  assert.deepEqual(result.alerts, ['Save unfinished edit?']);
  assert.equal(result.disk.get('/book3.txt'), 'Unfinished');
});

test('failed writes remain editable; discarding on close leaves the file unchanged', async () => {
  const result = await integration(async r => {
    r.failWrites(); r.el('edit').onclick(); r.el('editor').value = 'Draft'; r.el('save').onclick();
    await until(() => r.el('status').textContent === 'Disk full');
    assert.equal(r.api.draft().content, 'Draft'); r.close();
  }, { discard: true });
  assert.equal(result.disk.get('/book3.txt'), 'Three');
});
