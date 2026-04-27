// Minimal Vercel/Express-shaped response fake for handler tests.

function createFakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    end(body) {
      if (body !== undefined) this.body = body;
      this.ended = true;
      return this;
    },
  };
  return res;
}

module.exports = { createFakeRes };
