function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrap(body, { unsubscribe = false } = {}) {
  const footer = unsubscribe
    ? `<p style="margin:0 0 8px;font-size:12px;color:#A0A0A0;"><a href="https://circuit.fm" style="color:#A0A0A0;text-decoration:underline;">circuit.fm</a></p>
<p style="margin:0;font-size:11px;"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#666;text-decoration:underline;">unsubscribe</a></p>`
    : `<p style="margin:0;font-size:12px;color:#A0A0A0;"><a href="https://circuit.fm" style="color:#A0A0A0;text-decoration:underline;">circuit.fm</a></p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#000;">
<div style="font-family:'Courier New',Courier,monospace;color:#fff;background:#000;max-width:480px;margin:0 auto;padding:48px 24px;">
<p style="margin:0 0 40px;font-size:18px;font-weight:600;">Circuit FM</p>
${body}
<div style="border-top:2px solid #FF4400;margin:40px 0 24px;"></div>
${footer}
</div>
</body></html>`;
}

function ctaButton(text, url) {
  return `<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#FF4400;color:#000;font-family:'Courier New',Courier,monospace;font-size:14px;font-weight:600;text-decoration:none;padding:10px 24px;line-height:1;">${escapeHtml(text)}</a></p>`;
}

function renderConfirmation({ profileUrl } = {}) {
  const cta = profileUrl
    ? `<p style="margin:32px 0 8px;font-size:14px;line-height:1.6;">Two minutes that help us invite you to the right outings:</p>
${ctaButton("Tell us a bit about you →", profileUrl)}
<p style="margin:0 0 0;font-size:12px;line-height:1.6;color:#A0A0A0;">Four short questions. Edit any time.</p>`
    : "";

  return wrap(`
<p style="margin:0 0 24px;font-size:16px;line-height:1.6;">You're on the list.</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#A0A0A0;">A members' club with no house. It moves with you. Tap in at any venue. See who's here. Connect if you want to.</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#A0A0A0;">Curated outings. Member-only access. London 2026.</p>
${cta}`);
}

function renderShortlist({ format, day, options }) {
  const optionBlocks = options
    .map(
      (opt) => `
<p style="margin:0 0 4px;font-size:16px;font-weight:600;">${escapeHtml(opt.name)}</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;">${escapeHtml(opt.description)}</p>
<p style="margin:0 0 0;font-size:13px;color:#A0A0A0;">${escapeHtml(opt.venue)}</p>
${ctaButton("RSVP →", opt.rsvpUrl)}`
    )
    .join(`\n<p style="margin:16px 0;color:#333;">—</p>\n`);

  return wrap(
    `
<p style="margin:0 0 32px;font-size:20px;font-weight:600;">${escapeHtml(format)}: ${escapeHtml(day)}.</p>
${optionBlocks}`,
    { unsubscribe: true }
  );
}

function renderWildcard({ name, description, date, venue, rsvpUrl }) {
  return wrap(
    `
<p style="margin:0 0 32px;font-size:14px;line-height:1.6;color:#A0A0A0;">this one's different.</p>
<p style="margin:0 0 4px;font-size:20px;font-weight:600;">${escapeHtml(name)}</p>
<p style="margin:0 0 4px;font-size:14px;line-height:1.6;">${escapeHtml(description)}</p>
<p style="margin:0 0 0;font-size:13px;color:#A0A0A0;">${escapeHtml(date)}, ${escapeHtml(venue)}</p>
${ctaButton("RSVP →", rsvpUrl)}`,
    { unsubscribe: true }
  );
}

module.exports = {
  renderConfirmation,
  renderShortlist,
  renderWildcard,
  escapeHtml,
};
