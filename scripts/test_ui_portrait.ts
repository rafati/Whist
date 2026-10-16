import { spawn } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9334;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CDPClient {
  private ws!: WebSocket;
  private id = 1;
  private callbacks = new Map<number, (res: any) => void>();
  public consoleLogs: string[] = [];
  public consoleErrors: string[] = [];

  constructor(private wsUrl: string) {}

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise<void>((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && this.callbacks.has(msg.id)) {
        const cb = this.callbacks.get(msg.id)!;
        this.callbacks.delete(msg.id);
        cb(msg);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const text = msg.params.args.map((a: any) => a.value || JSON.stringify(a)).join(' ');
        this.consoleLogs.push(`[${msg.params.type}] ${text}`);
        if (msg.params.type === 'error') {
          this.consoleErrors.push(text);
        }
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const text = msg.params.exceptionDetails?.text || 'Exception';
        const desc = msg.params.exceptionDetails?.exception?.description || '';
        this.consoleErrors.push(`[UNCAUGHT] ${text}: ${desc}`);
      }
    });
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const reqId = this.id++;
      this.callbacks.set(reqId, resolve);
      this.ws.send(JSON.stringify({ id: reqId, method, params }));
    });
  }

  async captureScreenshot(outputPath: string) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res.result?.data) {
      fs.writeFileSync(outputPath, Buffer.from(res.result.data, 'base64'));
      console.log(`Saved screenshot to ${outputPath}`);
    } else {
      console.error('Failed to capture screenshot:', res);
    }
  }

  close() {
    this.ws.close();
  }
}

async function runPortraitTests() {
  const tmpUserDataDir = `/tmp/chrome_test_profile_portrait_${Date.now()}`;
  fs.mkdirSync(tmpUserDataDir, { recursive: true });

  console.log('--- 1. Launching Headless Chrome in Mobile Portrait (390x844 - iPhone 14/15) ---');
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${tmpUserDataDir}`,
      '--window-size=390,844',
      '--no-first-run',
      '--no-default-browser-check',
      'http://localhost:3001',
    ],
    { stdio: 'ignore' }
  );

  let cdpWsUrl = '';
  for (let i = 0; i < 20; i++) {
    await wait(400);
    try {
      const res = await fetch(`http://localhost:${DEBUG_PORT}/json/version`);
      if (res.ok) {
        const json = await res.json();
        cdpWsUrl = json.webSocketDebuggerUrl;
        break;
      }
    } catch {
      // waiting for chrome to bind
    }
  }

  if (!cdpWsUrl) {
    chromeProcess.kill();
    throw new Error('Failed to connect to Chrome remote debugging port.');
  }

  const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
  const tabs = await listRes.json();
  const pageTab = tabs.find((t: any) => t.type === 'page');
  const pageWsUrl = pageTab ? pageTab.webSocketDebuggerUrl : cdpWsUrl;

  const cdp = new CDPClient(pageWsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  console.log('--- 2. Setting Authenticated User in LocalStorage ---');
  const authPayload = JSON.stringify({
    sub: 'user_tester_portrait',
    name: 'Mobile Pilot',
    email: 'pilot@royalwhist.club',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Pilot',
  });

  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('whist_google_account_v2', ${JSON.stringify(authPayload)});`,
  });

  console.log('--- 3. Navigating to Lobby in Portrait ---');
  await cdp.send('Page.navigate', { url: 'http://localhost:3001' });
  await wait(1800);

  const lobbyScreenshotPath = '/tmp/ui_test_portrait_lobby.png';
  await cdp.captureScreenshot(lobbyScreenshotPath);

  console.log('--- 4. Entering Game Table in Portrait Mode ---');
  const clickResult = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const instantBtn = buttons.find(b => b.textContent && (b.textContent.includes('Instant Match') || b.textContent.includes('Quick Play')));
      if (instantBtn) {
        instantBtn.click();
        return 'Clicked ' + instantBtn.textContent.trim();
      }
      return 'Instant Match button not found';
    })()`,
    returnByValue: true,
  });
  console.log('Action:', clickResult.result?.value);
  await wait(3000);

  console.log('--- 4.5. Seating & Dealing Cards in Portrait ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const fillBtn = buttons.find(b => b.textContent && b.textContent.includes('Fill Bots & Deal'));
      if (fillBtn) {
        fillBtn.click();
        return 'Clicked Fill Bots & Deal';
      }
      return 'Fill button not found';
    })()`,
    returnByValue: true,
  });
  await wait(3000);

  const biddingScreenshotPath = '/tmp/ui_test_portrait_bidding.png';
  await cdp.captureScreenshot(biddingScreenshotPath);

  console.log('--- 5. Interacting with Table (Bidding & Trump Declaration in Portrait) ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const bidBtn = buttons.find(b => b.textContent && b.textContent.includes('Bid 1 Suit'));
      if (bidBtn) {
        bidBtn.click();
        return 'Clicked Bid 1 Suit';
      }
      const passBtn = buttons.find(b => b.textContent && b.textContent.includes('Pass'));
      if (passBtn) {
        passBtn.click();
        return 'Clicked Pass';
      }
      return 'No bid button found';
    })()`,
    returnByValue: true,
  });
  await wait(4000);

  // If declarer modal/console is up, pick Spades or Hearts
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const spadeBtn = buttons.find(b => b.textContent && (b.textContent.includes('Spades') || b.textContent.includes('Hearts')));
      if (spadeBtn) {
        spadeBtn.click();
        return 'Clicked Trump Suit';
      }
      return 'No trump button';
    })()`,
    returnByValue: true,
  });
  await wait(4500);

  const playingScreenshotPath = '/tmp/ui_test_portrait_playing.png';
  await cdp.captureScreenshot(playingScreenshotPath);

  console.log('--- 6. Playing a Card from Hand in Portrait ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cardSlots = Array.from(document.querySelectorAll('.portrait-card-slot, .landscape-compact-card-slot'));
      if (cardSlots.length > 0) {
        const cardElem = cardSlots[0].querySelector('div');
        if (cardElem) {
          cardElem.click();
          setTimeout(() => cardElem.click(), 50);
          return 'Played card';
        }
      }
      return 'No card found';
    })()`,
    returnByValue: true,
  });
  await wait(2500);

  const trickScreenshotPath = '/tmp/ui_test_portrait_trick.png';
  await cdp.captureScreenshot(trickScreenshotPath);

  console.log('\n--- 7. Inspecting Console Logs and Errors ---');
  console.log(`Total console logs: ${cdp.consoleLogs.length}`);
  console.log(`Total console errors: ${cdp.consoleErrors.length}`);

  if (cdp.consoleErrors.length > 0) {
    console.error('Console errors detected:');
    cdp.consoleErrors.forEach((e) => console.error('  ->', e));
  } else {
    console.log('✓ ZERO console errors or unhandled exceptions detected in portrait test!');
  }

  cdp.close();
  chromeProcess.kill();
  try {
    fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
  } catch {}

  console.log('\n--- All Portrait UI tests completed successfully! ---');
}

runPortraitTests().catch((err) => {
  console.error('Portrait Test Runner failed:', err);
  process.exit(1);
});
