// Minimal in-memory Firestore fake. Implements only the subset used by the app.
// If a method is called that isn't implemented, throw — that forces the test to
// extend the fake rather than silently passing on an unmocked path.

function createFakeFirestore() {
  const collections = new Map();

  function getCollection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    return collections.get(name);
  }

  function createDocRef(docsMap, id) {
    return {
      id,
      async set(data, options = {}) {
        const existing = docsMap.get(id);
        if (options.merge && existing) {
          docsMap.set(id, { ...existing, ...data });
        } else {
          docsMap.set(id, { ...data });
        }
      },
      async update(data) {
        // Real Firestore update() throws if the doc doesn't exist; mirror that.
        const existing = docsMap.get(id);
        if (!existing) {
          const err = new Error("NOT_FOUND: No document to update");
          err.code = 5;
          throw err;
        }
        docsMap.set(id, { ...existing, ...data });
      },
      async get() {
        const data = docsMap.get(id);
        return {
          exists: data !== undefined,
          id,
          data: () => (data ? { ...data } : undefined),
        };
      },
      async delete() {
        docsMap.delete(id);
      },
    };
  }

  function createCollectionRef(name) {
    const docs = getCollection(name);
    const ref = {
      doc(id) {
        return createDocRef(docs, id);
      },
      async add(data) {
        const id = `auto-${docs.size + 1}`;
        docs.set(id, { ...data });
        return createDocRef(docs, id);
      },
      orderBy() {
        return ref;
      },
      async get() {
        return {
          docs: Array.from(docs.entries()).map(([id, data]) => ({
            id,
            data: () => ({ ...data }),
          })),
        };
      },
      count() {
        return {
          async get() {
            return { data: () => ({ count: docs.size }) };
          },
        };
      },
    };
    return ref;
  }

  return {
    collection(name) {
      return createCollectionRef(name);
    },
    // Test-only introspection: snapshot of all collections as plain objects.
    _inspect() {
      const out = {};
      for (const [name, docs] of collections) {
        out[name] = Object.fromEntries(docs);
      }
      return out;
    },
  };
}

module.exports = { createFakeFirestore };
