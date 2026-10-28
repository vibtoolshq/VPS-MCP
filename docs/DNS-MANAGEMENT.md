# Cloudflare Domain & DNS Management

**Status:** Cloudflare DNS record management is implemented for the **private VPS-MCP dashboard**. Automated tests use a mocked Cloudflare API; an actual domain, live Cloudflare token, DNS delegation and public traffic have not yet been verified.

## Before you begin

- The domain must be hosted in **Cloudflare DNS**. Buying a domain from another registrar is fine, but its authoritative nameservers must use Cloudflare for these records to affect real visitors.
- You must be able to access Cloudflare's **Zone ID** (32 hexadecimal characters) for the domain.
- Create a **limited API token** with **Zone:Read** and **DNS:Edit** for **only the selected zone**. Do not paste a Global API Key into the panel.
- Open VPS-MCP over its private SSH tunnel. Do **not** make the admin dashboard public just to manage DNS.

Official instructions: [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/), [Cloudflare DNS Records API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/).

## Connect your Cloudflare zone

1. In your browser, sign in to VPS-MCP's dashboard.
2. Open **Domain & SSL → Manage real DNS records**.
3. In Cloudflare, open your domain overview and copy **Zone ID**.
4. In Cloudflare Profile → API Tokens, create a custom token with **Zone → Zone → Read** and **Zone → DNS → Edit**, scoped to that domain.
5. Paste Zone ID and token in the Control Panel, then **Connect Cloudflare**. The server verifies the zone and tries to list DNS records.
6. After confirmation, select **Load DNS records**. The table shows Cloudflare's actual records. It supports up to 1,000 displayed records.

The browser is told only which zone was connected, not the token. The token is saved to `/data/dns-provider.json` with mode 0600 in the private Compose volume.

## Add, edit and delete records

The panel supports:

| Type | Example name | Value example | Notes |
| --- | --- | --- | --- |
| A | `www` | `203.0.113.10` | IPv4 only; proxy optional |
| AAAA | `www` | `2001:db8::10` | IPv6 only; proxy optional |
| CNAME | `blog` | `pages.example.net` | Target domain; proxy optional |
| TXT | `_dmarc` | `v=DMARC1; p=none` | Text verification, SPF, DKIM etc; no proxy |
| MX | `@` | `mail.example.net` | Set priority; no proxy |

Use `@` for the root domain and a single label such as `www` for a direct subdomain. For nested subdomains, use the complete in-zone name, e.g. `api.stage.example.org`. Changes to unsupported record types (such as NS/SOA/CAA) are not exposed.

To create a record, enter name/type/content/TTL, review the dialog and submit. To edit, select **Edit** on the desired row; the record type is intentionally fixed. To delete, select **Delete** and confirm twice. The server validates record ID, zone membership, record name/type and the previously displayed content again. If the record changed since it was loaded, it rejects the edit/delete; reload before retrying. **A deletion is permanent on Cloudflare** and can interrupt website/email service.

Cloudflare may reject record conflicts or unsupported proxy/TTL combinations. Review the value and DNS rules before retrying. DNS caching means new records can take time to be observed across clients.

## Connection and storage safety

- The provider URL is fixed to **`https://api.cloudflare.com/client/v4/`**; the UI cannot select a different URL/host.
- Access requires an authenticated admin session. All mutations require the session's CSRF token, rate limits and a durable audit record before the provider request.
- The app stores **only one Cloudflare zone/token at a time**. To switch zones, disconnect and connect a new one. It never lists unrelated Cloudflare zones.
- The saved token is **not** visible in `GET /api/status` or other control responses. Do not expose or copy its private state file.
- The private backup archive includes `dns-provider.json`. **Backup archives are not encrypted by the script.** Encrypt off-server copies and control access.
- Disconnecting deletes the saved local credential, but **does not modify any DNS records**.
- Revoking the token in Cloudflare will immediately stop VPS-MCP's ability to manage that zone; reconnect with an updated token if needed.

## Admin API (reference)

```text
GET  /api/status         # includes sanitized dnsProvider status (no token)
POST /api/dns/connect   # {zoneId,token}
POST /api/dns/disconnect
GET  /api/dns/records
POST /api/dns/record    # {action:"create",record:{type,name,content,ttl,proxied,priority?}}
POST /api/dns/record    # {action:"update",id,expectedContent,record:{...}}
POST /api/dns/record    # {action:"delete",id,confirmName,confirmType,expectedContent}
```

All API paths are same-origin, admin-only. Mutations require CSRF; direct unauthenticated requests are rejected. The connection has independent rate limits and the record endpoints use a fixed, verified Cloudflare zone.

## What this DOES NOT do

- Register/purchase domains or change domain registrar nameservers.
- Issue, renew or install SSL certificates.
- Automatically expose the private MCP to the public internet, configure the reverse proxy, change Docker binding or configure OAuth callbacks.
- Support DNS providers other than Cloudflare.
- Prove DNS changes have propagated worldwide just because Cloudflare accepted them.
- Add unrestricted AI access to DNS. **These APIs are administrator dashboard endpoints**, not remotely exposed MCP tools.

For the separate network draft and private host port workflow see [Control Panel Network Guide](CONTROL-PANEL-NETWORK.md). For SSH installation see [README](../README.md).

## Verification and deployment

GitHub CI includes mocked Cloudflare zone handshake, permission rejection, record CRUD, CSRF, cross-zone name validation, secret non-disclosure and private file permissions. **A real Cloudflare account/token has not been connected in these tests**, so live provider compatibility and domain propagation remain deployment-time checks.
