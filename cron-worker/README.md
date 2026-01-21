# Reddit Agent Cron Worker

Standalone cron job for discovering Reddit posts. Runs on a VPS to avoid Reddit's IP blocking of serverless platforms.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Vercel      │     │      VPS        │     │     Turso       │
│                 │     │                 │     │                 │
│  Next.js App    │────▶│  Cron Worker    │────▶│    Database     │
│  (Frontend/API) │     │  (this script)  │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       ▲
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                    Both read/write to Turso
```

- **Vercel**: Hosts the main Next.js application (frontend UI and API routes)
- **VPS**: Runs only this cron worker to fetch Reddit posts
- **Turso**: Shared database accessed by both

The cron worker writes discovered threads to the database. The Vercel app reads and displays them.

---

## Deployment Option A: Bundled File (Recommended)

Build locally and deploy a single file. No need to clone the repo on your VPS.

### 1. Build Locally

```bash
cd cron-worker
bun install
bun run build
```

This creates `dist/discover.js` - a single bundled file with all dependencies included.

### 2. Copy to VPS

```bash
scp dist/discover.js user@your-vps:/home/user/reddit-cron/discover.js
```

### 3. Set Up Environment

SSH into your VPS and create a `.env` file:

```bash
ssh user@your-vps
cd /home/user/reddit-cron
nano .env
```

Add your Turso credentials:

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token-here
```

Set permissions:

```bash
chmod 600 .env
```

### 4. Install Bun on VPS

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

### 5. Test the Script

```bash
cd /home/user/reddit-cron
export $(cat .env | xargs) && bun run discover.js
```

Expected output:

```
[Cron] Starting discover job...
[Cron] Time: 2024-01-15T10:30:00.000Z
[Cron] Fetched 127 posts from Reddit API
[Cron] Inserted 3 new threads
[Cron] Job finished successfully
```

### 6. Set Up Cron

```bash
crontab -e
```

Add (runs every 2 minutes):

```cron
*/2 * * * * cd /home/user/reddit-cron && export $(cat .env | xargs) && /home/user/.bun/bin/bun run discover.js >> /var/log/reddit-cron.log 2>&1
```

Create the log file:

```bash
sudo touch /var/log/reddit-cron.log
sudo chown $(whoami):$(whoami) /var/log/reddit-cron.log
```

---

## Deployment Option B: Clone Repository

Use this if you want to modify code directly on the server.

### 1. Clone and Install

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/reddit-agent.git
cd reddit-agent

# Install root dependencies (for shared lib/)
bun install

# Install cron-worker dependencies
cd cron-worker
bun install
```

### 2. Create Environment File

Create `.env` in the project root:

```bash
cd ~/reddit-agent
nano .env
```

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-auth-token-here
```

```bash
chmod 600 .env
```

### 3. Test

```bash
cd ~/reddit-agent
export $(cat .env | xargs) && bun run cron:discover
```

### 4. Set Up Cron

```bash
crontab -e
```

```cron
*/2 * * * * cd /home/user/reddit-agent && export $(cat .env | xargs) && /home/user/.bun/bin/bun run cron:discover >> /var/log/reddit-cron.log 2>&1
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TURSO_DATABASE_URL` | Turso database URL (e.g., `libsql://db-name.turso.io`) | Yes |
| `TURSO_AUTH_TOKEN` | Turso authentication token | Yes |

---

## Updating

### Option A (Bundled)

Rebuild locally and re-upload:

```bash
# Local machine
cd cron-worker
bun run build
scp dist/discover.js user@your-vps:/home/user/reddit-cron/discover.js
```

### Option B (Cloned Repo)

```bash
cd ~/reddit-agent
git pull origin main
bun install
cd cron-worker
bun install
```

---

## Monitoring

### View Logs

```bash
# Live logs
tail -f /var/log/reddit-cron.log

# Recent logs
tail -n 50 /var/log/reddit-cron.log

# Search for errors
grep -i error /var/log/reddit-cron.log
```

### Check Cron Status

```bash
# Verify cron is running
sudo systemctl status cron

# View crontab
crontab -l

# Check recent cron executions
grep CRON /var/log/syslog | tail -20
```

---

## Troubleshooting

### 0 posts fetched

This usually means Reddit is blocking your VPS IP:

1. Try a different VPS provider
2. Consider using a residential proxy
3. Check if the IP is on any blocklists

### Script doesn't run via cron

1. Use full paths for `bun` (find with `which bun`)
2. Verify `.env` file exists and is readable
3. Check cron daemon is running: `sudo systemctl status cron`

### Environment variables not loading

Test manually:

```bash
export $(cat .env | xargs) && echo $TURSO_DATABASE_URL
```

If empty, check `.env` file format (no quotes around values, no spaces around `=`).

---

## Log Rotation

Prevent logs from growing indefinitely:

```bash
sudo nano /etc/logrotate.d/reddit-cron
```

```
/var/log/reddit-cron.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
}
```
