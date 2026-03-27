const { Resend } = require("resend");
const { renderShortlist, renderWildcard } = require("../lib/templates");

const templates = { shortlist: renderShortlist, wildcard: renderWildcard };

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth check
  const secret = process.env.BROADCAST_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { template, subject, data } = req.body || {};
  if (!template || !subject || !data) {
    return res.status(400).json({ error: "Missing template, subject, or data" });
  }

  const renderFn = templates[template];
  if (!renderFn) {
    return res.status(400).json({ error: `Unknown template: ${template}` });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const segmentId = process.env.RESEND_SEGMENT_ID;
  const from =
    process.env.RESEND_FROM || "Culture Club <onboarding@resend.dev>";

  if (!resendKey || !segmentId) {
    return res.status(500).json({ error: "Missing RESEND_API_KEY or RESEND_SEGMENT_ID" });
  }

  try {
    const html = renderFn(data);
    const resend = new Resend(resendKey);

    const { data: broadcast } = await resend.broadcasts.create({
      segmentId,
      from,
      subject,
      html,
      name: `${template}: ${subject}`,
    });

    // Send the broadcast
    await resend.broadcasts.send(broadcast.id);

    return res.status(200).json({ ok: true, broadcastId: broadcast.id });
  } catch (err) {
    console.error("Broadcast error:", err);
    return res.status(500).json({ error: "Broadcast failed" });
  }
};
