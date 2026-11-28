import "server-only";

// The careers mailbox: where candidates' replies arrive and where the ERP reads them (IMAP).
// IMAP_HOST / IMAP_PORT / IMAP_USER / IMAP_PASS when set; otherwise the server's own SMTP account,
// read over IMAP on the same host (Hostinger and most providers: smtp.x → imap.x, port 993, same login).
// The careers email's Reply-To is this address, so a reply always lands where it can be read.

export type MailboxConfig = { host: string; port: number; secure: boolean; user: string; pass: string; address: string };

export function careersMailbox(): MailboxConfig | null {
  const e = process.env;
  if ((e.CAREERS_MAILBOX ?? "").toLowerCase() === "off") return null;
  const user = e.IMAP_USER?.trim() || e.SMTP_USER?.trim();
  const pass = e.IMAP_PASS || e.SMTP_PASS;
  const host = e.IMAP_HOST?.trim() || (e.SMTP_HOST?.trim().replace(/^smtp\./i, "imap.") ?? "");
  if (!user || !pass || !host || pass === "[SENSITIVE]") return null;
  const port = Number(e.IMAP_PORT || 993);
  return { host, port, secure: (e.IMAP_SECURE ?? (port === 993 ? "true" : "false")) !== "false", user, pass, address: e.CAREERS_REPLY_TO?.trim() || user };
}
