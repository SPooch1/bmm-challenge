// In-memory stand-in for the Firebase compat SDK (auth + firestore) used by the
// local test harness and the Node tests. Every read and write is checked against
// tests/rules-model.js, batches and transactions atomically (get = before,
// getAfter = after the whole batch), so app flows exercise the rules logic.
// Only the API surface this app uses is implemented.
(function (root) {
  function createFakeFirebase(opts) {
    opts = opts || {};
    const RulesModel = opts.RulesModel || root.RulesModel;
    let rules = RulesModel.createRules(opts.mode || 'final');
    const store = new Map(); // path -> data
    let clock = 1700000000000;
    const log = [];

    class Timestamp {
      constructor(ms) { this._ms = ms; }
      toMillis() { return this._ms; }
      toDate() { return new Date(this._ms); }
      static now() { clock += 1000; return new Timestamp(clock); }
      static fromMillis(ms) { return new Timestamp(ms); }
    }
    const SENT = '__sentinel';
    const FieldValue = {
      serverTimestamp: () => ({ [SENT]: 'ts' }),
      increment: n => ({ [SENT]: 'inc', n }),
      delete: () => ({ [SENT]: 'del' })
    };
    const DOC_ID = { __docId: true };
    const FieldPath = { documentId: () => DOC_ID };

    const isPlain = v => v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !v[SENT];
    function clone(v) {
      if (v instanceof Timestamp) return v;
      if (Array.isArray(v)) return v.map(clone);
      if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = clone(v[k]); }); return o; }
      return v;
    }
    function resolve(val, prev, now) {
      if (val && val[SENT] === 'ts') return now;
      if (val && val[SENT] === 'inc') return (typeof prev === 'number' ? prev : 0) + val.n;
      if (isPlain(val)) { const o = {}; Object.keys(val).forEach(k => { const r = resolve(val[k], undefined, now); if (r !== undefined) o[k] = r; }); return o; }
      if (Array.isArray(val)) return val.map(x => resolve(x, undefined, now));
      return clone(val);
    }
    function applyFields(target, patch, now, deep) {
      Object.keys(patch).forEach(k => {
        const v = patch[k];
        if (v && v[SENT] === 'del') { delete target[k]; return; }
        if (deep && isPlain(v) && isPlain(target[k])) { applyFields(target[k], v, now, true); return; }
        target[k] = resolve(v, target[k], now);
      });
    }

    function err(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

    // ---- auth ----
    const accounts = {}; // email -> { uid, password }
    let currentUser = null;
    const listeners = [];
    let uidSeq = 1;
    function makeUser(uid, email) {
      return {
        uid, email,
        delete: async () => {
          Object.keys(accounts).forEach(e => { if (accounts[e].uid === uid) delete accounts[e]; });
          if (currentUser && currentUser.uid === uid) setUser(null);
        }
      };
    }
    function setUser(u) {
      currentUser = u;
      listeners.forEach(cb => setTimeout(() => cb(currentUser), 0));
    }
    const authApi = {
      get currentUser() { return currentUser; },
      onAuthStateChanged(cb) { listeners.push(cb); setTimeout(() => cb(currentUser), 0); return () => {}; },
      async signInWithEmailAndPassword(email, pw) {
        const a = accounts[email];
        if (!a || a.password !== pw) throw err('auth/invalid-credential', 'Invalid email or password.');
        setUser(makeUser(a.uid, email));
        return { user: currentUser };
      },
      async createUserWithEmailAndPassword(email, pw) {
        if (accounts[email]) throw err('auth/email-already-in-use');
        if (!pw || pw.length < 6) throw err('auth/weak-password');
        const uid = 'u' + (uidSeq++) + '_' + Math.random().toString(36).slice(2, 6);
        accounts[email] = { uid, password: pw };
        setUser(makeUser(uid, email));
        return { user: currentUser };
      },
      async signOut() { setUser(null); },
      async sendPasswordResetEmail() {}
    };

    // ---- rules plumbing ----
    function ctxFor(pre, post, path, op) {
      const getFrom = m => p => { if (!m.has(p)) throw err('missing', 'missing ' + p); return m.get(p); };
      return {
        auth: currentUser ? { uid: currentUser.uid } : null,
        resource: pre.has(path) ? pre.get(path) : null,
        request: op === 'delete' ? null : (post.has(path) ? post.get(path) : null),
        get: getFrom(pre),
        getAfter: getFrom(post),
        exists: p => pre.has(p)
      };
    }
    function checkRead(path, op) {
      if (!rules.allow(op, path, ctxFor(store, store, path, op))) {
        log.push({ denied: op, path });
        throw err('permission-denied', 'Missing or insufficient permissions. (' + op + ' ' + path + ')');
      }
    }

    // ---- refs & snapshots ----
    function docSnap(path) {
      const exists = store.has(path);
      const data = exists ? clone(store.get(path)) : undefined;
      return { exists, id: path.split('/').pop(), ref: new DocRef(path), data: () => (exists ? clone(data) : undefined) };
    }
    class DocRef {
      constructor(path) { this.path = path; this.id = path.split('/').pop(); }
      collection(name) { return new Query(this.path + '/' + name); }
      async get() { checkRead(this.path, 'get'); return docSnap(this.path); }
      async set(data, o) { const b = new Batch(); b.set(this, data, o); return b.commit(); }
      async update(data) { const b = new Batch(); b.update(this, data); return b.commit(); }
      async delete() { const b = new Batch(); b.delete(this); return b.commit(); }
    }
    class Query {
      constructor(path, filters, order, lim) { this.path = path; this.filters = filters || []; this.order = order || null; this.lim = lim || null; this.id = path.split('/').pop(); }
      doc(id) { return new DocRef(this.path + '/' + (id || ('auto' + Math.random().toString(36).slice(2, 12)))); }
      where(f, op, v) { return new Query(this.path, this.filters.concat([[f, op, v]]), this.order, this.lim); }
      orderBy(f, dir) { return new Query(this.path, this.filters, [f, dir || 'asc'], this.lim); }
      limit(n) { return new Query(this.path, this.filters, this.order, n); }
      async get() {
        const depth = this.path.split('/').length + 1;
        let paths = [...store.keys()].filter(p => p.startsWith(this.path + '/') && p.split('/').length === depth);
        paths = paths.filter(p => this.filters.every(([f, op, v]) => {
          const d = store.get(p);
          if (op === '==') return d[f] === v;
          throw new Error('fake: unsupported op ' + op);
        }));
        if (this.order) {
          const [f, dir] = this.order;
          const val = p => (f === DOC_ID ? p.split('/').pop() : (store.get(p)[f] instanceof Timestamp ? store.get(p)[f].toMillis() : store.get(p)[f]));
          paths.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * (dir === 'desc' ? -1 : 1));
        }
        if (this.lim) paths = paths.slice(0, this.lim);
        paths.forEach(p => checkRead(p, 'list'));
        const docs = paths.map(docSnap);
        return { docs, empty: docs.length === 0, size: docs.length, forEach: fn => docs.forEach(fn) };
      }
    }

    class Batch {
      constructor() { this.ops = []; }
      set(ref, data, o) { this.ops.push({ kind: 'set', path: ref.path, data, merge: !!(o && o.merge) }); return this; }
      update(ref, data) { this.ops.push({ kind: 'update', path: ref.path, data }); return this; }
      delete(ref) { this.ops.push({ kind: 'delete', path: ref.path }); return this; }
      async commit() { return commitOps(this.ops); }
    }
    function commitOps(ops) {
      const post = new Map([...store.entries()].map(([k, v]) => [k, clone(v)]));
      const touched = [];
      const now = Timestamp.now(); // one commit time per batch, like the server
      ops.forEach(o => {
        if (o.kind === 'delete') { post.delete(o.path); }
        else if (o.kind === 'update') {
          if (!post.has(o.path)) throw err('not-found', 'No document to update: ' + o.path);
          const t = post.get(o.path); applyFields(t, o.data, now, false);
        } else if (o.merge) {
          const t = post.has(o.path) ? post.get(o.path) : {}; applyFields(t, o.data, now, true); post.set(o.path, t);
        } else {
          const t = {}; applyFields(t, o.data, now, false); post.set(o.path, t);
        }
        if (!touched.includes(o.path)) touched.push(o.path);
      });
      touched.forEach(p => {
        const op = !post.has(p) ? 'delete' : store.has(p) ? 'update' : 'create';
        if (op === 'delete' && !store.has(p)) return; // deleting nothing
        if (!rules.allow(op, p, ctxFor(store, post, p, op))) {
          log.push({ denied: op, path: p });
          throw err('permission-denied', 'Missing or insufficient permissions. (' + op + ' ' + p + ')');
        }
      });
      touched.forEach(p => { if (post.has(p)) store.set(p, post.get(p)); else store.delete(p); });
      return Promise.resolve();
    }

    const db = {
      collection: name => new Query(name),
      doc: path => new DocRef(path),
      batch: () => new Batch(),
      async runTransaction(fn) {
        const ops = [];
        const t = {
          get: async ref => { checkRead(ref.path, 'get'); return docSnap(ref.path); },
          set: (ref, data, o) => { ops.push({ kind: 'set', path: ref.path, data, merge: !!(o && o.merge) }); return t; },
          update: (ref, data) => { ops.push({ kind: 'update', path: ref.path, data }); return t; },
          delete: ref => { ops.push({ kind: 'delete', path: ref.path }); return t; }
        };
        const result = await fn(t);
        if (ops.length) commitOps(ops);
        return result;
      }
    };

    function firestoreFn() { return db; }
    firestoreFn.FieldValue = FieldValue;
    firestoreFn.FieldPath = FieldPath;
    firestoreFn.Timestamp = Timestamp;

    const firebase = {
      initializeApp: () => ({}),
      auth: () => authApi,
      firestore: firestoreFn
    };

    // Test hooks
    const fake = {
      store, log, Timestamp,
      setMode(m) { rules = RulesModel.createRules(m); },
      get mode() { return rules.mode; },
      // Seed without rules (console / admin SDK writes)
      put(path, data) { store.set(path, resolve(data, undefined, Timestamp.now())); },
      read(path) { return store.has(path) ? clone(store.get(path)) : null; },
      account(email, password, uid) { accounts[email] = { uid, password }; },
      signInAs(uid, email) { setUser(makeUser(uid, email || uid + '@test')); },
      signOut() { setUser(null); },
      dump() { const o = {}; [...store.keys()].sort().forEach(k => { o[k] = store.get(k); }); return o; }
    };
    return { firebase, fake };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { createFakeFirebase };
  else root.createFakeFirebase = createFakeFirebase;
})(typeof window !== 'undefined' ? window : globalThis);
