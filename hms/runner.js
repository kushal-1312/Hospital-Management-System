/**
 * MedCare One - Unified Application Runner
 * Starts MongoDB (if not running), Backend API, and Frontend Vite dev server with a single command.
 * Automatically opens the browser once the frontend is ready.
 */

const { spawn, exec } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');

// ANSI Colors
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// Detect workspace roots
let hmsRoot = __dirname;
if (!fs.existsSync(path.join(hmsRoot, 'backend')) && fs.existsSync(path.join(hmsRoot, 'hms', 'backend'))) {
  hmsRoot = path.join(hmsRoot, 'hms');
}

const backendDir = path.join(hmsRoot, 'backend');
const frontendDir = path.join(hmsRoot, 'frontend');
const mongoDataDir = path.join(hmsRoot, '.runtime', 'mongo_data');
const cachedMongoBin = path.join(backendDir, 'node_modules', '.cache', 'mongodb-memory-server', 'mongod-x64-win32-8.2.6.exe');

const processes = [];

function checkPort(port, host = 'localhost') {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function waitForPort(port, timeoutMs = 30000, host = 'localhost') {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkPort(port, host)) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

function logLine(prefix, color, data) {
  const lines = data.toString().split(/\r?\n/);
  for (const line of lines) {
    if (line.trim().length > 0) {
      console.log(`${color}${prefix}${RESET} ${line}`);
    }
  }
}

async function ensureMongo() {
  const isUp = await checkPort(27017);
  if (isUp) {
    console.log(`${GREEN}✔${RESET} MongoDB is active on port 27017.`);
    return;
  }

  console.log(`${YELLOW}⟳${RESET} Starting local MongoDB engine...`);
  if (!fs.existsSync(mongoDataDir)) {
    fs.mkdirSync(mongoDataDir, { recursive: true });
  }

  let mongoExe = 'mongod';
  if (fs.existsSync(cachedMongoBin)) {
    mongoExe = cachedMongoBin;
  }

  const mongoProcess = spawn(mongoExe, ['--dbpath', mongoDataDir, '--port', '27017', '--bind_ip', '127.0.0.1'], {
    stdio: 'ignore',
    detached: true,
    windowsHide: true,
  });
  mongoProcess.unref();

  const ready = await waitForPort(27017, 10000);
  if (ready) {
    console.log(`${GREEN}✔${RESET} MongoDB started successfully.`);
  } else {
    console.log(`${YELLOW}⚠${RESET} MongoDB startup verification pending. Continuing...`);
  }
}

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
  exec(cmd, (err) => {
    if (err) console.error('Failed to open browser:', err.message);
  });
}

function killAll() {
  console.log(`\n${YELLOW}Stopping MedCare HMS processes...${RESET}`);
  for (const proc of processes) {
    if (proc.pid) {
      try {
        if (process.platform === 'win32') {
          exec(`taskkill /pid ${proc.pid} /T /F`, () => {});
        } else {
          proc.kill('SIGTERM');
        }
      } catch (e) {}
    }
  }
  process.exit(0);
}

process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

async function main() {
  console.log(`${BOLD}${CYAN}===============================================${RESET}`);
  console.log(`${BOLD}${CYAN}   MedCare One HMS 3.0 - Unified Starter       ${RESET}`);
  console.log(`${BOLD}${CYAN}===============================================${RESET}\n`);

  // 1. Ensure Database
  await ensureMongo();

  // 2. Backend API
  const backendAlreadyRunning = await checkPort(5000);
  if (backendAlreadyRunning) {
    console.log(`${GREEN}✔${RESET} Backend API is already active on port 5000.`);
  } else {
    console.log(`${CYAN}⟳${RESET} Launching Backend API (port 5000)...`);
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const backendProc = spawn(npmCmd, ['run', 'dev'], {
      cwd: backendDir,
      env: { ...process.env, FORCE_COLOR: 'true' },
    });
    processes.push(backendProc);
    backendProc.stdout.on('data', (d) => logLine('[BACKEND]', CYAN, d));
    backendProc.stderr.on('data', (d) => logLine('[BACKEND]', RED, d));
  }

  // 3. Frontend Web App
  const frontendAlreadyRunning = await checkPort(3000);
  if (frontendAlreadyRunning) {
    console.log(`${GREEN}✔${RESET} Frontend Web App is already active on port 3000.`);
  } else {
    console.log(`${MAGENTA}⟳${RESET} Launching Frontend UI (port 3000)...`);
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const frontendProc = spawn(npmCmd, ['run', 'dev'], {
      cwd: frontendDir,
      env: { ...process.env, FORCE_COLOR: 'true' },
    });
    processes.push(frontendProc);
    frontendProc.stdout.on('data', (d) => logLine('[FRONTEND]', MAGENTA, d));
    frontendProc.stderr.on('data', (d) => logLine('[FRONTEND]', RED, d));
  }

  // 4. Ensure Frontend is Ready and Launch Browser
  const feReady = await waitForPort(3000, 20000);
  if (feReady) {
    console.log(`\n${BOLD}${GREEN}✔ MedCare One HMS is LIVE!${RESET}`);
    console.log(`👉 Access URL: ${BOLD}http://localhost:3000${RESET}`);
    console.log(`👉 Demo login: ${BOLD}admin@hms.com${RESET} / ${BOLD}Admin@1234${RESET}\n`);
    openBrowser('http://localhost:3000');
  } else {
    console.log(`\n${YELLOW}⚠ Server taking longer to respond. Check http://localhost:3000 manually.${RESET}\n`);
  }

  // If both were already running and no child process spawned, exit runner cleanly after opening browser
  if (processes.length === 0) {
    console.log(`${GREEN}All services are already active and healthy.${RESET}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Startup failed:', err);
  killAll();
});
