// Minimal Resend SDK fake. Records calls. Supports a 'duplicate' mode where
// contacts.create throws a 409, mirroring Resend's real behaviour.

function createFakeResend({ contactsCreate = "ok" } = {}) {
  const calls = { contacts: [], emails: [] };

  const resend = {
    contacts: {
      async create(args) {
        calls.contacts.push(args);
        if (contactsCreate === "duplicate") {
          const err = new Error("Contact already exists");
          err.statusCode = 409;
          throw err;
        }
        if (contactsCreate === "error") {
          throw new Error("resend down");
        }
        return { id: "c_" + calls.contacts.length };
      },
    },
    emails: {
      async send(args) {
        calls.emails.push(args);
        return { id: "e_" + calls.emails.length };
      },
    },
    _calls: calls,
  };

  return resend;
}

module.exports = { createFakeResend };
