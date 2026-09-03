# Connecting the command centre to Ben's mailbox

Written 3 September 2026, after the chat was asked to check an email and could
not, because the app had no mailbox access at all.

The code is built, deployed and waiting. It needs one thing done inside Nuvo's
Microsoft 365 tenant, which needs a tenant administrator. About ten minutes.

## Why it is built this way

The app can reach two kinds of thing: a plain HTTPS API with a key, or nothing.
JobTread is live in the chat because it is the first kind. Outlook was the second
kind, reachable only by a scheduled Claude session, so the app knew about email
twice a weekday and was blind in between.

Microsoft Graph is a plain HTTPS API. Wiring it the same way JobTread is wired
makes mail and calendar live for the app itself, with no scheduled task in the
loop and no copy of his mail stored anywhere.

## What gets created

An app registration in Entra ID (Azure AD), with **application** permissions, so
it works without a person signed in. That is what lets the chat answer a mail
question at 6am on a Sunday.

### 1. Register the app

Entra admin centre, App registrations, New registration.
- Name: `Nuvo Command Centre`
- Accounts: this organizational directory only
- No redirect URI. This app never signs a person in.

Copy the **Application (client) ID** and the **Directory (tenant) ID**.

### 2. Permissions. Read only, and only these two.

API permissions, Add a permission, Microsoft Graph, **Application permissions**:
- `Mail.Read`
- `Calendars.Read`

Then **Grant admin consent**.

Do **not** add `Mail.ReadWrite`, `Mail.Send`, `Mail.ReadWrite.All`, or anything
that writes. The standing rule since July is that Outlook is strictly read only
and this must not become the exception. The code has no write path; the
permission grant is the thing that must also have none.

### 3. Client secret

Certificates and secrets, New client secret. Copy the **Value** immediately, not
the Secret ID. Set the longest expiry your policy allows and put the expiry date
in a calendar reminder, because when it lapses mail goes quiet and the failure
looks like an empty inbox.

### 4. RESTRICT IT TO BEN'S MAILBOX. This step is not optional.

`Mail.Read` as an application permission reads **every mailbox at Nuvo**, not
Ben's. Nothing in the app can detect or prevent that, which is exactly why it has
to be constrained at the Exchange end.

In Exchange Online PowerShell:

```powershell
Connect-ExchangeOnline

New-DistributionGroup -Name "CommandCentreMailScope" -Type Security `
  -Members ben@nuvoconstruction.com

New-ApplicationAccessPolicy -AppId <CLIENT-ID> `
  -PolicyScopeGroupId CommandCentreMailScope@nuvoconstruction.com `
  -AccessRight RestrictAccess `
  -Description "Command centre may read only Ben's mailbox"
```

Then prove it both ways. Both of these must be run and both answers checked:

```powershell
Test-ApplicationAccessPolicy -Identity ben@nuvoconstruction.com     -AppId <CLIENT-ID>
Test-ApplicationAccessPolicy -Identity <anyone.else>@nuvoconstruction.com -AppId <CLIENT-ID>
```

The first must say Granted. The second must say Denied. If the second says
Granted, stop and fix it before setting the environment variables, because at
that point the app can read the whole company's mail.

Policy changes can take up to a couple of hours to apply.

**Verify these cmdlet names against current Microsoft documentation before you
run them.** Microsoft has been moving this control toward "RBAC for
Applications", and application access policies may be deprecated or renamed by
now. The requirement is what matters, not the syntax: the app must be scoped to
one mailbox. If the cmdlets above do not exist in your tenant, find the current
equivalent rather than skipping the step.

### 5. Set three values on the Netlify site

Site `30bdd77c-2d79-4967-a130-5e84e92cd64c`, environment variables:

| name | value |
|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID |
| `MS_CLIENT_ID` | Application (client) ID |
| `MS_CLIENT_SECRET` | the secret **Value** |
| `MS_MAILBOX` | optional, defaults to `ben@nuvoconstruction.com` |

It picks these up on the next deploy.

## Checking it worked

Open the command centre, Today tab, and press **Check mail**. Three possible
answers and they are deliberately different:

- A list of messages. Done.
- "Live mail is built but not connected yet." The three values are not set, or
  the deploy predates them.
- "Graph refused that (403)." Either admin consent was not granted, or the
  access policy does not include this mailbox. Those are the two usual causes and
  the message says so.

Then ask the chat something only the mailbox can answer, like what Mike sent
today. It should go and look, and say what it searched for if it finds nothing.

## What this does and does not do

**Does**: read messages and calendar events for one mailbox, on demand, when Ben
asks. Nothing is copied into the app's storage. Every read is live.

**Does not**: send, reply, delete, move, flag, or mark read. There is no code
path for any of that and the permissions do not allow it.

## Two things worth knowing before you turn it on

**The site password now guards the inbox.** Anyone who can sign into the command
centre can ask the chat to read Ben's mail. That was already true of job values
and client names; it is more true now. Worth making the password a strong one if
it is not already.

**Email is text written by strangers.** Anyone can email Ben, so the chat is now
reading attacker-controllable text. Two defences are in the code: the system
prompt tells it that mail is data and never instructions, and every mailbox
result is wrapped in an explicit untrusted marker before the model sees it.
Neither is a guarantee. If the chat ever reports that an email tried to instruct
it, that is the defence working and worth looking at.
