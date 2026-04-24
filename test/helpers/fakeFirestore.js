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

  function matchesFilter(data, { field, op, value }) {
    const v = data[field];
    switch (op) {
      case "==":
        return v === value;
      case "!=":
        return v !== value;
      case "in":
        return Array.isArray(value) && value.includes(v);
      default:
        throw new Error(`fakeFirestore: unsupported op "${op}"`);
    }
  }

  function makeQuery(docsMap, filters = []) {
    return {
      where(field, op, value) {
        return makeQuery(docsMap, [...filters, { field, op, value }]);
      },
      orderBy() {
        return makeQuery(docsMap, filters);
      },
      async get() {
        const out = [];
        for (const [id, data] of docsMap.entries()) {
          if (filters.every((f) => matchesFilter(data, f))) {
            out.push({ id, data: () => ({ ...data }) });
          }
        }
        return { docs: out };
      },
    };
  }

  function createCollectionRef(name) {
    const docs = getCollection(name);
    const rootQuery = makeQuery(docs);
    const ref = {
      doc(id) {
        return createDocRef(docs, id);
      },
      async add(data) {
        const id = `auto-${docs.size + 1}`;
        docs.set(id, { ...data });
        return createDocRef(docs, id);
      },
      orderBy(...args) {
        return rootQuery.orderBy(...args);
      },
      where(...args) {
        return rootQuery.where(...args);
      },
      async get() {
        return rootQuery.get();
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
