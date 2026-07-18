function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLine(line: string): string {
  const urlMatch = line.match(/^(.*?):\s*(https?:\/\/\S+)$/);
  if (urlMatch) {
    const label = escapeHtml(urlMatch[1]!.trim());
    const url = escapeHtml(urlMatch[2]!);
    return `<tr>
<td style="padding:16px 0 0;text-align:center;">
<a href="${url}" style="display:inline-block;padding:0 20px;height:40px;line-height:40px;background:linear-gradient(105deg,#e2c295,#a99ad3);color:#171310;font-size:13px;font-weight:550;border-radius:2px;text-decoration:none;">${label}</a>
</td>
</tr>
<tr>
<td style="padding:8px 0 0;text-align:center;">
<a href="${url}" style="color:#5a6a80;font-size:11px;text-decoration:underline;">${url}</a>
</td>
</tr>`;
  }
  const trimmed = line.trim();
  if (trimmed === "\u2014" || trimmed === "" || trimmed.startsWith("Astron \u00b7"))
    return "";
  return `<tr>
<td style="padding:4px 0;color:#cbd5e7;font-size:14px;line-height:1.6;">${escapeHtml(trimmed)}</td>
</tr>`;
}

export function renderHtml(subject: string, text: string): string {
  const lines = text.split("\n").map(renderLine).filter(Boolean).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b1320;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0b1320;">
<tr>
<td align="center" style="padding:40px 16px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:100%;">
<tr>
<td style="padding:0 0 28px;text-align:center;">
<span style="color:#e2c295;font-size:21px;font-weight:600;letter-spacing:-0.03em;">Astron</span>
</td>
</tr>
<tr>
<td style="padding:28px 24px;background:linear-gradient(145deg,rgba(18,29,49,0.94),rgba(10,17,30,0.96));border:1px solid rgba(157,180,235,0.18);border-radius:8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${lines}
</table>
</td>
</tr>
<tr>
<td style="padding:24px 0 0;text-align:center;">
<span style="color:#5a6a80;font-size:12px;">Astron &middot; Restaurant service, clearly coordinated.</span>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;
}
