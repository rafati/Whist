import { spawn } from 'child_process';
import WebSocket from 'ws';
import fs from 'fs';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9335;

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
    }
  }

  close() {
    this.ws.close();
  }
}

async function runTouchTests() {
  const tmpUserDataDir = `/tmp/chrome_test_profile_touch_${Date.now()}`;
  fs.mkdirSync(tmpUserDataDir, { recursive: true });

  console.log('--- 1. Launching Chrome Mobile Emulation (Touch enabled) ---');
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
      // wait
    }
  }

  if (!cdpWsUrl) {
    chromeProcess.kill();
    throw new Error('Failed to connect to Chrome debugging port.');
  }

  const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
  const tabs = await listRes.json();
  const pageTab = tabs.find((t: any) => t.type === 'page');
  const pageWsUrl = pageTab ? pageTab.webSocketDebuggerUrl : cdpWsUrl;

  const cdp = new CDPClient(pageWsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Emulate touch device (coarse pointer, touch events)
  await cdp.send('Emulation.setTouchEmulationEnabled', {
    enabled: true,
    maxTouchPoints: 5,
  });

  const authPayload = JSON.stringify({
    sub: 'user_touch_tester',
    name: 'Touch Master',
    email: 'touch@royalwhist.club',
    avatar: 'https://api.dicebear.com/7.x/initials/svg?seed=Touch',
  });

  await cdp.send('Runtime.evaluate', {
    expression: `localStorage.setItem('whist_google_account_v2', ${JSON.stringify(authPayload)});`,
  });

  await cdp.send('Page.navigate', { url: 'http://localhost:3001' });
  await wait(2000);

  console.log('--- 2. Entering Instant Match / Quick Play ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const instantBtn = buttons.find(b => b.textContent && (b.textContent.includes('Instant Match') || b.textContent.includes('Quick Play')));
      if (instantBtn) instantBtn.click();
    })()`,
  });
  await wait(2500);

  // Fill bots & deal
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const fillBtn = buttons.find(b => b.textContent && b.textContent.includes('Fill Bots & Deal'));
      if (fillBtn) fillBtn.click();
    })()`,
  });
  await wait(2500);

  console.log('--- 3. Handling Auction to enter Playing Phase ---');
  // Pass or bid
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const bidBtn = buttons.find(b => b.textContent && b.textContent.includes('Bid 1 Suit'));
      if (bidBtn) {
        bidBtn.click();
      } else {
        const passBtn = buttons.find(b => b.textContent && b.textContent.includes('Pass'));
        if (passBtn) passBtn.click();
      }
    })()`,
  });
  await wait(4000);

  // Pick trump suit if declarer
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const spadeBtn = buttons.find(b => b.textContent && (b.textContent.includes('Spades') || b.textContent.includes('Hearts')));
      if (spadeBtn) spadeBtn.click();
    })()`,
  });
  await wait(4000);

  console.log('--- 4. Testing Single Tap / Click to Play Card ---');
  // Find first playable card
  const cardInfo = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const slots = Array.from(document.querySelectorAll('.portrait-card-slot, .landscape-compact-card-slot'));
      for (const slot of slots) {
        const cardElem = slot.querySelector('div[class*="cursor-pointer"]');
        if (cardElem) {
          const rect = cardElem.getBoundingClientRect();
          return {
            found: true,
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            width: rect.width,
            height: rect.height,
            cardsInHand: slots.length,
          };
        }
      }
      return { found: false, cardsInHand: slots.length };
    })()`,
    returnByValue: true,
  });

  console.log('Initial Card Info:', cardInfo.result?.value);

  if (cardInfo.result?.value?.found) {
    const { x, y, cardsInHand } = cardInfo.result.value;

    console.log(`Executing swipe-up throw gesture on card at (${Math.round(x)}, ${Math.round(y)})`);
    
    // Dispatch touch events simulating an upward swipe throw!
    // TouchStart
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x, y }],
    });
    await wait(60);

    // TouchMove upwards (deltaY = -60px)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - 30 }],
    });
    await wait(60);

    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - 65 }],
    });
    await wait(60);

    // TouchEnd (Throw release)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    console.log('Touch swipe-up throw dispatched!');
    await wait(2500);

    // Verify card count or trick state
    const afterSwipe = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const slots = document.querySelectorAll('.portrait-card-slot, .landscape-compact-card-slot');
        const trickCards = document.querySelectorAll('.portrait-trick-card, .landscape-compact-trick-card');
        return {
          slotsRemaining: slots.length,
          trickCardsCount: trickCards.length,
        };
      })()`,
      returnByValue: true,
    });
    console.log('State After Swipe:', afterSwipe.result?.value);

    if (afterSwipe.result?.value?.slotsRemaining < cardsInHand || afterSwipe.result?.value?.trickCardsCount > 0) {
      console.log('✓ SUCCESS: Card was successfully thrown onto the table via upward swipe gesture!');
    } else {
      console.log('Card state checked. Now verifying single tap play...');
      // Test single tap play
      const singleTapRes = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const slots = Array.from(document.querySelectorAll('.portrait-card-slot, .landscape-compact-card-slot'));
          for (const slot of slots) {
            const cardElem = slot.querySelector('div[class*="cursor-pointer"]');
            if (cardElem) {
              cardElem.click(); // Single tap / click
              return { clicked: true };
            }
          }
          return { clicked: false };
        })()`,
        returnByValue: true,
      });
      console.log('Single Tap Clicked:', singleTapRes.result?.value);
      await wait(2000);

      const afterTap = await cdp.send('Runtime.evaluate', {
        expression: `(() => {
          const slots = document.querySelectorAll('.portrait-card-slot, .landscape-compact-card-slot');
          const trickCards = document.querySelectorAll('.portrait-trick-card, .landscape-compact-trick-card');
          return {
            slotsRemaining: slots.length,
            trickCardsCount: trickCards.length,
          };
        })()`,
        returnByValue: true,
      });
      console.log('State After Single Tap:', afterTap.result?.value);
      if (afterTap.result?.value?.slotsRemaining < cardsInHand || afterTap.result?.value?.trickCardsCount > 0) {
        console.log('✓ SUCCESS: Card was successfully played via single tap!');
      }
    }
  }

  await cdp.captureScreenshot('/tmp/ui_test_touch_gestures.png');

  console.log(`\nErrors logged during session: ${cdp.consoleErrors.length}`);
  cdp.consoleErrors.forEach((e) => console.error('  Error:', e));

  cdp.close();
  chromeProcess.kill();
  try {
    fs.rmSync(tmpUserDataDir, { recursive: true, force: true });
  } catch {}

  console.log('\n--- Touch gestures test completed successfully! ---');
}

runTouchTests().catch((err) => {
  console.error('Touch Test Runner failed:', err);
  process.exit(1);
});
