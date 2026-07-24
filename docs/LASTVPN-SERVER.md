# LastVPN Server Access (DE-1)

**Project:** LastVPN (self-hosted VPN for LastVPN / BE dev access)  
**Date documented:** 2026-07-13

## Server Details

- **Provider:** Hetzner Cloud
- **Location:** Nuremberg (nuremberg1 / DE)
- **IPv4:** 5.75.157.60
- **Hostname:** lastvpn-de-1
- **OS:** Ubuntu 24.04 LTS
- **SSH User:** root
- **SSH Password:** dOLORES35!
- **Project path on server:** `/root/LastVPN`

## SSH Access

```bash
ssh root@5.75.157.60
# password: dOLORES35!
```

**Recommendation:** Set up SSH key auth soon and rotate the password.

## Services & Ports (open in Hetzner + ufw)

| Service                  | Protocol | Port(s)          | Notes |
|--------------------------|----------|------------------|-------|
| Xray (VLESS Reality xHTTP) | TCP    | 443             | Primary working transport (Happ) |
| Xray (VLESS Reality Vision) | TCP | 8443            | Good for Amnezia / classic clients |
| Xray (xHTTP alt)         | TCP      | 4430            | Backup |
| Hysteria2                | UDP      | 443             | Failover (with port hopping 20000-45000 UDP) |
| Subscription server      | TCP      | 8080            | http://5.75.157.60:8080/sub/demo-trial-3day |
| Masquerade (Hysteria)    | TCP      | 8444            | Internal |

## Client Configurations

### Subscription (recommended for Happ)
```
http://5.75.157.60:8080/sub/demo-trial-3day
```

### Amnezia / Xray clients - Vision (TCP Reality) - recommended for Amnezia on PC
```
vless://9528369d-3ff9-4330-af67-4005d02e56b9@5.75.157.60:8443?type=tcp&encryption=none&security=reality&flow=xtls-rprx-vision&sni=www.cloudflare.com&fp=chrome&pbk=G98xsoB6xFMzjujuWTy2UrnSXndVFsAeeonF2-RtlB4&sid=6ea050f916cc38d6#DE-1-Vision-Amnezia
```

### Happ - xHTTP (best on the phone path we tested)
```
vless://9528369d-3ff9-4330-af67-4005d02e56b9@5.75.157.60:443?encryption=none&type=xhttp&security=reality&mode=auto&path=%2F&sni=www.google.com&fp=chrome&pbk=G98xsoB6xFMzjujuWTy2UrnSXndVFsAeeonF2-RtlB4&sid=6ea050f916cc38d6&fragment=10-20,10-20,tlshello#DE-1 · Trial · xHTTP-443
```

## Current Status (as of 2026-07-13)

- xHTTP-443 (with fragment) has worked well for some sessions (YouTube functional).
- Vision 8443 is more compatible with Amnezia.
- Path can be unstable after heavy testing/probing (TSPU/DPI throttling on this IP).
- When using Amnezia: if it shows "Connected" but no internet (even http://1.1.1.1 fails), the tunnel is dead for that session. Try the Vision key or switch clients.
- Always test with raw IP first (`http://1.1.1.1`) to separate DNS vs tunnel problems.

## Useful Commands on the Server

```bash
cd /root/LastVPN
docker compose ps
docker logs lastvpn-xray --tail 50
docker logs lastvpn-hysteria --tail 50

# Fresh subscription content
curl -s http://127.0.0.1:8080/sub/demo-trial-3day | base64 -d

# Health
curl -s http://127.0.0.1:8080/healthz
```

## Notes

- This server was set up as a core LastVPN node (Xray + Hysteria2 + subscription endpoint).
- Full troubleshooting history is in the sibling LastVPN project: `D:\LastVPN\docs\OPS-RUNBOOK-DE1.md`
- Password included here per request. Rotate it and prefer SSH keys for daily use.
- Do not commit this file if the repo is public.

## Quick Connect Checklist (from PC with Amnezia)

1. Use the Vision vless link above (port 8443).
2. Make sure Kill Switch is temporarily off for testing.
3. After connect, immediately test `http://1.1.1.1` (bypasses DNS).
4. If that fails, the Amnezia session is not passing traffic — switch to the xHTTP link in Happ or try another client (v2rayN/Hiddify).

Server is ready for use from both mobile (Happ) and PC (Amnezia with Vision link).